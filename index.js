//const NDPiClient = require('./service/NDPiClient.js');

const fs = require('fs');
const path = require('path');

const VERSION_DIR = path.join(__dirname, 'version');
const NDPi_VERSION = (
    fs.existsSync(`${VERSION_DIR}/current`) ? 
    fs.readFileSync(`${VERSION_DIR}/current`, 'utf8') :
    '3.1'
);
const NDPi_VERSION_DATE = (
    fs.existsSync(`${VERSION_DIR}/current-date`) ? 
    fs.readFileSync(`${VERSION_DIR}/current-date`, 'utf8') :
    '2026-02-04'
);


class NDPi {
    constructor() {
        this.settings = null;
        this.server_api = null;
        this.service_bonjour = null;
        this.service_chromium = null;
        this.controller_cec = null;
        this.connection_ndpiServer = null;
        this.ndpiServerStatusUpdate = null; // Interval Timer

        this.targetSource = null;

        this.initiate();
    }

    initiate() {
        const startup = require('node:child_process').exec(`./sh/startup`);
        startup.stdout.on('data', (data) => {
            data
                .toString()
                .split(/\r?\n/)
                .forEach((line) => {
                console.log(line);
            });
        });
        startup.on('exit', () => {
            this.startFsData();
        });
    }

    startFsData() {
        const FileSystemMonitor = require('./service/client_fs.js');
        this.settings = new FileSystemMonitor(NDPi_VERSION, NDPi_VERSION_DATE);

        this.settings.on('ready', () => {
            this.startApi();
        });

        this.settings.on('ndpi_status_ndi_source_target', (data) => {
            const updatedTarget = data.toString() || null;
            if (updatedTarget !== this.targetSource) {
                this.targetSource = updatedTarget;
                if (this.targetSource && String(this.targetSource).toLowerCase() !== 'none') {
                    this.startNdiReceiver();
                } else {
                    this.ndiReceiver.close();
                }
            }
        });
    }

    startApi() {
        const port = this.settings.get('local_port_number_api');
        const NDPiCommandServer_Client = require('./service/client_api_server.js');
        this.server_api = new NDPiCommandServer_Client(this.settings);
        this.server_api.on('online', () => {
            console.log('[ client_api_server ] Ready.');
            this.startMdns();
            this.startChromium();
            this.openCecController();
            this.connectToNDPiServer();
            this.targetSource = this.settings.get('ndpi_status_ndi_source_target') || null;
            if (this.targetSource) this.startNdiReceiver(sourceTarget);
        });
    }

    startMdns() {
        const NDPiBonjourService = require('./service/client_bonjour.js');
        this.service_bonjour = new NDPiBonjourService(this.settings);
    }

    startChromium() {
        if (fs.existsSync('/usr/bin/chromium')) {
            const ChromiumOverlayDisplay = require('./service/client_chromium.js');
            this.service_chromium = new ChromiumOverlayDisplay(this.settings);
        } else {
            console.log('Skipping Chromium display launch.');
            console.log(' - Missing binary: /usr/bin/chromium');
        }
    }

    openCecController() {
        const CecController = require('./service/client_cec.js');
        this.controller_cec = new CecController();
        this.controller_cec.on('event', (data) => {
            console.log(`[ client_cec ][ Event ] ${data.toString()}`);
        });
        this.controller_cec.on('error_log', (data) => {
            console.log(`[ client_cec ][ Error ] ${data.toString()}`);
        });
        this.controller_cec.on('timeout', (data) => {
            console.log(data.toString());
            this.controller_cec = null;
        })
    }

    connectToNDPiServer() {
        const ClientServerWebSocket = require('./service/clientServer_websocket.js');
        this.connection_ndpiServer = new ClientServerWebSocket(this.settings, this.server_api);
        this.connection_ndpiServer.on('connected', () => {
            this.ndpiServerStatusUpdate = setInterval(() => {
                this.sendStatusToNDPiServer();
            }, 5000);
        });
    }

