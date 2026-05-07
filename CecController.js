const { spawn } = require('child_process');
const EventEmitter = require('events');

class CecController extends EventEmitter {
    constructor() {
        super();

        this.proc = null;
        this.buffer = '';
        this.queue = [];
        this.isReady = false;

        this.restartDelay = 1000;
        this.maxDelay = 10000;

        this.debounceMap = new Map();

        this.start();
    }

    start() {
        this.proc = spawn('cec-client', ['-d', '1'], {
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

        setTimeout(() => {
            if (!this.isReady) {
                this.emit('timeout', 'Never waiting for input signal.');
            }
        }, 10000);
    }

    _scheduleRestart() {
        setTimeout(() => {
            this.restartDelay = Math.min(this.restartDelay * 2, this.maxDelay);
            this.start();
        }, this.restartDelay);
    }

    _handleStdout(data) {
        this.buffer += data.toString();

        let lines = this.buffer.split('\n');
        this.buffer = lines.pop();

        for (const line of lines) {
            const parsed = this._parseLine(line.trim());
            if (parsed) this.emit('event', parsed);

            if (line.includes('waiting for input')) {
                this.isReady = true;
                this.restartDelay = 1000;
                this._flushQueue();
            }
        }
    }

    _handleStderr(data) {
        this.emit('error_log', data.toString());
    }

    _parseLine(line) {
        if (!line) return null;

        if (line.includes('power status changed')) {
            return {
                type: 'POWER',
                raw: line
            };
        }

        if (line.includes('>>') || line.includes('<<')) {
            return {
                type: 'TRAFFIC',
                raw: line
            };
        }

        return {
            type: 'UNKNOWN',
            raw: line
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