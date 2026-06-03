const { EventEmitter } = require('events');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const func = require('./functions');
const { randomUUID } = require('crypto');
const { spawn } = require('node:child_process');


class NDPiCommandServer_Client extends EventEmitter {
    constructor(fsData) {
        super();
        this.controller_cec = null;

        this.settings = fsData;
        this.port = fsData.get('local_port_number_api') || process.env.PORT_API || 3080

        fsData.on('update', (data) => {
            this.ws_conn_system.forEach(client => {
                try { client.send(data); }
                catch {}
            });
            this.ws_conn_display.forEach(client => {
                try { client.send(data); }
                catch {}
            });
        });

        this.discoveryExec = null;
        
        this.ws_serv_display = new WebSocket.Server({ noServer: true });
        this.ws_conn_display = new Set();
        this.ws_serv_system = new WebSocket.Server({ noServer: true });
        this.ws_conn_system = new Set();
        this.ws_serv_sources = new WebSocket.Server({ noServer: true });
        this.ws_conn_sources = new Set();

        this.App = express();
        this.App.use(express.json());

        this.App.use(express.static(path.join(__dirname, '..', 'public'), {
            setHeaders: (res, path) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); }
        }));
        this.App.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

        this.Server = http.createServer(this.App)
            .listen(this.port, '0.0.0.0', () => {
                console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, `API/Display Server Online`);
                console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, `PORT: ${this.port}`);
                process.nextTick(() => { this.emit('online'); });
            })
            .on('upgrade', (request, socket, head) => {
                const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
                
                if (pathname === '/ws/display') {
                    this.ws_serv_display.handleUpgrade(request, socket, head, (ws) => {
                        this.ws_serv_display.emit('connection', ws, request);
                    });
                } else if (pathname === '/ws/system') {
                    this.ws_serv_system.handleUpgrade(request, socket, head, (ws) => {
                        this.ws_serv_system.emit('connection', ws, request);
                    });
                } else if (pathname === '/ws/sources') {
                    this.ws_serv_sources.handleUpgrade(request, socket, head, (ws) => {
                        this.ws_serv_sources.emit('connection', ws, request);
                    });
                } else {
                    socket.destroy();
                }
            });

        this.ws_serv_display.on('connection', (ws) =>{
            console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'Display WebSocket connection added.');
            
            this.ws_conn_display.add(ws);
            
            setTimeout(() => { this.sendUpdateToDisplay(); }, 500);

            ws.on('error', (error) => { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] Display WebSocket Server`, error); });
            
            ws.on('close', () => { this.ws_conn_display.delete(ws); });
        });
        
        this.ws_serv_system.on('connection', (ws) =>{
            console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'System WebSocket connection added.');
            
            this.ws_conn_system.add(ws);

            ws.send(JSON.stringify(Array.from(this.settings.fileMap)));

            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                func.processCommand(message);
            });

            ws.on('error', (error) => { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] System WebSocket Server`, error); });
            
            ws.on('close', () => { this.ws_conn_system.delete(ws); });
        });

        this.ws_serv_sources.on('connection', (ws) =>{
            console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'Source WebSocket connection added.');
            
            this.ws_conn_sources.add(ws);
            
            this.startDiscovery();

            ws.on('error', (error) => { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] Sources WebSocket Server`, error); });
            
            ws.on('close', () => {
                this.ws_conn_sources.delete(ws);

                if (this.ws_conn_sources.size === 0)
                { this.discoveryExec.kill('SIGTERM'); }
            });
        });

        this.Routes = express.Router();
        this.App.use(this.Routes);

        this.Routes
            .route('/')
            .get((req, res) => {
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
            });

        this.Routes
            .route('/api/v1/rpc')
            .get(async (req, res) => {
                // to use: http://<ip>:<port>/api/v1/rpc?type=set-source&data=EVAN-MSI (OBS PGM)
                console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'GET:', req.url);

                const commandRes = await func.processCommand({
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
                console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'POST:', req.url);

                const commandRes = await func.processCommand({
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
                            this.controller_cec.send(decodeURI(data));
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
                        let source = String(data || 'none');
                        this.settings.put('ndpi_status_ndi_source_target', source);

                        res.status(200);
                        res.json({ success: true, message: `NDI Source Set: ${source}` });
                        break;

                    case 'shutdown':
                        res.sendStatus(200);
                        this.emit('shutdown-command');
                        break;

                    case 'reboot':
                        res.sendStatus(200);
                        this.emit('reboot-command');
                        break;

                    default:
                        res.sendStatus(400);
                        break;
                }
            });
    }

    close() {
        
        console.info(
            `[ ${path.basename(__filename).split('.')[0]} ]`,
            'Closing Module',
            `[ Connections ] Server: ${this.Server.connections || 'n/a'}, Display WS: ${this.ws_conn_display.size}, System WS: ${this.ws_conn_system.size}`
        );

        this.ws_conn_display.forEach(client => {
            try { client.close(); }
            catch (e) { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ]`, 'Error Closing Display WebSocket Client Connection', e); }
            finally { this.ws_conn_display.delete(client); }
        });

        this.ws_conn_system.forEach(client => {
            try { client.close(); }
            catch (e) { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ]`, 'Error Closing Display WebSocket Client Connection', e); }
            finally { this.ws_conn_system.delete(client); }
        });

        this.ws_conn_sources.forEach(client => {
            try { client.close(); }
            catch (e) { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ]`, 'Error Closing Display WebSocket Client Connection', e); }
            finally { this.ws_conn_system.delete(client); }
        });

        this.Server.closeAllConnections();
        this.Server.close();

        console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'Module Exited');
    }

    /**
     * This function is depricated. Use 'module.sendUpdateToDisplay()'
     * @param {object} message - This function is depricated. Use 'module.sendUpdateToDisplay()'
     * @param {boolean} sendAll - This function is depricated. Use 'module.sendUpdateToDisplay()'
     * @param {object} options - This function is depricated. Use 'module.sendUpdateToDisplay()'
     * @returns 
     */
    broadcastToDisplay(message = {}, sendAll = false, options = {}) {

        const displayMode = this.settings.get('ndpi_status_no_source_display_mode');
        let updateData = {};
        
        if (message.type)
        { updateData.type = message.type; }
        else
        { updateData.type = `show-${displayMode}`; }

        if (this.settings.get('ndpi_status_ndi') === 'streaming')
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
            console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'Sending update to GUI');
        }

        if (options.ws) 
        {
            if (options.ws.readyState === WebSocket.OPEN) 
            {
                options.ws.send(JSON.stringify(updateData));
                return;
            }
        }
        else
        {
            this.ws_conn_display.forEach(client => {
                if (client.readyState === WebSocket.OPEN)
                { client.send(JSON.stringify(updateData)); }
            });
        }
    }

    /**
     * This function is depricated. Use 'module.sendUpdateToDisplay()'
     * @param {object} message - This function is depricated. Use 'module.sendUpdateToDisplay()'
     * @returns 
     */
    updateDisplay(message = {}) {
        if (!message.type)
        { return; }
        this.ws_conn_display.forEach(client => {
            try { client.send(JSON.stringify(message)); }
            catch (e) { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ]`, 'Unable to deliver WebSocket message.\n', message, '\n', e); }
        });
    }

    /**
     * 
     * @param {object} message - Message object to send to Overlay Display
     * @param {string} [message.type] - Read by the overlay display as the message type.
     * @param {any} [message.data] - Data to send. Type predefinded by Display WebSocket on basis of message.type.
     */
    sendUpdateToDisplay(message) {
        let msg = {
            type: 'settings-update',
            data: Array.from(this.settings.fileMap),
            ...message,
        };
        setTimeout(() => {
            this.ws_conn_display.forEach(client => {
                try { client.send(JSON.stringify(msg)); }
                catch (e) { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ]`, 'Unable to deliver WebSocket message.\n', msg, '\n', e); }
            });
        }, 100);
    }

    setCecController(CecController) {
        if (!CecController)
        { return; }
        this.controller_cec = CecController;
    }

    startDiscovery() {
        if (this.discoveryExec)
        { return; }

        const discoveryPath = path.join(__dirname, '..', 'ndi_receiver_v3__NDI6');
        const programName = './ndpi_discover';
        
        this.discoveryExec = spawn(programName, {
            cwd: discoveryPath
        });

        this.discoveryExec.stdout.on('data', (data) => {
            const output = data.toString() || '[]';
            try
            {
                const sources = JSON.parse(output);
                if (Array.isArray(sources))
                {
                    this.ws_conn_sources.forEach((ws) => {
                        ws.send(JSON.stringify(sources));
                    });
                }
            }
            catch {}
            // catch (e) { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] Corrupted Data Received from ${programName}`); }
        });

        this.discoveryExec.on('exit', () => {
            this.discoveryExec = null;
        });
    }
}

module.exports = NDPiCommandServer_Client;