    sendStatusToNDPiServer() {
        const status = { type: 'client-status' };
        status.deviceId = this.settings.get('device_id');
        status.deviceName = this.settings.get('device_name');
        status.ip = this.settings.get('local_ip');
        status.currentSource = this.settings.get('ndpi_status_ndi_source_active');
        status.targetSource = this.settings.get('ndpi_status_ndi_source_target');
        status.displayMode = this.settings.get('ndpi_status_no_source_display_mode');
        status.ndiInfo.resolution = this.settings.get('ndpi_status_ndi_source_resolution');
        status.ndiInfo.framerate = this.settings.get('ndpi_status_ndi_source_framerate');
        status.ndiInfo.displayResolution = this.settings.get('output_resolution_current');
        status.ndiInfo.displayName = this.settings.get('output_framerate_current');
        status.ndiInfo.connectedAt = this.settings.get('ndpi_status_ndi_source_connected_time');
        status.status = this.settings.get('ndpi_status_ndi');
        status.systemStats = this.getSystemStats();

        this.connection_ndpiServer.send(status);
    }
    
    getSystemStats() {
        const stats = {
            cpu: 0,
            memory: { used: 0, total: 0, percent: 0 },
            temperature: 0,
            uptime: 0
        };
        
        try {
            // CPU usage - read from /proc/stat
            const cpuData = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].split(/\s+/);
            const idle = parseInt(cpuData[4]);
            const total = cpuData.slice(1, 8).reduce((a, b) => a + parseInt(b), 0);
            
            if (this.lastCpuStats) {
                const idleDiff = idle - this.lastCpuStats.idle;
                const totalDiff = total - this.lastCpuStats.total;
                stats.cpu = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
            }
            this.lastCpuStats = { idle, total };
            
            // Memory usage - read from /proc/meminfo
            const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
            const memTotal = parseInt(memInfo.match(/MemTotal:\s+(\d+)/)[1]) / 1024; // MB
            const memAvailable = parseInt(memInfo.match(/MemAvailable:\s+(\d+)/)[1]) / 1024; // MB
            stats.memory.total = Math.round(memTotal);
            stats.memory.used = Math.round(memTotal - memAvailable);
            stats.memory.percent = Math.round((stats.memory.used / stats.memory.total) * 100);
            
            // Temperature - read from thermal zone
            const tempFile = '/sys/class/thermal/thermal_zone0/temp';
            if (fs.existsSync(tempFile)) {
                stats.temperature = parseInt(fs.readFileSync(tempFile, 'utf8')) / 1000;
            }
            
            // System uptime
            const uptimeSeconds = parseFloat(fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]);
            stats.uptime = Math.floor(uptimeSeconds);
        } catch {}
        return stats;
    }

    startNdiReceiver() {
        if (!this.targetSource) return;
        const NDI_Receiver_v2 = require('./service/client_ndiReceiver.js');
        this.ndiReceiver = new NDI_Receiver_v2(this.settings, this.server_api, this.targetSource, 'ndi_receiver_v2');
        this.ndiReceiver.on('connected', () => {
            ///
            console.log('Receiver Started');
        });
        this.ndiReceiver.on('close', () => {
            this.ndiReceiver = null;
            this.server_api.broadcastToDisplay();
        });
    }
}

const index = new NDPi();

process.on('uncaughtException', (err) => {
    console.log('*');
    console.log('* *');
    console.log('* * * Uncaught Exception');
    console.log(err);
    console.log('* * *');
    console.log('* *');
    console.log('*');
});
process.on('unhandledRejection', (reason) => {
    console.log('*');
    console.log('* *');
    console.log('* * * Unhandled Rejection');
    console.log(reason);
    console.log('* * *');
    console.log('* *');
    console.log('*');
    killProcess();
});
process.on('exit', (code) => {
    console.log(`    [[ Exit Code: ${code} ]]`);
    console.log('══════════════════════════════════════════  N D P i - M O N I T O R  ═══');
});