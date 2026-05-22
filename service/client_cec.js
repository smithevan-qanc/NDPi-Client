const { spawn }    = require('child_process');
const EventEmitter = require('events');

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
        this.showAllOut = false;

        this.restartDelay = 1000;
        this.restartTimer = null;

        this.timeoutTimer = null;

        this.maxDelay = 10000;

        console.log('[ client_cec ] Opening CEC Client')
        this.start();
    }

    start() {
        this.isReady = false;

        this.proc = spawn('cec-client', ['-o', this.deviceName, '-t', 'r'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.proc.stdout.on('data', (data) => this._handleStdout(data));
        this.proc.stderr.on('data', (data) => this._handleStderr(data));

        this.proc.on('close', () => {
            this.isReady = false;
            this.proc = null;
            if (this.enabled)
                { this._scheduleRestart() }
            else
                {
                    if (this.timeoutTimer)
                        {
                            clearTimeout(this.timeoutTimer);
                            this.timeoutTimer = null;
                        }
                    this.queue = [];
                    this.debounceMap.clear();
                }
        });

        this.proc.on('error', () => {
            this.isReady = false;
            this._scheduleRestart();
        });

        if (this.timeoutTimer)
            { return }
        this.timeoutTimer = setTimeout(() => {
            if (!this.isReady)
                {
                    this.emit('timeout', "Never received 'waiting for input' signal");
                    this.close();
                }
            this.timeoutTimer = null;
        }, 30000);
    }

    close() {
        this.enabled = false;
        this.isReady = false;
        this.send('q');
    }

    _scheduleRestart() {
        this.restartTimer = setTimeout(() => {
            this.restartDelay = Math.min(this.restartDelay * 2, this.maxDelay);
            this.restartTimer = null;
            if (this.enabled)
                { this.start() }
        }, this.restartDelay);
    }

    _handleStdout(data) {
        this.buffer += data.toString();
        let lines = this.buffer.split('\n');
        this.buffer = lines.pop();

        const thisLine = String(data).split(/\r?\n/);
        thisLine.forEach((line) => {
            const lineCheck = line.trim() || null;
            if (this.showAllOut)
            {
                console.log(`[ client_cec ][ MESSAGE ] ${line}`);
                return;
            }

            if (!line.includes('TRAFFIC') && lineCheck && lineCheck !== "'")
            {
                if (!line.includes(']'))
                { console.log(`[ client_cec ][ MESSAGE ] ${line}`) }
                else
                {
                    let lineSplit = line.split(']')[1].trim();
                    let lineSendReceive = `${lineSplit.includes('->') ? lineSplit.split(':')[1].trim() : lineSplit}`;
                    if (lineSplit.includes('<<'))
                    { console.log(`[ client_cec ][    SEND ] ${lineSendReceive}`); }
                    else if (lineSplit.includes('>>'))
                    { console.log(`[ client_cec ][ RECEIVE ] ${lineSendReceive}`) }
                    else if (lineSplit.includes('(0):') || lineSplit.includes('(1):'))
                    {
                        console.log(`[ client_cec ][  UPDATE ] ${lineSplit}`);
                        if (lineSplit.includes('TV') && lineSplit.includes('power status'))
                            { this.settings.put('output_device_cec_status_power', lineSplit.split("'")[3]) }
                    }
                    else if (line.includes('ERROR'))
                    { console.log(`🔴 [ client_cec ][ ERROR ] ${lineSplit}`) }
                }
            }
        });

        for (const line of lines)
        {
            const parsed = this._parseLine(line.trim());
            if (line.includes('waiting for input'))
            {
                this.isReady = true;
                if (this.timeoutTimer)
                {
                    clearTimeout(this.timeoutTimer);
                    this.timeoutTimer = null;
                }
                this.emit('ready');
                console.log('[ client_cec ] CEC Ready');
                this.settings.put('output_device_cec_enabled', 'true');
                this.restartDelay = 1000;
                this._flushQueue();
            }
        }
    }

    _handleStderr(data) {
        this.emit('error_log', data.toString());
    }

    _parseLine(line) {
        if (!line)
            { return null }
        if (line.includes('power status changed'))
            { return {
                type: 'POWER',
                raw: line.split(/\t/)[1]
            } }
        if (line.includes('>>') || line.includes('<<'))
            { return {
                type: 'TRAFFIC',
                raw: line.split(/\t/)[1]
            } }
        return {
            type: 'UNKNOWN',
            raw: line.split(/\t/)[1]
        };
    }

    send(command, { debounceKey = null, debounceMs = 300 } = {}) {
        if (debounceKey)
        {
            const last = this.debounceMap.get(debounceKey) || 0;
            const now = Date.now();
            if (now - last < debounceMs)
                { return }
            this.debounceMap.set(debounceKey, now);
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
            { this.showAllOut = true; }
            else 
            { this.showAllOut = false; }
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