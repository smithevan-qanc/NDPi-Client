const child = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const func = require('./functions');

class CecController extends EventEmitter {
    constructor(fsData) {
        super();

        this.settings = fsData;

        this.deviceName = fsData.get('device_name');

        this.proc = null;
        this.buffer = '';
        this.debounceMap = new Map();
        this.queue = [];

        this.enabled = true;
        this.isReady = false;
        this.debug = false;

        this.restartDelay = 1000;
        this.restartTimer = null;

        this.timeoutTimer = null;

        this.debounceCheckCompliance = null;

        this.maxDelay = 10000;

        console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'Opening CEC Client')
        this.start();
    }

    start() {
        this.isReady = false;
        this.enabled = true;

        // this.settings.put('output_display_cec_this_source_active', 'false');

        this.proc = child.spawn('cec-client', ['-o', this.deviceName, '-t', 'r', '-d', this.debug ? '31' : '4'], { stdio: ['pipe', 'pipe', 'pipe'] });
        this.proc.stdout.on('data', (data) => this._handleStdout(data));
        this.proc.stderr.on('data', (data) => this._handleStderr(data));
        
        this.proc.once('exit', (code, signal) => {
            this.isReady = false;
            if (this.enabled)
            {
                this.proc = null;
                this._scheduleRestart();
                try { clearTimeout(this.timeoutTimer); }
                catch {}
                finally
                {
                    this.timeoutTimer = null;
                    this.queue = [];
                    this.debounceMap.clear();
                }
            }
        });

        if (this.timeoutTimer)
        { return; }

        this.timeoutTimer = setTimeout(() => {
            if (!this.isReady)
            {
                this.emit('timeout', "Never received 'waiting for input' signal");
                this.close();
            }
            this.timeoutTimer = null;
        }, 30000);
    }

    /**
     * Update the OSD name of the device.
     * @param {string} name 
     */
    updateDeviceName(name) {
        if (this.deviceName !== name && typeof name == 'string')
        {
            this.deviceName = name;
            this.send(`osd 4 ${this.deviceName}`);
        }
    }

    /**
     * @async
     * Kill the CEC Adapter and close out of the module.
     */
    async close() {
        this.isReady = false;
        this.enabled = false;

        return new Promise((resolve) => {
            child.exec('killall -s SIGKILL cec-client', () => {
                this.emit('closed');
                resolve();
            });
        });
    }

    _scheduleRestart() {
        if (this.enabled)
        {
            this.restartTimer = setTimeout(() => {
                this.restartDelay = Math.min(this.restartDelay * 2, this.maxDelay);
                this.restartTimer = null;
                if (this.enabled)
                { this.start(); }
            }, this.restartDelay);
        }
    }

    _handleStdout(data) {
        const thisLine = String(data).split(/\r?\n/);

        thisLine.forEach(async (line) => {
            if (this.debug) { console.info(`[ ${path.basename(__filename).split('.')[0]} ][ DEBUG ] ${line}`); }

            if (line.includes('waiting for input'))
            {
                try { clearTimeout(this.timeoutTimer); }
                catch {}
                finally
                {
                    this.timeoutTimer = null;
                    this.restartDelay = 1000;
                    this.isReady = true;
                }

                console.info(`[ ${path.basename(__filename).split('.')[0]} ] CEC Ready`);
                this.emit('ready');
                this._flushQueue();
            }

            if (line.includes('source deactivated') && line.includes('Recorder 1'))
            { this.settings.put('output_display_cec_this_source_active', 'false'); }
            
            if (line.includes('source activated') && line.includes('Recorder 1'))
            { this.settings.put('output_display_cec_this_source_active', 'true'); }

            if (line.includes('ERROR'))
            { console.error(`⚠️   [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] ${line}`); }
        });

        try { clearTimeout(this.debounceCheckCompliance); }
        catch {}
        finally { this.debounceCheckCompliance = null; }

        this.debounceCheckCompliance = setTimeout(() => {
            func.checkCecCompliance();
        }, 1000);
    }

    _handleStderr(data) {
        this.emit('error_log', data.toString());
    }

    send(command, { debounceKey = null, debounceMs = 300 } = {}) {
        const staticDebounceKey = debounceKey || String(command).split(' ')[0] || null;
        if (staticDebounceKey)
        {
            const last = this.debounceMap.get(staticDebounceKey) || 0;
            const now = Date.now();
            if (now - last < debounceMs)
            { return; }
            this.debounceMap.set(staticDebounceKey, now);
        }
        this.queue.push(command);
        this._flushQueue();
    }

    _flushQueue() {
        if (!this.isReady || !this.proc)
        { return }
        
        while (this.queue.length > 0)
        {
            const cmd = this.queue.shift();
            if (cmd === 'h')
            { this.debug = true; }
            else 
            { this.debug = false; }
            this.proc.stdin.write(cmd + '\n');
        }
    }
}

module.exports = CecController;

/**
================================================================================
Available commands:

[tx] {bytes}              transfer bytes over the CEC line.
[txn] {bytes}             transfer bytes but don't wait for transmission ACK.
[on] {address}            power on the device with the given logical address.
[standby] {address}       put the device with the given address in standby mode.
[la] {logical address}    change the logical address of the CEC adapter.
[p] {device} {port}       change the HDMI port number of the CEC adapter.
[pa] {physical address}   change the physical address of the CEC adapter.
[as]                      make the CEC adapter the active source.
[is]                      mark the CEC adapter as inactive source.
[osd] {addr} {string}     set OSD message on the specified device.
[ver] {addr}              get the CEC version of the specified device.
[ven] {addr}              get the vendor ID of the specified device.
[lang] {addr}             get the menu language of the specified device.
[pow] {addr}              get the power status of the specified device.
[name] {addr}             get the OSD name of the specified device.
[poll] {addr}             poll the specified device.
[lad]                     lists active devices on the bus
[ad] {addr}               checks whether the specified device is active.
[at] {type}               checks whether the specified device type is active.
[sp] {addr}               makes the specified physical address active.
[spl] {addr}              makes the specified logical address active.
[volup]                   send a volume up command to the amp if present
[voldown]                 send a volume down command to the amp if present
[mute]                    send a mute/unmute command to the amp if present
[self]                    show the list of addresses controlled by libCEC
[scan]                    scan the CEC bus and display device info
[mon] {1|0}               enable or disable CEC bus monitoring.
[log] {1 - 31}            change the log level. see cectypes.h for values.
[ping]                    send a ping command to the CEC adapter.
[bl]                      to let the adapter enter the bootloader, to upgrade the flash rom.
[r]                       reconnect to the CEC adapter.
[h] or [help]             show this help.
[q] or [quit]             to quit the CEC test client and switch off all connected CEC devices.
================================================================================ 
 */