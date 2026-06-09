const { EventEmitter } = require('events');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { setInterval, clearInterval } = require('timers');
const func = require('./functions.js');
const { exec, spawn } = require('node:child_process');
const { setTimeout } = require('node:timers');

class FileSystemMonitor extends EventEmitter {
    #pgmVersion;
    #pgmVersionDate;
    #ipPoll;
    #updatePoll;
    #updatePollInterval;
    constructor(version = '1.0.0', versionDate = '1970-01-01') {
        super();

        this.watcherEnable = true;
        this.watcher = null;
        this.setMaxListeners(100)

        this.defaultDeviceName = 'NDPi Client';

        this.#ipPoll = null;
        this.ipPollInterval = 1000;
        this.ipPollEnable = true;

        this.#updatePoll = null;
        this.#updatePollInterval = (10 * 60) * 1000;
        this.updatePollEnable = true;

        this.dataDir = process.env.DATA_NDPI_PATH;
        this.fileMap = null;

        this.debounceMap = new Map();
        this.queue = [];

        this.#pgmVersion = version;
        this.#pgmVersionDate = new Date(versionDate).toISOString().split('T')[0];

        this.serverCommunicationWebSocket = null;

        this.drmMonitor = null;
        this.debounceTimerDrmEvents = null;

        this.lcdDisplayScriptPath = path.join(__dirname, '..', 'python', 'script');
        this.sendToLCD = [
            'device_name',
            'device_id',
            'device_ip',
            'ndpi_version',
            'ndpi_status_ndi',
            'ndpi_status_ndi_source_target',
        ];

        process.nextTick(() => { this.init(); });
    }

