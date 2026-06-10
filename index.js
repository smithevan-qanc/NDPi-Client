const fs = require('fs');
const path = require('path');
const func = require('./service/functions.js');
const { exec, spawn } = require('node:child_process');

const VERSION_DIR = path.join(__dirname, 'version');
const NDPi_VERSION = (
    fs.existsSync(`${VERSION_DIR}/current`)
    ? fs.readFileSync(`${VERSION_DIR}/current`, 'utf8')
    : '3.1.0'
);
const NDPi_VERSION_DATE = (
    fs.existsSync(`${VERSION_DIR}/current-date`)
    ? fs.readFileSync(`${VERSION_DIR}/current-date`, 'utf8')
    : '2026-02-04'
);

class NDPi {
    constructor() {

        this.isInitialized = false;

        this.settings = null;
        this.server_api = null;
        this.service_bonjour = null;
        this.service_chromium = null;
        this.controller_cec = null;
        this.ndiReceiver = new Map();

        this.lcdDisplayRestartTimer = null;
        this.lcdDisplay = null;

        this.wsConnection_ndpiServer = null;
        this.ndpiServerStatusUpdate = null; // Interval Timer

        this.timerRestartNdi = null;
        this.targetSource = 'none';

        this.compMgr = null;

        this.shutdown = false;

        this.initiate();

    }

    /** INITIATE */
    async initiate() {
        const execStartup = async () => {
            const startup = exec(`./sh/startup`);
            startup.stdout.on('data', (data) => {
                data
                    .toString()
                    .split(/\r?\n/)
                    .forEach((line) => { console.info(line) });
            });
            startup.on('exit', () => {
                console.info(process.env);
                this.startFsData();
            });
        };
        
        execStartup();
    }

    /**
     * START FILE SYSTEM WATCHER
     */
    startFsData() {
        const FileSystemMonitor = require('./service/client_fs.js');
        this.settings = new FileSystemMonitor(NDPi_VERSION, NDPi_VERSION_DATE);

        //  FS System Ready
        this.settings.on('ready', () => {
            this.targetSource = this.settings.get('ndpi_status_ndi_source_target') || 'none';
            func.setDisplayResolution();
            this.startLcdDisplay();
            this.startMdns();
            this.startApi();
        });

        //  NDI Source Target
        this.settings.on('ndpi_status_ndi_source_target', (data) => {
            const output = String(data || 'none');
            this.startNdiReceiver(output);
        });

        //  NDPi Hub Server IP
        this.settings.on('ndpi_command_server_host', (data) => {
            const output = String(data || '').trim() || null;

            if (!output)
            { return; }

            if (this.wsConnection_ndpiServer)
            {
                if (output !== this.wsConnection_ndpiServer.ndpiServerIp)
                {
                    this.wsConnection_ndpiServer.ndpiServerIp = output;
                    this.wsConnection_ndpiServer.close();
                    this.wsConnection_ndpiServer.connect();
                }
            }
        });

        //  NDPi Hub Server Port
        this.settings.on('ndpi_command_server_port', (data) => {
            const output = String(data || '').trim() || null;
            if (!output)
            { return; }

            try
            {
                if (output !== this.wsConnection_ndpiServer.ndpiServerIp)
                {
                    this.wsConnection_ndpiServer.ndpiServerIp = output;
                    this.wsConnection_ndpiServer.close();
                    this.wsConnection_ndpiServer.connect();
                }
            }
            catch {}
        });

        //  Device Name
        this.settings.on('device_name', (data) => {
            const output = String(data.toString().trim() || '') || null;
            if (!output)
            {
                fs.writeFileSync(path.join(process.env.DATA_NDPI_PATH, 'device_name'), this.settings.defaultDeviceName, 'utf8');
                return;
            }

            if (this.controller_cec)
            { this.controller_cec.updateDeviceName(output); }
        });

        //  Device IP
        this.settings.on('device_ip', (data) => {
            const output = String(data || '').trim() || null;
            if (!output)
            { return; }
        });

        //  API Port Number
        this.settings.on('local_port_number_api', async (data) => {
            const output = String(data || '').trim() || null;

            if (!output) { return; }

            if (this.service_chromium) { await this.service_chromium.close(); }
            if (this.server_api) { this.server_api.close(); }

            console.info(`[ ${path.basename(__filename).split('.')[0]} ] Updated API Server PORT.`);
            console.info(`[ ${path.basename(__filename).split('.')[0]} ] Restarting API Server.`);

            setTimeout(() => {
                this.startApi();
            }, 1000);
        });

        //  HDMI Port
        this.settings.on('output_display_port', async (data) => {
            const output = String(data || '').trim() || null;

            if (output) { await func.setDisplayResolution(); }
        });

        //  HDMI Resolution
        this.settings.on('output_display_resolution_preference', (data) => {
            func.setDisplayResolution();
        });

        //  HDMI Framerate
        this.settings.on('output_display_framerate_preference', () => {
            func.setDisplayResolution();
        });
    }

