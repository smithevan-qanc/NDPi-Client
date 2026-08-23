# Client — Startup Process Tree

Traces exactly what happens from process launch (`node index.js`) through
the Client device reaching steady state — connecting NDI/AirPlay input,
CEC, its own local kiosk display, and its Hub-facing sockets. Built by
reading the actual source (not inferred) — see file:line references
throughout.

## Visualization

```mermaid
flowchart TD
    A["node index.js"] --> B["new NDPi() → initiate()<br/>index.js:36,40"]
    B --> C["exec('./sh/startup')<br/>index.js:42<br/>banner + xdotool mousemove ×2 (nudges X11 awake)"]
    C -->|"on 'exit'"| D["startFsData()<br/>index.js:51,60"]

    D --> E["new ClientFsData(version, versionDate)<br/>client_fs.js:42<br/>service/client_fs.js"]
    E --> F["init() (process.nextTick)"]
    F --> F1["mkdir DATA_NDPI_PATH if missing"]
    F1 --> F2["Resolve device_id<br/>Linux: /sys/.../serial-number → /etc/machine-id<br/>macOS fallback: ioreg IOPlatformSerialNumber"]
    F2 --> F3["Build fileMap: dozens of per-key settings<br/>read existing flat file under DATA_NDPI_PATH, else<br/>write the default (CEC, NDI receiver tuning,<br/>device_volume, overlay image, chromium/NDI PIDs,<br/>local_api_allowed_origins, ...)"]
    F3 --> F3a{"key in sendToLCD list?"}
    F3a -->|yes| F3b["also write value to python/script/&lt;key&gt;<br/>(feeds the LCD display script directly)"]
    F3a -->|no| F4
    F3b --> F4["start()<br/>client_fs.js:678"]
    F4 --> G1["startWatcher() — fs.watch(dataDir)"]
    F4 --> G2["startDrmMonitor() — udevadm monitor"]
    F4 --> G3["pollUpdate() — periodic update-check + updateOutputDisplayFiles()"]
    F4 --> G4["emit('ready')"]
    F4 -.await.-> G5["waitForNetwork() → pollIp() — 1s interval"]

    G4 -->|"NDPi.settings.on('ready')"| H["index.js:64-71"]
    H --> H1["targetSource = get('ndpi_status_ndi_source_target')"]
    H --> H2["func.setDisplayResolution()"]
    H --> H3["startAirPlay()<br/>index.js:67,153"]
    H --> H4["startLcdDisplay()<br/>index.js:68,228"]
    H --> H5["startMdns()<br/>index.js:69,320"]
    H --> H6["startApi()<br/>index.js:70,281"]

    H3 --> I1["spawn('uxplay', [-n name, -nh, -fs, -hls,<br/>-fps 60, -d, ...pin])<br/>client_chromium unrelated — separate AirPlay receiver<br/>on spawn: settings.put('pid_air_play_player', pid)<br/>stdout 'X11 Windows:' →<br/>activateWindow_AirPlay() + fadeVolume(in)"]

    H4 --> I2["spawn('python', ['lcdDisplayUpdate.py'])<br/>self-restarts every 60 min via lcdDisplayRestartTimer"]

    H5 --> I3["new NDPiBonjourService(settings)<br/>client_bonjour.js:4<br/>reads device_ip/device_id/bonjourPort/deviceName/<br/>commandPort/deviceType/programVersion from settings"]
    I3 --> I3a["_tryPublish()<br/>bonjour.publish() once all required fields are set<br/>(gated on deviceId — see Hub's ProcessTree.md note<br/>on the mDNS TXT-decoding bug this feeds)"]
    I3 --> I3b["republishInterval — re-publish every 60s"]

    H6 --> J["new ClientApiServer(settings)<br/>client_api_server.js:16"]
    J --> K["start()<br/>client_api_server.js:68"]
    K --> K1["express() + CORS(local_api_allowed_origins) +<br/>static mounts (/script, /assets)"]
    K --> K2["Register 4 WebSocket server groups (noServer)"]
    K2 --> K2a["__ws_Display() → /ws/display<br/>(overlay/idle display page's own socket)"]
    K2 --> K2b["__ws_System() → /ws/system<br/>(full settings fileMap, push on connect + on any change)"]
    K2 --> K2c["__ws_Stats() → /ws/stats<br/>(raw os.* stats, pushed every ~1s via statsSendInterval)"]
    K2 --> K2d["__ws_Sources() → /ws/sources<br/>(on first connection: startDiscovery() spawns<br/>./ndpi_discover if not already running)"]
    K --> K3["__Routers()<br/>/api/v1/rpc, /api/v1/adopt, /api/v1/__internal/:path,<br/>/display/idle"]
    K --> L["startServer()"]
    L --> L1["http.createServer(App).listen(PORT_API, '0.0.0.0')<br/>default 3080"]
    L1 -->|"listen callback"| L2["emit('online') (process.nextTick)"]
    L1 --> L3["Server.on('upgrade', ...) routes to the 4 WS servers"]

    L2 -->|"server_api.on('online')"| M["index.js:284-293"]
    M --> M1["isInitialized = true"]
    M --> M2["openCecController()<br/>index.js:288,382"]
    M --> M3["startChromium()<br/>index.js:289,338"]

    M2 --> N1["new CecController(settings)<br/>client_cec.js:6<br/>spawn('cec-client', ['-o', deviceName, '-t','r','-d','4'])"]
    N1 -->|"on 'ready'"| N1a["server_api.controller_cec = this<br/>(unblocks the /api/v1/__internal cec route)"]
    N1a --> N1b["after 2s: send('as')<br/>(Active Source — claims the HDMI input)"]

    M3 --> N2{"/usr/bin/chromium exists?"}
    N2 -->|no| N2x["log + skip — no kiosk display launched"]
    N2 -->|yes| N3["func.launchPicom() (compositor)"]
    N3 --> N4["spawn('chromium', ['--kiosk', ...,<br/>'http://localhost:PORT/display/idle/'])<br/>on spawn: settings.put('pid_chromium', pid)"]
    N4 -->|"on 'ready' (500ms after spawn)"| N5["_afterChromiumStart()"]
    N5 --> N5a["fadeVolume(0)"]
    N5 --> N5b["raiseWindow_Chromium() + activateWindow_Chromium()<br/>(xdotool)"]
    N5 --> N5c{"targetSource !== 'none'?"}
    N5c -->|yes| N5d["after 5s: startNdiReceiver(targetSource)"]
    N5c -->|no| N5e["stay idle — /display/idle/ page shown"]

    O["Steady state — settings.on(key) live listeners<br/>index.js:74-132"]
    O --> O1["ndpi_status_ndi_source_target changed →<br/>startNdiReceiver(source)<br/>closes any existing receiver, spawns<br/>ClientNdiReceiver unless source == 'none'"]
    O --> O2["device_name changed → controller_cec.updateDeviceName()<br/>+ restartAirPlay()"]
    O --> O3["local_port_number_api changed →<br/>close chromium + API server, restart both after 1s"]
    O --> O4["output_display_port / _resolution_preference changed →<br/>func.setDisplayResolution()"]
    O --> O5["ndpi_airplay_server_pin changed → restartAirPlay()"]

    P["Signals"]
    P --> P1["SIGTERM / SIGINT → quitNDPi(signal)<br/>index.js:600-608<br/>_killNdiReceiver → clear intervals/timers →<br/>_closeCecController → _closeMdns →<br/>close wsConnection_ndpiServer (legacy field, unused —<br/>see note below) → _closeApi → _closeFsData"]
    P --> P2["uncaughtException → logged only, process stays up"]
    P --> P3["unhandledRejection → logged, exit(1)"]
```

