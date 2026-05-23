# Deployment Manifest - NDPi LCD Display Monitor

## What to Deploy

Complete list of files and directories required to deploy the LCD Display Monitor as part of the NDPi Monitor Client v3.1.0.

---

## Directory Structure (After Build)

```
Client__v3_1_0/
├── lcd_display/                          # ← NEW: LCD display module
│   ├── src/
│   │   └── lcd_monitor.cpp              # Application source
│   ├── lib/
│   │   ├── Config/
│   │   │   ├── DEV_Config.c             # GPIO/SPI abstraction
│   │   │   ├── DEV_Config.h
│   │   │   └── Debug.h
│   │   ├── LCD/                         # Display drivers (all sizes)
│   │   │   ├── LCD_*.c/h                # 10+ driver variants
│   │   │   └── ...
│   │   ├── GUI/                         # Graphics library
│   │   │   ├── GUI_Paint.c/h
│   │   │   └── GUI_BMP.c/h
│   │   └── Fonts/                       # Font bitmaps
│   │       ├── font*.c/h                # Multiple size variants
│   │       └── fonts.h
│   ├── build/
│   │   └── lcd-monitor                  # ← COMPILED BINARY (executable)
│   ├── assets/                          # Symlink to ../assets/
│   ├── Makefile                         # Build configuration
│   ├── README.md                        # Setup & customization guide
│   └── INTEGRATION.md                   # index.js integration example
│
├── service/
│   ├── client_fs.js                     # ← UPDATED: fs.watch emitter
│   └── ... (other services)
│
├── index.js                             # ← UPDATED: LCD spawn integration
│
└── ... (existing structure)
```

---

## Files to Include in Deployment Package

### Essential (Required)

1. **Compiled binary:**
   - `lcd_display/build/lcd-monitor` – executable (~2–3 MB)
   - Must be executable (`chmod +x`)

2. **Libraries:** (included in `lcd_display/lib/`)
   - All `.c` and `.h` files (needed if rebuilding on target system)
   - Subdirectories: `Config/`, `LCD/`, `GUI/`, `Fonts/`

3. **Configuration:**
   - `lcd_display/Makefile` – for rebuilding if needed
   - `lcd_display/src/lcd_monitor.cpp` – source code

### Documentation (Recommended)

1. `lcd_display/README.md` – Build, integration, and customization guide
2. `lcd_display/INTEGRATION.md` – Code integration example for index.js

---

## Binary Deployment Checklist

### Pre-Deployment (On Build Machine - Raspberry Pi)

- [ ] Clone/update project on Raspberry Pi
- [ ] Install dependencies: `sudo apt install libgpio-dev build-essential`
- [ ] Build LCD monitor: `cd lcd_display && make clean && make`
- [ ] Verify binary: `ls -lh lcd_display/build/lcd-monitor`
- [ ] Test binary manually: `sudo ./lcd_display/build/lcd-monitor`

### Deployment Package Contents

```bash
# Include these in deployment:
lcd_display/build/lcd-monitor              # Executable binary ← PRIMARY
lcd_display/lib/                           # Source libraries (optional but recommended)
lcd_display/src/lcd_monitor.cpp            # Source code (recommended)
lcd_display/Makefile                       # Build config (for reference/rebuilding)
lcd_display/README.md                      # Documentation
lcd_display/INTEGRATION.md                 # Integration guide
```

### Post-Deployment (On Target Device)

1. **Verify binary is executable:**
   ```bash
   chmod +x /path/to/Client__v3_1_0/lcd_display/build/lcd-monitor
   ```

2. **Verify dependencies are installed:**
   ```bash
   ldconfig -p | grep lgpio
   ldconfig -p | grep libc.so
   ```

3. **Test hardware:**
   ```bash
   sudo /path/to/lcd_display/build/lcd-monitor
   # Should print initialization messages and accept stdin
   ```

4. **Integrate into index.js** (code provided in INTEGRATION.md)

---

## Version Control & Updates

### git Configuration

Add to `.gitignore` (binary is OS-specific, rebuild on each deploy):

```
lcd_display/build/
lcd_display/.gitignore
```

**Recommendation:** Keep source files in git, rebuild binaries per target system.

### Rebuild on New Target

If deploying to a different Raspberry Pi or architecture:

```bash
cd /path/to/Client__v3_1_0/lcd_display
make clean && make
```

---

## Integration Points

### 1. index.js (Node.js startup)

**Required changes:**
- Import and call `initLcdMonitor(fileMonitor)` after FileSystemMonitor is ready
- See [INTEGRATION.md](INTEGRATION.md) for code example

### 2. client_fs.js (Already compatible)

**Status:** ✅ No changes needed
- FileSystemMonitor emits fs.watch events
- Events are piped to LCD stdin automatically via index.js