    /**
     * LAUNCH LCD DISPLAY RENDERER
     */
    async startLcdDisplay() {
        if (this.lcdDisplay)
        {
            await this._closeLcdDisplay();
            await func.wait(500);
        }

        this.lcdDisplay = spawn('python', ['update_lcd.py'], {
            cwd: this.settings.lcdDisplayScriptPath,
            env: { ...process.env }
        });

        this.lcdDisplay.on('spawn', () => {
            this.lcdDisplayRestartTimer = setTimeout(() => {
                this.lcdDisplayRestartTimer = null;
                this.startLcdDisplay();
            }, (60 * 60) * 1000);
        });

        this.lcdDisplay.stderr.on('data', (data) => {
            console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ update_lcd ][ ERROR ]`, data.toString());
        });

        this.lcdDisplay.on('error', (err) => {
            console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ update_lcd ][ ERROR ]`, err);
        });

        this.lcdDisplay.on('exit', (code, signal) => {
            console.info(`[ ${path.basename(__filename).split('.')[0]} ][ update_lcd ] Closed`);
        });
    }

    async _closeLcdDisplay () {
        return new Promise((resolve) => {
            this.lcdDisplay.once('exit', () => {
                this.lcdDisplay = null;
                resolve();
            });

            if (this.lcdDisplay)
            { this.lcdDisplay.kill(); }
            else
            { resolve(); }
            
        });
    }

    /**
     * START API
     */
    startApi() {
        const NDPiCommandServer_Client = require('./service/client_api_server_test.js');
        this.server_api = new NDPiCommandServer_Client(this.settings);

        this.server_api.on('online', () => {
            if (!this.isInitialized)
            {
                this.isInitialized = true;
                this.openCecController();
                this.connectToNDPiServer();
                this.startChromium();
            }
            else 
            { this.startChromium(); }
        });

        this.server_api.on('shutdown-command', () => {
            setTimeout(() => { shutdownDevice(); }, 1000);
        });

        this.server_api.on('reboot-command', () => {
            setTimeout(() => { rebootDevice(); }, 1000);
        });
    }

    async _closeApi() {
        if (this.server_api)
        { await this.server_api.close(); }
    }

    /**
     * START BONJOUR MDNS BROADCAST
     */
    startMdns() {
        const NDPiBonjourService = require('./service/client_bonjour.js');
        this.service_bonjour = new NDPiBonjourService(this.settings);
    }

    /**
     * LAUNCH LOCAL CHROMIUM DISPLAY
     */
    async startChromium() {
        if (fs.existsSync('/usr/bin/chromium'))
        {
            if (this.service_chromium)
            { await this.service_chromium.close(); }

            const ChromiumOverlayDisplay = require('./service/client_chromium.js');
            this.service_chromium = new ChromiumOverlayDisplay(this.settings, this.server_api);

            this.service_chromium.on('ready', () => {
                setTimeout(() => { this._afterChromiumStart(); }, 1000);
            });
        }
        else
        {
            console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ client_chromium ] Skipping Chromium display launch.`);
            console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ client_chromium ] -- Missing binary: /usr/bin/chromium`);
        }
    }
    
    async _afterChromiumStart() {
        func.fadeVolume(0, `${path.basename(__filename)} startChromium() service_chromium.on(ready)`);
        await func.raiseWindow_Chromium();
        await func.activateWindow_Chromium();

        if (String(this.targetSource).toLowerCase() !== 'none')
        {
            setTimeout(() => {
                this.startNdiReceiver(this.targetSource);
            }, 5000);
        }
    }

    /**
     * OPEN CEC CONTROLER
     */
    openCecController() {
        const CecController = require('./service/client_cec.js');
        this.controller_cec = new CecController(this.settings);

        this.controller_cec.on('ready', () => {
            this.server_api.controller_cec = this.controller_cec;
            this.controller_cec.send('on 0');
            setTimeout(() => {
                this.controller_cec.send('as');
            }, 2000);
        });

        this.controller_cec.on('event', (data) => { console.info(`[ ${path.basename(__filename).split('.')[0]} ][ client_cec ]`, data); });
        
        this.controller_cec.on('error_log', (data) => { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ client_cec ][ ERROR ]`, data); });

        this.controller_cec.on('timeout', (data) => {
            console.info(`[ ${path.basename(__filename).split('.')[0]} ][ client_cec ] ${String(data || 'CEC Unavailable')}`);
            this.controller_cec.close();
            this.controller_cec = null;
        });
    }

    /**
     * LAUNCH NDI RECEIVER
     */
    async startNdiReceiver(source = 'none') {
        if (source == 'none')
        {
            if (this.ndiReceiver.size >= 1)
            { this.ndiReceiver.forEach((receiver, key) => { receiver.close(); }); }
            return;
        }

        if (source !== this.targetSource)
        { this.targetSource = source; }

        // const NDI_Receiver_v4 = require('./service/client_ndiReceiver.js');

        this.ndiReceiver.forEach((receiver, key) => {
            if (key !== source)
            { receiver.close(); }
        });

        this.ndiReceiver.set(
            source,
            new (require('./service/client_ndiReceiver.js'))(
                this.settings,
                this.server_api
            ).once('close', () => {
                this._removeFromSet(source);
            })
        );
    }

    _removeFromSet(sourceName = '') {
        if (this.ndiReceiver.has(sourceName))
        { this.ndiReceiver.delete(sourceName); }
    }

    async closeReceivers() {
        for (const receiver of this.ndiReceiver)
        { await receiver.close(); }
    }
    async softCloseReceivers() {
        for (const receiver of this.ndiReceiver)
        { await receiver.softClose(); }
    }

    /**
     * OPEN COMMUNICATION WITH NDPI HUB SERVER
     */
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

// ******************************************************
// *                                                    *
// *                START NDPi PROCESS                  *
// *                                                    *
// ******************************************************
let quitAttempts = 0;
const index = new NDPi();

async function shutdownDevice() {
    await quitNDPi('SIGTERM', false);
    setTimeout(() => {
        exec('sudo shutdown now');
    }, 1000);
}

async function rebootDevice() {
    await quitNDPi('SIGTERM', false);
    setTimeout(() => {
        exec('sudo reboot');
    }, 1000);
}

async function quitNDPi(signal, exit = true) {
    const sig = signal ? `[ ${signal} ]` : '';

    console.info(`[ index ]${sig} Shutting down application...`);

    index.shutdown = true;

    console.log('*** 🛑 SHUTDOWN ⎯ 1');
    if (index.ndiReceiver.size >= 1)
    { try { await index.softCloseReceivers(); } catch {} }

    console.log('*** 🛑 SHUTDOWN ⎯ 2');
    try { clearInterval(index.ndpiServerStatusUpdate); } catch {}
    finally { index.ndpiServerStatusUpdate = null; }

    console.log('*** 🛑 SHUTDOWN ⎯ 3');
    try { clearTimeout(index.lcdDisplayRestartTimer); } catch {}
    finally { index.lcdDisplayRestartTimer = null; }

    console.log('*** 🛑 SHUTDOWN ⎯ 4');
    await index._closeLcdDisplay();

    console.log('*** 🛑 SHUTDOWN ⎯ 5');
    try { await index.controller_cec.close(); }
    catch {}

    console.log('*** 🛑 SHUTDOWN ⎯ 6');
    try { await index.service_bonjour.close(); }
    catch {}

    console.log('*** 🛑 SHUTDOWN ⎯ 7');
    try { index.wsConnection_ndpiServer.close(); }
    catch {}

    console.log('*** 🛑 SHUTDOWN ⎯ 8');
    await index._closeApi();

    console.log('*** 🛑 SHUTDOWN ⎯ 9');
    try { await index.settings.close(); }
    catch {}

    if (exit)
    { process.exit(0); }
}

process.on('uncaughtException', (err) => {
    console.error(' ');
    console.error('🔴🔴🔴');
    console.error('Uncaught Exception');
    console.error('------------------');
    console.error(err);
    console.error('------------------');
    console.error('🔴🔴🔴');
    console.error(' ');
});

process.on('unhandledRejection', (reason) => {
    console.error(' ');
    console.error('🔴');
    console.error('🔴🔴');
    console.error('🔴🔴🔴');
    console.error('Unhandled REJECTION');
    console.error('-------------------');
    console.error(reason);
    console.error('-------------------');
    console.error('  Restarting NDPi  ');
    console.error('🔴🔴🔴');
    console.error('🔴🔴');
    console.error('🔴');
    console.error(' ');
    if (quitAttempts < 10)
    {
        quitAttempts++;
        quitNDPi('unhandledRejection');
    }
    else
    { process.exit(1); }
});

process.on('SIGTERM', () => quitNDPi('SIGTERM'));
process.on('SIGINT',  () => quitNDPi('SIGINT'));

process.on('exit', (code) => {
    console.info(`[ EXIT CODE: ${code} ]`);
    console.info('══════════════════════════════════════════  N D P i - M O N I T O R  ═══');
});