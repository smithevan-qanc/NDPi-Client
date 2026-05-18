const { setTimeout } = require('timers');
const os = require('os');
const net = require('net');

/** ---- Export Functions ---- */

    /** TODO */

        async function processCommand(message = {}) {
            console.log('(1) Processing Command', message);
            // ... Reference For Building
            let command = {
                id:     message?.id,     // UUID of command for tracking
                type:   message?.type,
                data:   message?.data,  // data can be of any type
            };
            let response = {
                id:         command.id,
                success:    false,
                ts:         Date.now(),
                data:       {}
            };

            if (!command.type) {
                response.data.message = "Missing 'type'";
                return response;
            }
            switch (command.type) {
                case 'ping':
                    console.log(`PROCESSING: ${command.type}`);
                    response.success = true;
                    return response;
                    break;

                // Visual Display Commands
                case 'show-blank':
                    console.log(`PROCESSING: ${command.type}`);
                    displayForceBlank();

                    response.success = true;
                    return response;
                    break;
                case 'show-overlay':
                    console.log(`PROCESSING: ${command.type}`);
                    displayForceOverlay();

                    response.success = true;
                    return response;
                    break;
                case 'set-overlay':
                    console.log(`PROCESSING: ${command.type}`);
                    const imageBase64 = command.data.content;
                    updateOverlay(imageBase64);

                    response.success = true;
                    return response;
                    break;
                case 'set-source':
                    console.log(`PROCESSING: ${command.type}`);

                    response.success = true;
                    return response;
                    break;

                // Physical Display Commands
                case 'send-cec':
                    console.log(`PROCESSING: ${command.type}`);
                    const fetchRes = await fetch('http://localhost:3080/internal/api/v1/cec', {
                        method: 'POST',
                        body: JSON.stringify({ BODY: command.data })
                    });
                    if (fetchRes.ok)
                         { response.success = true; }
                    else { response.success = false; }
                    console.log('Fetch RES', fetchRes);
                    return response;
                    break;
                // case '':
                //     console.log(`PROCESSING: ${command.type}`);

                //     response.success = true;
                //     return response;
                //     break;
                // case '':
                //     console.log(`PROCESSING: ${command.type}`);

                //     response.success = true;
                //     return response;
                //     break;
                // case '':
                //     console.log(`PROCESSING: ${command.type}`);

                //     response.success = true;
                //     return response;
                //     break;
                // case '':
                //     console.log(`PROCESSING: ${command.type}`);

                //     response.success = true;
                //     return response;
                //     break;
                // case '':
                //     console.log(`PROCESSING: ${command.type}`);

                //     response.success = true;
                //     return response;
                //     break;

                // Device Commands
                case 'shutdown-device':
                    console.log(`PROCESSING: ${command.type}`);

                    response.success = true;
                    return response;
                    break;
                case 'reboot-device':
                    console.log(`PROCESSING: ${command.type}`);

                    response.success = true;
                    return response;
                    break;
                case 'rename-device':
                    console.log(`PROCESSING: ${command.type}`);

                    response.success = true;
                    return response;
                    break;

                // Default Fallback
                default:
                    console.log('[ functions ] Unhandled Command Received', command.type);

                    response.data.message = "Unknown 'type'";
                    return response;
                    break;
                // End of Command Handler
            };
        }

    /** COMPLETED */

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


module.exports = {
    getLocalIp,
    processCommand
};


/** ---- Helper Functions ---- */

    /** TODO */

        function displayForceBlank() {
            ///
        }
        function displayForceOverlay() {
            ///
        }
        function updateOverlay(data) {
            /// write image base 64 to file 'media_overlay_image'
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
