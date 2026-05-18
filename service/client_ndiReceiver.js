const { EventEmitter } = require('events');
const { spawn } = require('node:child_process');
const { setTimeout, clearTimeout } = require('node:timers');
const path = require('path');

class NDI_Receiver_v2 extends EventEmitter {
    constructor(
        fsData,
        api,
        chromium,
        sourceName = 'none',
        receiverName = 'ndi_receiver_v2',
        libraryPath = `/opt/NDI SDK for Linux/lib/aarch64-rpi4-linux-gnueabi:${(process.env.LD_LIBRARY_PATH || '')}`,
        xAuthority = ''
    ) {
        super();

        this.enabled = true;

        this.settings = fsData;
        this.server = api;
        this.chromium = chromium;
        this.server.broadcastToDisplay({ type: `ndi-init` });

        this.homeDirectory = path.join(__dirname, '..', '..');
        this.parentDirectory = path.join(__dirname, '..');

        this.reconnectTimer = null;
        this.updateFsDebounce = null;

        this.receiver = null;
        this.receiverName = receiverName;
        this.xAuth = xAuthority || `${this.homeDirectory}/.Xauthority`;
        this.libraryPath = libraryPath;

        this.ndiSource = sourceName || 'none';
        this.settings.put('ndpi_status_ndi_source_target', this.ndiSource);
        this.ndiActiveSource = null;
        this.ndiConnectedAt = null;
        this.ndiFramerate = null;
        this.ndiResolution = null;
        this.ndiStatus = 'idle';

        setTimeout(() => {
            if (sourceName.toLowerCase() === 'none')
                { this.close() }
            else
                { this.connect() }
        }, 500);
    }

    connect() {
        this.enabled = true;
        this.receiver = spawn(`${this.parentDirectory}/${this.receiverName}`, [this.ndiSource], {
            env: {
                ...process.env,
                DISPLAY: ':0',
                XAUTHORITY: this.xAuth,
                LD_LIBRARY_PATH: this.libraryPath
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.receiver.stdout.on('data', (data) => {
            const output = data.toString().trim();
            this.parseInfo(output);
            if (output.includes('Connected to:'))
                {
                    this.server.broadcastToDisplay({ type: `ndi-started` });
                    this.ndiActiveSource = this.ndiSource;
                    this.settings.put('ndpi_status_ndi_source_active', this.ndiActiveSource || '');
                    this.ndiStatus = 'streaming';
                    this.settings.put('ndpi_status_ndi', this.ndiStatus);
                    this.ndiConnectedAt = new Date().toISOString();
                    this.settings.put('ndpi_status_ndi_source_connected_time', this.ndiConnectedAt || '');
                    this.settings.put('ndpi_status_ndi_source_framerate', String(this.ndiFramerate || ''));
                    this.settings.put('ndpi_status_ndi_source_resolution', this.ndiResolution || '');
                    this.emit('connected');
                }
        });

        this.receiver.on('error', (error) => {
            console.log(`🔴 [ client_ndiReceiver ][ NDI ] --▶ Critical Error:`, error);
        });

        this.receiver.stderr.on('data', (data) => {
            const output = data.toString().trim();
            output.split(/\r?\n/).forEach((line) => {
                console.log(`🔴 [ client_ndiReceiver ][ NDI ] --▶ Error: ${line}`);
                this.close();
            });
        });

        this.receiver.on('close', (code, signal) => {
            this.receiver = null;

            this.ndiActiveSource = null;
            this.settings.put('ndpi_status_ndi_source_active', '');

            this.ndiStatus = 'idle';
            this.settings.put('ndpi_status_ndi', this.ndiStatus);

            this.ndiConnectedAt = null;
            this.settings.put('ndpi_status_ndi_source_connected_time', '');

            this.ndiFramerate = null;
            this.settings.put('ndpi_status_ndi_source_framerate', '');

            this.ndiResolution = null;
            this.settings.put('ndpi_status_ndi_source_resolution', '');
            
            this.scheduleReconnect();
            console.log(`[ client_ndiReceiver ][ NDI ] --▶ Terminated - Code:${code}, Signal:${signal}`);
        });
    }

    close() {
        this.enabled = false;
        if (this.receiver)
            {
                this.chromium.launch();
                this.server.broadcastToDisplay();
            }
        setTimeout(() => {
            this.receiver.kill('SIGKILL');
            console.log('[ client_ndiReceiver ][ NDI ] --▶ SIGKILL');
            this.receiver = null;
            if (!this.enabled)
                { this.emit('close') }
        }, 1000);
    }

    scheduleReconnect(ms = 15000) {
        if (this.enabled)
            {
                this.server.broadcastToDisplay({ type: `ndi-init` });
                this.reconnectTimer = setTimeout(() => {
                    if (this.enabled && this.ndiSource && this.ndiSource !== 'none' && !this.receiver)
                        { this.connect() }
                    this.reconnectTimer = null;
                }, ms);
            }
    }

    parseInfo(data) {
        data.split(/\r?\n/).forEach((stdout) => {
            console.log(`[ client_ndiReceiver ][ NDI ] --▶ ${stdout}`);
        });

        const videoMatch = data.match(/(?:Video|Source):\s*(\d+)x(\d+)\s*@\s*(\d+(?:\.\d+)?)/i);
        if (videoMatch)
            {
                this.ndiResolution = `${videoMatch[1]}x${videoMatch[2]}`;
                this.ndiFramerate = parseFloat(videoMatch[3]);
            }
        if (!this.ndiResolution)
            {
                const resMatch = data.match(/(\d{3,4})x(\d{3,4})/);
                if (resMatch)
                    { this.ndiResolution = `${resMatch[1]}x${resMatch[2]}` }
            }
        if (!this.ndiFramerate)
            {
                const fpsMatch = data.match(/(\d+(?:\.\d+)?)\s*fps|@\s*(\d+(?:\.\d+)?)/i);
                if (fpsMatch)
                    { this.ndiFramerate = parseFloat(fpsMatch[1] || fpsMatch[2]) }
            }
    }
}

module.exports = NDI_Receiver_v2;