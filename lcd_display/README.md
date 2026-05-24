# NDPi LCD Display Monitor - Integration Guide

## Overview

The LCD Display Monitor is a C++ daemon that displays real-time NDPi client status on a Waveshare 1.69" LCD display (240×280, ST7789V2 controller). It communicates with the Node.js `client_fs.js` module via stdin, receiving JSON-formatted data updates triggered by file system watch events.

**Target Hardware:** Raspberry Pi with Waveshare 1.69" LCD Display Module (SPI interface)

---

## Project Structure

```
lcd_display/
├── src/
│   └── lcd_monitor.cpp           # Main application (stdin listener, rendering engine)
├── lib/
│   ├── Config/                   # Hardware abstraction (GPIO, SPI, PWM)
│   │   ├── DEV_Config.c/h
│   │   └── Debug.h
│   ├── LCD/                      # Display drivers for all Waveshare LCD sizes
│   │   ├── LCD_0in96.c/h
│   │   ├── LCD_1in3.c/h
│   │   ├── LCD_1in54.c/h
│   │   ├── LCD_1in69.c/h         # ← Currently used (240×280)
│   │   ├── LCD_2inch4.c/h
│   │   └── ... (other sizes)
│   ├── GUI/                      # Graphics primitives
│   │   ├── GUI_Paint.c/h         # Drawing functions, text, framebuffer
│   │   └── GUI_BMP.c/h           # BMP image handling
│   └── Fonts/                    # Font bitmaps (sizes 8px–50px + Chinese variants)
│       ├── font8.c/h, font12.c/h, font16.c/h, font20.c/h, font24.c/h, etc.
│       └── fonts.h
├── build/                        # Generated object files and binary (created by make)
├── assets/                       # Symlink to ../assets/ for image resources
├── Makefile                      # Build configuration
└── README.md                     # This file

```

---

## Building the Project

### Prerequisites (Raspberry Pi)

1. **GPIO library:** Install libbcm2835 (most reliably available)
   ```bash
   sudo apt-get install libbcm2835-dev
   ```
   
   **Alternative options:**
   
   - **WiringPi** (if available in your repos):
     ```bash
     sudo apt-get install wiringpi
     # Then edit Makefile: USELIB = USE_WIRINGPI_LIB
     ```
   
   - **lgpio** (modern, requires building from source):
     ```bash
     # See: https://github.com/joan2937/lg
     # Then edit Makefile: USELIB = USE_DEV_LIB
     ```

2. **Build tools:**
   ```bash
   sudo apt-get install build-essential
   ```

### Compilation

From the project root directory:

```bash
cd /path/to/Client__v3_1_0/lcd_display

# Clean and build
make clean
make

# Run help to see options
make help
```

**Output:**
- Binary: `build/lcd-monitor` (~2–3 MB)
- Build artifacts: `build/*.o` (object files)

### Switching Display Sizes

To use a different LCD size, edit `src/lcd_monitor.cpp` and change the header includes and initialization:

```cpp
// Change this line (example: LCD_1in3 for 1.3" display):
#include "LCD_1in3.h"

// And in display_init():
LCD_1IN3_Init(VERTICAL);
LCD_1IN3_Clear(COLOR_BG);
// ... adjust LCD_1IN3_HEIGHT, LCD_1IN3_WIDTH constants
```

Then rebuild: `make clean && make`

---

## Integration with Node.js (index.js)

### Overview

The LCD Monitor runs as a child process spawned from `index.js`. It listens on stdin for JSON messages from the `client_fs.js` fs.watch event emitter. When data changes, the message is piped to the LCD process, which parses and renders the display immediately.

### Implementation Pattern

In `Client__v3_1_0/index.js`:

```javascript
const { spawn } = require('child_process');
const path = require('path');

// Spawn LCD monitor process at startup
const lcdMonitor = spawn(
    path.join(__dirname, 'lcd_display/build/lcd-monitor'),
    [],
    {
        stdio: ['pipe', 'inherit', 'inherit'],  // pipe stdin, inherit stdout/stderr
        detached: false,  // kill LCD when parent dies
        cwd: path.join(__dirname, 'lcd_display')
    }
);

// From your FileSystemMonitor instance (fileMonitor from client_fs.js):
// Pipe updated fields to LCD process

const lcd_fields = [
    'device_name',
    'device_ip',
    'ndpi_status_ndi',
    'ndpi_status_ndi_source_resolution',
    'output_display_resolution_current'
];

// Listen to fs.watch events and forward to LCD
fileMonitor.on('device_name', (value) => {
    lcdMonitor.stdin.write(JSON.stringify({ device_name: value }) + '\n');
});

fileMonitor.on('device_ip', (value) => {
    lcdMonitor.stdin.write(JSON.stringify({ device_ip: value }) + '\n');
});

fileMonitor.on('ndpi_status_ndi', (value) => {
    lcdMonitor.stdin.write(JSON.stringify({ ndpi_status_ndi: value }) + '\n');
});

fileMonitor.on('ndpi_status_ndi_source_resolution', (value) => {
    lcdMonitor.stdin.write(JSON.stringify({ 
        ndpi_status_ndi_source_resolution: value 
    }) + '\n');
});

fileMonitor.on('output_display_resolution_current', (value) => {
    lcdMonitor.stdin.write(JSON.stringify({ 
        output_display_resolution_current: value 
    }) + '\n');
});

// Graceful shutdown
process.on('exit', () => {
    if (lcdMonitor && !lcdMonitor.killed) {
        lcdMonitor.kill('SIGTERM');
    }
});
```

