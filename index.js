const fs = require('fs');
const path = require('path');
const func = require('./service/functions.js');
const { exec, spawn } = require('node:child_process');

const VERSION_DIR = path.join(__dirname, 'version');
const NDPi_VERSION = (
    fs.existsSync(`${VERSION_DIR}/current`)
    ? fs.readFileSync(`${VERSION_DIR}/current`, 'utf8')
    : '3.1'
);
const NDPi_VERSION_DATE = (
    fs.existsSync(`${VERSION_DIR}/current-date`)
    ? fs.readFileSync(`${VERSION_DIR}/current-date`, 'utf8')
    : '2026-02-04'
);

// const spi = require('spi-device');

// const device = spi.openSync(0, 0);

// const message = [{
//     sendBuffer: Buffer.from([0x01, 0x02, 0x03]),
//     receiveBuffer: Buffer.alloc(3),
//     byteLength: 3,
//     speedHz: 1000000
// }];

// device.transfer(message, (err, messages) => {
//     if (err) throw err;
//     console.log(messages[0].receiveBuffer);
// });


class NDPi {
    constructor() {
        this.isInitialized = false;

        this.settings = null;
        this.server_api = null;
        this.service_bonjour = null;
        this.service_chromium = null;
        this.controller_cec = null;
        this.lcdDisplay = null;

        this.wsConnection_ndpiServer = null;
        this.ndpiServerStatusUpdate = null; // Interval Timer

        this.timerRestartNdi = null;
        this.targetSource = 'none';

        this.compMgr = null;

        this.initiate();
    }

    /** INITIATE */
    initiate() {
        const startup = exec(`./sh/startup`);
        startup.stdout.on('data', (data) => {
            data
                .toString()
                .split(/\r?\n/)
                .forEach((line) => { console.log(line) });
        });
        startup.on('exit', () => { 
            this.startFsData();
        });
        // try { exec('killall xcompmgr'); } catch {}
        // try { exec('killall picom'); } catch {}
        
        // this.compMgr = exec('./sh/xcompmgr');
        // this.compMgr = spawn('xcompmgr', ['-d', ':0', '-fFn']);
    }

    /** START FILE SYSTEM WATCHER */
    startFsData() {
        const FileSystemMonitor = require('./service/client_fs.js');
        this.settings = new FileSystemMonitor(NDPi_VERSION, NDPi_VERSION_DATE);

        //  FS System Ready
        this.settings.on('ready', () => {
            this.startLcdDisplay();
            func.setDisplayResolution();
            this.startApi();
        });

        //  NDI Source Target
        this.settings.on('ndpi_status_ndi_source_target', (data) => {
            const output = String(data || 'none');
            if (output !== this.targetSource)
            {
                this.targetSource = output;
                if (String(this.targetSource).toLowerCase() !== 'none')
                {
                    func.focusWindow('chromium');
                    try { this.ndiReceiver.close(); } catch {}
                    setTimeout(() => {
                        this.startNdiReceiver();
                    }, 1000);
                }
                else
                {
                    func.focusWindow('chromium');
                    setTimeout(() => {
                        try { this.ndiReceiver.close(); } catch {}
                    }, 800);
                }
            }
        });

        //  No Source Display Mode
        this.settings.on('ndpi_status_no_source_display_mode', (data) => {
            const output = String(data || 'overlay');
            this.server_api.updateDisplay({ type: `show-${output}` });
        });

        //  NDPi Hub Server IP
        this.settings.on('ndpi_command_server_host', (data) => {
            const output = String(data || '').trim() || null;
            if (!output)
                { return }
            this.server_api.updateDisplay({
                type: 'update-details',
                serverIp: output
            });
            if (output !== this.wsConnection_ndpiServer.ndpiServerIp)
                {
                    this.wsConnection_ndpiServer.ndpiServerIp = output;
                    this.wsConnection_ndpiServer.close();
                    this.wsConnection_ndpiServer.connect();
                }
        });

        //  NDPi Hub Server Port
        this.settings.on('ndpi_command_server_port', (data) => {
            const output = String(data || '').trim() || null;
            if (!output)
                { return }
            if (output !== this.wsConnection_ndpiServer.ndpiServerPort)
                {
                    this.wsConnection_ndpiServer.close();
                    this.wsConnection_ndpiServer = null;
                    this.connectToNDPiServer();
                }
        });

        //  Device Name
        this.settings.on('device_name', (data) => {
            const output = String(data || this.settings.defaultDeviceName);
            this.server_api.updateDisplay({
                type: 'update-details',
                thisDevice: { name: output }
            });
            this.service_bonjour.deviceName = output;
            this.service_bonjour._tryPublish();
            this.controller_cec.deviceName = output;
            this.controller_cec.send('q');
        });

        //  Device IP
        this.settings.on('device_ip', (data) => {
            const output = String(data || '').trim() || null;

            if (!output)
            { return }

            this.server_api.updateDisplay({
                type: 'update-details',
                thisDevice: { address: output }
            });

            if (!this.service_bonjour)
            {
                this.startMdns();
            }
            else
            {
                this.service_bonjour.localIp = output;
                this.service_bonjour._tryPublish();
            }
        });

        //  API Port Number
        this.settings.on('local_port_number_api', (data) => {
            const output = String(data || '').trim() || null;
            if (!output)
            { return; }

            try { this.server_api.close(); } catch {}
            this.startApi();
        });

        //  HDMI Port
        this.settings.on('output_display_port', (data) => {
            const output = String(data || '').trim() || null;
            if (!output)
                { return; }
            setTimeout(() => { func.setDisplayResolution(); }, 500);
        });

        //  HDMI Resolution
        this.settings.on('output_display_resolution_preference', (data) => {
            setTimeout(() => { func.setDisplayResolution(); }, 500);
        });

        //  HDMI Framerate
        this.settings.on('output_display_framerate_preference', (data) => {
            setTimeout(() => { func.setDisplayResolution(); }, 500);
        });

    }