### 3. Deployment scripts

**If using automated deployment (e.g., `git-hub-deploy-client.sh`):**

- Ensure `lcd_display/build/lcd-monitor` is copied to target
- Ensure binary has execute permissions
- Optionally rebuild if needed for target hardware

### 4. Documentation

**Update VERSION-NOTES.md:**

```markdown
## v3.1.0 (2026-05-22)

### New Features
- **LCD Display Support:** Added Waveshare 1.69" LCD monitor module
  - Real-time display of device status (name, IP, NDI status, resolutions)
  - Integrates with fs.watch events from client_fs.js
  - Spawned from index.js, data piped via stdin
  - See `lcd_display/README.md` for setup and customization

### Build & Deploy
- Compile on Raspberry Pi: `cd lcd_display && make clean && make`
- Integrate: See `lcd_display/INTEGRATION.md` for index.js code example
- Requires: `libgpio-dev` for GPIO/SPI support
```

---

## System Requirements

### Hardware

- **Raspberry Pi** (3B+, 4, 5, or similar)
- **Waveshare 1.69" LCD Display** (ST7789V2 controller, SPI interface)
- **SPI0 enabled** in Raspberry Pi configuration
- **GPIO access** (root/sudo privileges for display initialization)

### Software

- **Operating System:** Raspberry Pi OS (Debian-based)
- **Libraries:**
  - `libgpio-dev` – GPIO/SPI library (modern, recommended)
  - `libc6`, `libstdc++6` – Standard C/C++ runtime
  - `build-essential` – gcc/g++ (only if rebuilding)
- **Node.js:** v12+ (for parent index.js process)

### GPIO Pins (Wiring)

| Pin | Signal | GPIO | Function |
|-----|--------|------|----------|
| SPI0_MOSI | DIN | GPIO 10 | Data input |
| SPI0_SCK | CLK | GPIO 11 | Clock |
| SPI0_CE0 | CS | GPIO 8 | Chip select |
| GPIO 25 | DC | 25 | Data/Command |
| GPIO 27 | RST | 27 | Reset |
| GPIO 18 | BL | 18 | Backlight PWM |

---

## Troubleshooting Deployment

### Binary won't start

```bash
# Check file exists and is executable
ls -lh lcd_display/build/lcd-monitor

# Run with output
./lcd_display/build/lcd-monitor 2>&1 | head -20

# Expected output:
# [ LCD Monitor ] NDPi LCD Display Monitor v1.0
# [ LCD Monitor ] Listening on stdin for data updates...
# [ DEV_Config ] Module initialized (MOCK)
# [ LCD Monitor ] Display initialized successfully
```

### Library dependency missing

```bash
# Check library links
ldd ./lcd_display/build/lcd-monitor

# Install missing libraries
sudo apt-get install libgpio-dev
```

### GPIO/SPI errors at runtime

```bash
# Verify GPIO/SPI is enabled
ls /dev/spidev*

# Try with sudo
sudo ./lcd_display/build/lcd-monitor
```

### Data not updating

- Verify Node.js process is writing to LCD stdin
- Check JSON format is valid (newline-delimited)
- Look for encoding issues (UTF-8)

---

## Deployment Verification Checklist

- [ ] Binary exists: `ls -lh lcd_display/build/lcd-monitor`
- [ ] Binary is executable: `test -x lcd_display/build/lcd-monitor && echo OK`
- [ ] Dependencies installed: `ldconfig -p | grep -E "lgpio|libc"`
- [ ] SPI enabled on Raspberry Pi: `ls -la /dev/spidev0.0`
- [ ] GPIO accessible: `sudo gpio -g read 25` (GPIO 25 = DC pin)
- [ ] LCD hardware connected and powered
- [ ] Backlight PWM available: GPIO 18
- [ ] index.js integration code added
- [ ] Node.js process starts without errors
- [ ] LCD displays initial state (device name, status)
- [ ] Data updates appear on LCD when client_fs.js data changes

---

## Rollback Plan

If LCD display module causes issues:

1. **Disable in index.js:** Comment out `initLcdMonitor(fileMonitor)` call
2. **Remove binary:** `rm lcd_display/build/lcd-monitor`
3. **Keep source:** Source code can remain for future debugging
4. **Restart service:** Service functions normally without LCD output

---

## Future Enhancements

1. **Display rotation/sizing:** Support other Waveshare LCD sizes
2. **Image assets:** Display custom logos/images from `/assets/`
3. **Touch input:** Add button/touch handling via GPIO
4. **Network stats:** Display bandwidth, CPU, memory usage
5. **Animation effects:** Smooth transitions, color gradients

---

**Last Updated:** 2026-05-22  
**Status:** Ready for Production Deployment
