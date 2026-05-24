const bonjour = require('bonjour')();

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
        if (!this._isReady()) return;

        // Stop existing service before republishing with updated data
        if (this.service) {
            this.service.stop();
            this.service = null;
        }

        const options = this._buildOptions();
        console.log('[ client_bonjour ] Publishing Service');//, options

        this.service = bonjour.publish(options);
        this.service.on('error', (err) => {
            console.log('🔴 [ client_bonjour ][ ERROR ]', err.message);
        });
    }

    async close() {
        await new Promise((resolve) => {
            if (this.service)
            {
                this.service.stop();
                this.service = null;
                setTimeout(() => { resolve(); }, 1000);
            }
            else
            { resolve(); }
        });
        return;
    }
}

module.exports = NDPiBonjourService;