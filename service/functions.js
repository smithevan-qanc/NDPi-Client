const { setTimeout } = require('timers');
const os = require('os');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { exec } = require('node:child_process');

/** ---- Export Functions ---- */

    /** TODO */

        async function processCommand(message = {}) {
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

            let arry = [];

            if (!command.type)
            {
                response.data.message = "Missing 'type'";
                return response;
            }

            switch (command.type)
            {
                case 'ping':
                    response.success = true;
                    return response;
                    break;

                // Visual Display
                case 'show-blank':
                    try
                    {
                        fs.writeFileSync(
                            path.join(process.env.DATA_NDPI_PATH, 'ndpi_status_no_source_display_mode'),
                            'blank',
                            'utf8'
                        );
                        response = await setNdi(response, command);
                    }
                    catch (error)
                    {
                        response.data.message = error;
                        response.success = false;
                    }
                    return response;
                    break;

                case 'show-overlay':
                    try
                    {
                        fs.writeFileSync(
                            path.join(process.env.DATA_NDPI_PATH, 'ndpi_status_no_source_display_mode'),
                            'overlay',
                            'utf8'
                        );
                        response = await setNdi(response, command);
                    }
                    catch (error)
                    {
                        response.data.message = error;
                        response.success = false;
                    }
                    return response;
                    break;

                case 'set-overlay':
                    try
                    {
                        fs.writeFileSync(
                            path.join(process.env.DATA_NDPI_PATH, 'media_overlay_image'),
                            JSON.stringify(command.data, null, 2),
                            'utf8'
                        );
                    }
                    catch (error)
                    {
                        response.data.message = error;
                        response.success = false;
                    }
                    return response;
                    break;
                
                case 'set-source':
                    response = await setNdi(response, command);
                    return response;
                    break;
                
                case 'get-sources':
                    const ndiDiscoverPath = `./${fs.readFileSync(path.join(process.env.DATA_NDPI_PATH, 'ndi_source_discovery_exec'), 'utf8')}`;
                    await new Promise((resolve) => {
                        exec(ndiDiscoverPath, (error, stdout, stderr) => {
                            if (error)
                            {
                                console.error(`[ functions ] NDI Discovery Error`, stderr.toString());
                                arry.push(stdoutToArray(stderr));
                                response.data.message = arry.join(' << ');
                                response.success = false;
                                resolve();
                            }
                            else
                            {
                                response.data.sources = [];
                                const stdoutArray = stdoutToArray(stdout);

                                for (const line of stdoutArray)
                                {
                                    const splitLine = line.split('^');
                                    response.data.sources.push({
                                        name: splitLine[1],
                                        url: splitLine[0],
                                    });
                                }
                                response.success = true;
                                resolve();
                            }
                        });
                    });
                    return response;
                    break;

                // Physical Display
                case 'send-cec':
                    try
                    {
                        const f = await fetch('http://localhost:3080/api/v1/__internal/cec', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(command)
                        });
                        if (f.ok) { response.success = true }
                        else { response.success = false }
                    }
                    catch (error)
                    {
                        response.data.message = error;
                        response.success = false;
                    }
                    return response;
                    break;
                
                case 'focus-chromium':
                    response = await focusWindow('chromium', response);
                    return response;
                    break;
                
                case 'focus-ndi':
                    response = await focusWindow('gstreamer', response);
                    return response;
                    break;
                
                case '':
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

                // Device
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
                // case '':
                //     console.log(`PROCESSING: ${command.type}`);

                //     response.success = true;
                //     return response;
                //     break;

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
            if (testForNetwork)
                {
                    console.log('[ functions ] Waiting for network online...');
                    await waitForNetwork();
                }
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces))
                {
                    for (const iface of interfaces[name])
                        {
                            const isIPv4 = iface.family === 'IPv4' || iface.family === 4;
                            if (isIPv4 && !iface.internal)
                                { return iface.address || null }
                        }
                }
            return null;
        }

        async function setNdi(res = {}, command = {}) {
            let response = { ...res };
            try
            {
                const res = await fetch('http://localhost:3080/api/v1/__internal/ndi', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(command)
                });
                if (res.ok)
                {
                    const data = await res.json();
                    response.message = data?.message ?? 'OK';
                    response.success = true
                }
                else { response.success = false }
            }
            catch (error)
            {
                response.data.message = error;
                response.success = false;
            }
            return response;
        }

        async function focusWindow(className, res = { data: {} }) {
            let response = { ...res };
            await new Promise((resolve) => {
                exec(`xdotool search --onlyvisible --class "${className}" | head -n 1`, {
                    env: { ...process.env }
                }, (error, stdout, stderr) => {
                    if (error)
                    {
                        console.log('🔴 [ functions ] Could NOT find window:', stderr.toString().trim());
                        response.data.message = `Could NOT find window: ${stderr.toString().trim()}`;
                        response.success = false;
                        resolve();
                        return;
                    }
                    else 
                    {
                        console.log('[ functions ] Focusing Window ID:', stdout.toString().trim());
                        if (!stdout.toString().trim())
                        {
                            console.log(`🔴 [ functions ] ${className} NOT running.`);
                            response.data.message = `${className} is NOT running.`;
                            response.success = false;
                            resolve();
                            return;
                        }
                        const a = `xdotool windowactivate ${stdout.toString().trim()}`;
                        exec(a, {
                            env: { ...process.env }
                        }, (error, stdout, stderr) => {
                            if (error)
                            {
                                console.log('🔴 [ functions ] Could NOT activate window:', stderr.toString().trim() || 'null');
                                response.data.message = `Could NOT activate window: ${stderr.toString().trim()}`;
                                response.success = false;
                                resolve();
                                return;
                            }
                            else 
                            {
                                response.success = true;
                                resolve();
                                return;
                            }
                        });
                    }
                });
            });
            return response;
        }

        function stdoutToArray(stdout) {
            let a = [];
            let stdin = stdout.trim() || '';
            stdin.split(/\r?\n/).forEach((line) => {
                a.push(line);
            });
            return a;
        }


module.exports = {
    getLocalIp,
    processCommand,
    focusWindow,
    stdoutToArray,
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
