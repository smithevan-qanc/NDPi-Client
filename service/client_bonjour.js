const bonjour = require('bonjour')();
const path = require('path');

class NDPiBonjourService {
    constructor(fsData) {

        this.service = null;
        this.settings = fsData;

        this.localIp = this.settings.get('device_ip') || null;
        this.settings.on('device_ip', (data) => {
            this.localIp = String(data || '').trim() || null;
            this._tryPublish();
        });

        this.deviceId = this.settings.get('device_id') || null;
        this.settings.on('device_id', (data) => {
            this.deviceId = String(data || '').trim() || null;
            this._tryPublish();
        });

        this.bonjourPort = this.settings.get('local_port_number_bonjour') || process.env.PORT_MDNS || 3053;
        this.settings.on('local_port_number_bonjour', (data) => {
            this.bonjourPort = String(data || '').trim() || process.env.PORT_MDNS || 3053;
            this._tryPublish();
        });

        this.deviceName = this.settings.get('device_name') || null;
        this.settings.on('device_name', (data) => {
            this.deviceName = String(data || '').trim() || null;
            this._tryPublish();
        });

        this.commandPort = this.settings.get('local_port_number_api') || process.env.PORT_API || 3080;
        this.settings.on('local_port_number_api', (data) => {
            this.commandPort = String(data || '').trim() || process.env.PORT_API || 3080;
            this._tryPublish();
        });

        this.deviceType = this.settings.get('device_type') || null;
        this.settings.on('device_type', (data) => {
            this.deviceType = String(data || '').trim() || null;
            this._tryPublish();
        });

        this.programVersion = this.settings.get('ndpi_version') || null;
        this.settings.on('ndpi_version', (data) => {
            this.programVersion = String(data || '').trim() || null;
            this._tryPublish();
        });

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

    async _tryPublish() {
        if (!this._isReady())
        { return; }

        if (this.service) {
            await new Promise((resolve) => {
                this.service.stop();
                this.service = null;
                setTimeout(() => { resolve(); }, 1500);
            });
        }

        this.publish();
    }

    publish() {
        const options = this._buildOptions();
        console.info(`[ ${path.basename(__filename).split('.')[0]} ]`, 'Publishing Service');

        this.service = bonjour.publish(options);

        this.service.on('error', (err) => { console.error(`⚠️  [ ${path.basename(__filename).split('.')[0]} ][ ERROR ]`, err.message); });
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