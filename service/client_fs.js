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
    #fsPoll;
    constructor(version = '1.0.0', versionDate = '1970-01-01') {
        super();
        this.setMaxListeners(100)

        this.defaultDeviceName = 'NDPi Client';

        // Data Poll Timer
        this.#fsPoll = null;

        this.dataDir = process.env.DATA_NDPI_PATH;
        this.fileMap = null;

        this.debounceMap = new Map();
        this.queue = [];

        this.#pgmVersion = version;
        this.#pgmVersionDate = new Date(versionDate).toISOString().split('T')[0];

        this.serverCommunicationWebSocket = null;
        this.drmMonitor = null;

        this.lcdDisplayScriptPath = path.join(__dirname, '..', 'python', 'script');
        this.sendToLCD = [
            'device_name',
            'device_id',
            'device_ip',
            'ndpi_version',
            'ndpi_status_ndi',
            'ndpi_status_ndi_source_target',
        ];

        // First run is used as a flag for func.getLocalIp();
        this.firstRun = true;

        this.init();
    }

    async init() {
        console.log(`[ client_fs ] NDPi Data Management Module - v${this.#pgmVersion} - ${this.#pgmVersionDate}`);

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
                deviceId = fs.readFileSync(deviceIdPaths[0], 'utf8').replace(/\0/g, '').trim();
                console.log('[ client_fs ][ DEVICE ID ]',  deviceId);
            }
            catch 
            {
                deviceId = fs.readFileSync(deviceIdPaths[1], 'utf8').replace(/\0/g, '').trim();
                console.log('[ client_fs ][ FALLBACK DEVICE ID ] ', deviceId);
            }
        }
        else // MacOS Compatability
        {
            await new Promise((resolve) => {
                exec(`ioreg -l | grep IOPlatformSerialNumber | awk '{print $4}' | tr -d '"'`, (error, stdout) => {
                    if (!error)
                    { deviceId = stdout.trim(); }
                    resolve();
                });
            })
        }

        // Map file names and values with to standard defaults.
        this.fileMap = new Map();
        const files = [
            { 
                key: "device_name",                             // Custom device name
                value: `${this.defaultDeviceName}`,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "device_type",                             // Device type for broadcast over Bonjour
                value: `NDPi Monitor Client`,
                group: ``,
                allowEditInternal: false,
                allowEditExternal: false,
            },
            {
                key: "device_id",                               // Device ID
                value: deviceId.toUpperCase(),
                group: ``,
                allowEditInternal: false,
                allowEditExternal: false,
            },
            {
                key: "device_ip",                               // Local IP for device
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: false,
            },
            {
                key: "local_port_number_api",                   // Port number for device API
                value: `${process.env.PORT_API || 3080}`,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "local_port_number_bonjour",               // Port number for device Bonjour
                value: `${process.env.PORT_MDNS || 3053}`,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "ndpi_version",                            // Version of NDPi 
                value: this.#pgmVersion,
                group: ``,
                allowEditInternal: false,
                allowEditExternal: false,
            },
            {
                key: "ndpi_version_date",                       // NDPi Version release date.
                value: this.#pgmVersionDate,
                group: ``,
                allowEditInternal: false,
                allowEditExternal: false,
            },
            {
                key: "ndpi_command_server_host",                // 
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
                value: `ndi_receiver_v3`,
                group: ``,
                allowEditInternal: false,
                allowEditExternal: false,
            },
            {
                key: "ndi_receiver_bandwidth",
                value: `0`,
                options: [
                    ['Metadata Only', '-10'],
                    ['Audio Only',    '10'],
                    ['Lowest',        '0'],
                    ['Highest',       '100'],
                    ['Max',           '0x7fffffff']
                ],
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "ndi_receiver_color_format",
                value: `100`,
                options: [
                    ['BGRx_BGRa', '0'],
                    ['UYVY_BGRa', '1'],
                    ['RGBx_RGBa', '2'],
                    ['UYVY_RGBa', '3'],
                    ['Fastest',   '100'],
                    ['Best',      '101'],
                    ['Max',       '0x7fffffff']
                ],
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "output_display_resolution_current",
                value: ``,
                group: ``,
                options: [],
                allowEditInternal: true,
                allowEditExternal: true,
            },
            {
                key: "output_display_framerate_current",
                value: ``,
                group: ``,
                allowEditInternal: true,
                allowEditExternal: true,
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
                key: "output_display_cec_active_source",
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
            // {
            //     key: "",
            //     value: ``,
            //     group: ``,
            //     allowEditInternal: true,
            //     allowEditExternal: true,
            // },
        ];
        // Files that will NOT initialize with the previously stored value.
        const retainDefaultValue = [
            'ndpi_version',
            'ndpi_version_date',
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
            'output_display_cec_active_source',
        ];

        /**
         * 
         *  If the @key is within the retainDefaultValue Array,
         *      then change the @getValueFromFile flag to false.
         *      then overwrite the stored value with the default value.
         * 
         *  This is used to prevent reading value from file.
         * 
         */

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
            { console.log(`🔴 [ client_fs ][ ERROR ] Saving File: Name:${setting.key}, Value: ${setting.value}`, err) }
            
            if (this.sendToLCD.includes(setting.key))
            { fs.writeFileSync(path.join(__dirname, '..', 'python', 'script', setting.key), setting.value, 'utf8'); }
        };

        // Call updateLocalIp() right away. It will call poll() after.
        setTimeout(() => {
            this.updateLocalIp();
        }, 100);
    }

    start() {
        fs.watch(this.dataDir, async (event, filename) => {
            if (this.fileMap.has(filename) && event === 'change')
            { this._fsEvent(filename); }
        });
        this.startDrmMonitor();
    }
    
    _fsEvent(name, debounceMs = 800) {
        const last = this.debounceMap.get(name) || 0;
        const now = Date.now();

        if (now - last < debounceMs)
        { return; }

        this.debounceMap.set(name, now);
        this.queue.push({ name });

        setTimeout(() => {
            this.__flushQueue();
        }, 500);
    }

    __flushQueue() {
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
                { console.log(`[ client_fs ][ UPDATE ] '${name}'`); }
                else
                { console.log(`[ client_fs ][ UPDATE ] '${name}' ==> '${fsValue}'`); }

                if (this.sendToLCD.includes(name))
                { fs.writeFileSync(path.join(this.lcdDisplayScriptPath, name), fsValue, 'utf8'); }

                this.emit(name, fsValue);
                this.emit('update', JSON.stringify(Array.from(this.fileMap)));
            }
        }
    }

    poll(interval = 10000) {
        this.#fsPoll = setInterval(() => {
            this.updateLocalIp();
            // Add other functions to poll
        }, interval);
    }

    get(fileName) {
        if (!fileName || !this.fileMap.has(fileName))
        { return null; }

        return this.fileMap.get(fileName).value;
    }

    put(fileName, data = '') {
        if (!fileName || !this.fileMap.has(fileName))
        { return }
        try
        { fs.writeFileSync(path.join(this.dataDir, fileName), data.trim(), 'utf8') }
        catch (error)
        { console.error('🔴 [ client_fs ][ ERROR ] Saving to FileSystem') }
    }

    close() {
        clearInterval(this.#fsPoll);
        this.#fsPoll = null;
        this.drmMonitor.kill();
        this.drmMonitor = null;
    }

    /**
     *  Helper Functions
     */

    async updateLocalIp() {
        console.log('**** Getting IP');
        let fileName = 'device_ip';
        let deviceIP = null;

        await new Promise((resolve) => {
            exec("hostname -I | awk '{print $1}'", (error, stdout, stderr) => {
                if (error)
                {
                    resolve();
                    return;
                }
                else
                {
                    deviceIP = stdout.toString().trim() || null;
                    console.log('new source IP', deviceIP);
                    resolve();
                    return;
                }
            });
        });


        // deviceIP = await func.getLocalIp(this.firstRun);
        console.log('**** IP Set')
        if (deviceIP)
        {
            const storedValue = this.fileMap.get(fileName).value;
            if (deviceIP !== storedValue)
            { this.put(fileName, deviceIP); }
            
            if (this.firstRun)
            {
                this.poll();
                this.emit('ready');
                this.firstRun = false;
                this.start();
            }
        }
    }

    startDrmMonitor() {
        console.log('[ client_fs ] STARTING DRM MONITOR');

        // const pth_thermal_fanSpeed = path.join('/sys','class','thermal','cooling_device0','cur_state');
        // const pth_thermal_cpuTemperature = path.join('/sys','class','thermal','thermal_zone0','temp');

        this.drmMonitor = spawn('udevadm', ['monitor', '--subsystem-match=drm', '--kernel']);

        this.drmMonitor.stdout.on('data', (data) => {
            console.log('[ client_fs ] DRM Update');
            this.updateOutputDisplay();
        });

        this.drmMonitor.on('error', (error) => {
            console.log("🔴 [ client_fs ][ ERROR ] 'udevadm' DRM monitor disabled", error.toString());
            this.drmMonitor = null;
        });
    }

    async updateOutputDisplay() {
        let HDMI_1;
        let HDMI_2;

        await new Promise((resolve) => {
            exec('cat /sys/class/drm/card*HDMI*/status', (error, stdout, stderr) => {
                if (error)
                {
                    console.error(`🔴 [ functions ][ updateOutputDisplay() ][ ERROR ]`, stderr.toString().trim());
                }
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
            this.put('output_display_cec_active_source', '');
        }
        else
        {
            const commandPath = path.join(__dirname, '..', 'sh', 'current-resolution');
            exec(commandPath, (error, stdout, stderr) => {
                if (error)
                { console.error(`🔴 [ functions ][ updateOutputDisplay() ][ ERROR ] ${stderr.toString().trim()}`); }
                else
                {
                    let resolutionOptions = [];
                    func.stdoutToArray(stdout).forEach((line) => {
                        const output        = line.toString().trim();
                        const lineSplit_1   = output.split(' : ');
                        const splitKey      = lineSplit_1[0].trim();
                        const splitValue    = lineSplit_1[1].trim();
                        
                        let lineSplit_2 = null;
                        let splitOptKey = null;
                        let splitOptValue = null;

                        if (splitValue.includes(' :: '))
                        {
                            lineSplit_2   = splitValue.split(' :: ');
                            splitOptKey   = lineSplit_2[0].trim();
                            splitOptValue = lineSplit_2[1].trim();
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
                    const fileMapCurrRes = this.fileMap.get('output_display_resolution_current');
                    fileMapCurrRes.options = resolutionOptions;
                    this.fileMap.set('output_display_resolution_current', fileMapCurrRes);
                }
            });
        }
    }
}

module.exports = FileSystemMonitor;