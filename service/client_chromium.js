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
        {
            try { this.service.kill('SIGKILL'); }
            catch {}
            finally { this.service = null; }
        }
        // setTimeout(() => { this.launch(); }, 1000);
        this.launch();
    }

    close() {
        console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'Closing Module');
        try { this.service.kill('SIGTERM'); }
        catch {}
        finally { this.service = null; }
    }

    async launch() {
        if (this.service)
        {
            try { this.service.kill('SIGKILL'); }
            catch {}
            finally { this.service = null; }
        }

        let picomNotRunning = false;

        await new Promise((resolve) => {
            exec('pgrep picom', (error, stdout, stderr) => {
                if (error) {
                    picomNotRunning = true;
                    resolve();
                }
            });
        });

        if (picomNotRunning)
        {
            await new Promise((resolve) => {
                console.log('launching PICOM');

                exec(`picom -b --config "${process.env.HOME}/.config/picom/picom.conf"`, (error, stdout, stderr) => {
                    if (error) { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ]`, '[ PICOM ERROR ]', stderr.toString()); }
                    setTimeout(() => { resolve(); }, 2000);
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
            // '--kiosk',
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

        this.service.on('spawn', () => {
            setTimeout(() => {
                try { this.emit('spawn'); } catch {}
            }, 2000);
        });
        
        this.service.on('error', (err) => {
            console.error('⚠️', `[ ${path.basename(__filename).split('.')[0]} ]`, '[ SERVICE ERROR ]', err);
        });

        this.service.on('exit', (code, signal) => {
            try { this.service = null; } catch {}
            console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'Module Exited', `[ Code: ${code || 'n/a'} ], [ Signal: ${signal || 'n/a'} ]`);
        });
    }
}

module.exports = ChromiumOverlayDisplay;