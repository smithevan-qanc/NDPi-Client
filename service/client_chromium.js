const path = require('path');
const { exec } = require('child_process');
const { EventEmitter } = require('events');

class ChromiumOverlayDisplay extends EventEmitter {
    constructor(fsData) {
        super();
        this.service = null;
        this.settings = fsData;
        this.homeDirectory = path.join(__dirname, '..', '..');
        this.enabled = true;
        this.start();
    }

    start() {
        if (this.service)
            { this.close() }
        setTimeout(() => { this.launch() }, 1500);
    }

    close() {
        this.enabled = false;
        if (this.service)
            { this.service.kill('SIGTERM') }
    }

    launch() {
        if (this.service) return;
        this.enabled = true;
        const connectionPort = this.settings.get('local_port_number_api');

        let commandLine = `/usr/bin/chromium \
            --kiosk \
            --no-default-browser-check \
            --aggressive-cache-discard \
            --disable-pings \
            --disable-popup-blocking \
            --hide-crash-restore-bubble \
            --disable-infobars \
            --disable-session-crashed-bubble \
            --disable-component-extensions-with-background-pages \
            --no-first-run \
            --disable-default-apps \
            --disable-translate \
            --hide-scrollbars \
            --disable-features=TranslateUI \
            --noerrdialogs \
            --touch-events=enabled \
            --start-fullscreen \
            --disable-notifications \
            --disable-logging \
            --disable-crash-reporter \
            --user-data-dir=${this.homeDirectory}/.config/chromium/Default \
            --disable-web-security \
            http://localhost:${connectionPort}/`;

        this.service = exec(commandLine, {
            env: {
                ...process.env,
                DISPLAY: ':0',
                XAUTHORITY: `${this.homeDirectory}/.Xauthority`,
            },
        });

        this.service.on('close', () => {
            this.service = null;
            this.emit('close');
        });
        
        this.service.on('error', (err) => {
            console.log('🔴 [ client_chromium ][ ERROR ]', err);

        });
    }
}

module.exports = ChromiumOverlayDisplay;