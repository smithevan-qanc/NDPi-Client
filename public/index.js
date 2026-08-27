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
function waitingForHub(show = true) {
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
    }, 1000);
}

let connectingToSourceTimer = null;
let connectingToSourceVis = false;
function connectingToSource(show = true) {
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
    }, 1000);
}

let displayOverlayTimer = null;
let displayOverlayVis = false;
function displayOverlay(show = true) {
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
    }, 1000);
}

let displayDetailsTimer = null;
let displayDetailsVis = true;
function displayDetails(show = true) {
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
    }, 1000);
}


let messageData = new Map();

const server = new NDPi_WebSocket('ws/display');

server._ws.onopen = () => {
    if (server.timerPageReload)
    { clearTimeout(server.timerPageReload); server.timerPageReload = null; }
    if (server.timerReconnectDevice)
    { clearInterval(server.timerReconnectDevice); server.timerReconnectDevice = null; }
}

// server._ws.onmessage = (message) => {
//     try
//     {
//         console.log(message);
//         const msg = JSON.parse(message.data);
//         messageData = JSON.parse(message.data);

//         messageData.forEach((value, key) => {
//             console.log(value)
//             const obj = Object.values(value) || null;
//             const id = obj.key;
//             const output = obj.value || null;
//             console.log(`Output Object:`, obj);
//             console.log(`Output Value: ${output}`);
//             console.log(`Output Id: ${id}`);

//             switch (id)
//             {
//                 case 'device_name':
//                     document.getElementById(id).textContent = output || '';
//                     break;
//                     return;

//                 case 'device_id':
//                     document.getElementById(id).textContent = output || '';
//                     break;
//                     return;

//                 case 'device_ip':
//                     document.getElementById(id).textContent = output || 'Obtaining...';
//                     break;
//                     return;

//                 case 'ndpi_hub_hostname':
//                     if (String(output || '').includes('.'))
//                     {
//                         waitingForHub(false);
//                     }
//                     else
//                     {
//                         waitingForHub(true);
//                     }

//                     document.getElementById(id).textContent = output || '';
//                     document.getElementById(`div__${id}`).hidden = !output;
//                     break;
//                     return;

//                 case 'device_type':
//                     document.getElementById(id).textContent = output || '';
//                     break;
//                     return;

//                 case 'ndpi_version':
//                     document.getElementById(id).textContent = output || '';
//                     break;
//                     return;

//                 // case 'ndpi_status_ndi_status':
//                 //     const targetSource = String(messageData.get('ndpi_status_ndi_source_target').value || 'none').toLowerCase();
//                 //     if (
//                 //         String(output || '').toLowerCase().includes('idle') &&
//                 //         targetSource === 'none'
//                 //     ) {
//                 //         displayDetails(true);
//                 //         displayOverlay(true);
//                 //     }
//                 //     break;
//                 //     return;

//                 case 'ndpi_status_ndi_source_target':
//                     if (String(output || 'none').toLowerCase() !== 'none')
//                     {
//                         connectingToSource(true);
//                         displayOverlay(false);
//                     }
//                     break;
//                     return;

//                 case 'ndpi_status_ndi_source_active':
//                     const targetSource = String(messageData.get('ndpi_status_ndi_source_target').value || 'none').toLowerCase();
//                     if (
//                         String(output || '').toLowerCase() === '' &&
//                         targetSource === 'none'
//                     ) {
//                         displayDetails(true);
//                         displayOverlay(true);
//                         connectingToSource(false);
//                     }
//                     else if (
//                         String(output || '').toLowerCase() !== ''
//                     ) {
//                         displayDetails(false);
//                         connectingToSource(false);
//                     }
//                     break;
//                     return;

//                 case 'ndpi_status_no_source_display_mode':
//                     if (String(output || 'blank').toLowerCase() === 'blank')
//                     { overlayImageEl.style.opacity = 0; }
//                     else if (String(output || 'blank').toLowerCase() === 'overlay')
//                     { overlayImageEl.style.opacity = 1; }
//                     break;
//                     return;

//                 case 'media_overlay_image':
//                     if (!output)
//                     {
//                         break;
//                         return;
//                     }
//                     try
//                     {
//                         const imageObj = JSON.parse(output).src || '/assets/Display_Overlay.svg';
//                         if (imageObj)
//                         { overlayImageEl.src = imageObj; }
//                         else
//                         { throw new Error('/assets/Display_Overlay.svg') }
//                     }
//                     catch (e) { overlayImageEl.src = e; }
//                     break;
//                     return;

//                 default:
//                     break;
//                     return;
//             }
//         });