### stdin Message Format

The LCD Monitor expects **newline-delimited JSON**, one field per message:

```json
{"device_name":"NDPi Client"}
{"device_ip":"192.168.1.100"}
{"ndpi_status_ndi":"receiving"}
{"ndpi_status_ndi_source_resolution":"1920x1080"}
{"output_display_resolution_current":"1920x1080"}
```

Each message can contain one or more fields. Unknown fields are ignored.

---

## Display Layout & Customization

### Current Layout

The 240×280 display is divided into sections:

```
┌─────────────────────────┐
│ Device:                 │ (header, blue)
│ NDPi Client             │ (current device name)
├─────────────────────────┤
│ NDI:                    │ (status, color-coded)
│ idle/receiving/error    │ (green/yellow/red)
├─────────────────────────┤
│ IP:                     │ (header)
│ 192.168.1.100           │ (device IP)
├─────────────────────────┤
│ NDI Res:                │ (header)
│ 1920x1080@60            │ (NDI source resolution)
├─────────────────────────┤
│ Out Res:                │ (header)
│ 1920x1080               │ (output resolution)
├─────────────────────────┤
│ Last: 234ms ago         │ (footer, status timestamp)
└─────────────────────────┘
```

### Customizing Layout & Colors

Edit `src/lcd_monitor.cpp`:

**Color definitions** (lines ~40–50):
```cpp
#define COLOR_BG       WHITE        // Background
#define COLOR_TEXT     BLACK        // Text color
#define COLOR_HEADER   0x001F       // Blue (RGB565)
#define COLOR_NDI_OK   0x07E0       // Green
#define COLOR_NDI_IDLE 0xFFC0       // Yellow
#define COLOR_NDI_ERR  0xF800       // Red
```

RGB565 color reference:
- `0xFFFF` – White
- `0x0000` – Black
- `0xF800` – Red
- `0x07E0` – Green
- `0x001F` – Blue
- `0xFFE0` – Yellow
- `0xF81F` – Magenta
- `0x07FF` – Cyan

**Font selection** (available: Font8, Font12, Font16, Font20, Font24, Font48, Font50):
```cpp
Paint_DrawString_EN(x, y, "text", &Font16, foreground_color, background_color);
```

**Layout modifications** (function `render_display()`, lines ~200+):
- Adjust `y_pos` to change vertical spacing
- Modify `MARGIN_LEFT`, `MARGIN_TOP` constants
- Change line heights and section ordering

### Adding Image Support

To display custom images (BMP format):

```cpp
// Load and display an image from assets
uint8_t *image_buffer = (uint8_t *)malloc(image_size);
// Load BMP file into buffer
GUI_ReadBmp(image_path, image_buffer);
// Draw to framebuffer at position (x, y, width, height)
LCD_1IN69_Display(image_buffer);
```

For PNG/JPG support, add `libpng` or `libjpeg` libraries to the Makefile:
```makefile
LIB = -llgpio -lpng -lm   # Add -lpng for PNG support
```

---

## Deployment Checklist

### 1. Build & Verify

- [ ] Compile on target Raspberry Pi: `make clean && make`
- [ ] Check binary exists: `ls -lh build/lcd-monitor`
- [ ] Binary size ~2–3 MB
- [ ] No compile errors (warnings OK)

### 2. Hardware Check

- [ ] LCD display connected via SPI0 (pins: MOSI/SCLK/CS/DC/RST/BL)
- [ ] GPIO accessible (run with `sudo` initially)
- [ ] Backlight PWM available (GPIO 18)

### 3. Test Standalone

Run the LCD daemon manually to verify hardware:

```bash
cd /path/to/lcd_display

# Test display initialization (watch for boot messages)
sudo ./build/lcd-monitor

# In another terminal, send test data via stdin:
echo '{"device_name":"Test Device"}' | sudo ./build/lcd-monitor
```

