/**
 *  NDPi - Monitor v3 (CLIENT)
 *      Created By: Evan Smith
 *      On Behalf of: New Life Church COGOP - Atlantic
 * 
 *  This service is used for:
 *  -   Communicating with NDPi - Monitor v3 (SERVER)
 *  -   Launching NDI video streams and displaying them to HDMI out.
 */

const express    = require('express');
const WebSocket  = require('ws');
const http       = require('http');
const bonjour    = require('bonjour')();
const os         = require('os');
const fs         = require('fs');
const path       = require('path');
const { exec }   = require('child_process');
const { uptime } = require('process');
const net        = require('net');

const readFile  = (pathToFile, bufferEncoding = 'utf8') => fs.existsSync(pathToFile) ? fs.readFileSync(pathToFile, bufferEncoding) : bufferEncoding === 'utf8' ? '' : null;
const CRLFArray = string => string.split(/\r?\n/);

let NET_ONLINE = false;
let SYS_DETAILS = {
    os: {
        type: os.type(),
        platform: os.platform(),
        version: os.version(),
        release: os.release(),
    },
    machine: os.machine(),
    arch: os.arch(),
    cpus: os.cpus(),
    load_avg: os.loadavg(),
    uptime: os.uptime(),
    memory: {
        free: os.freemem(),
        total: os.totalmem(),
        percentUsed: ( 1-(os.freemem()/os.totalmem()) ).toFixed(3),
    },
    dir: {
        home: os.homedir(),
        tmp: os.tmpdir(),
        data: `${os.homedir()}/DATA_ndpi`
    },
    uptime_ndpi: uptime(),
    hostname: os.hostname(),
    user: os.userInfo(),
};

const PATH_VERSION_CURRENT  = path.join(__dirname, 'version', 'current');
const PATH_VERSION_STABLE   = path.join(__dirname, 'version', 'stable');
const PATH_NDI_RECEIVER     = path.join(__dirname, 'ndi_receiver_v2');
const PATH_CONFIG           = `${SYS_DETAILS.dir.data}/client-state.json`;

/** VERSION CONTROL **/
const versionCurrent  = readFile(PATH_VERSION_CURRENT) || '';
const versionStable   = readFile(PATH_VERSION_STABLE)  || '';
const versionIsStable = versionCurrent === versionStable;
/** END of - VERSION CONTROL **/

