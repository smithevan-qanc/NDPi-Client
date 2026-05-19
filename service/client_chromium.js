const path = require('path');
const { exec } = require('child_process');
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
        require('node:child_process').exec('killall chromium', (error) => {
            if (error)
                { console.log('🔴 [ client_chromium ][ ERROR ] killall') }
        });
        this.service = null;
        // if (this.service)
        //     { this.service.kill('SIGKILL') }
    }

    launch() {
        if (this.service)
            { return; }
        const connectionPort = this.settings.get('local_port_number_api');
        const command = [
            '/usr/bin/chromium',
                //'--kiosk',
                '--no-default-browser-check',
                '--aggressive-cache-discard',
                '--disable-pings',
                '--disable-popup-blocking',
                '--hide-crash-restore-bubble',
                '--disable-infobars',
                '--disable-session-crashed-bubble',
                '--disable-component-extensions-with-background-pages',
                '--no-first-run',
                '--disable-default-apps',
                '--disable-translate',
                '--hide-scrollbars',
                '--disable-features=TranslateUI',
                '--noerrdialogs',
                '--touch-events=enabled',
                '--start-fullscreen',
                '--disable-notifications',
                '--disable-logging',
                '--disable-crash-reporter',
                `--user-data-dir=${this.homeDirectory}/.config/chromium/Default`,
                '--disable-web-security',
            `http://localhost:${connectionPort}/`
        ];

        this.service = exec(command.join(' '), {
            env: {
                ...process.env,
                DISPLAY: ':0',
                XAUTHORITY: `${this.homeDirectory}/.Xauthority`,
            },
        });
        
        this.service.on('error', (err) => {
            console.log('🔴 [ client_chromium ][ ERROR ]', err);
        });

        this.service.on('close', () => {
            this.service = null;
            console.log('[ client_chromium ] Closed')
            this.emit('close');
        });
    }
}

module.exports = ChromiumOverlayDisplay;