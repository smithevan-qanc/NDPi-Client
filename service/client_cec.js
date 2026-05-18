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
                this.proc.stdin.write(cmd + '\n');
            }
    }
}

module.exports = CecController;