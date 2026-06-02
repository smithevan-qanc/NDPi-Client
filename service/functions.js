const { setTimeout } = require('timers');
const os = require('os');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('node:child_process');

/** ---- Export Functions ---- */

    /** TODO */

        async function checkCecCompliance() {
            let responseCecCompliance = [];

            await new Promise((resolve) => {
                const proc = spawn('cec-compliance', ['-s']);
                proc.stdout.on('data', (data) => {
                    const output = String(data.toString()).replaceAll('\t', '');
                    stdoutToArray(output).forEach((line) => {
                        if (line) { responseCecCompliance.push(line); }
                    });
                });
                proc.on('close', () => { resolve(); });
            });

            // console.log(JSON.stringify(responseCecCompliance, null, 2));

            const lineIncludes = (search = '', match = '') => { return search.includes(match); }
            
            responseCecCompliance.forEach((line) => {
                let fileName = null;
                let writeValue = '';

                const splitLine = String(line).split(':');

                if (lineIncludes(line, 'Polling:') && !fileName)
                {
                    fileName = 'output_display_cec_enabled';
                    writeValue = String(splitLine[1] || '').trim() == 'OK' ? 'true' : 'false';
                }

                if (lineIncludes(line, 'CEC Version') && !fileName && !String(splitLine[1] || '').startsWith('Tx'))
                {
                    fileName = 'output_display_cec_version';
                    writeValue = String(splitLine[1] || '').trim();
                }

                if (lineIncludes(line, 'Physical Address') && !fileName && !String(splitLine[1] || '').startsWith('Tx'))
                {
                    fileName = 'output_display_cec_address';
                    writeValue = String(Number(String(splitLine[1] || '').trim().replaceAll('.', '') || 0));
                }

                if (lineIncludes(line, 'Power Status') && !fileName)
                {
                    fileName = 'output_display_cec_status_power';
                    writeValue = String(splitLine[1] || 'unknown').trim();
                }


                if (fileName)
                {
                    // console.log('CEC Compliance Update:', JSON.stringify({
                    //     PATH: path.join(process.env.DATA_NDPI_PATH, fileName),
                    //     VALUE: writeValue
                    // }));
                    fs.writeFileSync(path.join(process.env.DATA_NDPI_PATH, fileName), writeValue, 'utf8');
                }
            });
        }
    
        /** 
         * (NDPi Function) - Process API Command.
         * @param {object} message - Message object from API. Required: 'type'
         * @param {string} [message.id] 
         * @param {string} [message.type]
         * @param {any} [message.data]
         * 
         * @returns {object} 
         */
        async function processCommand(message = {}) {
            // ... Reference For Building
            let command = {
                id:     message?.id || '',     // UUID of command for tracking
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
                        response = await setNdi(command, response);
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
                        response = await setNdi(command, response);
                    }
                    catch (error)
                    {
                        response.data.message = error;
                        response.success = false;
                    }
                    return response;
                    break;

                case 'set-overlay':
                    // const base64String = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...";
                    // // Remove the header (e.g., "data:image/png;base64,")
                    // const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
                    // const buffer = Buffer.from(base64Data, 'base64'); // Create buffer from base64

                    // fs.writeFile('output.png', buffer, (err) => {
                    // if (err) console.error(err);
                    // else console.log('Saved Base64 image!');
                    // });
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
                    response = await setNdi(command, response);
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
                    await focusChromium();
                    return response;
                    break;
                
                case 'focus-ndi':
                    await focusNdi();
                    return response;
                    break;
                
                // Device
                case 'shutdown-device':
                    try
                    {
                        const f = await fetch('http://localhost:3080/api/v1/__internal/shutdown', {
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
                
                case 'reboot-device':
                    try
                    {
                        const f = await fetch('http://localhost:3080/api/v1/__internal/reboot', {
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
                
                    // NOT Complete
                    // This case is complete, but needs implemented.
                case 'rename-device':
                    const commandData = command.data || null;
                    if (typeof commandData === 'string')
                    { 
                        fs.writeFileSync(path.join(process.env.DATA_NDPI_PATH, 'device_name'))
                    }
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

        /** GET LOCAL IP */
        async function getLocalIp(testForNetwork = false) {
            if (testForNetwork)
            {
                console.info('[ functions ] Waiting for network online...');
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

        /** SET NDI SOURCE */
        /**
         * Set the target NDI source. This will trigger the fsWatcher to launch the NDI Stream.
         * @param {object} command - Command contains the source information and UUID of the command.
         * @param {string} [command.id] - UUID of the Command/Request. Used for tracking.
         * @param {string} [command.data] - The name of the NDI source to connect to.
         * @param {object} res - This function will overwrite an existing response object for API. Optional.
         * 
         * @returns 
         */
        async function setNdi(command, res = {}) {
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

        /**
         * Fade the volume from it's current level.
         * @param {number} level - Level to fade the volume to. Starting from it's current setpoint. [Range: 0 - 255]
         * @param {string} source - Description of where the function was called. For debugging.
         * @returns
         */
        function fadeVolume(level, source = 'Default') {
            if (!level.toString()) return;

            const commandLine = `${path.join(__dirname, '..', 'sh', 'fade-volume')} ${level} "${source}"` ;
            exec(commandLine);
        }

        async function focusChromium() {
            return await new Promise((resolve) => {
                let focusSuccess = false;
                let focusError = '';

                exec(`xdotool search --class 'chromium'`, (error, stdout, stderr) => {
                    if (error)
                    { console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ][ ERROR ][ focusChromium() ]`, stderr); }
                    else
                    {
                        const output = stdoutToArray(stdout);
                        for (const line of output)
                        {
                            if (!focusSuccess)
                            {
                                exec(`xdotool windowactivate ${line}`, (error, stdout, stderr) => {
                                    if (error)
                                    { focusError = stderr.toString().trim(); }
                                    else
                                    { focusSuccess = true; }
                                });
                            }
                        }
                    }

                    if (!focusSuccess)
                    { console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ][ ERROR ][ focusChromium() ]`, focusError); }

                    resolve();
                });
                // exec(path.join(__dirname, '..', 'sh', 'focus-chromium')).once('exit', () => { resolve(); });

                // const proc = spawn(path.join(__dirname, '..', 'sh', 'focus-chromium'), {
                //     env: { ...process.env }
                // });

                // proc.stdout.on('data', (data) => {
                //     stdoutToArray(data.toString().trim()).forEach((line) => {
                //         console.info(`[ ${path.basename(__filename).split('.')[0]} ][ focusChromium() ]`, line);
                //     })
                // });

                // proc.stderr.on('data', (data) => {
                //     stdoutToArray(data.toString().trim()).forEach((line) => {
                //         console.info(`[ ${path.basename(__filename).split('.')[0]} ][ focusChromium() ]`, line);
                //     })
                // });
                
                // proc.on('exit', (code) => {
                //     if (code !== 0)
                //     { console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ][ focusChromium() ][ EXIT ] Code:`, code); }
                //     resolve();
                // });
            });
        }

        async function focusNdi() {
            await launchPicom();

            return await new Promise((resolve) => {
                let focusSuccess = false;
                let focusError = '';

                exec(`xdotool search --class 'gstreamer'`, (error, stdout, stderr) => {
                    if (error)
                    { console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ][ ERROR ][ focusNdi() ]`, stderr); }
                    else
                    {
                        const output = stdoutToArray(stdout);
                        for (const line of output)
                        {
                            if (!focusSuccess)
                            {
                                exec(`xdotool windowactivate ${line}`, (error, stdout, stderr) => {
                                    if (error)
                                    { focusError = stderr.toString().trim(); }
                                    else
                                    { focusSuccess = true; }
                                });
                            }
                        }
                    }

                    if (!focusSuccess)
                    { console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ][ ERROR ][ focusNdi() ]`, focusError); }

                    resolve();
                });

                // exec(path.join(__dirname, '..', 'sh', 'focus-ndi')).once('exit', () => { resolve(); });

                // const proc = spawn(path.join(__dirname, '..', 'sh', 'focus-ndi'), {
                //     env: { ...process.env }
                // });

                // proc.stdout.on('data', (data) => {
                //     stdoutToArray(data.toString().trim()).forEach((line) => {
                //         console.info(`[ ${path.basename(__filename).split('.')[0]} ][ focusNdi() ]`, line);
                //     })
                // });

                // proc.stderr.on('data', (data) => {
                //     stdoutToArray(data.toString().trim()).forEach((line) => {
                //         console.info(`[ ${path.basename(__filename).split('.')[0]} ][ focusNdi() ]`, line);
                //     })
                // });
                
                // proc.on('exit', (code) => {
                //     if (code !== 0)
                //     { console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ][ focusNdi() ][ EXIT ] Code:`, code); }
                //     resolve();
                // });
            });
        }

        async function launchPicom() {
            let picomNotRunning = false;
            await new Promise((resolve) => {
                exec('pgrep picom', (error, stdout, stderr) => {
                    if (error) { picomNotRunning = true; }
                    resolve();
                });
            });

            if (picomNotRunning)
            {
                console.log('launching PICOM');
                await new Promise((resolve) => {
                    exec(`picom -b --config "${process.env.HOME}/.config/picom/picom.conf"`, (error, stdout, stderr) => {
                        if (error)
                        { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ]`, '[ PICOM ERROR ]', stderr.toString()); }
                        resolve();
                    });
                });
            }
            return;
        }

        /** STDOUT TO ARRAY */
        function stdoutToArray(stdout) {
            let a = [];
            let stdin = stdout.trim() || '';
            stdin.split(/\r?\n/).forEach((line) => {
                a.push(line);
            });
            return a;
        }

        /** SET DISPLAY RESOLUTION */
        /**
         * This function set's the HDMI output resolution to the currently set values contained in 'output_display_port', 'output_display_resolution_preference', and 'output_display_framerate_preference'.
         */
        async function setDisplayResolution() {
            let config = {
                displayPort: 'HDMI-1',
                resolution: null,
                framerate: null,
            };
            try { config.displayPort = fs.readFileSync(path.join(process.env.DATA_NDPI_PATH, 'output_display_port'), 'utf8').trim() } catch {}
            try { config.resolution = fs.readFileSync(path.join(process.env.DATA_NDPI_PATH, 'output_display_resolution_preference'), 'utf8').trim() } catch {}
            try { config.framerate = fs.readFileSync(path.join(process.env.DATA_NDPI_PATH, 'output_display_framerate_preference'), 'utf8').trim() } catch {}

            await new Promise((resolve) => {
                exec(`xrandr \
                    --output ${config.displayPort} \
                    ${config.resolution ? `--mode ${config.resolution}` : '--auto'} \
                    ${config.framerate ? `--rate ${config.framerate}` : ''} \
                `, {
                    env: { ...process.env }
                }, (error, stderr) => {
                    if (error)
                    {
                        console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ][ setDisplayResolution() ][ ERROR ] Resolution Set:`, config, stderr);
                        resolve();
                    }
                    else
                    {
                        exec('openbox --restart', {
                            env: { ...process.env }
                        }, (error, stdout, stderr) => {
                            if (error)
                            { console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ][ setDisplayResolution() ][ ERROR ] Openbox Restart: ${stderr.toString()}`); }
                            resolve();
                        });
                    }
                });
            });
            return;
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


module.exports = {
    processCommand,
    stdoutToArray,
    setDisplayResolution,
    checkCecCompliance,
    waitForNetwork,
    focusChromium,
    focusNdi,
    setNdi,
    fadeVolume,
    launchPicom,
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


        /** FOCUS WINDOW */
        /**
         * Set focus to a window by class name.
         * @param {string} className - Window class name of the window to focus. Discover the class name using xprop.
         * @param {object} res - Response object. This function will use and update a response object from an API call. This is optional.
         * @param {object} options - Additional configuration.
         * @param {boolean} [options.onlyVisible] - Search for windows that are Visible. (excludes background processes from attempting to focus.)
         * @returns {object} - Response object
         */
        async function focusWindow(className, res = { data: {} }, options = { onlyVisible: true }) {
            let response = { ...res };
            await new Promise((resolve) => {
                exec(`xdotool search ${options.onlyVisible ? '--onlyvisible' : ''} --class "${className}" | head -n 1`, {
                    env: {
                        ...process.env,
                        DISPLAY: ':0',
                    }
                }, (error, stdout, stderr) => {
                    if (error)
                    {
                        // console.log('⚠️ [ functions ] Could NOT find window:', stderr.toString().trim());
                        response.data.message = `Could NOT find window: ${stderr.toString().trim()}`;
                        response.success = false;
                        resolve();
                        return;
                    }
                    else 
                    {
                        console.info(`[ ${path.basename(__filename).split('.')[0]} ] Focusing Window ID:`, stdout.toString().trim());
                        if (!stdout.toString().trim())
                        {
                            // console.log(`⚠️ [ functions ] ${className} NOT running.`);
                            response.data.message = `${className} is NOT running.`;
                            response.success = false;
                            resolve();
                            return;
                        }
                        const a = `xdotool windowminimize ${stdout.toString().trim()} && xdotool windowraise ${stdout.toString().trim()} && xdotool windowactivate ${stdout.toString().trim()}` ;
                        exec(a, {
                            env: { ...process.env }
                        }, (error, stdout, stderr) => {
                            if (error)
                            {
                                console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ] Could NOT activate window:`, stderr.toString().trim() || 'null');
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
