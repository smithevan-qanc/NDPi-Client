const path = require('path');
const { exec, spawn } = require('node:child_process');
const { EventEmitter } = require('events');
const func = require('./functions');

class ChromiumOverlayDisplay extends EventEmitter {
    constructor(fsData, api) {
        super();
        this.service = null;
        this.settings = fsData;
        this.server = api;
        this.windowId = null;
        this.ready = false;
        this.launch();
    }

    async launch() {
        await func.launchPicom();

        const connectionPort = this.settings.get('local_port_number_api');
        const command = 'chromium';
        const args = [
            '--kiosk',
            '--aggressive-cache-discard',
            '--deny-permission-prompts',
            '--disable-component-extensions-with-background-pages',
            '--disable-crash-reporter',
            '--disable-default-apps',
            '--disable-features=TranslateUI',
            '--disable-infobars',
            '--disable-logging',
            '--disable-notifications',
            '--disable-pings',
            '--disable-popup-blocking',
            '--disable-session-crashed-bubble',
            '--disable-translate',
            '--hide-crash-restore-bubble',
            '--hide-scrollbars',
            '--noerrdialogs',
            '--no-default-browser-check',
            '--no-first-run',
            '--start-fullscreen',
            '--touch-events=enabled',
            `--user-data-dir=${process.env.HOME}/.config/chromium`,
            `http://localhost:${connectionPort}/display/idle/`
        ];

        this.service = spawn(command, args, {
            env: {
                ...process.env,
                DISPLAY: ':0',
                XAUTHORITY: `${process.env.HOME}/.Xauthority`,
            }
        });

        this.service.once('spawn', () => {
            this.settings.put('pid_chromium', String(this.service.pid || ''));
            setTimeout(() => {
                this.emit('ready');
            }, 500);
        });
        
        this.service.on('error', (err) => {
            console.error(`⚠️   [ ${path.basename(__filename).split('.')[0]} ]`, '[ SERVICE ERROR ]', err);
        });

        this.service.once('exit', () => {
            this.settings.put('pid_chromium', '');
            this.emit('close');
            this.service = null;
        });
    }

    async close() {
        console.info(`[ CLOSING ][ ${path.basename(__filename).split('.')[0]} ]`);
        
        if (this.service)
        {
            await new Promise((resolve) => {
                this.service.once('close', () => {
                    this.service = null;
                    resolve();
                });
                this.service.kill('SIGTERM');
            });
        }

        return new Promise((resolve) => {
            exec('pgrep chromium', (error, stdout, stderr) => {
                if (!error) {
                    exec('killall chromium', () => {
                        console.info(`[ -CLOSED ][ ${path.basename(__filename).split('.')[0]} ]`);
                        resolve();
                    });
                }
                else
                {
                    console.info(`[ -CLOSED ][ ${path.basename(__filename).split('.')[0]} ]`);
                    resolve();
                }
            });
        });
    }
}

module.exports = ChromiumOverlayDisplay;