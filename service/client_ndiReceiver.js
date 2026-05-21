const { EventEmitter } = require('events');
const { spawn } = require('node:child_process');
const { setTimeout, clearTimeout } = require('node:timers');
const path = require('path');

class NDI_Receiver_v2 extends EventEmitter {
    constructor(
        fsData,
        api,
        chromium,
        receiverName = '',
        libraryPath = '',
        xAuthority = ''
    ) {
        super();

        this.enabled = true;

        this.settings = fsData;
        this.server = api;
        this.chromium = chromium;
        this.server.updateDisplay({ type: `ndi-init` });

        this.homeDirectory = path.join(__dirname, '..', '..');
        this.parentDirectory = path.join(__dirname, '..');

        this.reconnectTimer = null;
        this.updateFsDebounce = null;

        this.receiver = null;
        this.receiverName = receiverName || 'ndi_receiver_v3';
        this.libraryPath = libraryPath || `/opt/NDI SDK for Linux/lib/aarch64-rpi4-linux-gnueabi:${(process.env.LD_LIBRARY_PATH || '')}`;
        this.xAuth = xAuthority || `${this.homeDirectory}/.Xauthority`;

        this.ndiSource = this.settings.get('ndpi_status_ndi_source_target') || 'none';
        // this.settings.put('ndpi_status_ndi_source_target', this.ndiSource);
        this.ndiActiveSource = null;
        this.ndiConnectedAt = null;
        this.ndiFramerate = null;
        this.ndiResolution = null;
        this.ndiStatus = 'idle';

        setTimeout(() => {
            if (this.ndiSource.toLowerCase() === 'none')
                { this.close(); }
            else
                { this.connect(); }
        }, 500);
    }

    connect() {

        this.receiver = spawn(`${this.parentDirectory}/${this.receiverName}`, [this.ndiSource, 0x7fffffff, 100], {
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
                    this.ndiConnectedAt = new Date().toISOString();
                    this.ndiActiveSource = this.ndiSource;
                    this.ndiStatus = 'streaming';
                    this.settings.put('ndpi_status_ndi', this.ndiStatus);
                    this.settings.put('ndpi_status_ndi_source_active', this.ndiActiveSource || '');
                    this.settings.put('ndpi_status_ndi_source_connected_time', this.ndiConnectedAt || '');
                    
                    this.settings.put('ndpi_status_ndi_source_framerate', String(this.ndiFramerate || ''));
                    this.settings.put('ndpi_status_ndi_source_resolution', this.ndiResolution || '');
                    
                    process.nextTick(() => { this.emit('connected') });
                }
        });

        this.receiver.on('error', (error) => {
            process.nextTick(() => { this.emit('error') });
            console.log(`🔴 [ client_ndiReceiver ][ NDI ] --▶ Critical Error:`, error);
        });

        this.receiver.stderr.on('data', (data) => {
            const output = data.toString().trim();
            output.split(/\r?\n/).forEach((line) => {
                console.log(`🔴 [ client_ndiReceiver ][ NDI ] --▶ Error: ${line}`);
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
            
            console.log(`[ client_ndiReceiver ][ NDI ] --▶ Terminated - Code:${code}, Signal:${signal}`);
            //this.server.broadcastToDisplay();

            //this.scheduleReconnect();
            this.emit('close');
        });
    }

    // close() {
    //     this.enabled = false;
    //     if (this.receiver)
    //         {
    //             this.chromium.launch();
    //             this.server.broadcastToDisplay();
    //         }
    //     setTimeout(() => {
    //         try { this.receiver.kill('SIGKILL') } catch {}
    //         console.log('[ client_ndiReceiver ][ NDI ] --▶ SIGKILL');
    //         this.receiver = null;
    //         if (!this.enabled)
    //             { this.emit('close') }
    //     }, 1000);
    // }
    
    close() {
        this.enabled = false;
        try
        {
            this.receiver.kill('SIGKILL');
            console.log('[ client_ndiReceiver ][ NDI ] --▶ SIGKILL');
        } catch {}
        this.receiver = null;
    }

    // scheduleReconnect(ms = 15000) {
    //     if (this.enabled)
    //         {
    //             this.server.broadcastToDisplay({ type: `ndi-init` });
    //             this.reconnectTimer = setTimeout(() => {
    //                 if (this.enabled && this.ndiSource && this.ndiSource !== 'none' && !this.receiver)
    //                     { this.connect() }
    //                 this.reconnectTimer = null;
    //             }, ms);
    //         }
    // }

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