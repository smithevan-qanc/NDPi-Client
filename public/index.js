function updateDetails(msg) {
    const fields = {
        devName:    msg.thisDevice?.name,
        devId:      msg.thisDevice?.id,
        devIp:      msg.thisDevice?.address === undefined ? undefined :
                    msg.thisDevice.address === '' ? 'Obtaining...' :
                    msg.thisDevice.address,
        hubIp:      msg.hubIp || 'No NDPi Hub',
        pgmName:    msg.service?.name,
        pgmVer:     msg.service?.version,
    };

    for (const [id, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        document.getElementById(id).textContent = value;
    }
    displayDetails();
}

const waitingForHubEl       = document.getElementById('waiting-for-hub-svg');
const startingEl            = document.getElementById('attempting-ndi-connection-svg');
const overlayContainerEl    = document.getElementById('overlay-container');
const overlayImageEl        = document.getElementById('overlay');
const detailsEl             = document.getElementById('sys-details');

let waitingForHubTimer = null;
let waitingForHubVis = true;
function waitingForHub(show = true, timeout = 1000) {
    console.log(`*FUNC* waitingForHub(${show})`);
    if (
        waitingForHubVis !== show &&
        waitingForHubTimer
    ) {
        clearTimeout(waitingForHubTimer);
        waitingForHubTimer = null;
    }
    
    if (waitingForHubTimer) return;

    waitingForHubTimer = setTimeout(() => {
        waitingForHubVis = show;
        waitingForHubEl.style.opacity = show ? 1 : 0;
        waitingForHubTimer = null;
    }, timeout);
}

let connectingToSourceTimer = null;
let connectingToSourceVis = false;
function connectingToSource(show = true, timeout = 1000) {
    console.log(`*FUNC* connectingToSource(${show})`);
    if (
        connectingToSourceVis !== show &&
        connectingToSourceTimer
    ) {
        clearTimeout(connectingToSourceTimer);
        connectingToSourceTimer = null;
    }

    if (connectingToSourceTimer) return;
    
    connectingToSourceTimer = setTimeout(() => {
        connectingToSourceVis = show;
        startingEl.style.opacity = show ? 1 : 0;
        connectingToSourceTimer = null;
    }, timeout);
}

let displayOverlayTimer = null;
let displayOverlayVis = false;
function displayOverlay(show = true, timeout = 1000) {
    console.log(`*FUNC* displayOverlay(${show})`);
    if (
        displayOverlayVis !== show &&
        displayOverlayTimer
    ) {
        clearTimeout(displayOverlayTimer);
        displayOverlayTimer = null;
    }

    if (displayOverlayTimer) return;
    
    displayOverlayTimer = setTimeout(() => {
        displayOverlayVis = show;
        overlayContainerEl.style.opacity = show ? 1 : 0;
        displayOverlayTimer = null;
    }, timeout);
}

let displayDetailsTimer = null;
let displayDetailsVis = true;
function displayDetails(show = true, timeout = 1000) {
    console.log(`*FUNC* displayDetails(${show})`);
    if (
        displayDetailsVis !== show &&
        displayDetailsTimer
    ) {
        clearTimeout(displayDetailsTimer);
        displayDetailsTimer = null;
    }

    if (displayDetailsTimer) return;
    
    displayDetailsTimer = setTimeout(() => {
        displayDetailsVis = show;
        detailsEl.style.opacity = show ? 1 : 0;
        displayDetailsTimer = null;
    }, timeout);
}


let messageData = new Map();
let lastMessage = new Map();

const server = new NDPi_WebSocket('ws/display');

server._ws.onopen = () => {
    if (server.timerPageReload)
    { clearTimeout(server.timerPageReload); server.timerPageReload = null; }
    if (server.timerReconnectDevice)
    { clearInterval(server.timerReconnectDevice); server.timerReconnectDevice = null; }
}

server._ws.onmessage = (message) => {
    try {
        messageData = new Map(JSON.parse(message.data));

        messageData.forEach((entry, id) => {
            const output = entry.value ?? null;

            switch (id) {
                case 'device_name':
                case 'device_id':
                case 'device_type':
                case 'ndpi_version':
                    document.getElementById(id).textContent = output || '';
                    break;

                case 'device_ip':
                    document.getElementById(id).textContent = output || 'Obtaining...';
                    break;

                case 'ndpi_hub_hostname':
                    waitingForHub(!String(output || '').includes('.'));
                    document.getElementById(id).textContent = output || '';
                    document.getElementById(`div__${id}`).hidden = !output;
                    break;

                case 'ndpi_status_ndi_source_target': {
                    if (
                        String(output || 'none').toLowerCase() !== 'none'
                    ) {
                        connectingToSource(true);
                        displayOverlay(false);
                    }
                    break;
                }

                case 'ndpi_status_ndi_source_active': {
                    const targetEntry = messageData.get('ndpi_status_ndi_source_target');
                    const targetSource = String(targetEntry?.value || 'none').toLowerCase();
                    if (
                        String(output || '').toLowerCase() === '' &&
                        targetSource === 'none'
                    ) {
                        displayDetails(true);
                        displayOverlay(true);
                        connectingToSource(false);
                    }
                    else if (
                        String(output || '').toLowerCase() !== ''
                    ) {
                        displayDetails(false);
                        connectingToSource(false);
                    }
                    break;
                }

                case 'ndpi_status_no_source_display_mode':
                    if (
                        String(output || 'blank').toLowerCase() === 'blank'
                    ) { overlayImageEl.style.opacity = 0; }
                    else if (
                        String(output || 'blank').toLowerCase() === 'overlay'
                    ) { overlayImageEl.style.opacity = 1; }
                    break;

                case 'media_overlay_image': {
                    const lastOutputEntry = lastMessage.get('ndpi_status_ndi_source_target');
                    const lastOutput = lastOutputEntry?.value || null;
                    if (!output)
                    {
                        overlayImageEl.style.removeProperty('height');
                        break;
                    }
                    if (lastOutput === output) {
                        console.log('Last Output eq Output');
                        break;
                    }
                    updateOverlay(output)
                    break;
                }

                default:
                    break;
            }
        });
        lastMessage = new Map(JSON.parse(message.data));
    } catch (e) {
        console.error(e);
    }
};

async function updateOverlay(output) {
    try {
        const parsed = JSON.parse(output);
        const parsedSrc = parsed.src || null;
        if (parsedSrc)
        {
            displayOverlay(false, 0);
            await new Promise((resolve) => {
                setTimeout(() => {
                    overlayImageEl.src = parsedSrc;
                    resolve();
                }, 800);
            });
            displayOverlay(true, 0);
            setTimeout(() => {
                overlayImageEl.style.height = '100vh';
            }, 300);
        }
        else
        {
            displayOverlay(false, 0);
            await new Promise((resolve) => {
                setTimeout(() => {
                    overlayImageEl.style.removeProperty('height');
                }, 300);
                setTimeout(() => {
                    overlayImageEl.src = '/assets/Display_Overlay.svg';
                    resolve();
                }, 800);
            });
            displayOverlay(true, 0);
        }
    } catch (e) {
        console.error('Failed to parse media_overlay_image', e);
        overlayImageEl.style.removeProperty('height');
        overlayImageEl.src = '/assets/Display_Overlay.svg';
        overlayImageEl.opacity = 1;
        displayOverlay(true);
    }
}