    /** LAUNCH LCD DISPLAY RENDERER */
    startLcdDisplay() {
        if (this.lcdDisplay)
        { try { this.lcdDisplay.kill(); } catch {} }

        this.lcdDisplay = spawn('python3', ['update_lcd.py'], { cwd: this.settings.lcdDisplayScriptPath });

        this.lcdDisplay.on('error', (error) => {
            console.error(`🔴 [ python ][ ERROR ] ${error.toString()}`);
        });
    }

    /** START API */
    startApi() {
        const NDPiCommandServer_Client = require('./service/client_api_server.js');
        this.server_api = new NDPiCommandServer_Client(this.settings);

        this.server_api.on('online', () => {
            if (!this.isInitialized)
            {
                this.startChromium();
                this.openCecController();
                this.connectToNDPiServer();
                this.targetSource = this.settings.get('ndpi_status_ndi_source_target');
                if (String(this.targetSource || 'none').toLowerCase() !== 'none')
                    { 
                        setTimeout(() => {
                            this.startNdiReceiver();
                        }, 5000);
                    }
                this.isInitialized = true;
            }
            else 
            {
                if (this.service_bonjour)
                {
                    this.service_bonjour.commandPort = output;
                    this.service_bonjour._tryPublish();
                }
                
                try 
                { this.service_chromium?.close(); }
                catch {}
                finally
                { 
                    this.service_chromium = null;
                    this.startChromium();
                }
            }
        });

        this.server_api.on('shutdown', () => {
            setTimeout(() => {
                shutdownDevice();
            }, 1000);
        });
        this.server_api.on('reboot', () => {
            setTimeout(() => {
                rebootDevice();
            }, 1000);
        });
    }

    /** START BONJOUR MDNS BROADCAST */
    startMdns() {
        const NDPiBonjourService = require('./service/client_bonjour.js');
        this.service_bonjour = new NDPiBonjourService(this.settings);
    }

    /** LAUNCH LOCAL CHROMIUM DISPLAY */
    startChromium() {
        if (fs.existsSync('/usr/bin/chromium'))
        {
            const ChromiumOverlayDisplay = require('./service/client_chromium.js');
            this.service_chromium = new ChromiumOverlayDisplay(this.settings, this.server_api);
        } 
        else
        {
            console.log('[ index ][ client_chromium ] Skipping Chromium display launch.');
            console.log('[ index ][ client_chromium ] -- Missing binary: /usr/bin/chromium');
        }
    }

    /** OPEN CEC CONTROLER */
    openCecController() {
        const CecController = require('./service/client_cec.js');
        this.controller_cec = new CecController(this.settings);

        this.controller_cec.on('ready', () => {
            this.server_api.setCecController(this.controller_cec);
            // Command TV to turn ON <<< Then, Command TV to display this device as the active source.
            this.controller_cec.proc.stdin.write('on 0\n');
            setTimeout(() => {
                this.controller_cec.proc.stdin.write('as\n');
            }, 3000);
        });

        this.controller_cec.on('event', (data) => {
            console.log(`[ index ][ client_cec ]`, data);
        });
        
        this.controller_cec.on('error_log', (data) => {
            console.log(`🔴 [ index ][ client_cec ][ ERROR ]`, data);
        });

        this.controller_cec.on('timeout', (data) => {
            console.log(`[ index ][ client_cec ] ${String(data || 'CEC Unavailable')}`);
            this.controller_cec.quit();
            this.controller_cec = null;
        });
    }

    /** LAUNCH NDI RECEIVER */
    startNdiReceiver() {
        if (this.ndiReceiver)
        {
            this.ndiReceiver.close();
            return;
        }
        const NDI_Receiver_v2 = require('./service/client_ndiReceiver.js');
        this.ndiReceiver = new NDI_Receiver_v2(this.settings, this.server_api, this.service_chromium);

        this.ndiReceiver.on('connected', () => {
            console.log('[ index ][ client_ndiReceiver ] Receiver Started');
            this.server_api.updateDisplay({ type: `show-ndi` });
            //this.service_chromium.close();
        });

        this.ndiReceiver.on('close', () => {
            
            // if (String(this.targetSource || 'none').toLowerCase() !== 'none') 
            if (this.ndiReceiver.enabled) 
            { this.__restartNdiReceiver(); }
            else 
            { setTimeout(() => { this.server_api.broadcastToDisplay(); }, 400); }
            
            this.ndiReceiver = null;
        });
    }