    async init() {
        console.info(`[ ${path.basename(__filename).split('.')[0]} ][  INITIATE ] NDPi Data Management Module - v${this.#pgmVersion} - ${this.#pgmVersionDate}`);

        // Create directory if it doesn't exist.
        if (!fs.existsSync(this.dataDir))
        { fs.mkdirSync(this.dataDir, { recursive: true }) }

        // Set the deviceId from either serial-number or machine-id
        let deviceId = '';

        const deviceIdPaths = [
            path.join('/sys','firmware','devicetree','base','serial-number'),
            path.join('/etc','machine-id'),
        ];

        if (fs.existsSync(deviceIdPaths[0]) || fs.existsSync(deviceIdPaths[1]))
        {
            try
            {
                deviceId = fs.readFileSync(deviceIdPaths[0], 'utf8').replace(/\0/g, '').trim().toUpperCase();
                console.info(`[ ${path.basename(__filename).split('.')[0]} ][ DEVICE ID ] ${deviceId}`);
            }
            catch 
            {
                deviceId = fs.readFileSync(deviceIdPaths[1], 'utf8').replace(/\0/g, '').trim().toUpperCase();
                console.info(`[ ${path.basename(__filename).split('.')[0]} ][ FALLBACK DEVICE ID ] ${deviceId}`);
            }
        }
        else // MacOS Compatability
        {
            await new Promise((resolve) => {
                exec(`ioreg -l | grep IOPlatformSerialNumber | awk '{print $4}' | tr -d '"'`, (error, stdout) => {
                    if (!error)
                    { deviceId = stdout.trim().toUpperCase(); }
                    resolve();
                });
            })
        }

        // Map file names and values with to standard defaults.
        this.fileMap = new Map();
        const files = [
            { 
                key: "device_name",
                value: `${this.defaultDeviceName}`,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "device_type",
                value: `NDPi Monitor Client`,
                group: ``,
                allowEditInternal: false,
                allowEditExternal: false,
            },
            {
                key: "device_id",
                value: `${deviceId}`,
                group: ``,
                allowEditInternal: false,
                allowEditExternal: false,
            },
            {
                key: "device_ip",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "local_port_number_api",
                value: `${process.env.PORT_API || 3080}`,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "local_port_number_bonjour",
                value: `${process.env.PORT_MDNS || 3053}`,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "ndpi_version_update_available",
                value: `false`,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "ndpi_version_update_version",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "ndpi_version",
                value: this.#pgmVersion,
                group: ``,
                allowEditInternal: false,
                allowEditExternal: false,
            },
            {
                key: "ndpi_version_date",
                value: this.#pgmVersionDate,
                group: ``,
                allowEditInternal: false,
                allowEditExternal: false,
            },
            {
                key: "ndpi_command_server_host",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "ndpi_command_server_port",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "ndpi_command_log",
                value: `System Initial Run: v${this.#pgmVersion} ${this.#pgmVersionDate}`,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "ndpi_status_ndi", 
                value: `idle`,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "ndpi_status_ndi_source_target",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "ndpi_status_ndi_source_active",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "ndpi_status_ndi_source_resolution",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "ndpi_status_ndi_source_framerate",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "ndpi_status_ndi_source_connected_time", 
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "ndpi_status_no_source_display_mode",
                value: `overlay`,
                group: ``,
                options: [
                    ['Overlay Image', 'overlay'],
                    ['Blank Screen',  'blank'  ],
                ],
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "ndi_source_discovery_exec",
                value: `ndi_discover_v2`,
                group: ``,
                allowEditInternal: false,
                allowEditExternal: false,
            },
            {
                key: "ndi_receiver_exec",
                value: `ndi_receiver_v4`,
                group: ``,
                allowEditInternal: false,
                allowEditExternal: false,
            },
            {
                key: "ndi_receiver_bandwidth",
                value: `0`,
                options: [
                    ['Metadata Only', '-10'       ],
                    ['Audio Only',    '10'        ],
                    ['Lowest',        '0'         ],
                    ['Highest',       '100'       ],
                    ['Max',           '0x7fffffff'],
                ],
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "ndi_receiver_color_format",
                value: `100`,
                options: [
                    ['BGRx_BGRa', '0'         ],
                    ['UYVY_BGRa', '1'         ],
                    ['RGBx_RGBa', '2'         ],
                    ['UYVY_RGBa', '3'         ],
                    ['Fastest',   '100'       ],
                    ['Best',      '101'       ],
                    // ['Max',       '0x7fffffff'],
                ],
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "output_display_resolution_preference",
                value: `1920x1080`,
                group: ``,
                options: [],
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "output_display_framerate_preference",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "output_display_resolution_current",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "output_display_framerate_current",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "output_display_resolution_preferred",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "output_display_framerate_preferred",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "output_display_port",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "output_display_manufacturer",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "output_display_model",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "output_display_cec_enabled",
                value: `false`,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "output_display_cec_status_power",
                value: `unknown`,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "output_display_cec_this_source_active",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "output_display_cec_version",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "output_display_cec_address",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "media_overlay_image",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
        ];
        // Files that will NOT initialize with the previously stored value.
        const retainDefaultValue = [
            'ndpi_version',
            'ndpi_version_date',
            'ndpi_version_update_available',
            'ndpi_version_update_version',
            'device_id',
            'device_type',
            'device_ip',
            'exec_ndi_source_discovery',
            'ndi_receiver_exec',
            'local_port_number_bonjour',
            'local_port_number_api',
            'ndpi_status_ndi',
            'ndpi_status_ndi_source_active',
            'ndpi_status_ndi_source_connected_time',
            'ndpi_status_ndi_source_resolution',
            'ndpi_status_ndi_source_framerate',
            'output_display_cec_enabled',
            'output_display_cec_status_power',
            'output_display_cec_this_source_active',
            'output_display_cec_version',
            'output_display_cec_address',
        ];

        for (const file of files)
        {
            let setting = file;
            let getValueFromFile = true;

            const filePath = path.join(this.dataDir, setting.key);

            if (retainDefaultValue.includes(setting.key))
            { getValueFromFile = false }

            try
            {
                if (fs.existsSync(filePath) && getValueFromFile)
                {
                    const currentValue = fs.readFileSync(filePath, 'utf8').replace(/\0/g, '').trim();
                    setting.value = currentValue;
                    this.fileMap.set(setting.key, setting);
                }
                else
                {
                    fs.writeFileSync(filePath, setting.value, 'utf8');
                    this.fileMap.set(setting.key, setting);
                }
            }
            catch (err)
            { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] Saving File: Name:${setting.key}, Value: ${setting.value}`, err) }
            
            if (this.sendToLCD.includes(setting.key))
            { fs.writeFileSync(path.join(__dirname, '..', 'python', 'script', setting.key), setting.value, 'utf8'); }
        };

        this.start();
    }

    async start() {
        this.startWatcher();
        this.startDrmMonitor();
        this.pollUpdate();
        this.emit('ready');
        await func.waitForNetwork();
        this.pollIp();
    }

    startWatcher() {
        this.watcher = fs.watch(this.dataDir);

        this.watcher.on('change', (eventType, filename) => {
            if (this.fileMap.has(filename))
            { this._fsEvent(filename); }
        });
        
        this.watcher.on('error', (error) => {
            console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ]`, error);
        });

