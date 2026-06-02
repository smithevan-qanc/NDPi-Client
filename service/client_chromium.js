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
            `--user-data-dir=${process.env.HOME}/.config/chromium/Default`,
            `http://localhost:${connectionPort}/`
        ];

        console.log('launching chromium');

        this.service = spawn(command, args, {
            env: {
                ...process.env,
                DISPLAY: ':0',
                XAUTHORITY: `${process.env.HOME}/.Xauthority`,
            }
        });

        return;

        this.service.stdout.once('data', () => {
            process.nextTick(() => { this.emit('ready'); });
        });
        
        this.service.on('error', (err) => {
            console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ]`, '[ SERVICE ERROR ]', err);
        });
    }

    async close() {
        console.info(`[ CLOSING ][ ${path.basename(__filename).split('.')[0]} ]`);
        
        if (this.service)
        {
            await new Promise((resolve) => {
                this.service.once('exit', () => {
                    this.service = null;
                    resolve();
                });
                this.service.kill('SIGTERM');
            });
        }

        await new Promise((resolve) => {
            exec('pgrep chromium', (error, stdout, stderr) => {
                if (!error) {
                    try { exec('killall chromium'); }
                    catch {}
                }
                resolve();
            });
        });

        console.info(`[  CLOSED ][ ${path.basename(__filename).split('.')[0]} ]`);
        return;
    }
}

module.exports = ChromiumOverlayDisplay;