const waitingForServer   = (show = true) => { document.getElementById('waiting-for-server-svg').style.opacity = show ? 1 : 0; }
const connectingToSource = (show = true) => { document.getElementById('attempting-ndi-connection-svg').style.opacity = show ? 1 : 0; }
const displayDetails     = (show = true) => { document.getElementById('sys-details').style.opacity = show ? 1 : 0; }

const displayOverlay = async (show = true, imagePath = '') => {
    const svgContainer = document.getElementById('overlay-svg');
    let overlayImageSrc = imagePath || null;
    if (show && overlayImageSrc) 
    {
        svgContainer.style.opacity = 0; 
        await new Promise((resolve) => {
            setTimeout(() => {
                svgContainer.src = overlayImageSrc;
                setTimeout(() => { resolve(); }, 200);
            }, 810);
        });
        svgContainer.style.opacity = 1;
    }
    else if (show) 
    {
        svgContainer.src = '/assets/Display_Overlay.svg';
        await new Promise((resolve) => {
            setTimeout(() => { resolve(); }, 200);
        });
        svgContainer.style.opacity = 1
    } else
    {
        svgContainer.style.opacity = 0;
    }
}

const hideAll = () => {
    displayDetails(false);
    displayOverlay(false);
    connectingToSource(false);
}

(() => {
    console.log(new URLPattern(window.location.href));
})();


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

        this._ws = new WebSocket(`${this.protocol}//${this.host}/ws/display`);

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
                handleDisplayCommand(msg);
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

    // call this when the NDPi Hub Server establishes a connection with the client device.
    hubConnected(timeout = 10000) {
        waitingForServer(false);
        if (this.timerNdpiHubServerPing)
        {
            clearTimeout(this.timerNdpiHubServerPing);
            this.timerNdpiHubServerPing = null;
        }
        this.timerNdpiHubServerPing = setTimeout(() => { waitingForServer(true); }, timeout);
    }
    
}

const server = new DeviceSocket();

function handleDisplayCommand(msg) {
    switch (msg.type) {
        case 'update-details':
            updateDetails(msg);
            break;
        case 'ndpi-server-connected':
            server.hubConnected(10000);
            break;
        case 'ndi-init':
            connectingToSource(true);
            break;
        case 'ndi-started':
            hideAll();
            break;
        case 'show-ndi':
            hideAll();
            break;
        case 'show-overlay':
            displayOverlay(true);
            updateDetails(msg);
            break;
        case 'show-blank':
            displayOverlay(false);
            updateDetails(msg);
            break;
        case 'show-custom-overlay':
            displayOverlay(true, msg.data);
            break;
        default:
            console.log("Message Received from device with unrecognized type.", msg);
            break;
    }
}

function updateDetails(msg) {
    const fields = {
        devName:     msg.thisDevice?.name,
        devId:       msg.thisDevice?.id,
        devIp:       msg.thisDevice?.address === undefined ? undefined
                        : msg.thisDevice.address === '' ? 'Obtaining...'
                        : msg.thisDevice.address,
        servIp:      msg.serverIp || 'No NDPi Hub',
        programName: msg.service?.name,
        programVer:  msg.service?.version,
    };

    for (const [id, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        document.getElementById(id).textContent = value;
    }
    displayDetails();
}