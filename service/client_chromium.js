const path = require('path');
const { exec, spawn } = require('node:child_process');
const { EventEmitter } = require('events');

class ChromiumOverlayDisplay extends EventEmitter {
    constructor(fsData, api) {
        super();
        this.service = null;
        this.settings = fsData;
        this.server = api;
        this.start();
    }

    start() {
        if (this.service)
        { this.close(); }
        setTimeout(() => { this.launch(); }, 1000);
    }

    close() {
        console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'Closing Module');
        try { this.service.kill(); }
        catch {}
        finally { this.service = null; }
    }

    async launch() {
        if (this.service)
        { return; }

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

        await new Promise((resolve) => {
            console.log('launching PICOM');

            const picom = spawn('picom', [
                '--config',
                `${process.env.HOME}/.config/picom/picom.conf`
            ],{
                env: { ...process.env },
                detached: true,
            });

            picom.stderr.on('data', (data) => {
                console.error('⚠️', `[ ${path.basename(__filename).split('.')[0]} ]`, '[ PICOM ERROR ]', data.toString());
            });

            picom.on('spawn', () => {
                setTimeout(() => {
                    console.log('PICOM spawned');
                    resolve();
                }, 500);
            });

            picom.unref();
        });

        this.service = spawn(command, args, {
            env: {
                ...process.env,
                DISPLAY: ':0',
                XAUTHORITY: `${process.env.HOME}/.Xauthority`,
            }
        });

        this.service.on('spawn', () => {
            this.emit('spawn');
        });
        
        this.service.on('error', (err) => {
            console.error('⚠️', `[ ${path.basename(__filename).split('.')[0]} ]`, '[ SERVICE ERROR ]', err);
        });

        this.service.on('exit', (code, signal) => {
            this.service = null;
            console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'Module Exited', `[ Code: ${code || 'n/a'} ], [ Signal: ${signal || 'n/a'} ]`);
            this.emit('close');
        });
    }
}

module.exports = ChromiumOverlayDisplay;