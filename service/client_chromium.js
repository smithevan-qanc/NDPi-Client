const path = require('path');
const { exec } = require('child_process');

class ChromiumOverlayDisplay {
    constructor(fsData) {
        this.service = null;
        this.settings = fsData;
        this.homeDirectory = path.join(__dirname, '..', '..');
        this.enabled = true;
        this.start();
    }
    start() {
        if (!this.enabled) return;
        if (this.service) this.close();
        setTimeout(() => { this.launch(); }, 500);
    }

    close() {
        this.enabled = false;
        if (this.service) this.service.kill();
        this.service = null;
    }

    launch() {
        if (this.service) return;
        this.enabled = true;
        
        const connectionPort = this.settings.get('local_port_number_api');
        let commandLine = `/usr/bin/chromium ` +
            `--user-data-dir=${this.homeDirectory}/.config/chromium/Default ` +
            `--disable-web-security ` +
            `http://localhost:${connectionPort}/`;

        this.service = exec(commandLine, {
            env: {
                ...process.env,
                DISPLAY: ':0',
                XAUTHORITY: `${this.homeDirectory}/.Xauthority`,
            },
        });

        this.service.on('exit', () => {
            this.service = null;
            console.log(`[ client_chromium ] Relaunching...`);
            this.start();
        });
        
        this.service.on('error', (err) => {
            console.log('[ client_chromium ][ Error ]', err);
        });
    }
}

module.exports = ChromiumOverlayDisplay;