## Notes on what's *not* pictured / caveats

- **`wsConnection_ndpiServer` / `client-status` push**: earlier versions
  of this Client pushed a `client-status` summary to the Hub over a
  persistent `/ws/client` connection (`clientServer_websocket.js`). That
  entire mechanism was **deleted** (see the Hub's `CLAUDE.md` for the
  full root-cause writeup — it had a `setInterval` leak that re-fired on
  every Hub-hostname/port reconnect). `quitNDPi()`'s shutdown sequence
  still references `index.wsConnection_ndpiServer.close()` — that field
  is never set to anything now, so this line always throws and is
  swallowed by the surrounding `try/catch`; effectively dead code kept
  from the pre-removal shutdown sequence.
- **How the Hub actually learns this device's live status now**: the Hub
  connects *outbound* to this Client's own `/ws/system` and `/ws/stats`
  (started above) — not the other way around — once it knows this
  device's IP/port, either from mDNS discovery or from the one-time
  `/api/v1/adopt` call a Hub makes when an admin adopts this device. That
  adopt call only writes `ndpi_hub_hostname`/`ndpi_hub_port` via
  `client_api_server.js`'s `/api/v1/adopt` route — informational
  bookkeeping only now, since nothing on this Client reads those two
  settings to open a connection anymore.
- **`ndpi_discover` binary**: ARM64 Linux binary; `startDiscovery()`
  spawns it lazily on the *first* `/ws/sources` WebSocket connection, not
  during process startup — not pictured under the main boot sequence for
  that reason, shown as part of `__ws_Sources()`'s connection handler
  instead.
- **NDI receiver (`startNdiReceiver`)**: only actually spawns a process
  when a non-`'none'` source is targeted — either from a previously
  persisted `ndpi_status_ndi_source_target` (fired 5s after Chromium's
  kiosk page loads) or from a later live setting change / Hub command.
  On a fresh device with no source ever selected, no NDI receiver process
  starts at all during boot.
