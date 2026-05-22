const { EventEmitter } = require('events');
const { spawn } = require('node:child_process');
const { setTimeout, clearTimeout } = require('node:timers');
const path = require('path');
const func = require('./functions');
const { OutgoingMessage } = require('node:http');

class NDI_Receiver_v2 extends EventEmitter {
    constructor(
        fsData,
        api,
        chromium,
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

        this.secondsInactive = 0;

        this.reconnectTimer = null;
        this.updateFsDebounce = null;

        this.receiver = null;
        this.receiverName = this.settings.get('ndi_receiver_exec');
        this.libraryPath = libraryPath || `/opt/NDI SDK for Linux/lib/aarch64-rpi4-linux-gnueabi:${(process.env.LD_LIBRARY_PATH || '')}`;
        this.xAuth = xAuthority || `${this.homeDirectory}/.Xauthority`;

        this.ndiSource = this.settings.get('ndpi_status_ndi_source_target') || 'none';
        
        /**
         * 
         * NDIlib_recv_bandwidth_metadata_only  = -10,          // Receive metadata.
         * NDIlib_recv_bandwidth_audio_only     = 10,           // Receive metadata, audio.
         * NDIlib_recv_bandwidth_lowest         = 0,            // Receive metadata, audio, video at a lower bandwidth and resolution.
         * NDIlib_recv_bandwidth_highest        = 100,          // Receive metadata, audio, video at full resolution.
         * NDIlib_recv_bandwidth_max            = 0x7fffffff
         * 
         */
        this.ndiBandwidth = this.settings.get('ndi_receiver_bandwidth') || '0';
        
        /**
         * 
         * NDIlib_recv_color_format_BGRX_BGRA   = 0
         * NDIlib_recv_color_format_UYVY_BGRA   = 1
         * NDIlib_recv_color_format_RGBX_RGBA   = 2
         * NDIlib_recv_color_format_UYVY_RGBA   = 3
         * NDIlib_recv_color_format_fastest     = 100
         * NDIlib_recv_color_format_best        = 101
         * 
         */
        this.ndiColorFormat = this.settings.get('ndi_receiver_color_format') || '100';

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

        this.receiver = spawn(`${this.parentDirectory}/${this.receiverName}`, [this.ndiSource, this.ndiBandwidth, this.ndiColorFormat], {
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
                process.nextTick(() => { this.emit('connected') });
            }
            else if (output.includes('Reconnected to:'))
            {
                this.secondsInactive = 0;
                this.ndiStatus = 'streaming';
                this.settings.put('ndpi_status_ndi', this.ndiStatus);
                func.focusWindow('gstreamer');
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
        func.focusWindow('chromium');
        try
        {
            this.receiver.kill('SIGKILL');
            console.log('[ client_ndiReceiver ][ NDI ] --▶ SIGKILL');
        }
        catch {}
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
        const logInfo = (line = '') => { console.log(`[ client_ndiReceiver ][ NDI ] --▶ ${line}`); }
        data.split(/\r?\n/).forEach((stdout) => {
            const str = String(stdout || '');
            if (str && !str.startsWith('- '))
            {
                const KeyValues = str.split('^');
                switch(KeyValues[0])
                {
                    case 'Display_Resolution':
                        logInfo(`${KeyValues[0]} = ${KeyValues[1]}`);
                        break;
                    case 'NDI_Source_Compression':
                        logInfo(`${KeyValues[0]} = ${KeyValues[1]}`);
                        break;
                    case 'NDI_Source_Resolution':
                        logInfo(`${KeyValues[0]} = ${KeyValues[1]}`);
                        this.ndiResolution = KeyValues[1];
                        this.settings.put('ndpi_status_ndi_source_resolution', this.ndiResolution || '');
                        break;
                    case 'NDI_Source_Framerate':
                        logInfo(`${KeyValues[0]} = ${KeyValues[1]}`);
                        this.ndiFramerate = KeyValues[1];
                        this.settings.put('ndpi_status_ndi_source_framerate', String(this.ndiFramerate || ''));
                        break;
                    case 'NDI_Source_Not_Active':
                        this.secondsInactive++;
                        this.processInactiveStream();
                        break;
                    default:
                        //
                        break;
                }
            }
            else
            { logInfo(stdout); }
        });

        // const videoMatch = data.match(/(?:Video|Source):\s*(\d+)x(\d+)\s*@\s*(\d+(?:\.\d+)?)/i);
        // if (videoMatch)
        // {
        //     this.ndiResolution = `${videoMatch[1]}x${videoMatch[2]}`;
        //     this.ndiFramerate = parseFloat(videoMatch[3]);
        // }
        // if (!this.ndiResolution)
        // {
        //     const resMatch = data.match(/(\d{3,4})x(\d{3,4})/);
        //     if (resMatch)
        //         { this.ndiResolution = `${resMatch[1]}x${resMatch[2]}` }
        // }
        // if (!this.ndiFramerate)
        // {
        //     const fpsMatch = data.match(/(\d+(?:\.\d+)?)\s*fps|@\s*(\d+(?:\.\d+)?)/i);
        //     if (fpsMatch)
        //         { this.ndiFramerate = parseFloat(fpsMatch[1] || fpsMatch[2]) }
        // }
    }

    processInactiveStream() {
        switch(this.secondsInactive)
        {
            case 1:
                //this.ndiStatus = 'stalled';
                this.settings.put('ndpi_status_ndi', 'stalled');
                return;
                break;
            case 10:
                console.log(`[ client_ndiReceiver ] ${this.ndiSource} inactive for ${this.secondsInactive} seconds.`);
                return;
                break;
            case 20:
                console.log(`[ client_ndiReceiver ] ${this.ndiSource} inactive for ${this.secondsInactive} seconds.`);
                return;
                break;
            case 30:
                console.log(`[ client_ndiReceiver ] ${this.ndiSource} inactive for ${this.secondsInactive} seconds.`);
                return;
                break;
            case 40:
                console.log(`[ client_ndiReceiver ] ${this.ndiSource} inactive for ${this.secondsInactive} seconds.`);
                return;
                break;
            case 50:
                console.log(`[ client_ndiReceiver ] ${this.ndiSource} inactive for ${this.secondsInactive} seconds.`);
                return;
                break;
            case 60:
                console.log(`[ client_ndiReceiver ] ${this.ndiSource} inactive for ${this.secondsInactive} seconds.`);
                return;
                break;
            default:
                if (this.secondsInactive === 61)
                { console.log(`[ client_ndiReceiver ] ${this.ndiSource} inactive longer than 60 seconds. Awaiting reconnection.`); }
                return;
                break;
        }
    }
}

module.exports = NDI_Receiver_v2;