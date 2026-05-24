/**
 * NDPi LCD Display Monitor - index.js Integration Example
 * 
 * This shows how to spawn the LCD monitor process and pipe data from
 * client_fs.js fs.watch events to it via stdin.
 * 
 * Location: Client__v3_1_0/index.js (add this code to your startup)
 */

const { spawn } = require('child_process');
const path = require('path');

/**
 * Initialize and spawn the LCD Monitor process
 * Call this after fileMonitor (client_fs.js) is created
 */
function initLcdMonitor(fileMonitor) {
    console.log('[ index ] Spawning LCD monitor process...');
    
    const lcdBinary = path.join(__dirname, 'lcd_display/build/lcd-monitor');
    const lcdCwd = path.join(__dirname, 'lcd_display');
    
    // Spawn LCD process with stdin pipe
    const lcdProcess = spawn(lcdBinary, [], {
        stdio: ['pipe', 'inherit', 'inherit'],  // stdin=pipe, stdout/stderr=inherit
        detached: false,
        cwd: lcdCwd
    });
    
    lcdProcess.on('error', (err) => {
        console.error('[ index ] LCD monitor spawn error:', err);
    });
    
    lcdProcess.on('exit', (code, signal) => {
        console.warn(`[ index ] LCD monitor exited with code ${code}, signal ${signal}`);
    });
    
    // Map of fileMonitor events to LCD process stdin
    const fieldMappings = {
        'device_name': 'device_name',
        'device_ip': 'device_ip',
        'ndpi_status_ndi': 'ndpi_status_ndi',
        'ndpi_status_ndi_source_resolution': 'ndpi_status_ndi_source_resolution',
        'output_display_resolution_current': 'output_display_resolution_current'
    };
    
    // Listen to fs.watch events and pipe to LCD
    Object.entries(fieldMappings).forEach(([fsField, lcdField]) => {
        fileMonitor.on(fsField, (value) => {
            try {
                const msg = JSON.stringify({ [lcdField]: value }) + '\n';
                lcdProcess.stdin.write(msg, (err) => {
                    if (err && err.code !== 'EPIPE') {
                        console.error(`[ index ] LCD stdin write error for ${fsField}:`, err);
                    }
                });
            } catch (err) {
                console.error(`[ index ] Error sending ${fsField} to LCD:`, err);
            }
        });
    });
    
    // Graceful shutdown
    process.on('exit', () => {
        if (lcdProcess && !lcdProcess.killed) {
            console.log('[ index ] Closing LCD monitor process...');
            lcdProcess.kill('SIGTERM');
        }
    });
    
    process.on('SIGINT', () => {
        if (lcdProcess && !lcdProcess.killed) {
            lcdProcess.kill('SIGTERM');
        }
        process.exit(0);
    });
    
    return lcdProcess;
}

// ============================================================================
// USAGE EXAMPLE - Add this to your index.js startup sequence:
// ============================================================================

/*

const FileSystemMonitor = require('./service/client_fs.js');

// ... existing initialization ...

// Create file system monitor
const fileMonitor = new FileSystemMonitor(version, versionDate);

// Listen for ready signal
fileMonitor.on('ready', () => {
    console.log('[ main ] File system monitor ready');
    
    // Initialize LCD monitor AFTER fileMonitor is ready
    const lcdProcess = initLcdMonitor(fileMonitor);
    
    // Continue with rest of startup...
    // startWebSocketServer();
    // startApiServer();
    // etc.
});

// Export for use in other modules if needed
module.exports = { initLcdMonitor };

*/

/**
 * QUICK START CHECKLIST:
 * 
 * 1. [ ] Build LCD binary on Raspberry Pi:
 *        cd lcd_display && make clean && make
 * 
 * 2. [ ] Verify binary exists:
 *        ls -lh lcd_display/build/lcd-monitor
 * 
 * 3. [ ] Copy the initLcdMonitor function above into your index.js
 * 
 * 4. [ ] After creating fileMonitor, call initLcdMonitor(fileMonitor)
 * 
 * 5. [ ] Start NDPi client and verify LCD displays data
 * 
 * TROUBLESHOOTING:
 * 
 * - LCD process fails to start?
 *   → Check that build/lcd-monitor binary exists and has execute permissions
 *   → Run manually: sudo ./lcd_display/build/lcd-monitor
 * 
 * - Data not updating?
 *   → Check Node.js console logs for errors writing to LCD stdin
 *   → Verify JSON format: echo '{"device_name":"Test"}' | nc localhost 0
 * 
 * - Display shows garbage?
 *   → Check GPIO/SPI is initialized (may need sudo)
 *   → Verify correct LCD size header in lcd_monitor.cpp
 */
