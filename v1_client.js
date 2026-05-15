/**
 *  NDPi - Monitor v3 (CLIENT)
 *      Created By: Evan Smith
 *      On Behalf of: New Life Church COGOP - Atlantic
 * 
 *  This service is used for:
 *  -   Communicating with NDPi - Monitor v3 (SERVER)
 *  -   Launching NDI video streams and displaying them to HDMI out.
 */

const os                            = require('os');
const fs                            = require('fs');
const path                          = require('path');
const { exec }                      = require('child_process');
const { uptime }                    = require('process');
const net                           = require('net');
const NDPiClient                    = require('./service/NDPiClient.js');
const CecController                 = require('./service/client_cec.js');
const SystemConfigurationManager    = require('./service/client_fs.js');

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
        if (data) console.log(JSON.stringify(data));
        //console.log('⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻ ');
    }
}
function getDeviceId() {
    var cmd = "cat /proc/cpuinfo | grep -Fw 'Serial' | awk '{print $3}'";
    exec(cmd, (error, stdout, stderr) => {
        if (!error) {
            var out = stdout.toString().split(':')[1].trim();
            console.log(`Device Serial #: ${out}`);
            return out;
        } else {
            console.log(`ERROR: ${cmd}`, stderr);
            return null;
        }
    });
    //try {
    //    const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    //    const serial = readFile('/proc/cpuinfo').match(/Serial\s*:\s*([0-9a-f]+)/i);
    //     if (serial) {
    //         return serial[1];
    //     }
    // } catch (error) {
    //     consoleLog('Error Reading Serial Number', null, error);
    //     return null;
    // }
}
function getDeviceModel() {
    var cmd = "cat /proc/cpuinfo | grep -Fw 'Model' | awk '{print}'";
    exec(cmd, (error, stdout, stderr) => {
        if (!error) {
            var out = stdout.toString().split(':')[1].trim();
            console.log(`Device Model: ${out}`);
            return out;
        } else {
            console.log(`ERROR: ${cmd}`, stderr);
            return null;
        }
    });
    // try {
    //     const model = readFile('/proc/cpuinfo').match(/Model\s*:\s*([0-9a-f]+)/i);
    //     if (model) {
    //         return model[1];
    //     }
    // } catch (error) {
    //     consoleLog('Error Reading Device Model', null, error);
    //     return null;
    // }
}
async function getLocalIP() {
    if (!NET_ONLINE) {
        await waitForNetwork();
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

const system__ = new SystemConfigurationManager();
const ndpi = new NDPiClient();
const cec = new CecController();

async function initiate() {
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

    console.log('Waiting For Network...');

    var deviceID = getDeviceId();
    var deviceModel = getDeviceModel();
    var localIp = await getLocalIP();

    console.log(`Connected: ${localIp}`);
    ndpi.__client.config.ip = localIp;
    ndpi.__client.id = deviceID || '';
    ndpi.__client.model = deviceModel || '';

    setTimeout(() => {
        console.log('Starting...')
        ndpi.start();
    }, 700);

    setInterval(async () => {
        localIp = await getLocalIP();
        ndpi.__client.config.ip = localIp;
    }, 10000);
}

// react to structured events
cec.on('event', (evt) => {
    console.log('CEC Event:', evt.raw);
    if (evt.type === 'POWER') {
        console.log('Power event:', evt.raw);
    }
});
cec.on('error_log', (data) => {
    console.log('CEC ERROR:', data);
});
cec.on('timeout', () => {
    console.log('CEC Timed Out');
    cec.send('q', { debounceKey: 'quit' });
});

async function deviceShutdown() {
    console.log('device powering down');
    await killProcess();
    exec('sudo shutdown now', (error) => {
        if (error) console.log('device powerdown failed', null, error);
    });
}
async function deviceReboot() {
    console.log('device rebooting...');
    await killProcess();
    exec('sudo reboot', (error) => {
        if (error) console.log('device reboot failed', null, error);
    });
}
async function killProcess() {
    await new Promise((resolve) => {
        if (ndpi.bonjour__service) {
            console.log('Terminating mdns');
            ndpi.bonjour__service.stop();
        }
        setTimeout(async () => {
            if (ndpi.child_process__ndi_receiver) {
                console.log('Terminating Service Connections');
                await ndpi.killNdiReceiver();
            }
            console.log('Closing CEC...');
            cec.send('q', { debounceKey: 'quit' });
            setTimeout(() => {
                console.log('⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻ ')
                console.log('⸻    GOOD BYE 👋');
                console.log('⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻ ');
                console.log('⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻   ⸻ ');
                process.exit();
                resolve();
            }, 1000);
        }, 500);
    });
    return;
}

process.on('SIGINT', () => { killProcess(); });
process.on('SIGTERM', () => { killProcess(); });
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