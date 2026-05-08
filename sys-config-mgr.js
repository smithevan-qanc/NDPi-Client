const { EventEmitter }  = require('events');
const os                = require('os');
const fs                = require('fs');
const path              = require('path');
const { exec }          = require('child_process');

class SystemConfigurationManager extends EventEmitter {
    constructor() {
        super();
        this.default_device_name = null;
        this.storage_directory = `${os.homedir()}/DATA_ndpi`;
        // Local Area Network IP Address
        this.lan_ip = null;
        // NDPi Device ID from machine Serial Number
        this.device_id = null;
        // Percent of total available memory in use
        this.perc_memory_used = null; //( 1-(os.freemem()/os.totalmem()) ).toFixed(3)

        this.ndpi_version = null;
    }

    /**
     * DATA_ndpi/device-name
     * DATA_ndpi/device-name-default
     * DATA_ndpi/device-type
     * DATA_ndpi/device-id
     * 
     * DATA_ndpi/network-ip
     * DATA_ndpi/network-port-number-display
     * DATA_ndpi/network-port-number-api        (previously command port)
     * DATA_ndpi/network-port-number-bonjour
     * 
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
     * DATA_ndpi/ndpi-status-ndi-source-time-connected
     * DATA_ndpi/ndpi-status-no-source-display-mode
     * 
     * DATA_ndpi/output-resolution-current
     * DATA_ndpi/output-framerate-current
     * DATA_ndpi/output-device-resolution-preferred
     * DATA_ndpi/output-device-framerate-preferred
     * DATA_ndpi/output-device-manufacturer
     * DATA_ndpi/output-device-model
     * DATA_ndpi/output-device-cec-enabled
     * DATA_ndpi/output-device-cec-status-power
     * 
     * DATA_ndpi/
     * DATA_ndpi/
     * DATA_ndpi/
     * DATA_ndpi/
     * DATA_ndpi/
     * DATA_ndpi/
     * DATA_ndpi/
     */

    init() {
        //
    }

    outputEvent(event = 'data', payload) {
        this.emit(event, payload);
    }

}