const path = require('path');
const { exec, spawn } = require('node:child_process');
const { EventEmitter } = require('events');

class ChromiumOverlayDisplay extends EventEmitter {
    constructor(fsData, api) {
        super();
        this.service = null;
        this.settings = fsData;
        this.server = api;
        this.homeDirectory = path.join(__dirname, '..', '..');
        this.start();
    }

    start() {
        if (this.service)
        { this.close(); }
        setTimeout(() => { this.launch(); }, 1000);
    }

    close() {
        console.info(
            `[ ${path.basename(__filename)} ]`,
            'Closing Module'
        );
        try {
            this.service.kill();
        } catch (err) {
            console.error(
                '🔴',
                `[ ${path.basename(__filename)} ]`,
                '[ ERROR ]',
                err
            );
            exec('killall chromium', (error, stdout, stderr) => {
                if (error)
                {
                    console.error(
                        '🔴',
                        `[ ${path.basename(__filename)} ]`,
                        '[ ERROR ]',
                        stderr
                    );
                }
            });
        }
        this.service = null;
    }

    launch() {
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
            `--user-data-dir=${this.homeDirectory}/.config/chromium/Default`,
            `http://localhost:${connectionPort}/`
        ];

        this.service = spawn(command, args, {
            env: {
                ...process.env,
                DISPLAY: ':0',
                XAUTHORITY: `${this.homeDirectory}/.Xauthority`,
            }
        });

        // this.service = exec(command.join(' '), {
        //     env: {
        //         ...process.env,
        //         DISPLAY: ':0',
        //         XAUTHORITY: `${this.homeDirectory}/.Xauthority`,
        //     },
        // });
        
        this.service.on('error', (err) => {
            console.error(
                '🔴',
                `[ ${path.basename(__filename).split('.')[0]} ]`,
                '[ ERROR ]',
                err
            );
        });

        this.service.on('close', () => {
            this.service = null;
            console.info(
                `[ ${path.basename(__filename)} ]`,
                'Module Exited'
            );
            this.emit('close');
        });
    }
}

module.exports = ChromiumOverlayDisplay;