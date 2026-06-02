const { EventEmitter } = require('node:events');
const { spawn, exec } = require('node:child_process');
const path = require('path');
const func = require('./functions');

class NDI_Receiver_v4 extends EventEmitter {
    constructor(
        fsData,
        api,
        chromium,
        libraryPath = '',
        xAuthority = ''
    ) {
        super();

        this.settings = fsData;
        this.server = api;
        this.chromium = chromium;

        this.parentDirectory = path.join(__dirname, '..');

        this.reconnectTimer = null;

        this.receiver = null;

        this.receiverName = this.settings.get('ndi_receiver_exec');
        this.libraryPath = libraryPath || `/opt/NDI SDK for Linux/lib/aarch64-rpi4-linux-gnueabi:${process.env.LD_LIBRARY_PATH}`;
        this.xAuth = xAuthority || `${process.env.HOME}/.Xauthority`;

        this.ndiSource = this.settings.get('ndpi_status_ndi_source_target') || 'none';
        
        /**
         * NDIlib_recv_bandwidth_metadata_only  = -10,          // Receive metadata.
         * NDIlib_recv_bandwidth_audio_only     = 10,           // Receive metadata, audio.
         * NDIlib_recv_bandwidth_lowest         = 0,            // Receive metadata, audio, video at a lower bandwidth and resolution.
         * NDIlib_recv_bandwidth_highest        = 100,          // Receive metadata, audio, video at full resolution.
         * NDIlib_recv_bandwidth_max            = 0x7fffffff
         */
        this.ndiBandwidth = this.settings.get('ndi_receiver_bandwidth') || '0';
        
        /**
         * NDIlib_recv_color_format_BGRX_BGRA   = 0
         * NDIlib_recv_color_format_UYVY_BGRA   = 1
         * NDIlib_recv_color_format_RGBX_RGBA   = 2
         * NDIlib_recv_color_format_UYVY_RGBA   = 3
         * NDIlib_recv_color_format_fastest     = 100
         * NDIlib_recv_color_format_best        = 101
         */
        this.ndiColorFormat = this.settings.get('ndi_receiver_color_format') || '100';

        this.ndiActiveSource = null;
        this.ndiConnectedAt = null;
        this.ndiFramerate = null;
        this.ndiResolution = null;
        this.ndiStatus = 'idle';

        this.enabled = true;
        this.closing = false;
        this.secondsInactive = 0;

        if (this.ndiSource.toLowerCase() !== 'none')
        { this.connect(); }
    }

