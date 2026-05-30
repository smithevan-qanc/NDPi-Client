const bonjour = require('bonjour')();
const path = require('path');

class NDPiBonjourService {
    constructor(fsData) {

        this.service        = null;
        this.bonjourPort    = fsData.get('local_port_number_bonjour') || process.env.PORT_MDNS || 3053;
        this.deviceId       = fsData.get('device_id')                 || null;
        this.deviceName     = fsData.get('device_name')               || null;
        this.localIp        = fsData.get('device_ip')                 || null;
        this.commandPort    = fsData.get('local_port_number_api')     || process.env.PORT_API || 3080;
        this.deviceType     = fsData.get('device_type')               || null;
        this.programVersion = fsData.get('ndpi_version')              || null;

        this._tryPublish();
    }

    _isReady() {
        return !!(
            this.deviceId    &&
            this.deviceName  &&
            this.deviceType  &&
            this.localIp     &&
            this.commandPort &&
            this.programVersion
        );
    }

    _buildOptions() {
        const serviceType = String(this.deviceType).replace(/ /g, '-').toLowerCase();
        return {
            name: `${serviceType}-${this.deviceId}`,
            type: String(serviceType),
            port: this.bonjourPort,
            txt: {
                deviceId:    String(this.deviceId),
                deviceName:  String(this.deviceName),
                ip:          String(this.localIp),
                commandPort: String(this.commandPort),
                type:        String(this.deviceType),
                status:      'online',
                version:     String(this.programVersion)
            }
        };
    }

    _tryPublish() {
        if (!this._isReady())
        { return; }

        // Stop existing service before republishing with updated data
        if (this.service) {
            this.service.stop();
            this.service = null;
        }

        const options = this._buildOptions();

        setTimeout(() => {
            try
            {
                console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'Publishing Service');
                this.service = bonjour.publish(options);
            }
            catch {}
        }, 1500);

        this.service.on('error', (err) => { console.error(`⚠️ [ ${path.basename(__filename).split('.')[0]} ][ ERROR ]`, err.message); });
    }

    /**
     * Update the device name on mDNS.
     * @param {string} name 
     */
    updateDeviceName(name) {
        if (this.deviceName !== name && typeof name == 'string')
        {
            this.deviceName = name;
            this._tryPublish();
        }
    }

    /**
     * Update the device IP address on mDNS.
     * @param {string} address 
     */
    updateDeviceIp(address) {
        if (this.localIp !== address && typeof address == 'string')
        {
            this.localIp = address;
            this._tryPublish();
        }
    }

    /**
     * Kill the Bonjour client and close out of the module.
     * @param {boolean} shutdown - Set as true when exiting the entire NDPi Process.
     */
    async close(shutdown = false) {
        console.info(
            `[ ${path.basename(__filename).split('.')[0]} ]`,
            'Closing Module'
        );

        await new Promise((resolve) => {
            if (this.service)
            {
                this.service.stop();
                this.service = null;
                setTimeout(() => { resolve(); }, shutdown ? 50 : 1000);
            }
            else
            { resolve(); }
        });

        console.info(
            `[ ${path.basename(__filename).split('.')[0]} ]`,
            'Module Exited'
        );
        return;
    }
}

module.exports = NDPiBonjourService;