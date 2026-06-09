

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

const overlayEl = document.getElementById('overlay');
const detailsEl = document.getElementById('sys-details');
const startingEl = document.getElementById('attempting-ndi-connection-svg');

const server = new NDPi_WebSocket('ws/display');

server._ws.onopen = () => {
    console.log('Connected to device server');
    if (this.timerPageReload) 
    { clearTimeout(this.timerPageReload); this.timerPageReload = null; }
    if (this.timerReconnectDevice)
    { clearInterval(this.timerReconnectDevice); this.timerReconnectDevice = null; }
}

server._ws.onmessage = (message) => {
    try
    {
        const msg = JSON.parse(message.data);
        for (const [id, object] of msg)
        {
            const output = object.value || null;

            switch (id)
            {
                case 'device_name':
                    document.getElementById(id).textContent = output || '';
                    break;
                    return;

                case 'device_id':
                    document.getElementById(id).textContent = output || '';
                    break;
                    return;

                case 'device_ip':
                    document.getElementById(id).textContent = output || 'Obtaining...';
                    break;
                    return;

                case 'ndpi_command_server_host':
                    if (!output)
                    { document.getElementById('waiting-for-server-svg').style.opacity = 1; }
                    else
                    { document.getElementById('waiting-for-server-svg').style.opacity = 0; }
                    document.getElementById(id).textContent = output || '';
                    document.getElementById(`div__${id}`).hidden = !output;
                    break;
                    return;

                case 'device_type':
                    document.getElementById(id).textContent = output || '';
                    break;
                    return;

                case 'ndpi_version':
                    document.getElementById(id).textContent = output || '';
                    break;
                    return;

                case 'ndpi_status_ndi':
                    if (output == 'idle' || output == 'stalled')
                    {
                        detailsEl.style.opacity = 1;
                        setTimeout(() => {
                            overlayEl.style.opacity = 1;
                        }, 500);
                    }
                    else
                    {
                        setTimeout(() => {
                            overlayEl.style.opacity = 0;
                            detailsEl.style.opacity = 0;
                        }, 1000);
                    }
                    break;
                    return;

                case 'ndpi_status_ndi_source_target':
                    if (output && output !== 'none')
                    { startingEl.style.opacity = 1; }
                    else
                    { startingEl.style.opacity = 0; }
                    break;
                    return;

                case 'ndpi_status_no_source_display_mode':
                    if (!output || output == 'blank')
                    { document.getElementById('overlay-container').style.opacity = 0; }
                    else
                    { document.getElementById('overlay-container').style.opacity = 1; }
                    break;
                    return;

                case 'media_overlay_image':
                    if (!output)
                    {
                        break;
                        return;
                    }
                    try
                    {
                        const imageObj = JSON.parse(output).src || '/assets/Display_Overlay.svg';
                        if (imageObj)
                        { overlayEl.src = imageObj; }
                        else
                        { throw new Error('/assets/Display_Overlay.svg') }
                    }
                    catch (e) { overlayEl.src = e; }
                    break;
                    return;

                default:
                    break;
                    return;
            }
        }
    }
    catch {}
}

let displayMode = 'blank';
let customOverlay = '';


function waitingForServer(show = true) { document.getElementById('waiting-for-server-svg').style.opacity = show ? 1 : 0; }
function connectingToSource(show = true) { document.getElementById('attempting-ndi-connection-svg').style.opacity = show ? 1 : 0; }
function displayDetails(show = true) { document.getElementById('sys-details').style.opacity = show ? 1 : 0; }