function startupConsoleLog() {
    console.log(`
 
 
════════════════════════════════════════════════════════════════════════
      ⌈▔∖ ⌈▔⌈▔▔▔▔∖⌈▔▔▔▔∖(-)   ⌈▔▔∖/▔▔|           (-)ʃ▔▏
      ⏐  ∖⏐ ⏐ ⌈▔| ⏐ ⌈-) ⌈▔|   ⏐ ⌈∖/| ⏐/▔▔▔∖⌈▔'▔▔∖⌈▔|▏ ▔/▔▔▔∖⌈▔'▔▔|
      ⏐ ⌈∖  ⏐ ⌊_| ⏐  __/⏐ ⏐▔▔▔⏐ ⏐  ⏐ ⏐ (-) ⏐ ⌈▔⏐ ⏐ ⏐▏ ⎡▏(-) ⏐ ⌈▔▔             
      ⌊_| ∖_⌊____/⌊_|   ⌊_|▔▔▔⌊_|  ⌊_|∖___/⌊_| ⌊_⌊_|∖__∖___/⌊_|
      𝘝𝘦𝕣𝕤𝕚𝕠𝕟   ⸻      ${versionCurrent}${versionIsStable ? ' (Stable)' : ''}
════════════════════════════════════════════════════════════════════════
                                                                      𓀡
        
`);
}
function consoleLog(message = 'SYSTEM UPDATE', data, error) {
    if (error) {
        console.log('⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻ ');
        //console.log(`  [${ipAddr}] ⸺  ▶ 🔴 ERROR: ${message.toUpperCase()}`);
        console.log(`🔴 ERROR: ${message}`);
        console.log(JSON.stringify(error, null, 2));
        if (data) {
            console.log(`DATA:`, JSON.stringify(data, null, 2));
        }
        console.log('⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻ ');
    } else {
        //console.log('⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻ ');
        //console.log(`  [${ipAddr}] ⸺  ▶ ${message.toUpperCase()}`);
        console.log(`${message.toUpperCase()}`);
        if (data) console.log(JSON.stringify(data, null, 2));
        //console.log('⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻ ');
    }
}
function getDeviceId() {
    try {
        //const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
        const serial = readFile('/proc/cpuinfo').match(/Serial\s*:\s*([0-9a-f]+)/i);
        if (serial) {
            return serial[1];
        }
    } catch (error) {
        consoleLog('Error Reading Serial Number', null, error);
        return null;
    }
}
function getDeviceModel() {
    try {
        const model = readFile('/proc/cpuinfo').match(/Model\s*:\s*([0-9a-f]+)/i);
        if (model) {
            return model[1];
        }
    } catch (error) {
        consoleLog('Error Reating Serial Number', null, error);
        return null;
    }
}
async function getLocalIP() {
    if (!NET_ONLINE) {
        return await waitForNetwork();
        NET_ONLINE = true;
    }
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            const isIPv4 = iface.family === 'IPv4' || iface.family === 4;
            if (isIPv4 && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}
async function waitForNetwork({ host = '8.8.8.8', port = 53, retryMs = 1000 } = {}) {
    return await new Promise((resolve) => {
        const tryConnect = () => {
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.once('connect', () => {
                const localIP = socket.localAddress;
                socket.destroy();
                NET_ONLINE = true;
                resolve(localIP);
            });
            socket.once('timeout', () => {
                socket.destroy();
                setTimeout(tryConnect, retryMs);
            });
            socket.once('error', () => {
                socket.destroy();
                setTimeout(tryConnect, retryMs);
            });
            socket.connect(port, host);
        };
        tryConnect();
    });
}
function getHdmiResolution() {
    let res = '';
    exec('xrandr', {
        env: {
            ...process.env,
            DISPLAY: ':0',
            XAUTHORITY: '/home/ndpi-client/.Xauthority',
        },
    }, (error, stdout, stderr) => {
        if (error) {
            consoleLog('Get HDMI Resolution', stdout, stderr);
        } else {
            CRLFArray(stdout)[0].split(', ').forEach((ln) => {
                if (ln.includes('current')) {
                    const pixel = ln.trim().split(' '); //==> [ '1920', 'x', '1080' ]
                    return res = `${pixel[1]}x${pixel[3]}`;
                }
            });
        }
    });
}
function listHdmiResolutions() {
    let resolutionOptions = [];
    exec('DISPLAY=:0 xrandr', (error, stdout, stderr) => {
        if (error) {
            consoleLog('List HDMI Resolutions', stdout, stderr);
        } else {
            CRLFArray(stdout).forEach((ln) => {
                const str = ln.trim();
                if (
                    str.startsWith('1') || 
                    str.startsWith('2') || 
                    str.startsWith('3') || 
                    str.startsWith('4') || 
                    str.startsWith('5') || 
                    str.startsWith('6') || 
                    str.startsWith('7') || 
                    str.startsWith('8') || 
                    str.startsWith('9')
                ) resolutionOptions.push(str.split(' ')[0]);
            });
        }
    });
    return resolutionOptions;
}
async function cecPowerOn(commandInfo = {}) {
    let success = false;
    consoleLog(`(↑↓) cec command out: 'on 0' && 'as'`);
    exec('echo "on 0" | cec-client -s -d 1 && echo "as" | cec-client -s -d 1', (e,o,err) => {
        if (e) {
            consoleLog('[ERROR] CEC', null, { Message: err || 'No Error String Output' });
        } else {
            const res = CRLFArray(o);
            if (res.length > 0) res.forEach( (line) => {console.log(`(↓↓)[ EXEC STDOUT ] ⸺  ▶ ${line}`)} );
            success = true;
        }
        if (success) {
            consoleLog('[sent] CEC', stdout);
            return { success: true };
        }
    });
}
async function cecPowerOff(commandInfo = {}) {
    let success = false;
    consoleLog(`(↑↓) cec command out: 'standby 0'`);
    exec('echo "standby 0" | cec-client -s -d 1', (e,o,err) => {
        if (e) {
            consoleLog('[ERROR] CEC', null, { Message: err || 'No Error String Output' });
        } else {
            const res = CRLFArray(o);
            if (res.length > 0) res.forEach( (line) => {console.log(`(↓↓)[ EXEC STDOUT ] ⸺  ▶ ${line}`)} );
            success = true;
        }
        if (success) {
            consoleLog('[sent] CEC', stdout);
            return { success: true };
        }
    });
}

class NDPiClient {
    constructor() {

        this.defaultDeviceName = 'NDPi Client';

        // Bonjour - mDNS
        this.bonjour__service = null;
        this.bonjour__options = null;
        this.time_interval__republish_bonjour = 60000;
        
        // WebSocket Connections
        this.ws_connections__display_server = new Set();
        this.child_process__chromium = null;

        this.ws_connection__ndpi_server = null;
        this.time_interval__send_status_update = 5000;
        this.timer__resend_status_update = null;
        this.time_interval__reconnect_ndpi_server = 5000;
        this.timer__reconnect_ndpi_server = null;

        this.child_process__ndi_receiver = null;
        this.timer__reconnect_ndi = null;

        this.__client = {
            name: this.defaultDeviceName,
            type: 'Certified NDPi Monitor',
            id: '',
            model: '',
            config: {
                ip: '',
                displayPort: 8080,
                commandPort: 3001,
                bonjourPort: 3002,
                displayMode: 'overlay', // either 'overlay' OR 'blank'
                version: versionCurrent,
            },
            ndi: {
                status: 'idle',
                source: {
                    current: '',
                    target: '',
                },
                resolution: null,
                framerate: null,
                connectedAt: null,
                uptime: null,
            },
            display: {
                resolution: '',
                cecEnabled: false,
                mfr: null,
            },
            server: {
                ip: null,
                lastSeen: null,
            },
            lastCommand: {
                source: null,
                timestamp: null,
                command: null,
            },
        };

        /**.   Path for Resolution List '/sys/class/drm/card1/card1-HDMI-A-1/modes'
         * 
         *  3840x2160
            3840x2160
            3840x2160
            3840x2160
            3840x2160
            3840x2160
            3840x2160
            3840x2160
            3840x2160
            3840x2160
            2560x1440
            1920x1080
            1920x1080
            1920x1080
            1920x1080i
            1920x1080i
            1920x1080
            1920x1080
            1920x1080
            1920x1080
            1600x900
            1280x1024
            1280x800
            1152x864
            1280x720
            1280x720
            1280x720
            1024x768
            800x600
            720x480
            720x480
            720x480
            720x480
            640x480
            640x480
            640x480
         * Path for Resolution List '/sys/class/drm/card1/card1-HDMI-A-1/status' 
            ==> connected
         * cat /sys/class/drm/card1/card1-HDMI-A-1/edid | edid-decode
         */
        
    }
  ///////////////////////////////////////////////////////////////////////////////////////
    start() {
        this.loadState();
        console.log(this.__client);
        this.displayStartup();
    }

    loadState() {
        let data = this.__client;

        try {
            data = JSON.parse(readFile(PATH_CONFIG));
        } catch (error) {
            consoleLog('[ERROR] Loading State', 'Attempted at Initial Load State', error);
        }

        console.log(data);

        this.__client.name                  = data.name;
        this.__client.ndi.source.target     = data.ndi.source.target || null;
        this.__client.server.ip             = data.server.ip || null;
        this.__client.lastCommand.source    = data.lastCommand.source;
        this.__client.lastCommand.timestamp = data.lastCommand.timestamp;
        this.__client.lastCommand.command   = data.lastCommand.command;
        
        console.log('Configuration Loaded');
        console.log('CONFIG:', JSON.stringify(this.__client, null, 2));

        if (this.__client.server.ip) {
            setTimeout(() => {
                this.connectToServer(this.__client.server.ip);
            }, 2000);
        }

        this.startDisplayServer();
    }

    startDisplayServer() {

        const displayServer = http.createServer((req, res) => {

            let filePath;
            const assetsDir = path.join(__dirname, 'assets');
            
            if (req.url === '/' || req.url === '/client.html') {
                filePath = path.join(__dirname, 'client.html');
            } else if (req.url.startsWith('/assets/')) {
                filePath = path.join(assetsDir, req.url.substring(8));
            } else {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            
            const ext = path.extname(filePath);
            const contentTypes = {
                '.html': 'text/html',
                '.svg': 'image/svg+xml',
                '.css': 'text/css',
                '.js': 'application/javascript'
            };
            
            fs.readFile(filePath, (err, data) => {
                let code;
                if (err) {
                    code = 404;
                } else {
                    code = 200;
                }

                consoleLog('(↓↑) Display Server: rest API', {
                    req: {
                        url: `${req.url}`,
                        method: `${req.method}`,
                        //headers: req.headers ?? {},
                        body: req.body ?? {}
                    },
                    res: { status: code }
                });

                if (err) {
                    res.writeHead(404);
                    res.end('File not found: ' + filePath);
                    return;
                }
                res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
                res.end(data);
            });
        });

        // WebSocket server for display control
        this.displayWss = new WebSocket.Server({ server: displayServer });
        
        this.displayWss.on('connection', (ws) => {
            
            this.ws_connections__display_server.add(ws);
            
            // Send current state
            setTimeout(() => {
                this.broadcastToDisplay();
            }, 1500);
            
            ws.on('close', () => {
                this.ws_connections__display_server.delete(ws);
            });

            ws.on('error', (error) => {
                console.log('Display WebSocket Error:', error);
            });
        });

        displayServer.listen(this.__client.config.displayPort, () => {
            console.log(`Display Server running on port ${this.__client.config.displayPort}`);
            console.log(`Web interface: http://${this.__client.config.ip}:${this.__client.config.displayPort}`);
            this.startCommandServer();
        });
    }

    startCommandServer() {

        // Create HTTP server with REST API endpoints
        const server = http.createServer(async (req, res) => {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const handled = () => consoleLog(`(↓↑) [handled] ${url.pathname}`);
            
            // CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            
            if (req.method === 'OPTIONS') {
                consoleLog('(↓↓) command server: api', {
                    req: {
                        url: `${req.url}`,
                        method: `${req.method}`,
                        //headers: req.headers ?? {},
                        body: req.body ?? {}
                    },
                    res: { status: 200 }
                });
                res.writeHead(200);
                res.end();
                return;
            }
            
            // REST API endpoints
            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });

                    consoleLog('(↓↓) command server: api', {
                        req: {
                            url: `${req.url}`,
                            method: `${req.method}`,
                            //headers: req.headers ?? {},
                            body: JSON.parse(body) ?? {}
                        },
                        res: { status: 200 }
                    });

                    let data;
                    try {
                        data = JSON.parse(body);
                    } catch (e) {}

                    const commandInfo = {
                        source:     req.headers['host'] || 'Unknown Host',
                        timestamp:  new Date().toISOString(),
                        command:    url.pathname,
                        data:       data,
                    };
                    
                    switch (url.pathname) {
                        case '/api/overlay':
                            this.showOverlay(commandInfo);
                            handled();
                            res.end(JSON.stringify({
                                success: true,
                                message: 'Overlay displayed'
                            }));
                            break;
                        case '/api/blank':
                            this.showBlank(commandInfo);
                            handled();
                            res.end(JSON.stringify({
                                success: true,
                                message: 'Blank screen displayed'
                            }));
                            break;
                        case '/api/source':
                            this.setNDISource(data.sourceName, commandInfo);
                            handled();
                            res.end(JSON.stringify({
                                success: true,
                                message: `Source set to ${data.sourceName}`
                            }));
                            break;
                        case '/api/cec/on':
                            const successCecOn = cecPowerOn(commandInfo);
                            if (successCecOn === undefined) {
                                consoleLog(`(↓↑) [handel Unknown] ${url.pathname}`);
                                res.end(JSON.stringify({
                                    success: true,
                                    message: 'TV Power On'
                                }));
                            } else if (!successCecOn.success) {
                                handled();
                                res.end(JSON.stringify({
                                    success: false,
                                    message: 'TV Power On Failed'
                                }));
                            } else if (successCecOn.success) {
                                handled();
                                res.end(JSON.stringify({
                                    success: true,
                                    message: 'TV Power On'
                                }));
                            }
                            break;
                        case '/api/cec/standby':
                            const successCecOff = cecPowerOff(commandInfo);
                            if (successCecOff === undefined) {
                                consoleLog(`(↓↑) [handel Unknown] ${url.pathname}`);
                                res.end(JSON.stringify({
                                    success: true,
                                    message: 'TV Power Off'
                                }));
                            } else if (!successCecOff.success) {
                                handled();
                                res.end(JSON.stringify({
                                    success: false,
                                    message: 'TV Power Off Failed'
                                }));
                            } else if (successCecOff.success) {
                                handled();
                                res.end(JSON.stringify({
                                    success: true,
                                    message: 'TV Power Off'
                                }));
                            }
                            break;
                        case '/api/deviceName':
                            const currentDeviceName = this.__client.name;
                            this.__client.name      = data.deviceName || this.defaultDeviceName;
                            this.saveState(commandInfo);
                            handled();
                            res.end(JSON.stringify({
                                success: true,
                                message: `Device name updated.`,
                                updates: {
                                    deviceName: {
                                        previous: currentDeviceName,
                                        new: data.deviceName
                                    }
                                }
                            }));
                            break;
                        default:
                            consoleLog(`(↓↑) [unhandled] ${url.pathname}`, {details: 'Path Not Defined'});
                            res.end(JSON.stringify({
                                success: false,
                                message: 'Path Not found'
                            }));
                    }
                });
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            consoleLog('(↓↓) command server: api', {
                req: {
                    url: `${req.url}`,
                    method: `${req.method}`,
                },
                res: { status: 200 }
            });
            
            switch (url.pathname) {
                case '/control/browser/restart':
                    this.relaunchOverlayBrowser();
                    handled();
                    res.end(JSON.stringify({ status: 200, response: OK }));
                    break;
                default:
                    res.end(JSON.stringify({
                        config: { ...this.__client },
                        system: { 
                            ...SYS_DETAILS,
                            cpus: os.cpus(),
                            memory: {
                                free: os.freemem(),
                                total: os.totalmem(),
                                percentUsed: ( 1-(os.freemem()/os.totalmem()) ).toFixed(3),
                            },
                            load_avg: os.loadavg(),
                            uptime: os.uptime(),
                            uptime_ndpi: uptime(),
                        },
                        get_stats: this.getSystemStats()
                    }));
                    break;
            }

        });

        this.wss = new WebSocket.Server({ server });

        this.wss.on('connection', (ws) => {

            ws.on('message', (message) => {
                try {
                    const command = JSON.parse(message);
                    consoleLog('(↓↓) command server: ws');
                    this.handleCommand(command, ws);
                } catch (error) {
                    consoleLog('(↓↓) command server: ws', {Message: message}, error);
                    ws.send(JSON.stringify({
                        success: false,
                        message: 'Invalid command format'
                    }));
                }
            });

            ws.on('close', () => {
                consoleLog('[disconnected] command server: ws');
            });

            ws.on('error', (error) => {
                consoleLog('[connection error] command server: ws', null, error);
            });
        });

        server.listen(this.__client.config.commandPort, () => {
            console.log(`Command Handler API running on port ${this.__client.config.commandPort}`);
            this.bonjour__start();
        });
    }

    bonjour__start() {
        this.bonjour__publish();

        setInterval(() => {
            this.bonjour__publish();
        }, this.time_interval__update_bonjour);
    }

    bonjour__publish() {
        this.bonjour__options = {
            name: `ndpi-client-${this.__client.id}`,
            type: 'ndpi-monitor-client',
            port: this.__client.config.bonjourPort,
            txt: {
                deviceId: String(this.__client.id),
                deviceName: String(this.__client.name),
                ip: String(this.__client.config.ip),
                commandPort: String(this.__client.config.commandPort),
                type: String(this.__client.type),
                status: String('online'),
                version: String(this.__client.config.version)
            }
        };

        if (this.bonjour__service) {
            this.bonjour__service.stop();
            this.bonjour__service = null;
        } else {
            console.log('(↑↑) Starting Bonjour');
        }

        setTimeout(() => {
            console.log('bonjour start');
            this.bonjour__service = bonjour.publish(this.bonjour__options);
        }, 500);

    }

    handleCommand(command, ws) {

        if (command.serverAddress) {
            if (command.serverAddress !== this.__client.server.ip) {
                this.__client.server.ip = command.serverAddress;
                consoleLog('(↑↓) [handled][updated] server ip address', { ReconnectingIn: 5 });
                setTimeout(() => {
                    this.connectToServer(command.serverAddress)
                }, 5000)
            }
        }

        const commandInfo = {
            source:     command.source      || 'unknown',
            timestamp:  command.timestamp   || new Date().toISOString(),
            command:    command.type        || 'unknown',
        };

        const handled = () => consoleLog(`(↑↓) [handled]`, commandInfo);

        switch (command.type) {
            case 'set-source':
                commandInfo.data = { sourceName: command.sourceName };
                this.setNDISource(command.sourceName, commandInfo);
                handled();
                ws.send(JSON.stringify({
                    success: true,
                    message: `Source set to ${command.sourceName}`
                }));
                break;

            case 'rename':
                commandInfo.data = { deviceName: command.newName };
                this.__client.name = command.newName
                this.saveState(commandInfo);
                handled();
                ws.send(JSON.stringify({
                    success: true,
                    message: `Renamed to ${command.newName}`
                }));
                break;

            case 'show-overlay':
            case 'overlay':
                this.showOverlay(commandInfo);
                handled();
                ws.send(JSON.stringify({
                    success: true,
                    message: 'Overlay displayed'
                }));
                break;

            case 'show-blank':
            case 'blank':
                this.showBlank(commandInfo);
                handled();
                ws.send(JSON.stringify({
                    success: true,
                    message: 'Blank screen displayed'
                }));
                break;

            case 'shutdown':
                ws.send(JSON.stringify({
                    success: true,
                    message: 'Shutting down...'
                }));
                handled();
                setTimeout(() => deviceShutdown(), 1000);
                break;

            case 'reboot':
                ws.send(JSON.stringify({
                    success: true,
                    message: 'Rebooting...'
                }));
                handled();
                setTimeout(() => deviceReboot(), 1000);
                break;

            case 'ping':
                ws.send(JSON.stringify({
                    success: true,
                    type: 'pong',
                    deviceId: this.__client.id
                }));
                consoleLog('(↑↑) command server: ws', { data: 'pong' });
                break;

            case 'get-status':
                ws.send(JSON.stringify({
                    success: true,
                    deviceId: this.__client.id,
                    deviceName: this.__client.name,
                    ip: this.__client.config.ip,
                    currentSource: this.__client.ndi.source.current || 'None',
                    displayMode: this.__client.config.displayMode || 'overlay',
                    status: 'online'
                }));
                handled();
                break;

            default:
                ws.send(JSON.stringify({
                    success: false,
                    message: `Unknown command: ${command.type}`
                }));
                consoleLog(`(↑↓) [unhandled]`, commandInfo);
        }
    }

    displayStartup() {
        this.launchOverlayBrowser();
        setTimeout(() => {
            if (this.__client.ndi.source.target) {
                this.startNDIReceiver(this.__client.ndi.source.target);
            } else {
                this.broadcastToDisplay();
            }
        }, 2000);
    }

    saveState(commandInfo = {}) {

        if (commandInfo.serverAddress) this.__client.server.ip = commandInfo.serverAddress;

        const cmdSource     = commandInfo.source    || commandInfo.user || null;
        const cmdTimestamp  = commandInfo.timestamp || new Date().toISOString();
        const cmdCommand    = commandInfo.command   || null;
        const cmdData       = commandInfo.data      || null;

        let state;

        if (cmdSource || cmdCommand || cmdData) {
            // Log new Command
            // Store Previous Command
            const previousCommand = {
                source:     this.__client.lastCommand.source,
                timestamp:  this.__client.lastCommand.timestamp,
                command:    this.__client.lastCommand.command,
                data:       this.__client.lastCommand.data,
            };

            this.__client.lastCommand.source    = cmdSource || 'unknown';
            this.__client.lastCommand.timestamp = cmdTimestamp;
            this.__client.lastCommand.command   = cmdCommand || '';
            this.__client.lastCommand.data      = cmdData || {};
        
            state = this.__client;
            state.commandLog = [ previousCommand ];

            // Switched to Max of 100
            // const discardLogAfter = 15 * 86400000; // Days to retain command logs. 86400000 = ms in a Day
            try {
                if (fs.existsSync(PATH_CONFIG)) {
                    const data = JSON.parse(fs.readFileSync(PATH_CONFIG, 'utf8'));
                    const savedLog = data.commandLog || [];

                    if (Array.isArray(savedLog) && savedLog.length > 0) {
                        savedLog.forEach((command) => {
                            if (state.commandLog.length < 100) state.commandLog.push(command);
                        });
                    }
                }
            } catch (error) {
                consoleLog('[ERROR] Loading Command Log', 'Attempted at Save State', error);
            }
        } else {
            state = this.__client;
        }
        
        try {
            fs.writeFileSync(PATH_CONFIG, JSON.stringify(state, null, 2), 'utf8');
        } catch (error) {
            consoleLog('[error] updating device state', null, error);
        }
    }

    getConfig() {
        let data = null;
        try {
            if (fs.existsSync(PATH_CONFIG)) {
                data = JSON.parse(fs.readFileSync(PATH_CONFIG, 'utf8'));
            }
        } catch (e) {
            consoleLog('Get Config', null, e);
        }
        return data;
    }

    connectToServer(serverAddress) {

        if (!serverAddress || serverAddress.includes('localhost')) return;
        
        this.__client.server.ip = serverAddress;
        
        // Clean up existing connection
        if (this.ws_connection__ndpi_server) {
            try { this.ws_connection__ndpi_server.close(); } catch {}
            this.ws_connection__ndpi_server = null;
        }
        
        if (this.timer__reconnect_ndpi_server) {
            clearTimeout(this.timer__reconnect_ndpi_server);
            this.timer__reconnect_ndpi_server = null;
        }

        //consoleLog('[Establishing connection] ndpi server',{ WebSocket: wsUrl });
        console.log('Connecting to NDPi Command Server')
        
        const wsUrl = `ws://${serverAddress}/ws/client`;
        try {
            this.ws_connection__ndpi_server = new WebSocket(wsUrl);
            
            this.ws_connection__ndpi_server.on('open', () => {
                consoleLog('[connected] ndpi server', { details: `Sending status updates every ${this.time_interval__send_status_update / 1000} seconds.` });
                this.sendStatusToServer();
                this.broadcastToDisplay({ type: 'ndpi-server-connected' });
                this.timer__resend_status_update = setInterval(() => {
                    this.sendStatusToServer();
                }, this.time_interval__send_status_update);
                
            });
            
            this.ws_connection__ndpi_server.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    consoleLog('(↓↓) ndpi Server', message);
                    this.handleServerMessage(message);
                } catch (error) {
                    consoleLog('(↓↓) ndpi server', data, error);
                }
            });
            
            this.ws_connection__ndpi_server.on('close', () => {
                consoleLog('[disconnected] ndpi server', { ReconnectingIn: this.time_interval__reconnect_ndpi_server / 1000 });
                if (this.timer__resend_status_update) {
                    clearInterval(this.timer__resend_status_update);
                    this.timer__resend_status_update = null;
                }
                
                this.timer__reconnect_ndpi_server = setTimeout(() => {
                    this.connectToServer(this.__client.server.ip);
                }, this.time_interval__reconnect_ndpi_server);
            });
            
            this.ws_connection__ndpi_server.on('error', (error) => {
                consoleLog('[connection error] ndpi server', null, error);
                clearInterval(this.timer__resend_status_update);
                this.timer__resend_status_update = null;
            });
            
        } catch (error) {
            consoleLog('[connection failed] ndpi server', {ReconnectTimeout: 5000}, error);
            
            this.timer__reconnect_ndpi_server = setTimeout(() => {
                this.connectToServer(serverAddress);
            }, 5000);
        }
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
            
        } catch (error) {
            // Silently fail - stats will be 0
        }
        
        return stats;
    }

    sendStatusToServer() {

        if (!this.ws_connection__ndpi_server || this.ws_connection__ndpi_server.readyState !== WebSocket.OPEN) return;
        
        const systemStats = this.getSystemStats();
        
        const status = {
            type: 'client-status',
            deviceId: this.__client.id,
            deviceName: this.__client.name,
            ip: this.__client.config.ip,
            currentSource: this.__client.ndi.source.current || 'None',
            targetSource: this.__client.ndi.source.target || 'None',
            displayMode: this.__client.config.displayMode,
            ndiInfo: {
                resolution: this.__client.ndi.resolution,
                framerate: this.__client.ndi.framerate,
                displayResolution: this.__client.display.resolution,
                displayName: this.__client.display.mfr,
                connectedAt: this.__client.ndi.connectedAt,
            },
            systemStats: systemStats,
            status: this.__client.ndi.status,
        };
        
        try {
            this.ws_connection__ndpi_server.send(JSON.stringify(status));
        } catch (error) {
            consoleLog('[failed] status update to server', null, error);
        }
    }

    handleServerMessage(message) {

        const handled = () => consoleLog(`[handled] ${message.type}`);
        
        switch (message.type) {
            case 'set-source':
                this.setNDISource(message.sourceName, {
                    source: message.user,
                    timestamp: message.timestamp,
                    data: { sourceName: message.sourceName },
                    serverAddress: message.serverAddress
                });
                handled();
                break;
                
            case 'overlay':
                this.showOverlay({
                    source: message.user,
                    timestamp: message.timestamp,
                    command: message.type
                });
                handled();
                break;
                
            case 'blank':
                this.showBlank({
                    source: message.user,
                    timestamp: message.timestamp,
                    command: message.type
                });
                handled();
                break;
                
            case 'reboot':
                handled();
                setTimeout(() => deviceReboot(), 1000);
                break;
                
            case 'shutdown':
                handled();
                setTimeout(() => deviceShutdown(), 1000);
                break;
                
            case 'ping':
                consoleLog('(↑↓) ndpi Server: ws', { data: 'pong' });
                this.ws_connection__ndpi_server.send(JSON.stringify({ type: 'pong', deviceId: this.__client.id }));
                break;
            default:
                consoleLog(`(↑↓) [unhandled] ${message.type}`);
                break;
        }
    }

    parseNDIInfo(output) {

        CRLFArray(output).forEach((stdout) => {
            console.log(`(↓↓)[ NDI ] ⸺  ▶ ${stdout}`);
        });

        /*
        outputArry.forEach((stdout) => {
            console.log(`(↓↓)[ NDI ] ⸺  ▶ ${stdout}`);
        });
        */
        const videoMatch = output.match(/(?:Video|Source):\s*(\d+)x(\d+)\s*@\s*(\d+(?:\.\d+)?)/i);
        if (videoMatch) {
            this.__client.ndi.resolution = `${videoMatch[1]}x${videoMatch[2]}`;
            this.__client.ndi.framerate = parseFloat(videoMatch[3]);
        }
        
        if (!this.__client.ndi.resolution) {
            const resMatch = output.match(/(\d{3,4})x(\d{3,4})/);
            if (resMatch) {
                this.__client.ndi.resolution = `${resMatch[1]}x${resMatch[2]}`;
            }
        }
        
        if (!this.__client.ndi.framerate) {
            const fpsMatch = output.match(/(\d+(?:\.\d+)?)\s*fps|@\s*(\d+(?:\.\d+)?)/i);
            if (fpsMatch) {
                this.__client.ndi.framerate = parseFloat(fpsMatch[1] || fpsMatch[2]);
            }
        }
    }

    broadcastToDisplay(message = {}) {

        const currentConfig = this.__client;
        const displayMode = message.type || `show-${this.__client.config.displayMode}`;

        const updateData = {
            type: displayMode,
            serverIp: this.__client.server.ip.split(':')[0] || '',
            thisDevice: {
                id: this.__client.id,
                address: this.__client.config.ip,
                name: this.__client.name,
            },
            service: {
                name: this.__client.type,
                version: `${versionCurrent}${versionIsStable ? ' (Stable)' : ''}`,
            }
        };

        let connectedws_connections__display_server = [];

        consoleLog('(↑↑) Display Server: ws', { type: displayMode });
        const data = JSON.stringify(updateData);

        this.ws_connections__display_server.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(data);
        });

    }

    relaunchOverlayBrowser() {
        if (this.child_process__chromium) {
            this.killOverlayBrowser();
        }
        setTimeout(() => {
            this.launchOverlayBrowser();
        }, 2000);
    }
    killOverlayBrowser() {
        if (this.child_process__chromium) {
            this.child_process__chromium.kill();
            this.child_process__chromium = null;
        }
    }
    launchOverlayBrowser() {
        if (this.child_process__chromium) {
            return;
        }

        let commandLine = `/usr/bin/chromium \
            --kiosk \
            --disable-web-security \
            --default-background-color=#00000000 \
            --disable-crash-reporter \
            --disable-logging \
            --disable-notifications \
            --enable-virtual-keyboard \
            --pull-to-refresh \
            --show-taps \
            --kiosk-splash-screen-min-time-seconds=5 \
            --user-data-dir=${os.homedir()}/.config/chromium \
        http://localhost:${this.__client.config.displayPort}/`;

        // --show-fps-counter \
        // --show-taps ///\\\ Draws a circle at each touch point, similar to the Android OS developer option "Show taps".

        const { exec, spawn } = require('child_process');
        this.child_process__chromium = exec(commandLine, {
            env: {
                ...process.env,
                DISPLAY: ':0',
                XAUTHORITY: '/home/ndpi-client/.Xauthority',
            },
        });

        this.child_process__chromium.on('exit', () => {
            this.child_process__chromium = null;
        });

        this.child_process__chromium.stderr.on('data', (data) => {
            const output = data.toString();
            CRLFArray(output).forEach((line) => {
                console.log(`[ Chromium Error ]: ${line}`);
            });
        });
        
        this.child_process__chromium.on('error', (err) => {
            console.log('[ Chromium Error ]:', err);
            console.log(`[ Chromium Error ]: Relaunching...`);
            this.relaunchOverlayBrowser();
        });
    }

    killNdiReceiver() {

        if (this.child_process__ndi_receiver) {
            try {
                consoleLog('[ ndi ] ⸺  ▶ [SIGKILL]');
                this.child_process__ndi_receiver.kill('SIGKILL'); // Use SIGKILL for immediate termination
                this.child_process__ndi_receiver = null;
            } catch (e) {
                consoleLog('[ ndi ] ⸺  ▶ [SIGKILL]', null, e);
            }
        }

        // Kill any orphaned NDI processes
        try {
            exec('pkill -9 ndi_receiver_v2 2>/dev/null || true');
        } catch (e) {
            consoleLog('[ ndi ] ⸺  ▶ [pkill -9]', null, e);
        }
    }
    setNDISource(sourceName, commandInfo = {}) {

        if (this.timer__reconnect_ndi) {
            clearTimeout(this.timer__reconnect_ndi);
            this.timer__reconnect_ndi = null;
        }
        
        this.__client.ndi.source.target = sourceName;
        
        // Save server address if provided
        if (commandInfo.serverAddress) {
            this.__client.server.ip = commandInfo.serverAddress;
            if (!this.ws_connection__ndpi_server || this.ws_connection__ndpi_server.readyState !== WebSocket.OPEN) {
                this.connectToServer(commandInfo.serverAddress);
            }
        }
        
        this.saveState(commandInfo);
        
        // If source is None or empty, just stop
        if (!sourceName || sourceName === 'None') {
            this.__client.ndi.source.target = null;
            this.broadcastToDisplay();
            //setTimeout(() => {
                this.killNdiReceiver();
            //}, 1000);
        } else {
            this.startNDIReceiver(sourceName);
        }

    }
    startNDIReceiver(sourceName) {

        consoleLog('[Establishing connection] NDI');

        this.broadcastToDisplay({ type: `ndi-init` });

        this.killNdiReceiver();
        setTimeout(() => {
            this._startNDIReceiverInternal(sourceName);
        }, 1000);

    }
    _startNDIReceiverInternal(sourceName) {

        if (!fs.existsSync(PATH_NDI_RECEIVER)) {
            consoleLog('[ERROR] ndi', { Path: PATH_NDI_RECEIVER }, { error: 'Receiver path not found.' });
            this.scheduleReconnect();
            this.broadcastToDisplay();
            return;
        }
        
        const { spawn } = require('child_process');

        console.log(`(↑↓)[ NDI ] ⸺  ▶ [INIT]`, {SourceName: sourceName});

        this.child_process__ndi_receiver = spawn(PATH_NDI_RECEIVER, [sourceName], {
            env: {
                ...process.env,
                DISPLAY: ':0',
                XAUTHORITY: '/home/ndpi-client/.Xauthority',
                LD_LIBRARY_PATH: '/opt/NDI SDK for Linux/lib/aarch64-rpi4-linux-gnueabi:' + (process.env.LD_LIBRARY_PATH || '')
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        this.child_process__ndi_receiver.stdout.on('data', (data) => {
            const output = data.toString().trim();
            this.parseNDIInfo(output);

            if (output.includes('Connected to:')) { // When Connection to NDI is Successful
                this.broadcastToDisplay({ type: `ndi-started` });
                this.__client.ndi.source.current = sourceName;
                this.__client.ndi.connectedAt = new Date().toISOString();
                this.saveState();
                this.sendStatusToServer();
                this.broadcastToDisplay({ type: `show-blank` });
            }
        });
        
        this.child_process__ndi_receiver.stderr.on('data', (data) => {
            const output = data.toString().trim();
            CRLFArray(output).forEach((line) => {
                console.log(`(❌)[ NDI ] ⸺  ▶ [ERROR]: ${line}`);
            });
        });
        
        this.child_process__ndi_receiver.on('close', (code) => {
            this.child_process__ndi_receiver                     = null;
            this.__client.ndi.source.current    = null;
            this.__client.ndi.status            = 'idle';
            this.__client.ndi.resolution        = null;
            this.__client.ndi.framerate         = null;
            this.__client.ndi.connectedAt       = null;
            this.saveState();
            this.sendStatusToServer();
            consoleLog('[ ndi ] ⸺  ▶ [TERMINATED]', {Code: code});
            this.broadcastToDisplay();
            this.scheduleReconnect();
        });
        
        this.child_process__ndi_receiver.on('error', (error) => {
            consoleLog('[error] ndi', null, error);
        });
    }
    scheduleReconnect() {

        // Only reconnect if we have a target source and aren't already trying
        if (
            !this.__client.ndi.source.target || 
            this.__client.ndi.source.target === 'None' || 
            this.timer__reconnect_ndi
        ) return;

        this.broadcastToDisplay({type: `ndi-init`});

        this.timer__reconnect_ndi = setTimeout(() => {
            this.timer__reconnect_ndi = null;
            if (
                this.__client.ndi.source.target && 
                this.__client.ndi.source.target !== 'None' && 
                !this.child_process__ndi_receiver
            ) this.startNDIReceiver(this.__client.ndi.source.target);
        }, 15000);
    }

    showOverlay(commandInfo = {}) {

        if (this.timer__reconnect_ndi) {
            clearTimeout(this.timer__reconnect_ndi);
            this.timer__reconnect_ndi = null;
        }

        this.__client.ndi.source.target = null;
        this.__client.config.displayMode = 'overlay';

        this.saveState(commandInfo);

        this.launchOverlayBrowser();

        setTimeout(() => {
            this.killNdiReceiver();
            this.sendStatusToServer();
        }, 1000);

    }
    showBlank(commandInfo = {}) {

        if (this.timer__reconnect_ndi) {
            clearTimeout(this.timer__reconnect_ndi);
            this.timer__reconnect_ndi = null;
        }

        this.__client.ndi.source.target = null;
        this.__client.config.displayMode = 'blank';

        this.saveState(commandInfo);

        this.launchOverlayBrowser();

        setTimeout(() => {
            this.killNdiReceiver();
        }, 1000);
    }
}

let client;
(async () => {
    await new Promise((resolve) => {
        const startup = exec(`./sh/startup`);
        startup.stdout.on('data', (data) => {
            const output = data.toString();
            CRLFArray(output).forEach((line) => {
                console.log(line);
            });
        });
        startup.on('exit', () => {
            resolve();
        })
    }); 

    client = new NDPiClient();

    console.log('Waiting For Network...');

    var localIp = await getLocalIP();
    console.log(`Connected: ${localIp}`);
    client.__client.config.ip = localIp;

    setTimeout(() => {
        console.log('Starting...')
        client.start();
    }, 700);

    setInterval(async () => {
        localIp = await getLocalIP();
        client.__client.config.ip = localIp;
    }, 10000);
})();

async function deviceShutdown() {
    consoleLog('device powering down');
    await killProcess();
    exec('sudo shutdown now', (error) => {
        if (error) consoleLog('device powerdown failed', null, error);
    });
}
async function deviceReboot() {
    consoleLog('device rebooting...');
    await killProcess();
    exec('sudo reboot', (error) => {
        if (error) consoleLog('device reboot failed', null, error);
    });
}
async function killProcess() {
    if (client.mdnsService) {
        consoleLog('Terminating mdns');
        client.mdnsService.stop();
    }
    setTimeout(async () => {
        if (client.child_process__ndi_receiver) {
            consoleLog('Terminating Service Connections');
            await client.killNdiReceiver();
        }
        consoleLog('Terminating Application');
        console.log('⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻ ')
        console.log('⸻    GOOD BYE 👋');
        console.log('⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻ ');
        console.log('⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻ ');
        process.exit();
    }, 500);
}

process.on('SIGINT', () => { killProcess(); });
process.on('SIGTERM', () => { killProcess(); });
process.on('exit', (code) => {
    console.log(`    Exit Code: ${code}`);
    console.log('════════════════════════════════════════════  N D P i - M O N I T O R  ═');
    //                                                           N D P i - M O N I T O R ═════ END ═════
});
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
    process.exit();
});