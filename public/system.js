class DeviceSocket {
    constructor() {
        
        this._ws = null;

        this.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.host = window.location.host;

        this.timerNdpiHubServerPing = null;
        this.timerReconnectDevice = null;
        this.timerPageReload = null;

        this.connect();
    }

    disconnect() {
        if (this._ws && this._ws.readyState === WebSocket.OPEN)
        try { this._ws.close(); } catch {}
        this._ws = null;
    }

    connect() {
        if (this._ws && this._ws.readyState === WebSocket.OPEN)
        try { this._ws.close(); } catch {}
        this._ws = null;

        this._ws = new WebSocket(`${this.protocol}//${this.host}/ws/system`);

        this._ws.onopen = () => {
            console.log('Connected to device server');
            if (this.timerPageReload) 
            { clearTimeout(this.timerPageReload); this.timerPageReload = null; }
            if (this.timerReconnectDevice)
            { clearInterval(this.timerReconnectDevice); this.timerReconnectDevice = null; }
        };

        this._ws.onmessage = (message) => {
            try
            {
                const msg = JSON.parse(message.data);
                for (const [id, object] of msg)
                {
                    // const settingInnerHTML = `<label style="text-transform: capitalize;" for="${id}">${String(id.split('_').join(' '))}:</label><input type="text" id="${id}" value="${value}">`;

                    const settingInnerHTML = `
                        <td style="text-transform: capitalize; min-width: 200px; text-align: right;">${String(id.split('_').join(' '))}:</td>
                        <td style="width: 60%;">
                            <input type="text" id="${id}" value="${object.value}" ${object.allowEditExternal ? '' : 'disabled'}>
                        </td>`;

                    if (id === 'ndpi_status_ndi_source_target') 
                    { document.getElementById('source_selection').value = object.value || 'none'; }

                    let settingEl = document.getElementById(`__${id}`);
                    if (!settingEl)
                    {
                        settingEl = document.createElement('tr');
                        settingEl.id = `__${id}`;
                        // settingEl.className = 'flex-row';
                        settingEl.innerHTML = settingInnerHTML;
                        document.getElementById('settings').appendChild(settingEl);
                    } else
                    {
                        settingEl.innerHTML = settingInnerHTML;
                    }
                }
            }
            catch (e)
            { console.error('Invalid message:', e); }
        };

        this._ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this._ws.onclose = () => {
            this.scheduleDeviceReconnect();
            this._ws = null;
        }
    }

    scheduleDeviceReconnect(ms = 10000, timeout = 120000) {
        if (this.timerReconnectDevice) 
        { clearInterval(this.timerReconnectDevice); this.timerReconnectDevice = null; }
        this.timerReconnectDevice = setInterval(() => { this.connect(); }, ms);

        if (this.timerPageReload) 
        { return; }
        this.timerPageReload = setTimeout(() => { window.navigation.reload(); }, timeout);
    }

    // // call this when the NDPi Hub Server establishes a connection with the client device.
    // hubConnected(timeout = 10000) {
    //     waitingForServer(false);
    //     if (this.timerNdpiHubServerPing)
    //     {
    //         clearTimeout(this.timerNdpiHubServerPing);
    //         this.timerNdpiHubServerPing = null;
    //     }
    //     this.timerNdpiHubServerPing = setTimeout(() => { waitingForServer(true); }, timeout);
    // }
    
}

const server = new DeviceSocket();

// function updateDetails(msg) {
//     const fields = {
//         devName:     msg.thisDevice?.name,
//         devId:       msg.thisDevice?.id,
//         devIp:       msg.thisDevice?.address === undefined ? undefined
//                         : msg.thisDevice.address === 'localhost' ? 'Obtaining...'
//                         : msg.thisDevice.address,
//         servIp:      msg.serverIp || '-.-.-.-',
//         programName: msg.service?.name,
//         programVer:  msg.service?.version,
//     };

//     for (const [id, value] of Object.entries(fields)) {
//         if (value === undefined) continue;
//         document.getElementById(id).textContent = value;
//     }
//     displayDetails();
// }