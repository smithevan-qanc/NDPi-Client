const path = require('path');
const { exec, spawn } = require('node:child_process');
const { EventEmitter } = require('events');

class ChromiumOverlayDisplay extends EventEmitter {
    constructor(fsData, api) {
        super();
        this.service = null;
        this.settings = fsData;
        this.server = api;
        this.launch();
    }

    async launch() {
        let picomNotRunning = false;
        await new Promise((resolve) => {
            exec('pgrep picom', (error, stdout, stderr) => {
                if (error) { picomNotRunning = true; }
                resolve();
            });
        });

        if (picomNotRunning)
        {
            console.log('launching PICOM');
            await new Promise((resolve) => {
                exec(`picom -b --config "${process.env.HOME}/.config/picom/picom.conf"`, (error, stdout, stderr) => {
                    if (error)
                    { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ]`, '[ PICOM ERROR ]', stderr.toString()); }
                    resolve();
                });
                // const picom = spawn('picom', [
                //     '-b',
                //     '--config',
                //     `${process.env.HOME}/.config/picom/picom.conf`
                // ],{
                //     env: { ...process.env },
                //     // detached: true,
                // });

                // picom.stderr.on('data', (data) => {
                //     console.error('⚠️', `[ ${path.basename(__filename).split('.')[0]} ]`, '[ PICOM ERROR ]', data.toString());
                // });

                // picom.on('spawn', () => {
                //     console.log('PICOM spawned in chromium.js');
                //     setTimeout(() => {
                //         console.log('PICOM spawned in chromium.js: Continuing...');
                //         resolve();
                //     }, 2000);
                // });

                // picom.on('exit', () => { console.log('picom in chromium.js has exited.'); });
                // picom.on('close', () => { console.log('picom in chromium.js has closed.'); });

                // picom.unref();
            });
        }

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