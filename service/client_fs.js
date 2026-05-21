const { EventEmitter } = require('events');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { setInterval, clearInterval } = require('timers');
const { getLocalIp } = require('./functions.js');
const { exec } = require('node:child_process');
const { setTimeout } = require('node:timers');

class FileSystemMonitor extends EventEmitter {
    #pgmVersion;
    #pgmVersionDate;
    #fileMap;
    #fsPoll;
    constructor(version = '1.0.0', versionDate = '1970-01-01') {
        super();
        this.setMaxListeners(100)

        this.defaultDeviceName = 'NDPi Client';

        // Data Poll Timer
        this.#fsPoll = null;

        this.dataDir = process.env.DATA_NDPI_PATH;
        this.#fileMap = null;

        this.debounceMap = new Map();
        this.queue = [];

        this.#pgmVersion = version;
        this.#pgmVersionDate = new Date(versionDate).toISOString().split('T')[0];

        this.serverCommunicationWebSocket = null;
        this.drmMonitor = null;

        // First run is used as a flag for getLocalIp();
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
        this.#fileMap = new Map();
        const files = [
            { 
                key: "device_name",
                value: `${this.defaultDeviceName}`
            }, {
                key: "device_type",
                value: `NDPi Monitor Client`
            }, {
                key: "device_id",
                value: deviceId.toUpperCase()
            }, {
                key: "device_ip",
                value: ``
            }, {
                key: "local_port_number_api",
                value: `${process.env.PORT_API || 3080}`
            }, {
                key: "local_port_number_bonjour",
                value: `${process.env.PORT_MDNS || 3053}`
            }, {
                key: "ndpi_version",
                value: this.#pgmVersion
            }, {
                key: "ndpi_version_date",
                value: this.#pgmVersionDate
            }, {
                key: "ndpi_command_server_host",
                value: `` 
            }, {
                key: "ndpi_command_server_port",
                value: ``
            }, {
                key: "ndpi_command_log",
                value: `System Initial Run: v${this.#pgmVersion} ${this.#pgmVersionDate}`
            }, {
                key: "ndpi_status_ndi", 
                value: `idle`
            }, {
                key: "ndpi_status_ndi_source_target",
                value: ``
            }, {
                key: "ndpi_status_ndi_source_active",
                value: ``
            }, {
                key: "ndpi_status_ndi_source_resolution",
                value: ``
            }, {
                key: "ndpi_status_ndi_source_framerate",
                value: ``
            }, {
                key: "ndpi_status_ndi_source_connected_time", 
                value: ``
            }, {
                key: "ndpi_status_no_source_display_mode",
                value: `overlay`
            }, {
                key: "ndi_receiver_bandwidth",
                value: `0` // MAX: 0x7fffffff
            }, {
                key: "ndi_receiver_color_format",
                value: `100`
            }, {
                key: "output_resolution_current",
                value: ``
            }, {
                key: "output_framerate_current",
                value: ``
            }, {
                key: "output_device_resolution_preferred",
                value: ``
            }, {
                key: "output_device_framerate_preferred",
                value: ``
            }, {
                key: "output_device_port",
                value: ``
            }, {
                key: "output_device_manufacturer",
                value: ``
            }, {
                key: "output_device_model",
                value: ``
            }, {
                key: "output_device_cec_enabled",
                value: `false`
            }, {
                key: "output_device_cec_status_power",
                value: `unknown`
            }, {
                key: "output_device_cec_active_source",
                value: ``
            }, {
                key: "media_overlay_image",
                value: ``
            },
        ];
        // Files that will NOT initialize with their previously stored values.
        const retainDefaultValue = [
            'ndpi_version',
            'ndpi_version_date',
            'device_id',
            'device_type',
            'device_ip',
            'local_port_number_bonjour',
            'local_port_number_api',
            'ndpi_status_ndi',
            'ndpi_status_ndi_source_active',
            'ndpi_status_ndi_source_connected_time',
            'ndpi_status_ndi_source_resolution',
            'ndpi_status_ndi_source_framerate',
            'output_device_cec_enabled',
            'output_device_cec_status_power',
            'output_device_cec_active_source',
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
        for (const { key, value } of files)
        {
            const filePath = path.join(this.dataDir, key);
            let getValueFromFile = true;
            if (retainDefaultValue.includes(key))
            { getValueFromFile = false }
            try
            {
                if (fs.existsSync(filePath) && getValueFromFile)
                {
                    const currentValue = fs.readFileSync(filePath, 'utf8').replace(/\0/g, '').trimEnd();
                    this.#fileMap.set(key, currentValue);
                }
                else
                {
                    fs.writeFileSync(filePath, value, 'utf8');
                    this.#fileMap.set(key, value);
                }
            }
            catch (err)
            { console.log(`🔴 [ client_fs ][ ERROR ] Saving File: Name:${key}, Value: ${value}`, err) }
        };

        // Call updateLocalIp() right away. It will call poll() after.
        setTimeout(() => { this.updateLocalIp() }, 500);
    }

    start() {
        fs.watch(this.dataDir, async (event, filename) => {
            if (!this.#fileMap.has(filename))
            { return }

            if (event === 'change')
            {
                const currentValue = this.#fileMap.get(filename);
                const fsValue = fs.readFileSync(path.join(this.dataDir, filename), 'utf8').replace(/\0/g, '').trimEnd();
                if (currentValue !== fsValue)
                {
                    this.#fileMap.set(filename, fsValue);
                    this.fsEvent(filename, fsValue);
                }
            }
        });
        this.startDrmMonitor();
    }

    close() {
        clearInterval(this.#fsPoll);
        this.#fsPoll = null;
        this.drmMonitor.kill();
        this.drmMonitor = null;
    }

    poll(interval = 10000) {
        this.#fsPoll = setInterval(() => {
            this.updateLocalIp();
            // Add other functions to poll
        }, interval);
    }

    get(fileName) {
        if (!fileName || !this.#fileMap.has(fileName))
        { return null; }

        return this.#fileMap.get(fileName);
    }

    put(fileName, data = '') {
        if (!fileName || !this.#fileMap.has(fileName))
        { return }
        try
        { fs.writeFileSync(path.join(this.dataDir, fileName), data.trimEnd(), 'utf8') }
        catch (error)
        { console.error('🔴 [ client_fs ][ ERROR ] Saving to FileSystem') }
    }
    
    fsEvent(name, value, debounceMs = 500) {
        const last = this.debounceMap.get(name) || 0;
        const now = Date.now();
        if (now - last < debounceMs)
        { return }

        this.debounceMap.set(name, now);
        this.queue.push({ name, value });
        this._flushQueue();
    }

    _flushQueue() {
        while (this.queue.length > 0)
        {
            const { name, value } = this.queue.shift();
            console.log(`[ client_fs ][ UPDATE ] '${name}' ==> '${value}'`);
            this.emit(name, value);
        }
    }

    async updateLocalIp() {
        const fileName = 'device_ip';
        const updateValue = await getLocalIp(this.firstRun);
        if (updateValue)
        {
            const storedValue = this.#fileMap.get(fileName);
            if (updateValue !== storedValue)
            { this.put(fileName, updateValue) }
            
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

        this.drmMonitor = require('node:child_process').spawn('udevadm', ['monitor', '--subsystem-match=drm', '--kernel']);

        this.drmMonitor.stdout.on('data', (data) => {
            const HDMI_1 = fs.readFileSync(path.join('/sys', 'class', 'drm', 'card1-HDMI-A-1', 'status'), 'utf8').trimEnd();
            const HDMI_2 = fs.readFileSync(path.join('/sys', 'class', 'drm', 'card1-HDMI-A-2', 'status'), 'utf8').trimEnd();
            if (HDMI_1.startsWith('connected'))
                { this.put('output_device_port', 'HDMI-1') }
            else if (HDMI_2.startsWith('connected'))
                { this.put('output_device_port', 'HDMI-2') }
        });

        this.drmMonitor.on('error', () => {
            console.log("🔴 [ client_fs ][ ERROR ] 'udevadm' not available, DRM monitor disabled");
            this.drmMonitor = null;
        });
    }
}

module.exports = FileSystemMonitor;