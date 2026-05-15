const path = require('path');
const { exec } = require('child_process');

class ChromiumOverlayDisplay {
    constructor(fsData) {
        this.service = null;
        this.settings = fsData;
        this.homeDirectory = path.join(__dirname, '..', '..');
        this.relaunchOverlayBrowser();
    }
    relaunchOverlayBrowser() {
        if (this.service) {
            this.killOverlayBrowser();
        }
        setTimeout(() => {
            this.launchOverlayBrowser();
        }, 1000);
    }

    killOverlayBrowser() {
        if (this.service) {
            this.service.kill();
            this.service = null;
        }
    }

    launchOverlayBrowser() {
        if (this.service) {
            return;
        }

        const connectionPort = this.settings.get('local_port_number_api');

        let commandLine = `/usr/bin/chromium \
            --user-data-dir=${this.homeDirectory}/.config/chromium \
            --disable-crash-reporter \
            --disable-logging \
            --disable-notifications \
            --disable-web-security \
            --enable-transparent-visuals \
            --disable-gpu \
            --start-fullscreen \
            --default-background-color=00000000 \
            --ozone-platform=x11 \
        http://localhost:${connectionPort}/`;

        // --show-fps-counter \
        // --show-taps ///\\\ Draws a circle at each touch point, similar to the Android OS developer option "Show taps".
        /**
            --show-fps-counter
            --show-taps
                Draws a circle at each touch point, similar to the Android OS developer option "Show taps".
            --pull-to-refresh
            --enable-virtual-keyboard
            --default-background-color=#81c127
            --kiosk 
            --kiosk-splash-screen-min-time-seconds=5
         */

        this.service = exec(commandLine, {
            env: {
                ...process.env,
                DISPLAY: ':0',
                XAUTHORITY: `${this.homeDirectory}/.Xauthority`,
            },
        });

        this.service.on('exit', () => {
            this.service = null;
            this.relaunchOverlayBrowser();
        });
        
        this.service.on('error', (err) => {
            console.log('[ client_chromium ][ Error ]', err);
            console.log(`[ client_chromium ][ Error ] Relaunching...`);
            this.relaunchOverlayBrowser();
        });
    }
}

module.exports = ChromiumOverlayDisplay;