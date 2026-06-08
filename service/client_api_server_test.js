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
        
        this.ws_serv_display = null;
        this.ws_conn_display = null;

        this.ws_serv_system = null;
        this.ws_conn_system = null;

        this.ws_serv_sources = null;
        this.ws_conn_sources = null;

        this.App = null;    // express()
        this.Server = null; // http.createServer()
        this.Routes = null; // express.Router()

        this.start();
    }

    start() {
        this.App = express();
        this.App.use(express.json());
        this.App.use(
            express.static(path.join(__dirname, '..', 'public'), {
                setHeaders: (res, path) => {
                    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                }
            })
        );
        this.App.use(
            '/assets',
            express.static(path.join(__dirname, '..', 'assets'), {
                setHeaders: (res, path) => {
                    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
                }
            })
        );

        this.__ws_Display();
        this.__ws_Sources();
        this.__ws_System();
        this.__Routers();
    }

    __ws_Display() {
        this.ws_serv_display = new WebSocket.Server({ noServer: true });
        this.ws_conn_display = new Set();

        /**
         *      No Source Display - WebSocket Connection Handler
         */
        this.ws_serv_display.on('connection', (ws) =>{
            this.ws_conn_display.add(ws);

            console.info(
                `[ ${path.basename(__filename).split('.')[0]} ]`,
                'No Source Display WebSocket connection ADDED.'
            );

            setTimeout((resolve) => {
                this.sendUpdateToDisplay();
            }, 500);

            ws.onerror = (error) => {
                console.error(
                    `⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ]`,
                    `No Source Display WebSocket Server`,
                    error
                );
            };

            ws.onclose = () => {
                this.ws_conn_display.delete(ws);
                console.info(
                    `[ ${path.basename(__filename).split('.')[0]} ]`,
                    'No Source Display WebSocket connection REMOVED.'
                );
            };
        });
    }

    __ws_System() {
        this.ws_serv_system = new WebSocket.Server({ noServer: true });
        this.ws_conn_system = new Set();

        /**
         *      System GUI - WebSocket Connection Handler
         */
        this.ws_serv_system.on('connection', (ws) =>{
            this.ws_conn_system.add(ws);
            console.info(
                `[ ${path.basename(__filename).split('.')[0]} ]`,
                'System GUI WebSocket connection ADDED.'
            );

            ws.send(
                JSON.stringify(Array.from(this.settings.fileMap))
            );

            ws.onmessage = (event) => {
                try
                { func.processCommand(JSON.parse(event.data)); }
                catch (error)
                { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ]`, error); }
            };

            ws.onerror = (error) => {
                console.error(
                    `⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ]`,
                    `System GUI WebSocket Server`,
                    error
                );
            };

            ws.onclose = () => {
                this.ws_conn_system.delete(ws);
                console.info(
                    `[ ${path.basename(__filename).split('.')[0]} ]`,
                    'System GUI WebSocket connection REMOVED.'
                );
            };
        });
    }

    __ws_Sources() {
        this.ws_serv_sources = new WebSocket.Server({ noServer: true });
        this.ws_conn_sources = new Set();

        /**
         *      NDI Source - WebSocket Connection Handler
         */
        this.ws_serv_sources.on('connection', (ws) =>{
            this.ws_conn_sources.add(ws);
            console.info(
                `[ ${path.basename(__filename).split('.')[0]} ]`,
                'NDI Source WebSocket connection ADDED.'
            );

            setTimeout((resolve) => {
                this.startDiscovery();
            }, 500);

            ws.onerror = (error) => {
                console.error(
                    `⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ]`,
                    `NDI Source WebSocket Server`,
                    error
                );
            };
            
            ws.onclose = () => {
                this.ws_conn_sources.delete(ws);
                console.info(
                    `[ ${path.basename(__filename).split('.')[0]} ]`,
                    'NDI Source WebSocket connection REMOVED.'
                );
                if (this.ws_conn_sources.size === 0)
                { 
                    try { this.discoveryExec.kill('SIGTERM'); }
                    catch {}
                }
            };
        });
    }

    __Routers() {
        this.Routes = express.Router();
        this.App.use(this.Routes);
        this.startServer();

        this.Routes.route('/')
        .get((req, res) => {
              // DEV
            // res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
              // PROD
            res.set('Cache-Control', 'public, max-age=86400, immutable');
            res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
        });

        /**
         *  Public API (v1)
         *      Required Input
         *      {
         *          type: <Command Type>,
         *          data: <Relevant Data [any]>
         *      }
         */
        this.Routes.route('/api/v1/rpc')
        .get(async (req, res) => {
            // to use: http://<ip>:<port>/api/v1/rpc?type=set-source&data=EVAN-MSI (OBS PGM)
            console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'GET:', req.url);

            const commandRes = await func.processCommand({
                ...req.query,
                id: randomUUID(),
            });

            if (commandRes && commandRes.success)
            { res.status(200).json(commandRes); }
            else
            { res.status(400).json(commandRes); }
        })
        .post(async (req, res) => {
            console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'POST:', req.url);

            const commandRes = await func.processCommand({
                ...req.body,
                id: randomUUID(),
            });

            if (commandRes && commandRes.success)
            { res.status(200).json(commandRes); }
            else
            { res.status(400).json(commandRes); }
        });

        /**
         *  Internal API (v1)
         *      Required Inputs
         *          PATH '/internal/api/v1/{PATH}'
         *          BODY {data} of any type
         */
        this.Routes
        .route('/api/v1/__internal/:path')
        .get((req, res) => {
            res.sendStatus(403)
        })
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

                /**
                 *      Send CEC (Consumer Electronic Control) command 
                 *      directly to the CEC controller.
                 */
                case 'cec':
                    reqValid = (typeof data === 'string' && this.controller_cec.isReady);
                    if (reqValid && this.controller_cec)
                    {
                        this.controller_cec.send(decodeURI(data));
                        res.status(200).json({ success: true });
                    }
                    else
                    {
                        res.status(400).json({ success: false });
                    }
                    break;

                case 'ndi':
                    let source = String(data || 'none');
                    this.settings.put('ndpi_status_ndi_source_target', source);

                    res.status(200).json({ success: true, message: `NDI Source Set: ${source}` });
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

    startServer() {
        this.Server = http.createServer(this.App);

        this.Server.listen(this.port, '0.0.0.0', () => {
            console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, `API Server Online`);
            console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, `PORT: ${this.port}`);
            process.nextTick(() => { this.emit('online'); });
        });

        this.Server.on('upgrade', (request, socket, head) => {
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
    }

    startDiscovery() {
        if (this.discoveryExec)
        { return; }

        const discoveryPath = path.join(__dirname, '..', 'ndi_receiver_v3__NDI6');
        const programName = './ndpi_discover';
        
        console.info(`[ ${path.basename(__filename).split('.')[0]} ] Starting NDI Source Discovery.`);
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

        if (this.ws_conn_sources.size === 0)
        { 
            try { this.discoveryExec.kill('SIGTERM'); }
            catch {}
        }

        this.discoveryExec.on('exit', () => {
            process.nextTick(() => { this._restartDiscovery(); });
        });
    }

    _restartDiscovery() {
        if (this.ws_conn_sources.size >= 1)
        {
            console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] Source Discovery Exited Prematurely. Relaunching`);
            this.discoveryExec = null;
            this.startDiscovery();
        }
        else
        { this.discoveryExec = null; }
    }

    async close() {
        console.info(
            `[ ${path.basename(__filename).split('.')[0]} ]`,
            'Closing Module',
            `[ Connections ] Server: ${this.Server.connections || 'n/a'}, Display WS: ${this.ws_conn_display.size}, System WS: ${this.ws_conn_system.size}`
        );

        for (const client of this.ws_conn_display)
        {
            try { client.close(); }
            catch {}
            finally { this.ws_conn_display.delete(client); }
        }
        for (const client of this.ws_conn_system)
        {
            try { client.close(); }
            catch {}
            finally { this.ws_conn_system.delete(client); }
        }
        for (const client of this.ws_conn_sources)
        {
            try { client.close(); }
            catch {}
            finally { this.ws_conn_sources.delete(client); }
        }

        return new Promise((resolve) => {
            this.Server.once('close', () => {
                console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'Module Exited');
                resolve();
            });

            try { this.Server.closeAllConnections(); }
            catch {}

            try { this.Server.close(); }
            catch {}
        });
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
}

module.exports = NDPiCommandServer_Client;