        this.watcher.on('close', () => {
            if (this.watcherEnable)
            { setTimeout(() => { this.startWatcher(); }, 1000); }
        });
    }
    
    _fsEvent(name, debounceMs = 800) {
        const last = this.debounceMap.get(name) || 0;
        const now = Date.now();

        if (now - last < debounceMs)
        { return; }

        this.debounceMap.set(name, now);
        this.queue.push({ name });

        setTimeout(() => { this.__flushQueue(); }, debounceMs);
    }

    async __flushQueue() {
        let updated = false;

        while (this.queue.length > 0)
        {
            const { name } = this.queue.shift();

            let currentValue = this.fileMap.get(name);
            const fsValue = fs.readFileSync(path.join(this.dataDir, name), 'utf8').replace(/\0/g, '').trim();
            
            if (currentValue.value !== fsValue)
            {
                currentValue.value = fsValue;
                this.fileMap.set(name, currentValue);

                if (name === 'media_overlay_image')
                { console.info(`[ ${path.basename(__filename).split('.')[0]} ][ UPDATE ] '${name}'`); }
                else
                { console.info(`[ ${path.basename(__filename).split('.')[0]} ][ UPDATE ] '${name}' ==> '${fsValue}'`); }

                if (this.sendToLCD.includes(name))
                { fs.writeFileSync(path.join(this.lcdDisplayScriptPath, name), fsValue, 'utf8'); }

                this.emit(name, fsValue);
                updated = true;
            }
        }

        if (updated)
        { this.emit('update', JSON.stringify(Array.from(this.fileMap))); }

        return;
    }

    get(fileName) {
        if (!fileName || !this.fileMap.has(fileName))
        { return null; }
        return this.fileMap.get(fileName).value;
    }

    put(fileName, data = '') {
        if (!fileName || !this.fileMap.has(fileName))
        { return; }
        try { fs.writeFileSync(path.join(this.dataDir, fileName), data.trim(), 'utf8') }
        catch (error) { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] Saving to FileSystem`); }
    }

    startDrmMonitor() {
        try
        { exec('killall udevadm'); }
        catch {}
        finally
        { this.drmMonitor = null;}

        console.info(`[ ${path.basename(__filename).split('.')[0]} ] Starting DRM Event Monitor`);

        this.drmMonitor = spawn('udevadm', ['monitor', '--subsystem-match=drm', '--kernel']);

        this.drmMonitor.stdout.on('data', (data) => {
            console.info(`[ ${path.basename(__filename).split('.')[0]} ] DRM Update`);
            this.debounceDrm();
        });

        this.drmMonitor.on('error', (error) => {
            console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ] 'udevadm' DRM monitor disabled`, error.toString());
            this.drmMonitor = null;
        });

        this.drmMonitor.on('close', () => {
            console.info(`[ CLOSED ][ ${path.basename(__filename).split('.')[0]} ] DRM Monitor`)
            try { clearTimeout(this.debounceTimerDrmEvents) } catch {}
        });
    }

    debounceDrm(debounceMs = 1000) {
        if (this.debounceTimerDrmEvents)
        {
            clearTimeout(this.debounceTimerDrmEvents);
            this.debounceTimerDrmEvents = null;
        }

        this.debounceTimerDrmEvents = setTimeout(() => {
            this.updateOutputDisplayFiles();
            this.debounceTimerDrmEvents = null;
        }, debounceMs);
    }

    async close() {
        this.watcherEnable = false;
        this.ipPollEnable = false;
        this.updatePollEnable = false;

        console.info( `[ CLOSING ][ ${path.basename(__filename).split('.')[0]} ]`);

        try { clearTimeout(this.#ipPoll); } catch {}
        finally { this.#ipPoll = null; }

        try { clearTimeout(this.#updatePoll); } catch {}
        finally { this.#updatePoll = null; }

        if (this.watcher)
        {

            await new Promise((resolve) => {
                this.watcher.once('close', async () => {
                    await this.__flushQueue();
                    resolve();
                });

                this.watcher.close();
            });
        }

        if (this.debounceTimerDrmEvents)
        {
            clearTimeout(this.debounceTimerDrmEvents);
            this.debounceTimerDrmEvents = null;
        }

        return new Promise((resolve) => {
            if (this.drmMonitor)
            {
                this.drmMonitor.once('exit', () => {
                    this.drmMonitor = null;
                    console.info( `[  CLOSED ][ ${path.basename(__filename).split('.')[0]} ]`);
                    resolve();
                });
                this.drmMonitor.kill('SIGINT');
            }
            else
            {
                console.info( `[  CLOSED ][ ${path.basename(__filename).split('.')[0]} ]`);
                resolve();
            }
        });
    }



    async pollIp() {
        try { await this.updateLocalIp(); }
        catch {}
        finally
        {
            if (this.ipPollEnable)
            {
                this.#ipPoll = null;
                this.#updatePoll = setTimeout(() => {
                    this.pollIp();
                }, this.ipPollInterval);
            }
        }
    }

    async pollUpdate() {
        try { await func.checkForUpdate(); }
        catch {}
        finally
        {
            if (this.updatePollEnable)
            {
                this.#updatePoll = null;
                this.#updatePoll = setTimeout(() => {
                    this.pollUpdate();
                }, this.#updatePollInterval);
            }
        }
    }

    /**
     *  Helper Functions
     */

    async updateLocalIp() {
        let fileName = 'device_ip';
        let valueUpdate = null;

        await new Promise((resolve) => {
            exec('ip -j address', (error, stdout, stderr) => {
                if (error)
                {
                    console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ] Error Reading IP Address.`, stderr.toString());
                    resolve();
                }
                else
                {
                    try
                    {
                        let output = JSON.parse(String(stdout));
                        if (Array.isArray(output))
                        {
                            output = output
                                .filter(link => link.link_type == 'ether')
                                .filter(link => link.operstate == 'UP');

                            if (output.length >= 1)
                            {
                                const output_obj = output[0];
                                if (Array.isArray(output_obj.addr_info))
                                {
                                    let output_addr_info = output_obj.addr_info.filter(addr => addr.family == 'inet');
                                    if (output_addr_info.length === 1)
                                    { valueUpdate = output_addr_info[0].local; }
                                }
                            }
                        }
                    }
                    catch (error)
                    { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ] Error Reading IP Address.`, error); }
                    finally
                    { resolve(); }
                }
            });
        });

        if (valueUpdate)
        {
            const storedValue = this.fileMap.get(fileName).value;
            if (valueUpdate !== storedValue)
            {
                this.put(fileName, valueUpdate);
                this.ipPollInterval = 10000;
            }
        }
        else
        {
            this.put(fileName, '');
            this.ipPollInterval = 1000;
        }
        return;
    }

    async updateOutputDisplayFiles() {
        let HDMI_1;
        let HDMI_2;

        await new Promise((resolve) => {
            exec('cat /sys/class/drm/card*HDMI*/status', (error, stdout, stderr) => {
                if (error)
                { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ updateOutputDisplayFiles() ][ ERROR ]`, stderr.toString().trim()); }
                else
                {
                    const output = func.stdoutToArray(stdout);
                    HDMI_1 = output[0] || 'disconnected';
                    HDMI_2 = output[1] || 'disconnected';
                    resolve();
                }
            });
        });

        if (HDMI_1 === 'disconnected' && HDMI_2 === 'disconnected')
        {
            this.put('output_display_port', '');
            this.put('output_display_resolution_preferred', '');
            this.put('output_display_framerate_preferred', '');
            this.put('output_display_manufacturer', '');
            this.put('output_display_model', '');
            this.put('output_display_cec_enabled', 'false');
            this.put('output_display_cec_status_power', 'unknown');
            this.put('output_display_cec_this_source_active', 'false');
            this.put('output_display_cec_version', '');
            this.put('output_display_cec_address', '');
            this.emit('drm');
        }
        else
        {
            const commandPath = path.join(__dirname, '..', 'sh', 'current-resolution');
            exec(commandPath, (error, stdout, stderr) => {
                if (error)
                { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ updateOutputDisplayFiles() ][ ERROR ] ${stderr.toString().trim()}`); }
                else
                {
                    let resolutionOptions = [];
                    func.stdoutToArray(stdout).forEach((line) => {
                        const output        = line.toString().trim();
                        const lineSplit_1   = output.split(' : ');
                        const splitKey      = String(lineSplit_1[0] || '').trim();
                        const splitValue    = String(lineSplit_1[1] || '').trim();
                        
                        let lineSplit_2 = null;
                        let splitOptKey = null;
                        let splitOptValue = null;

                        if (splitValue.includes(' :: '))
                        {
                            lineSplit_2   = splitValue.split(' :: ');
                            splitOptKey   = String(lineSplit_2[0] || '').trim();
                            splitOptValue = String(lineSplit_2[1] || '').trim();
                        }

                        switch(splitKey)
                        {
                            case 'current_output':
                                this.put('output_display_port', splitValue);
                                return;
                                break;
                            case 'current_resolution':
                                this.put('output_display_resolution_current', splitValue);
                                return;
                                break;
                            case 'current_framerate':
                                this.put('output_display_framerate_current', splitValue);
                                return;
                                break;
                            case 'preferred_resolution':
                                this.put('output_display_resolution_preferred', splitValue);
                                return;
                                break;
                            case 'preferred_framerate':
                                this.put('output_display_framerate_preferred', splitValue);
                                return;
                                break;
                            case 'manufacturer':
                                this.put('output_display_manufacturer', splitValue);
                                return;
                                break;
                            case 'model':
                                this.put('output_display_model', splitValue);
                                return;
                                break;
                            case 'list_resolutions':
                                if (splitOptKey && splitOptValue)
                                { resolutionOptions.push([splitOptKey, splitOptValue]); }
                                return;
                                break;
                        }
                    });
                    const fileMapCurrRes = this.fileMap.get('output_display_resolution_preference');
                    fileMapCurrRes.options = resolutionOptions;
                    this.fileMap.set('output_display_resolution_preference', fileMapCurrRes);
                    this.emit('drm');
                }
            });
        }
        return;
    }
}

module.exports = FileSystemMonitor;