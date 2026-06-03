// use NDPi_WebSocket from './socket.js'
const server = new NDPi_WebSocket('ws/system');
const sources = new NDPi_WebSocket('ws/sources');


// Available sources array.
let availableSources = [];
const uploaderEl = document.getElementById('overlay_upload');
const uploaderPreviewEl = document.getElementById('overlay_preview');
let overlayUploadCommand = {
    type: 'set-overlay',
    data: {
        name: '',
        type: '',
        size: 0,
        dateLastModified: '',
        dateUploaded: '',
        src: '',
    }
};

(async () => {
    await refreshSources();
    addEvents();
})();


server._ws.onmessage = (message) => {
    try
    {
        const msg = JSON.parse(message.data);
        const overlayPreviewEl = document.getElementById('media_overlay_image');

        for (const [id, object] of msg)
        {
            if (id === 'media_overlay_image')
            {
                try
                {
                    const parse = JSON.parse(object.value).src || null;
                    if (parse && parse !== overlayPreviewEl.src)
                    {
                        overlayPreviewEl.src = parse;
                        overlayPreviewEl.style.boxShadow = '0px 0px 5px -1px rgba(250, 250, 250, 0.6)';
                        uploaderEl.value = '';
                    }
                }
                catch
                {
                    overlayPreviewEl.style.boxShadow = 'none';
                    overlayPreviewEl.src = '';
                }
                finally { return; }
            }

            const settingInnerHTML = `
                <div class="div-label">${String(id.split('_').join(' '))}</div>
                <input type="text" id="${id}" value="${String(object.value).replaceAll('"', "'")}" ${object.allowEditExternal ? '' : 'disabled'}>
            `;

            if (id === 'ndpi_status_ndi_source_target') 
            { document.getElementById('source_selection').value = object.value || 'none'; }

            let settingEl = document.getElementById(`__${id}`);
            if (!settingEl)
            {
                settingEl = document.createElement('div');
                settingEl.id = `__${id}`;
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

sources._ws.onmessage = (message) => {
    try
    {
        const sources = JSON.parse(message.data);
        if (Array.isArray(sources))
        {
            availableSources = sources;
            renderSources();
        }
    }
    catch {}
};

function addEvents() {
    document.getElementById('tv_power_off').addEventListener('click', async (e) => {
        e.preventDefault();
        await sendCommand({
            type: 'send-cec',
            // data: 'standby%200',
            data: encodeURI('standby 0'),
        });
    });
    document.getElementById('tv_power_on').addEventListener('click', async (e) => {
        e.preventDefault();
        await sendCommand({
            type: 'send-cec',
            data: encodeURI('on 0'),
        });
    });
    document.getElementById('tv_volume_down').addEventListener('click', async (e) => {
        e.preventDefault();
        await sendCommand({
            type: 'send-cec',
            data: encodeURI('voldown'),
        });
    });
    document.getElementById('tv_volume_up').addEventListener('click', async (e) => {
        e.preventDefault();
        await sendCommand({
            type: 'send-cec',
            data: encodeURI('volup'),
        });
    });
    document.getElementById('tv_as').addEventListener('click', async (e) => {
        e.preventDefault();
        await sendCommand({
            type: 'send-cec',
            data: encodeURI('as'),
        });
    });
    document.getElementById('tv_is').addEventListener('click', async (e) => {
        e.preventDefault();
        await sendCommand({
            type: 'send-cec',
            data: encodeURI('is'),
        });
    });
    document.getElementById('send_bytes').addEventListener('change', async function(e) {
        e.preventDefault();
        this.disabled = true;
        await sendCommand({
            type: 'send-cec',
            data: encodeURI(`${this.value}`),
        });
        this.value = '';
        this.disabled = false;
    });
    document.getElementById('source_selection').addEventListener('change', async function(e) {
        e.preventDefault();
        this.disabled = true;
        await sendCommand({
            type: 'set-source',
            data: this.value,
        });
        this.disabled = false;
    });
    document.getElementById('refresh_sources').addEventListener('click', async function(e) {
        e.preventDefault();
        this.disabled = true;
        await refreshSources();
        this.disabled = false;
    });
    uploaderEl.addEventListener('change', handleFiles);
    document.getElementById('reset_overlay_upload').addEventListener('click', (e) => {
        e.preventDefault();
        resetOverlayUpload();
    });
    document.getElementById('save_overlay').addEventListener('click', async function(e) {
        e.preventDefault();
        this.disabled = true;
        const res = await sendCommand(overlayUploadCommand);
        if (!res?.success)
        { console.error('Failed to upload overlay.', res) }
    });
    document.getElementById('device_reboot').addEventListener('click', async function(e) {
        e.preventDefault();
        this.disabled = true;
        this.textContent = 'REBOOTING...'
        await sendCommand({
            type: 'reboot-device'
        });
    });
    document.getElementById('device_shutdown').addEventListener('click', async function(e) {
        e.preventDefault();
        this.disabled = true;
        this.textContent = 'SHUTTING DOWN...'
        await sendCommand({
            type: 'shutdown-device'
        });
    });
    
}

function resetOverlayUpload() {
    document.getElementById('save_overlay').disabled = true;
    uploaderEl.value = '';
    uploaderPreviewEl.innerHTML = '';
    overlayUploadCommand = {
        type: 'set-overlay',
        data: {
            name: '',
            type: '',
            size: 0,
            dateLastModified: '',
            dateUploaded: '',
            src: '',
        }
    };
    sendCommand(overlayUploadCommand);
}

async function handleFiles() {
    uploaderEl.scroll({behavior: 'smooth'});
    const file = uploaderEl.files[0];

    if (!file.type.startsWith("image/"))
    { return; }

    const img = document.getElementById('media_overlay_image');
    img.file = file;

    overlayUploadCommand.data.name = file.name || '';
    overlayUploadCommand.data.type = file.type || '';
    overlayUploadCommand.data.size = file.size || 0;
    overlayUploadCommand.data.dateLastModified = file.lastModified;
    overlayUploadCommand.data.dateUploaded = Date.now();


    const reader = new FileReader();
    reader.onload = (e) => {
        img.src = e.target.result;
        overlayUploadCommand.data.src = e.target.result;
        if (overlayUploadCommand.data.src)
        { document.getElementById('save_overlay').disabled = false; }
    };
    reader.readAsDataURL(file);
    uploaderEl.value = '';
}

async function sendCommand(command = {}, viaWebSocket = true) {
    if (!command.type) return null;
    
    if (viaWebSocket && server?._ws && server?._ws.readyState === WebSocket.OPEN) 
    {
        try
        {
            server._ws.send(JSON.stringify(command));
            return;
        }
        catch (err)
        { console.error(err); }
    }
    
    // const searchParams = new URLSearchParams(command).toString();
    // const url = new URLPattern(window.location.href);
    // const urlString = `${url.protocol}://${url.hostname}:${url.port}/api/v1/rpc?${searchParams}`;

    const url = new URLPattern(window.location.href);
    const urlString = `${url.protocol}://${url.hostname}:${url.port}/api/v1/rpc`;

    let data = null;
    try
    {
        const res = await fetch(urlString, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(command)
        });
        if (!res.ok) throw new Error(await res.json());
        data = await res.json();
    }
    catch (e) 
    { console.error(e); }
    return data;
}

async function refreshSources() {
    const response = await sendCommand({ type: 'get-sources' }, false);
    console.log(response);
    if (response?.success)
    { availableSources = response.data.sources || []; }
    renderSources();
}

function renderSources() {
    const sourceSelectorEl = document.getElementById('source_selection');
    if (!sourceSelectorEl)
    { return; }

    sourceSelectorEl.innerHTML = '';

    const noSourceOpt = document.createElement('option');
    noSourceOpt.value = 'none';
    noSourceOpt.textContent = 'Clear Source';
    sourceSelectorEl.appendChild(noSourceOpt);

    if (availableSources.length >= 1)
    {
        availableSources.forEach((source) => {
            if (!source.name)
            { return; }

            const sourceOpt = document.createElement('option');
            sourceOpt.value = source.name;
            sourceOpt.dataset.url = source.url || '';
            sourceOpt.textContent = source.name;
            sourceSelectorEl.appendChild(sourceOpt);
        });
    }
    const currentSourceEl = document.getElementById('ndpi_status_ndi_source_target');

    if (currentSourceEl)
    { sourceSelectorEl.value = currentSourceEl.value || 'none'; }
}