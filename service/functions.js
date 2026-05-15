const { setTimeout } = require('timers');
const os = require('os');
const net = require('net');

async function getLocalIp(testForNetwork = false) {
    if (testForNetwork) {
        console.log('[ functions ] Waiting for network online...');
        await waitForNetwork();
    }
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            const isIPv4 = iface.family === 'IPv4' || iface.family === 4;
            if (isIPv4 && !iface.internal) {
                return iface.address || null;
            }
        }
    }
    return null;
}

async function processCommand(data) {
    if (!data) {
        return {
            success: false,
            message: "Missing 'payload'",
        };
    }

    // Placeholder ... Reference When Building Origins
    let command = {
        type: '',
        payload: {},
    };

    switch (command.type) {
        case 'show-overlay':
            displayForceOverlay();
            return 
            break;
        case 'set-overlay':
            const imageBase64 = command.payload.content;
            updateOverlay(imageBase64);
            break;
        default:
            console.log('[ functions ] Unhandled Command Received', command.type);
            break;
    }

}

module.exports = {
    getLocalIp,
    processCommand
};


/** ---- Private Functions ---- */

/** TODO */

function displayForceOverlay() {
    ///
}

function updateOverlay(data) {
    SystemConfigurationManager.write('')
}

/** COMPLETED */
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
