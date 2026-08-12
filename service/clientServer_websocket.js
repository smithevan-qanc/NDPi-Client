const WebSocket = require('ws');
const { EventEmitter } = require('events');
const { processCommand } = require('./functions');
const path = require('path');
const os = require('node:os');
const fs = require('node:fs');

class ClientServerWebSocket extends EventEmitter {
    constructor(fsData, api) {
        super();

        this.settings = fsData;
        this.server = api;

        this.socket = null;
        this.enabled = true;

        this.ndpiHubHostname = fsData.get('ndpi_hub_hostname') || null;
        this.ndpiHubPort = fsData.get('ndpi_hub_port') || null;

        this.reconnectTimer = null;
        this.statusInterval = null;
        this.statusIntervalMs = 5000;

        // Push an immediate status/settings update to the Hub any time a
        // setting changes locally (device UI, CEC polling, NDI status, etc),
        // instead of waiting for the next periodic tick.
        fsData.on('update', () => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN)
            { this.sendStatus(); }
        });

        if (this.ndpiHubHostname && this.ndpiHubPort)
            { this.connect() }
    }
    connect() {
        if (!this.ndpiHubHostname || this.ndpiHubHostname.includes('localhost'))
        {
            this.scheduleReconnect();
            return;
        }

        this.enabled = true;
        
        // Clean up existing connection
        if (this.socket)
        {
            try { this.socket.close(); } catch {}
            this.socket = null;
        }

        if (this.reconnectTimer)
        {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        console.info(`[ ${path.basename(__filename).split('.')[0]} ] Connecting`);
        try
        {
            const wsUrl = `ws://${this.ndpiHubHostname}:${this.ndpiHubPort}/ws/client`;
            this.socket = new WebSocket(wsUrl);
        }
        catch (error)
        {
            console.error(`⚠️   [ ${path.basename(__filename).split('.')[0]} ] Connection Failed`, error);
            this.scheduleReconnect();
        }
            
        this.socket.on('open', () => {
            console.info(`[ ${path.basename(__filename).split('.')[0]} ] Connected NDPi Server`);
            this.emit('connected');
            this.sendStatus();
            this.startStatusInterval();
        });
        
        this.socket.on('message', (data) => {
            try
            {
                const message = JSON.parse(data);
                console.info(`[ ${path.basename(__filename).split('.')[0]} ][ Message ] NDPi Server: Message:`, message);
                processCommand(message);
            }
            catch (error)
            {
                console.error(`⚠️   [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] NDPi Server: Message:`, data);
                console.error(`⚠️   [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] NDPi Server: Error:`, error);
            }
        });
        
        this.socket.on('error', (error) => {
            console.error(`⚠️   [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] NDPi Server Connection`, error);
        });
        
        this.socket.on('close', () => {
            console.info(`⚠️   [ ${path.basename(__filename).split('.')[0]} ] NDPi Server Disconnected`);
            this.stopStatusInterval();
            this.scheduleReconnect();
        });
    }

    close() {
        console.info(
            `[ ${path.basename(__filename).split('.')[0]} ]`,
            'Closing Module'
        );

        this.enabled = false;

        this.stopStatusInterval();

        try { this.socket.close(); }
        catch {}
        finally { this.socket = null; }

        console.info(
            `[ ${path.basename(__filename).split('.')[0]} ]`,
            'Module Exited'
        );
    }

    scheduleReconnect(ms = 5000) {
        if (this.reconnectTimer)
        {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.enabled)
        {
            this.reconnectTimer = setTimeout(() => {
                if (this.enabled)
                    { this.connect() }
                this.reconnectTimer = null;
            }, ms);
        }
    }

    send(message = {}) {
        if (!this.enabled)
            { return }
        if (!message.type)
            {
                console.error(`⚠️   [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] Missing 'message.type'. Message:`, message);
                return;
            }
        if (this.socket && this.socket.readyState <= 1)
            { this.socket.send(JSON.stringify(message)) }
        else
            { console.error(`⚠️   [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] Unable to send message.`) }
    }

    /**
     *  Periodically report this device's status to the Hub so it can be
     *  displayed/managed from the Hub's dashboard (devices-update).
     */
    startStatusInterval() {
        this.stopStatusInterval();
        this.statusInterval = setInterval(() => {
            this.sendStatus();
        }, this.statusIntervalMs);
    }

    stopStatusInterval() {
        if (this.statusInterval)
        {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
    }

    sendStatus() {
        this.send(this.buildStatusMessage());
    }

    buildStatusMessage() {
        const connectedTime = this.settings.get('ndpi_status_ndi_source_connected_time') || '';
        const uptime = connectedTime ? Math.max(0, Math.floor((Date.now() - new Date(connectedTime).getTime()) / 1000)) : 0;

        return {
            type: 'client-status',
            deviceId: this.settings.get('device_id') || '',
            deviceName: this.settings.get('device_name') || '',
            ip: this.settings.get('device_ip') || '',
            currentSource: this.settings.get('ndpi_status_ndi_source_target') || 'None',
            displayMode: this.settings.get('ndpi_status_no_source_display_mode') || 'overlay',
            streamStatus: this.settings.get('ndpi_status_ndi_status') || 'idle',
            ndiInfo: {
                resolution: this.settings.get('ndpi_status_ndi_source_resolution') || '',
                framerate: parseFloat(this.settings.get('ndpi_status_ndi_source_framerate')) || 0,
                displayName: this.settings.get('output_display_model') || this.settings.get('output_display_manufacturer') || '',
                displayResolution: this.settings.get('output_display_resolution_current') || '',
                uptime,
            },
            systemStats: this.getSystemStats(),
            // Full settings snapshot (same shape sent to the Client's own local
            // `/ws/system` UI) so the Hub dashboard can offer the same remote
            // controls as Client__v3_1_0/public/system.js (settings editor,
            // overlay upload, update checks, etc).
            settings: Array.from(this.settings.fileMap),
        };
    }

    getSystemStats() {
        let temperature = 0;
        try
        {
            const tempFile = '/sys/class/thermal/thermal_zone0/temp';
            if (fs.existsSync(tempFile))
            { temperature = parseInt(fs.readFileSync(tempFile, 'utf8')) / 1000; }
        }
        catch {}

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const load = os.loadavg();

        return {
            cpu: Math.round(Math.min(load[0] / os.cpus().length, 1) * 1000) / 10,
            memory: {
                percent: Math.round((usedMem / totalMem) * 100),
                used: Math.round((usedMem / 1024 / 1024 / 1024) * 10) / 10,
                total: Math.round((totalMem / 1024 / 1024 / 1024) * 10) / 10,
            },
            temperature,
            uptime: os.uptime(),
        };
    }

}

module.exports = ClientServerWebSocket;