    /** RELAUNCH NDI RECEIVER */
    __restartNdiReceiver(wait = 1000) {
        if (!this.timerRestartNdi)
        {
            this.timerRestartNdi = setTimeout(() => {
                this.startNdiReceiver();
                this.timerRestartNdi = null;
            }, wait);
        }
    }

    /** OPEN COMMUNICATION WITH NDPI HUB SERVER */
    connectToNDPiServer() {
        const ClientServerWebSocket = require('./service/clientServer_websocket.js');
        this.wsConnection_ndpiServer = new ClientServerWebSocket(this.settings, this.server_api);
        this.wsConnection_ndpiServer.on('connected', () => {
            this.ndpiServerStatusUpdate = setInterval(() => {
                this.sendStatusToNDPiServer();
            }, 5000);
        });
    }

    /** HELPER FUNCTIONS */
    sendStatusToNDPiServer() {
        const status = {
            type: 'client-status',
            ndiInfo: {},
            fsMap: Array.from(this.settings.fileMap)
        };
        status.deviceId = this.settings.get('device_id');
        status.deviceName = this.settings.get('device_name');
        status.ip = this.settings.get('device_ip');
        status.currentSource = this.settings.get('ndpi_status_ndi_source_active');
        status.targetSource = this.settings.get('ndpi_status_ndi_source_target');
        status.displayMode = this.settings.get('ndpi_status_no_source_display_mode');
        status.ndiInfo.resolution = this.settings.get('ndpi_status_ndi_source_resolution');
        status.ndiInfo.framerate = this.settings.get('ndpi_status_ndi_source_framerate');
        status.ndiInfo.displayResolution = this.settings.get('output_display_resolution_current');
        status.ndiInfo.displayName = this.settings.get('output_display_framerate_current');
        status.ndiInfo.connectedAt = this.settings.get('ndpi_status_ndi_source_connected_time');
        status.status = this.settings.get('ndpi_status_ndi');
        status.systemStats = {
            cpu: 0,
            memory: { used: 0, total: 0, percent: 0 },
            temperature: 0,
            uptime: 0
        };

        this.wsConnection_ndpiServer.send(status);
    }
}

const index = new NDPi();

async function shutdownDevice() {
    await quitNDPi('SIGTERM', false);
    exec('sudo shutdown now');
}

async function rebootDevice() {
    await quitNDPi('SIGTERM', false);
    exec('sudo reboot');
}

async function quitNDPi(signal, exit = true) {
    await new Promise((resolve) => {
        const sig = signal ? `[ ${signal} ]` : '';
        console.log(`[ index ]${sig} Shutting down application...`);
        if (index.ndpiServerStatusUpdate)
            {
                clearInterval(index.ndpiServerStatusUpdate);
                index.ndpiServerStatusUpdate = null;
            }
        try { index.ndiReceiver?.close(); } catch {}
        try { index.lcdDisplay?.kill() } catch {}
        try { index.controller_cec?.close(); } catch {}
        try { index.service_bonjour?.close(); } catch {}
        try { index.service_chromium?.close(); } catch {}
        try { index.wsConnection_ndpiServer?.close(); } catch {}
        try { index.server_api?.close(); } catch {}
        try { index.settings?.close(); } catch {}
        setTimeout(() => {
            resolve();
        }, 3000);
    });
    if (exit)
    { process.exit(0); }
}

process.on('uncaughtException', (err) => {
    console.log(' ');
    console.log('🔴');
    console.log('🔴🔴');
    console.log('🔴🔴🔴');
    console.log('Uncaught Exception');
    console.log('------------------');
    console.log(err);
    console.log('------------------');
    console.log('🔴🔴🔴');
    console.log('🔴🔴');
    console.log('🔴');
    console.log(' ');
});
process.on('unhandledRejection', (reason) => {
    console.log(' ');
    console.log('🔴');
    console.log('🔴🔴');
    console.log('🔴🔴🔴');
    console.log('Unhandled REJECTION');
    console.log('-------------------');
    console.log(reason);
    console.log('-------------------');
    console.log('🔴🔴🔴');
    console.log('🔴🔴');
    console.log('🔴');
    console.log(' ');
    quitNDPi('unhandledRejection');
});

process.on('SIGTERM', () => quitNDPi('SIGTERM'));
process.on('SIGINT',  () => quitNDPi('SIGINT'));

process.on('exit', (code) => {
    console.log(`[ EXIT CODE: ${code} ]`);
    console.log('══════════════════════════════════════════  N D P i - M O N I T O R  ═══');
});