//         // for (const [id, object] of msg)
//         // {
//         //     const output = object.value || null;
//         //     switch (id)
//         //     {
//         //         case 'device_name':
//         //             document.getElementById(id).textContent = output || '';
//         //             break;
//         //             return;

//         //         case 'device_id':
//         //             document.getElementById(id).textContent = output || '';
//         //             break;
//         //             return;

//         //         case 'device_ip':
//         //             document.getElementById(id).textContent = output || 'Obtaining...';
//         //             break;
//         //             return;

//         //         case 'ndpi_hub_hostname':
//         //             if (!output)
//         //             { waitingForHub(true); }
//         //             else
//         //             { waitingForHub(false); }
//         //             document.getElementById(id).textContent = output || '';
//         //             document.getElementById(`div__${id}`).hidden = !output;
//         //             break;
//         //             return;

//         //         case 'device_type':
//         //             document.getElementById(id).textContent = output || '';
//         //             break;
//         //             return;

//         //         case 'ndpi_version':
//         //             document.getElementById(id).textContent = output || '';
//         //             break;
//         //             return;

//         //         // case 'ndpi_status_ndi_status':
//         //         //     const targetSource = String(messageData.get('ndpi_status_ndi_source_target').value || 'none').toLowerCase();
//         //         //     if (
//         //         //         String(output || '').toLowerCase().includes('idle') &&
//         //         //         targetSource === 'none'
//         //         //     ) {
//         //         //         displayDetails(true);
//         //         //         displayOverlay(true);
//         //         //     }
//         //         //     break;
//         //         //     return;

//         //         case 'ndpi_status_ndi_source_target':
//         //             if (String(output || 'none').toLowerCase() !== 'none')
//         //             {
//         //                 connectingToSource(true);
//         //                 displayOverlay(false);
//         //             }
//         //             break;
//         //             return;

//         //         case 'ndpi_status_ndi_source_active':
//         //             const targetSource = String(messageData.get('ndpi_status_ndi_source_target').value || 'none').toLowerCase();
//         //             if (
//         //                 String(output || '').toLowerCase() === '' &&
//         //                 targetSource === 'none'
//         //             ) {
//         //                 displayDetails(true);
//         //                 displayOverlay(true);
//         //             }
//         //             else if (
//         //                 String(output || '').toLowerCase() !== '' &&
//         //                 targetSource !== 'none'
//         //             ) {
//         //                 displayDetails(false);
//         //                 connectingToSource(false);
//         //             }
//         //             break;
//         //             return;

//         //         case 'ndpi_status_no_source_display_mode':
//         //             if (!output || output == 'blank')
//         //             { overlayImageEl.style.opacity = 0; }
//         //             else
//         //             { overlayImageEl.style.opacity = 1; }
//         //             break;
//         //             return;

//         //         case 'media_overlay_image':
//         //             if (!output)
//         //             {
//         //                 break;
//         //                 return;
//         //             }
//         //             try
//         //             {
//         //                 const imageObj = JSON.parse(output).src || '/assets/Display_Overlay.svg';
//         //                 if (imageObj)
//         //                 { overlayImageEl.src = imageObj; }
//         //                 else
//         //                 { throw new Error('/assets/Display_Overlay.svg') }
//         //             }
//         //             catch (e) { overlayImageEl.src = e; }
//         //             break;
//         //             return;

//         //         default:
//         //             break;
//         //             return;
//         //     }
//         // }
//     }
//     catch (e) {
//         console.error(e)
//     }
// }

server._ws.onmessage = (message) => {
    try {
        messageData = JSON.parse(message.data);

        messageData.forEach((entry) => {
            const id = entry.key;
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
                    if (String(output || 'none').toLowerCase() !== 'none')
                    {
                        connectingToSource(true);
                        displayOverlay(false);
                    }
                    break;
                }

                case 'ndpi_status_ndi_source_active': {
                    const targetEntry = messageData.find(e => e.key === 'ndpi_status_ndi_source_target');
                    const targetSource = String(targetEntry?.value || 'none').toLowerCase();

                    if (
                        String(output || '').toLowerCase() === '' &&
                        targetSource === 'none'
                    ) {
                        displayDetails(true);
                        displayOverlay(true);
                        connectingToSource(false);
                    } else if (
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
                    if (!output) break;
                    try {
                        const parsed = JSON.parse(output);
                        overlayImageEl.src = parsed.src || '/assets/Display_Overlay.svg';
                    } catch (e) {
                        console.error('Failed to parse media_overlay_image', e);
                        overlayImageEl.src = '/assets/Display_Overlay.svg';
                    }
                    break;
                }

                default:
                    break;
            }
        });
    } catch (e) {
        console.error(e);
    }
};