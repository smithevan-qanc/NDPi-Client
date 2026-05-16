const { EventEmitter } = require('events');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');


class NDPiCommandServer_Client extends EventEmitter {
    constructor(fsData) {
        super();
        this.controller_cec = null;

        this.settings = fsData;
        this.port = fsData.get('local_port_number_api') || process.env.PORT || 3030
        fsData.on('ndpi_command_server_host', (data) => { this.updateDisplay({ type: 'update-details', serverIp: String(data) }); });
        fsData.on('device_ip', (data) => { this.updateDisplay({ type: 'update-details', thisDevice: { address: String(data) } }); });
        fsData.on('device_name', (data) => { this.updateDisplay({ type: 'update-details', thisDevice: { name: String(data) } }); });
        
        this.WebSocket = new WebSocket.Server({ noServer: true });
        this.WebSocketConnections = new Set();

        this.App = express();
        this.App.use(express.json());
        this.App.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

        this.Server = http.createServer(this.App)
            .listen(this.port, '0.0.0.0', () => {
                console.log('[ client_api_server ] API/Display Server Online');
                console.log(`[ client_api_server ] PORT: ${this.port}`);
                process.nextTick(() => {
                    this.emit('online');
                });
            })
            .on('upgrade', (req, socket, head) => {
                this.WebSocket.handleUpgrade(req, socket, head, (ws) => {
                    this.WebSocket.emit('connection', ws, req);
                });
            });

        this.WebSocket.on('connection', (ws) =>{
            console.log('[ client_api_server ] Display WebSocket connection started.');
            this.WebSocketConnections.add(ws);
            setTimeout(() => {
                this.broadcastToDisplay(undefined, true);
            }, 1000);
            
            ws.on('close', () => {
                this.WebSocketConnections.delete(ws);
            });

            ws.on('error', (error) => {
                console.log('[ client_api_server ] Error: WebSocket GUI Connection', error);
            });

        });

        this.Routes = express.Router();
        this.App.use(this.Routes);

        this.Routes
            .route('/')
            .get((req, res) => {
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                res.sendFile(path.join(__dirname, '..', 'index.html'));
            });
        this.Routes
            .route('/api/cec/:cmd')
            .get((req, res) => {
                const command = req.params.cmd || null;
                if (command && this.controller_cec.isReady) {
                    this.controller_cec.send(command);
                    res.send('200 OK');
                } else {
                    res.send(`${this.controller_cec.isReady ? '400 Bad Request' : '500 Unavailable'}`)
                }
            });
            
        this.Routes
            .route('/api/ndi')
            .get((req, res) => {
                res.send('test api');
                // Get Current NDI Source Data
            })
            .post((req, res) => {
                res.send('test');
                // Change NDI Source
            })
            .delete((req, res) => {
                res.send('test');
                // Stop NDI Viewer
            });
    }

    close() {
        this.WebSocketConnections.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.close();
            this.WebSocketConnections.delete(client);
        });
        this.WebSocket.close();
        this.Server.closeAllConnections();
        this.Server.close();
    }

    broadcastToDisplay(message = {}, sendAll = false) {
        const displayMode = this.settings.get('ndpi_status_no_source_display_mode');
        let updateData = {};
        if (message.type) {
            updateData.type = message.type;
        } else {
            updateData.type = `show-${displayMode}`;
        }
        if (sendAll) {
            updateData.serverIp = this.settings.get('ndpi_command_server_host');
            updateData.thisDevice = {};
            updateData.thisDevice.id = this.settings.get('device_id');
            updateData.thisDevice.address = this.settings.get('device_ip');
            updateData.thisDevice.name = this.settings.get('device_name');
            updateData.service = {};
            updateData.service.name = this.settings.get('device_type');
            updateData.service.version = this.settings.get('ndpi_version');
            console.log('[ client_api_server ] Sending update to GUI');
        }
        
        this.WebSocketConnections.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(updateData));
            }
        });
    }

    updateDisplay(message) {
        if (!message) return;
        this.WebSocketConnections.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }

    setCecController(CecController) {
        if (!CecController) return;
        this.controller_cec = CecController;
        console.log('[ client_api_server ] CEC Controller Set');
    }
}

module.exports = NDPiCommandServer_Client;