Expected output (on LCD):
- Display clears and shows initialized state
- Device name appears in header
- "Last: XXms ago" updates in footer

### 4. Integration Test

- [ ] Integrate LCD spawn into `index.js`
- [ ] Start NDPi client: `npm start` or equivalent
- [ ] Monitor LCD updates as data changes
- [ ] Verify data fields render correctly
- [ ] Check console logs in Node.js process

### 5. Deployment

- [ ] Add entry to VERSION-NOTES.md documenting LCD integration
- [ ] Update deployment script if needed (`git-hub-deploy-client.sh`)
- [ ] Verify LCD binary is included in deployment package
- [ ] Test restart/recovery (process death handling)

---

## Data Fields Reference

| Field | Source (client_fs.js) | Example | Purpose |
|-------|:---:|---|---|
| `device_name` | User-configurable | "NDPi Client" | Display name |
| `device_ip` | Auto-detected | "192.168.1.100" | Local IP address |
| `ndpi_status_ndi` | NDI receiver status | "idle", "receiving", "error" | Connection status (color-coded) |
| `ndpi_status_ndi_source_resolution` | NDI source metadata | "1920x1080" | Input resolution |
| `output_display_resolution_current` | Display manager | "1920x1080" | Output resolution |

See [client_fs.js](../service/client_fs.js) for data structure definitions.

---

## Troubleshooting

### Issue: Build fails with "lgpio.h not found"

**Solution:** Install the lgpio development library:
```bash
sudo apt-get install libgpio-dev
```

If unavailable for your OS, use alternative GPIO library:
```makefile
USELIB = USE_WIRINGPI_LIB  # or USE_BCM2835_LIB
```

### Issue: Display shows nothing or random pixels

**Possible causes:**
1. Incorrect display size header included (check `LCD_1in69.h` vs others)
2. GPIO pins incorrect (verify SPI/DC/RST/BL pin mappings in `DEV_Config.h`)
3. SPI not enabled on Raspberry Pi (`sudo raspi-config` → Interface Options → SPI)

### Issue: Process exits immediately

**Check logs:**
```bash
sudo ./build/lcd-monitor 2>&1 | head -20
```

Look for:
- GPIO initialization failures
- SPI device errors
- Memory allocation failures

### Issue: Data doesn't update on display

**Debug stdin communication:**
```bash
# In one terminal:
sudo ./build/lcd-monitor

# In another, pipe test data:
echo '{"device_name":"Test"}' | nc localhost 0  # or pipe directly
```

Verify:
- Node.js process is writing to LCD stdin
- JSON format is valid (one line per message)
- No encoding issues (UTF-8)

---

## Modifications & Extensions

### Change Display Size

1. Edit `src/lcd_monitor.cpp`:
   - Replace `#include "LCD_1in69.h"` with desired size
   - Update `LCD_1IN69_*` constants to match (e.g., `LCD_2IN4_HEIGHT`, `LCD_1IN3_WIDTH`)

2. Rebuild: `make clean && make`

### Add More Data Fields

1. In `src/lcd_monitor.cpp`, add to `extract_json_string()` calls in `parse_json_message()`:
   ```cpp
   if (extract_json_string(message, "new_field", temp, sizeof(temp))) {
       strncpy(g_display_data.new_field, temp, sizeof(g_display_data.new_field) - 1);
       updated = 1;
   }
   ```

2. Add field to `DisplayData` struct (line ~65)

3. Render in `render_display()` function

### Change Refresh Rate

Edit debounce interval:
```cpp
#define UPDATE_DEBOUNCE_MS 500  // Minimum ms between renders (line ~40)
```

Lower = more responsive, higher = less flicker/SPI traffic.

---

## Performance Notes

- **Memory footprint:** ~10–15 MB (framebuffer + libraries)
- **CPU usage:** <5% idle, <10% during updates (depends on rendering complexity)
- **Update latency:** 50–200 ms from stdin message to display (SPI transfer ~100 ms for 240×280×16-bit)
- **SPI speed:** Configured by kernel/lgpio driver (typically 5–10 MHz for reliability)

---

## License & Attribution

- **Waveshare Libraries:** Provided by Waveshare under their open-source license
- **Application Code:** NDPi Monitor Client v3.1.0
- **Dependencies:** lgpio, standard C/C++ runtime

---

## Support & Development

For issues, customizations, or further development:

1. Check the [Waveshare LCD Documentation](http://www.waveshare.com) for hardware details
2. Review vendor example code in `/tmp/LCD/LCD/c/examples/`
3. Consult [client_fs.js](../service/client_fs.js) for available data fields
4. Modify colors/layout in [src/lcd_monitor.cpp](src/lcd_monitor.cpp)

---

**Last Updated:** 2026-05-22  
**Version:** 1.0 (Initial Release)
