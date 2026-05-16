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

        // Data Poll Timers
        this.#fsPoll = null;

        this.dataDir = path.join(__dirname, '..', '..', 'DATA_ndpi');
        this.#fileMap = null;

        this.#pgmVersion = version;
        this.#pgmVersionDate = new Date(versionDate).toISOString().split('T')[0];

        this.serverCommunicationWebSocket = null;

        // First run is used as a flag for getLocalIp();
        this.firstRun = true;

        this.init();
    }

    async init() {

        console.log(`[ client_fs ] NDPi Data Management Module - ${this.#pgmVersion} - ${this.#pgmVersionDate}`);

        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        let deviceId = '';
        const deviceIdPaths = [
            path.join('/sys','firmware','devicetree','base','serial-number'),
            path.join('/etc','machine-id'),
        ]; 
        
        if (fs.existsSync(deviceIdPaths[0]) || fs.existsSync(deviceIdPaths[1])) {
            try {
                deviceId = fs.readFileSync(deviceIdPaths[0], 'utf8');
                console.log('DEVICE ID:', deviceId);
            } catch {
                deviceId = fs.readFileSync(deviceIdPaths[1], 'utf8');
                console.log('FALLBACK DEVICE ID:', deviceId);
            }
        } else {
            // MacOS Compatability
            await new Promise((resolve) => {
                exec(`ioreg -l | grep IOPlatformSerialNumber | awk '{print $4}' | tr -d '"'`, (error, stdout) => {
                    if (!error) deviceId = stdout.trim();
                    resolve();
                });
            });
        }

        this.#fileMap = new Map();

        const files = [
            { 
                key: "device_name",
                value: `NDPi Client`
            }, {
                key: "device_type",
                value: `NDPi Monitor Client`
            }, {
                key: "device_id",
                value: deviceId.toUpperCase()
            }, {
                key: "local_ip",
                value: ``
            }, { 
                key: "local_port_number_display",
                value: `${8080}`
            }, { 
                key: "local_port_number_api",
                value: `${process.env.PORT || 3001}`
            }, { 
                key: "local_port_number_bonjour",
                value: `${3002}`
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

        const retainDefaultValue = [
            'ndpi_status_ndi',
            'ndpi_version_date',
            'ndpi_version',
            'local_port_number_bonjour',
            'device_id',
            'device_type',
            'output_device_cec_enabled',
            'output_device_cec_status_power',
            'output_device_cec_active_source',
        ];

        for (const { key, value } of files) {
            const filePath = path.join(this.dataDir, key);

            /**
             * If the @key is within the retainDefaultValue Array,
             * then change the getValueFromFile flag to false to prevent reading value from file.
             */
            let getValueFromFile = true;
            if (retainDefaultValue.includes(key)) getValueFromFile = false;
            
            try {
                if (fs.existsSync(filePath) && getValueFromFile) {
                    const currentValue = fs.readFileSync(filePath, 'utf8');
                    this.#fileMap.set(key, currentValue);
                } else {
                    fs.writeFileSync(filePath, value, 'utf8');
                    this.#fileMap.set(key, value);
                }
            } catch (err) {
                console.error(`[ client_fs ] Error Saving File: Name:${key}, Value: ${value}`, err);
            }
        };

        setTimeout(() => {
            this.updateLocalIp();
        }, 500);
    }

    start() {
        fs.watch(this.dataDir, async (event, filename) => {
            if (!this.#fileMap.has(filename)) return;

            if (event === 'change') {
                const currentValue = this.#fileMap.get(filename);
                const fsValue = fs.readFileSync(path.join(this.dataDir, filename), 'utf8');

                if (currentValue !== fsValue) {
                    console.log(`[ client_fs ] '${filename}' changed from '${currentValue}' to '${fsValue}'`)
                    this.emit(filename, fsValue);
                    this.#fileMap.set(filename, fsValue);
                }
            }
        });
    }

    stop() {
        clearInterval(this.#fsPoll);
        this.#fsPoll = null;
    }

    poll(interval = 10000) {
        this.#fsPoll = setInterval(() => {
            this.updateLocalIp();
        }, interval);
    }

    get(fileName) {
        if (!fileName || !this.#fileMap.has(fileName)) return null;
        return this.#fileMap.get(fileName);
    }

    put(fileName, data = '') {
        if (!fileName || !this.#fileMap.has(fileName)) return;
        try {
            fs.writeFileSync(path.join(this.dataDir, fileName), data, 'utf8');
        } catch (error) {
            console.error('[ client_fs ] Error Saving to FileSystem');
        }
    }


    async updateLocalIp() {
        const fileName = 'local_ip';
        const updateValue = await getLocalIp(this.firstRun);
        if (updateValue) {
            const storedValue = this.#fileMap.get(fileName);

            if (updateValue !== storedValue) {
                this.put(fileName, updateValue);
                this.#fileMap.set(fileName, updateValue);
            }
            if (this.firstRun) {
                this.poll();
                this.emit('ready');
                this.firstRun = false;
                this.start();
            }
        }
    }

}

module.exports = FileSystemMonitor;