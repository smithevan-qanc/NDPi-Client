const { spawn }    = require('child_process');
const EventEmitter = require('events');

class CecController extends EventEmitter {
    constructor(fsData) {
        super();

        this.settings = fsData;

        this.deviceName = fsData.get('device_name');
        fsData.on('device_name', (data) => {
            this.deviceName = String(data);
            this.send('q');
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
        this.proc = spawn('cec-client', ['-o', this.deviceName], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.isReady = false;

        this.proc.stdout.on('data', (data) => this._handleStdout(data));
        this.proc.stderr.on('data', (data) => this._handleStderr(data));

        this.proc.on('close', () => {
            this.isReady = false;
            this.proc = null;
            if (this.enabled) {
                this._scheduleRestart();
            } else {
                if (this.timeoutTimer) {
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

        if (this.timeoutTimer) return;
        this.timeoutTimer = setTimeout(() => {
            if (!this.isReady) {
                this.emit('timeout', "Never received 'waiting for input' signal");
                this.quit();
            }
            this.timeoutTimer = null;
        }, 30000);
    }

    quit() {
        this.enabled = false;
        this.isReady = false;
        this.send('q');
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
        if (!thisLine.includes('TRAFFIC')) {
            if (!thisLine.includes(']  ')) {
                console.log(`[ client_cec ][ Message ] ${thisLine}`);
            } else {
                let thisLineSplit = thisLine.split(']')[1].trim();
                if (thisLineSplit.includes('<<')) {
                    console.log(`[ client_cec ][ SEND ] ${thisLineSplit.includes('->') ? thisLineSplit.split(':')[1].trim() : thisLineSplit}`);
                } else if (thisLineSplit.includes('>>')) {
                    console.log(`[ client_cec ][ RECEIVE ] ${thisLineSplit.includes('->') ? thisLineSplit.split(':')[1].trim() : thisLineSplit}`);
                } else if (thisLineSplit.includes('(0):') || thisLineSplit.includes('(1):')) {
                    console.log(`[ client_cec ][ Update ] ${thisLineSplit}`);
                } else if (thisLine.includes('ERROR')) {
                    console.log(`[ client_cec ][ ERROR ] ${thisLineSplit}`);
                }
            }
        }

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