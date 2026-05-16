const bonjour = require('bonjour')();

class NDPiBonjourService {
    constructor(fsData) {
        this.bonjourPort = fsData.get('local_port_number_bonjour') || 3002;
        this.service     = null;

        this.deviceId       = fsData.get('device_id')             || null;
        this.deviceName     = fsData.get('device_name')           || null;
        this.localIp        = fsData.get('local_ip')              || null;
        this.commandPort    = fsData.get('local_port_number_api') || null;
        this.deviceType     = fsData.get('device_type')           || null;
        this.programVersion = fsData.get('ndpi_version')          || null;

        fsData.on('device_id',             (v) => { this.deviceId       = v; this._tryPublish(); });
        fsData.on('device_name',           (v) => { this.deviceName     = v; this._tryPublish(); });
        fsData.on('local_ip',              (v) => { this.localIp        = v; this._tryPublish(); });
        fsData.on('local_port_number_api', (v) => { this.commandPort    = v; this._tryPublish(); });
        fsData.on('device_type',           (v) => { this.deviceType     = v; this._tryPublish(); });
        fsData.on('ndpi_version',          (v) => { this.programVersion = v; this._tryPublish(); });

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
        console.log('[ client_bonjour ] Publishing');//, options

        this.service = bonjour.publish(options);
        this.service.on('error', (err) => {
            console.log('[ client_bonjour ] Error:', err.message);
        });
    }

    close() {
        if (this.service) {
            this.service.stop();
            this.service = null;
        }
    }
}

module.exports = NDPiBonjourService;