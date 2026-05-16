const { spawn }    = require('child_process');
const EventEmitter = require('events');

class CecController extends EventEmitter {
    constructor(fsData) {
        super();

        this.settings = fsData;

        this.deviceName = fsData.get('device_name');
        fsData.on('device_name', (data) => {
            this.deviceName = String(data);
            this.quit();
            setTimeout(() => {
                this.start();
            }, 5000);
        });

        this.proc = null;
        this.buffer = '';
        this.queue = [];

        this.enabled = true;
        this.isReady = false;

        this.restartDelay = 1000;
        this.restartTimer = null;

        this.timeoutTimer = null;

        this.maxDelay = 10000;
        this.debounceMap = new Map();

        console.log('[ client_cec ] Opening CEC Client')
        this.start();
    }

    start() {
        this.proc = spawn('cec-client', [`-o '${this.deviceName}'`], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.isReady = false;

        this.proc.stdout.on('data', (data) => this._handleStdout(data));
        this.proc.stderr.on('data', (data) => this._handleStderr(data));

        this.proc.on('close', () => {
            this.isReady = false;
            this._scheduleRestart();
        });

        this.proc.on('error', () => {
            this.isReady = false;
            this._scheduleRestart();
        });

        if (this.timeoutTimer) return;
        this.timeoutTimer = setTimeout(() => {
            if (!this.isReady) {
                this.emit('timeout', "Never received 'waiting for input signal'");
                this.quit();
            }
            this.timeoutTimer = null;
        }, 30000);
    }

    quit() {
        this.enabled = false;
        this.isReady = false;
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }
        if (this.proc) {
            this.proc.kill();
        }
        this.proc = null;
        this.queue = [];
        this.debounceMap.clear();
        this.emit('close');
    }

    _scheduleRestart() {
        this.restartTimer = setTimeout(() => {
            this.restartDelay = Math.min(this.restartDelay * 2, this.maxDelay);
            this.restartTimer = null;
            if (this.enabled) this.start();
        }, this.restartDelay);
    }

    _handleStdout(data) {
        this.buffer += data.toString();
        let lines = this.buffer.split('\n');
        this.buffer = lines.pop();

        let thisLine = data.toString();
        console.log(`${this.line}`);
        // if (thisLine.includes('TRAFFIC')) {
        //     console.log(`Traffic: ${thisLine.split('<<')[1].trim()}`);
        // } else if (thisLine.includes(''))

        for (const line of lines) {
            const parsed = this._parseLine(line.trim());
            //if (parsed) this.emit('event', parsed);

            if (line.includes('waiting for input')) {
                this.isReady = true;
                if (this.timeoutTimer) {
                    clearTimeout(this.timeoutTimer);
                    this.timeoutTimer = null;
                }
                console.log('[ client_cec ] CEC Ready');
                this.restartDelay = 1000;
                this._flushQueue();
                this.emit('ready');
                this.settings.put('output_device_cec_enabled', 'true');
            }
        }
    }

    _handleStderr(data) {
        console.log(data.toString());
        this.emit('error_log', data.toString());
    }

    _parseLine(line) {
        if (!line) return null;

        if (line.includes('power status changed')) {
            return {
                type: 'POWER',
                raw: line.split(/\t/)[1]
            };
        }

        if (line.includes('>>') || line.includes('<<')) {
            return {
                type: 'TRAFFIC',
                raw: line.split(/\t/)[1]
            };
        }

        return {
            type: 'UNKNOWN',
            raw: line.split(/\t/)[1]
        };
    }

    send(command, { debounceKey = null, debounceMs = 300 } = {}) {
        if (debounceKey) {
            const last = this.debounceMap.get(debounceKey) || 0;
            const now = Date.now();

            if (now - last < debounceMs) {
                return;
            }

            this.debounceMap.set(debounceKey, now);
        }

        this.queue.push(command);
        this._flushQueue();
    }

    _flushQueue() {
        if (!this.isReady || !this.proc) return;

        while (this.queue.length > 0) {
            const cmd = this.queue.shift();
            this.proc.stdin.write(cmd + '\n');
        }
    }
}

module.exports = CecController;