    connect() {
        this.receiver = spawn(`${this.parentDirectory}/${this.receiverName}`, [
            '--source', this.ndiSource,
            '--bandwidth', this.ndiBandwidth,
            '--color-format', this.ndiColorFormat,
            //'--framesync'
        ], {
            env: {
                ...process.env,
                DISPLAY: ':0',
                XAUTHORITY: this.xAuth,
                LD_LIBRARY_PATH: this.libraryPath
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.receiver.stdout.on('data', (data) => {
            const showNDI = (delay = 1000) => {
                setTimeout(() => {
                    func.focusNdi();
                    func.fadeVolume(255, `${path.basename(__filename)} connect(); stdout.on(data)`);

                    setTimeout(() => {
                        this.server.updateDisplay({ type: `show-ndi` });
                    }, 10000);
                }, delay);
            }

            const output = data.toString().trim();
            this.logInfo(output);

            if (output.includes('NDI Receiver started:'))
            {
                this.secondsInactive = 0;
                this.ndiConnectedAt = new Date().toISOString();
                this.ndiActiveSource = this.ndiSource;
                this.ndiStatus = 'streaming';

                this.settings.put('ndpi_status_ndi', this.ndiStatus);
                this.settings.put('ndpi_status_ndi_source_active', this.ndiActiveSource || '');
                this.settings.put('ndpi_status_ndi_source_connected_time', this.ndiConnectedAt || '');

                console.info(`[ ${path.basename(__filename).split('.')[0]} ][ client_ndiReceiver ] Receiver Started`);
            }

            if (output.includes('Connected to:'))
                { showNDI(500); }

            if (output.includes('Reconnected to:'))
            {
                this.ndiStatus = 'streaming';
                this.settings.put('ndpi_status_ndi', this.ndiStatus);
                this.secondsInactive = 0;
            }
        });

        this.receiver.stderr.on('data', (data) => {
            func.stdoutToArray(data.toString().trim()).forEach((line) => {
                console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] -`, line);
            });
        });

        this.receiver.on('error', (error) => {
            console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ][ RECEIVER ERROR ] -`, error);
            this.emit('error');
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
        });
    }

    /**
     * Kill the NDI Receiver without resetting the target source.
     * To reactivate the source, call 'thisModule.connect();'
     */
    async softClose() {
        func.fadeVolume(0, `${path.basename(__filename)} softClose()`);
        await func.focusChromium();
        
        try { this.receiver.kill('SIGTERM'); }
        catch {}
    }
    
    /**
     * Kill the NDI Receiver and close out of the module.
     * @param {boolean} shutdown - Set as true when exiting the entire NDPi Process.
     */
    async close(shutdown = false) {
        this.enabled = false;

        setTimeout(() => {});
        func.fadeVolume(0, `${path.basename(__filename)} close()`);
        await func.focusChromium();

        if (this.receiver)
        {
            return new Promise((resolve) => {
                if (this.receiver?.exitCode !== null || this.receiver?.killed) {
                    resolve();
                    return;
                }

                this.receiver.once('exit', (code, signal) => {
                    console.info( `[ ${path.basename(__filename).split('.')[0]} ]`, 'Module Exited' );
                    this.emit('close');
                    resolve();
                    return;
                });

                try 
                {
                    console.info( `[ ${path.basename(__filename).split('.')[0]} ]`, 'Closing Module' );
                    this.receiver.kill('SIGTERM');
                }
                catch
                { 
                    if (!this.receiver.killed)
                    { this.receiver.kill('SIGKILL'); }
                }

            });
        }
    }

    logInfo(data) {
        const log = (line = '') => {
            console.info(`[ ${path.basename(__filename).split('.')[0]} ][ NDI ] ⎯→ ${line}`);
        }
        data.split(/\r?\n/).forEach((stdout) => {
            const str = String(stdout || '');

            if (str && !str.startsWith('- '))
            {
                const KeyValues = str.split('^');
                switch(KeyValues[0])
                {
                    case 'Display_Resolution':
                        log(`${KeyValues[0]} = ${KeyValues[1]}`);
                        break;
                    case 'NDI_Source_Compression':
                        log(`${KeyValues[0]} = ${KeyValues[1]}`);
                        break;
                    case 'NDI_Source_Resolution':
                        log(`${KeyValues[0]} = ${KeyValues[1]}`);
                        this.ndiResolution = KeyValues[1];
                        this.settings.put('ndpi_status_ndi_source_resolution', this.ndiResolution || '');
                        break;
                    case 'NDI_Source_Framerate':
                        log(`${KeyValues[0]} = ${KeyValues[1]}`);
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
            { log(stdout); }
        });
    }

    processInactiveStream() {
        switch(this.secondsInactive)
        {
            case 2:
                //this.ndiStatus = 'stalled';
                this.settings.put('ndpi_status_ndi', 'stalled');
                return;
                break;
            case 10:
                console.info(`[ ${path.basename(__filename).split('.')[0]} ] ${this.ndiSource} inactive for ${this.secondsInactive} seconds.`);
                return;
                break;
            case 20:
                console.info(`[ ${path.basename(__filename).split('.')[0]} ] ${this.ndiSource} inactive for ${this.secondsInactive} seconds.`);
                return;
                break;
            case 30:
                console.info(`[ ${path.basename(__filename).split('.')[0]} ] ${this.ndiSource} inactive for ${this.secondsInactive} seconds.`);
                return;
                break;
            case 40:
                console.info(`[ ${path.basename(__filename).split('.')[0]} ] ${this.ndiSource} inactive for ${this.secondsInactive} seconds.`);
                return;
                break;
            case 50:
                console.info(`[ ${path.basename(__filename).split('.')[0]} ] ${this.ndiSource} inactive for ${this.secondsInactive} seconds.`);
                return;
                break;
            case 60:
                console.info(`[ ${path.basename(__filename).split('.')[0]} ] ${this.ndiSource} inactive for ${this.secondsInactive} seconds.`);
                return;
                break;
            default:
                if (this.secondsInactive === 61)
                { console.info(`[ ${path.basename(__filename).split('.')[0]} ] ${this.ndiSource} inactive longer than 60 seconds. Awaiting reconnection.`); }
                return;
                break;
        }
    }
}

module.exports = NDI_Receiver_v4;