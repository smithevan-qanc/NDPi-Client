const fs = require('fs');
const path = require('path');

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


class NDPi {
    constructor() {
        this.isInitialized = false;

        this.settings = null;
        this.server_api = null;
        this.service_bonjour = null;
        this.service_chromium = null;
        this.controller_cec = null;

        this.wsConnection_ndpiServer = null;
        this.ndpiServerStatusUpdate = null; // Interval Timer

        this.targetSource = 'none';

        this.initiate();
    }

    initiate() {
        const startup = require('node:child_process').exec(`./sh/startup`);
        startup.stdout.on('data', (data) => {
            data
                .toString()
                .split(/\r?\n/)
                .forEach((line) => { console.log(line) });
        });
        startup.on('exit', () => { this.startFsData(); });
    }

    startFsData() {
        const FileSystemMonitor = require('./service/client_fs.js');
        this.settings = new FileSystemMonitor(NDPi_VERSION, NDPi_VERSION_DATE);

        //  FS System Ready
        this.settings.on('ready', () => {
            this.setDisplayResolution();
            this.startApi();
        });

        //  NDI Source Target
        this.settings.on('ndpi_status_ndi_source_target', (data) => {
            const output = String(data || 'none');
            if (output !== this.targetSource)
                {
                    this.targetSource = output;
                    console.log('test 123d', String(this.targetSource).toLowerCase());
                    if (String(this.targetSource).toLowerCase() !== 'none')
                        { this.startNdiReceiver(); }
                    else
                        { this.ndiReceiver.close(); }
                }
        });

        //  No Source Display Mode
        this.settings.on('ndpi_status_no_source_display_mode', (data) => {
            const output = String(data || 'overlay');
            this.server_api.updateDisplay();
        });

        //  Server IP
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

        //  Server Port
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
            this.service_bonjour.localIp = output;
            this.service_bonjour._tryPublish();
        });

        //  Device Port Number
        this.settings.on('local_port_number_api', (data) => {
            const output = String(data || '').trim() || null;
            if (!output)
                { return }
            try { this.server_api.close() }
            catch {}
            this.startApi();
        });

        //  HDMI Port
        this.settings.on('output_device_port', (data) => {
            const output = String(data || '').trim() || null;
            if (!output)
                { return }
            setTimeout(() => { this.setDisplayResolution(); }, 500);
        });

        //  HDMI Resolution
        this.settings.on('output_resolution_current', (data) => {
            setTimeout(() => { this.setDisplayResolution(); }, 500);
        });

        //  HDMI Framerate
        this.settings.on('output_framerate_current', (data) => {
            setTimeout(() => { this.setDisplayResolution(); }, 500);
        });

    }

    startApi() {
        const NDPiCommandServer_Client = require('./service/client_api_server.js');
        this.server_api = new NDPiCommandServer_Client(this.settings);

        this.server_api.on('online', () => {
            if (!this.isInitialized)
                {
                    this.startMdns();
                    this.startChromium();
                    this.openCecController();
                    this.connectToNDPiServer();
                    this.targetSource = this.settings.get('ndpi_status_ndi_source_target');
                    if (String(this.targetSource || 'none').toLowerCase() !== 'none')
                        { setTimeout(() => { this.startNdiReceiver(); }, 5000); }
                    this.isInitialized = true;
                }
            else 
                {
                    this.service_bonjour.commandPort = output;
                    this.service_bonjour._tryPublish();
                    try { this.service_chromium?.close(); }
                    catch {}
                    finally
                    { 
                        this.service_chromium = null;
                        this.startChromium();
                    }
                }
        });

        this.server_api.on('start-ndi', (data) => {
            const output = String(data || 'none').trim();
            this.targetSource = output;
            this.startNdiReceiver();
        });
    }

    startMdns() {
        const NDPiBonjourService = require('./service/client_bonjour.js');
        this.service_bonjour = new NDPiBonjourService(this.settings);
    }

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

    openCecController() {
        const CecController = require('./service/client_cec.js');
        this.controller_cec = new CecController(this.settings);

        this.controller_cec.on('ready', () => {
            this.server_api.setCecController(this.controller_cec);
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

    startNdiReceiver() {
        if (!this.targetSource)
            { return }
        if (this.ndiReceiver)
            { this.ndiReceiver.close() }
        const NDI_Receiver_v2 = require('./service/client_ndiReceiver.js');
        this.ndiReceiver = new NDI_Receiver_v2(this.settings, this.server_api, this.service_chromium, this.targetSource, 'ndi_receiver_v2');

        this.ndiReceiver.on('connected', () => {
            console.log('[ index ][ client_ndiReceiver ] Receiver Started');
            this.service_chromium.close();
        });

        this.ndiReceiver.on('close', () => {
            this.ndiReceiver = null;
        });
    }

    //  TODO: Migrate the server status updates to be triggered like the display status updates.
    connectToNDPiServer() {
        const ClientServerWebSocket = require('./service/clientServer_websocket.js');
        this.wsConnection_ndpiServer = new ClientServerWebSocket(this.settings, this.server_api);
        this.wsConnection_ndpiServer.on('connected', () => {
            this.ndpiServerStatusUpdate = setInterval(() => {
                this.sendStatusToNDPiServer();
            }, 5000);
        });
    }

    // FUNCTIONS
    sendStatusToNDPiServer() {
        const status = {
            type: 'client-status',
            ndiInfo: {}
        };
        status.deviceId = this.settings.get('device_id');
        status.deviceName = this.settings.get('device_name');
        status.ip = this.settings.get('device_ip');
        status.currentSource = this.settings.get('ndpi_status_ndi_source_active');
        status.targetSource = this.settings.get('ndpi_status_ndi_source_target');
        status.displayMode = this.settings.get('ndpi_status_no_source_display_mode');
        status.ndiInfo.resolution = this.settings.get('ndpi_status_ndi_source_resolution');
        status.ndiInfo.framerate = this.settings.get('ndpi_status_ndi_source_framerate');
        status.ndiInfo.displayResolution = this.settings.get('output_resolution_current');
        status.ndiInfo.displayName = this.settings.get('output_framerate_current');
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

    setDisplayResolution() {
        const displayOutput = this.settings.get('output_device_port') || 'HDMI-1';
        const resolution = this.settings.get('output_resolution_current') || null;
        const framerate  = this.settings.get('output_framerate_current') || null;
        require('child_process').exec(`xrandr \
            --output ${displayOutput} \
            ${resolution ? `--mode ${resolution}` : '--auto'} \
            ${framerate ? `--rate ${framerate}` : ''} \
        `, { env: { ...process.env } }, (error, stderr) => {
            if (error)
                { console.log('🔴 [ index ][ ERROR ] Resolution Set', stderr) }
            else
                {
                    require('node:child_process').exec('openbox --restart', {
                        env: { ...process.env }
                    }, (error, stdout, stderr) => {
                        console.log(error ? `🔴 [ index ][ ERROR ] ${String(stderr)}` : ``);
                    });
                }
        });
    }
}

const index = new NDPi();

function quitNDPi(signal) {
    const sig = signal ? `[ ${signal} ]` : '';
    console.log(`[ index ]${sig} Shutting down application...`);
    if (index.ndpiServerStatusUpdate)
        {
            clearInterval(index.ndpiServerStatusUpdate);
            index.ndpiServerStatusUpdate = null;
        }
    try { index.ndiReceiver?.close(); } catch {}
    try { index.controller_cec?.close(); } catch {}
    try { index.service_bonjour?.close(); } catch {}
    try { index.service_chromium?.close(); } catch {}
    try { index.wsConnection_ndpiServer?.close(); } catch {}
    try { index.server_api?.close(); } catch {}
    try { index.settings?.close(); } catch {}
    process.exit(0);
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