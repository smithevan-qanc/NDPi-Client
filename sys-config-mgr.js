const { EventEmitter }  = require('events');
const os                = require('os');
const fs                = require('fs');
const path              = require('path');
const { exec }          = require('child_process');

class SystemConfigurationManager extends EventEmitter {
    constructor() {
        super();
        this.default_device_name = 'NDPi Client';
        this.storage_directory = `${os.homedir()}/DATA_ndpi`;
    }

    /**
     * DATA_ndpi/device-name
     * DATA_ndpi/device-name-default
     * DATA_ndpi/device-type
     * DATA_ndpi/device-id
     * DATA_ndpi/network-ip
     * DATA_ndpi/network-port-number-display
     * DATA_ndpi/network-port-number-api
     * DATA_ndpi/network-port-number-bonjour
     * DATA_ndpi/ndpi-version
     * DATA_ndpi/ndpi-version-date
     * DATA_ndpi/ndpi-command-server-host
     * DATA_ndpi/ndpi-command-server-socket-path
     * DATA_ndpi/ndpi-command-log
     * DATA_ndpi/ndpi-status-ndi
     * DATA_ndpi/ndpi-status-ndi-source-target
     * DATA_ndpi/ndpi-status-ndi-source-active
     * DATA_ndpi/ndpi-status-ndi-source-resolution
     * DATA_ndpi/ndpi-status-ndi-source-framerate
     * DATA_ndpi/ndpi-status-ndi-source-connected-time
     * DATA_ndpi/ndpi-status-no-source-display-mode
     * DATA_ndpi/output-resolution-current
     * DATA_ndpi/output-framerate-current
     * DATA_ndpi/output-device-resolution-preferred
     * DATA_ndpi/output-device-framerate-preferred
     * DATA_ndpi/output-device-manufacturer
     * DATA_ndpi/output-device-model
     * DATA_ndpi/output-device-cec-enabled
     * DATA_ndpi/output-device-cec-status-power
     * DATA_ndpi/
     * DATA_ndpi/
     * DATA_ndpi/
     * DATA_ndpi/
     * DATA_ndpi/
     * DATA_ndpi/
     * DATA_ndpi/
     */

    init() {
        const filenames = [
            "device-name",
            "device-name-default",
            "device-type",
            "device-id",
            "network-ip",
            "network-port-number-display",
            "network-port-number-api",
            "network-port-number-bonjour",
            "ndpi-version",
            "ndpi-version-date",
            "ndpi-command-server-host",
            "ndpi-command-server-socket-path",
            "ndpi-command-log",
            "ndpi-status-ndi",
            "ndpi-status-ndi-source-target",
            "ndpi-status-ndi-source-active",
            "ndpi-status-ndi-source-resolution",
            "ndpi-status-ndi-source-framerate",
            "ndpi-status-ndi-source-connected-time",
            "ndpi-status-no-source-display-mode",
            "output-resolution-current",
            "output-framerate-current",
            "output-device-resolution-preferred",
            "output-device-framerate-preferred",
            "output-device-manufacturer",
            "output-device-model",
            "output-device-cec-enabled",
            "output-device-cec-status-power"
        ];
        for (const filename in filenames) {

        }
    }

    _write_fs(filename, payload) {
        try {
            const filepath = path.join(this.storage_directory, filename);
            /***/ console.log(`[SystemConfigurationManager]_write_fs(): Writing To Path: [${filepath}]`);
            fs.writeFileSync(filepath, payload, 'utf8');
        } catch (error) {
            /***/ console.log('[SystemConfigurationManager]_write_fs(): ERROR', error);
        }
    }

    _read_fs(filename) {
        const filepath = path.join(this.storage_directory, filename);
        try {
            /***/ console.log(`[SystemConfigurationManager]_read_fs(): Reading Path: [${filepath}]`);
            if (fs.existsSync(filepath)) {
                const data = fs.readFileSync(filepath, 'utf8');
                return data;
            }
        } catch (error) {
            /***/ console.log('[SystemConfigurationManager]_read_fs(): ERROR', error);
            return null;
        }
    }

    outputEvent(event = 'data', payload) {
        this.emit(event, payload);
    }

}