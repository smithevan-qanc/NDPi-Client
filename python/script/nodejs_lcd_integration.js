// Example Node.js integration for updating the LCD display
// Add this to your client_fs.js or index.js

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const SCRIPT_DIR = '/home/ndpi-client/ndpi/python/script';
const DATA_DIR = '/home/ndpi-client/ndpi/tmp';

/**
 * Update a single data file
 * @param {string} key - Data key (e.g., 'device_name', 'device_ip')
 * @param {string} value - Data value to write
 */
function updateDataFile(key, value) {
    const filename_map = {
        'device_name': 'device_name.txt',
        'device_ip': 'device_ip.txt',
        'ndi_status': 'ndi_status.txt',
        'ndi_resolution': 'ndi_resolution.txt',
        'output_resolution': 'output_resolution.txt'
    };
    
    const filename = filename_map[key];
    if (!filename) {
        console.error(`Unknown key: ${key}`);
        return false;
    }
    
    const filepath = path.join(DATA_DIR, filename);
    
    try {
        // Create directory if it doesn't exist
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        
        // Write value to file
        fs.writeFileSync(filepath, String(value), 'utf8');
        console.log(`[LCD] Updated ${key}: ${value}`);
        return true;
    } catch (err) {
        console.error(`[LCD] Failed to write ${filepath}:`, err);
        return false;
    }
}

/**
 * Refresh the LCD display by calling the Python script
 */
function refreshDisplay() {
    const scriptPath = path.join(SCRIPT_DIR, 'ndpi_lcd_display.py');
    
    return new Promise((resolve) => {
        const proc = spawn('sudo', ['python3', scriptPath], {
            cwd: SCRIPT_DIR,
            timeout: 5000
        });
        
        let output = '';
        let error = '';
        
        proc.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
            error += data.toString();
        });
        
        proc.on('close', (code) => {
            if (code === 0) {
                console.log('[LCD] Display refreshed successfully');
                resolve(true);
            } else {
                console.error(`[LCD] Display script failed with code ${code}:`, error);
                resolve(false);
            }
        });
        
        proc.on('error', (err) => {
            console.error('[LCD] Failed to run display script:', err);
            resolve(false);
        });
    });
}

/**
 * Update display with new data and refresh
 * @param {object} data - Object with keys: device_name, device_ip, ndi_status, etc.
 */
async function updateDisplay(data) {
    // Write all data to files
    for (const [key, value] of Object.entries(data)) {
        updateDataFile(key, value);
    }
    
    // Refresh display
    await refreshDisplay();
}

// ============================================================================
// Usage Examples
// ============================================================================

// Example 1: Update single field
// updateDataFile('device_ip', '192.168.1.100');
// refreshDisplay();

// Example 2: Update multiple fields at once
// updateDisplay({
//     device_name: 'NDPi Client',
//     device_ip: '192.168.1.100',
//     ndi_status: 'receiving',
//     ndi_resolution: '1920x1080',
//     output_resolution: '1280x720'
// });

// Example 3: Integration with file watching (from client_fs.js)
// Watch a data file and update display when it changes
/*
fs.watch('/path/to/data.json', async (eventType, filename) => {
    if (eventType === 'change') {
        try {
            const data = JSON.parse(fs.readFileSync('/path/to/data.json', 'utf8'));
            await updateDisplay({
                device_name: data.deviceName,
                device_ip: data.ipAddress,
                ndi_status: data.ndiStatus,
                ndi_resolution: data.sourceResolution,
                output_resolution: data.outputResolution
            });
        } catch (err) {
            console.error('Error processing data:', err);
        }
    }
});
*/

// Export functions for use in other modules
module.exports = {
    updateDataFile,
    refreshDisplay,
    updateDisplay
};
