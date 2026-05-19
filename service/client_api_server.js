const { EventEmitter } = require('events');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { processCommand } = require('./functions');
const { randomUUID } = require('crypto');


class NDPiCommandServer_Client extends EventEmitter {
    constructor(fsData) {
        super();
        this.controller_cec = null;

        this.settings = fsData;
        this.port = fsData.get('local_port_number_api') || process.env.PORT_API || 3080
        
        this.WebSocket = new WebSocket.Server({ noServer: true });
        this.WebSocketConnections = new Set();

        this.App = express();
        this.App.use(express.json());
        this.App.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

        this.Server = http.createServer(this.App)
            .listen(this.port, '0.0.0.0', () => {
                console.log('[ client_api_server ] API/Display Server Online');
                console.log(`[ client_api_server ] PORT: ${this.port}`);
                process.nextTick(() => { this.emit('online'); });
            })
            .on('upgrade', (req, socket, head) => {
                this.WebSocket.handleUpgrade(req, socket, head, (ws) => {
                    this.WebSocket.emit('connection', ws, req);
                });
            });

        this.WebSocket.on('connection', (ws) =>{
            console.log('[ client_api_server ] Display WebSocket connection started.');
            
            this.WebSocketConnections.add(ws);
            
            setTimeout(() => { this.broadcastToDisplay(undefined, true); }, 1000);
            
            ws.on('close', () => { this.WebSocketConnections.delete(ws); });

            ws.on('error', (error) => { console.log('🔴 [ client_api_server ][ ERROR ] WebSocket GUI Connection', error); });
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
            .route('/api/v1/command')
            .get(async (req, res) => {
                // to use: http://<ip>:<port>/api/v1/command?type=set-source&data=EVAN-MSI (OBS PGM)
                console.log('[ client_api_server ] GET:', req.url);

                const commandRes = await processCommand({
                    ...req.query,
                    id: randomUUID(),
                });
                if (commandRes && commandRes.success)
                    {
                        res.status(200);
                        res.json(commandRes);
                    }
                else
                    {
                        res.status(400);
                        res.json(commandRes);
                    }
            })
            .post(async (req, res) => {
                console.log('[ client_api_server ] POST:', req.url);

                const commandRes = await processCommand({
                    ...req.body,
                    id: randomUUID(),
                });
                if (commandRes && commandRes.success)
                    {
                        res.status(200);
                        res.json(commandRes);
                    }
                else
                    {
                        res.status(400);
                        res.json(commandRes);
                    }
            });

        //  Internal API (v1)
        //      Required Inputs
        //          PATH '/internal/api/v1/{PATH}'
        //          BODY {data} of any type
        this.Routes
            .route('/api/v1/__internal/:path')
            .get((req, res) => { res.sendStatus(403) })
            .post((req, res) => {
                const { id, data } = req.body;
                const switch_path  = req.params.path;

                if (req.hostname !== 'localhost')
                    {
                        res.status(403);
                        res.json({ success: false, message: 'forbidden' });
                        return;
                    }

                let reqValid = false;
                switch (switch_path) {

                    case 'cec':
                        reqValid = (typeof data === 'string' && this.controller_cec.isReady);
                        if (reqValid)
                            {
                                this.controller_cec.send(data);
                                res.status(200);
                                res.json({ success: true });
                            }
                        else
                            {
                                res.status(400);
                                res.json({ success: false });
                            }

                        break;

                    case 'ndi':
                        let source;

                        if (!data)
                            { source = 'none'; }
                        else if (String(data).toLowerCase() === 'none')
                            { source = 'none'; }
                        else
                            { source = String(data); }

                        this.settings.put('ndpi_status_ndi_source_target', source);
                        res.status(200);
                        res.json({ success: true, message: `NDI Source Set: ${source}` });

                        break;

                    default:
                        res.sendStatus(400);
                        break;
                }
            });
    }

    close() {
        this.WebSocketConnections.forEach(client => {
            if (client.readyState === WebSocket.OPEN)
                { client.close() }
            this.WebSocketConnections.delete(client);
        });
        this.WebSocket.close();
        this.Server.closeAllConnections();
        this.Server.close();
    }

    broadcastToDisplay(ws, message = {}, sendAll = false) {
        const displayMode = this.settings.get('ndpi_status_no_source_display_mode');
        let updateData = {};
        
        if (message.type)
            { updateData.type = message.type; }
        else
            { updateData.type = `show-${displayMode}`; }
        
        if (this.settings.get('ndpi_status_no_source_display_mode') === 'streaming')
            { updateData.type = 'show-ndi'; }

        if (sendAll)
            {
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
            if (client.readyState === WebSocket.OPEN)
                { client.send(JSON.stringify(updateData)) }
        });
    }

    updateDisplay(message = {}) {
        if (!message.type)
            { return; }
        this.WebSocketConnections.forEach(client => {
            if (client.readyState === WebSocket.OPEN)
                { client.send(JSON.stringify(message)) }
        });
    }

    setCecController(CecController) {
        if (!CecController)
            { return }
        this.controller_cec = CecController;
        console.log('[ client_api_server ] CEC Controller Set');
    }
}

module.exports = NDPiCommandServer_Client;