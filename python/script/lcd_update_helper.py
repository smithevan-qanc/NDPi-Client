#!/usr/bin/python
# -*- coding: UTF-8 -*-
"""
Simple helper to update display data files and refresh display
Can be called from Node.js or any other source
"""

import os
import sys
import subprocess
import argparse
import logging

logging.basicConfig(level=logging.INFO)

# Directory where data files are stored
DATA_DIR = "/home/ndpi-client/ndpi/tmp"

# Path to the main display script
DISPLAY_SCRIPT = os.path.join(os.path.dirname(__file__), "ndpi_lcd_display.py")


def update_data_file(key, value):
    """
    Write value to data file
    """
    filename_map = {
        'device_name': 'device_name.txt',
        'device_ip': 'device_ip.txt',
        'ndi_status': 'ndi_status.txt',
        'ndi_resolution': 'ndi_resolution.txt',
        'output_resolution': 'output_resolution.txt'
    }
    
    if key not in filename_map:
        logging.error(f"Unknown key: {key}")
        return False
    
    filepath = os.path.join(DATA_DIR, filename_map[key])
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(filepath, 'w') as f:
            f.write(str(value))
        logging.info(f"Updated {key}: {value}")
        return True
    except Exception as e:
        logging.error(f"Failed to write {filepath}: {e}")
        return False


def refresh_display():
    """
    Call the main display script to refresh the LCD
    """
    try:
        result = subprocess.run(['sudo', 'python3', DISPLAY_SCRIPT], 
                              capture_output=True, 
                              text=True, 
                              timeout=5)
        if result.returncode == 0:
            logging.info("Display refreshed successfully")
            return True
        else:
            logging.error(f"Display script failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        logging.error("Display script timed out")
        return False
    except Exception as e:
        logging.error(f"Failed to run display script: {e}")
        return False


def update_and_refresh(**kwargs):
    """
    Update multiple data files and refresh display
    Usage: update_and_refresh(device_name="NDPi", device_ip="192.168.1.100", ndi_status="receiving")
    """
    for key, value in kwargs.items():
        update_data_file(key, value)
    return refresh_display()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update NDPi LCD display data")
    parser.add_argument('--device-name', help='Device name')
    parser.add_argument('--device-ip', help='Device IP address')
    parser.add_argument('--ndi-status', help='NDI status')
    parser.add_argument('--ndi-resolution', help='NDI resolution')
    parser.add_argument('--output-resolution', help='Output resolution')
    parser.add_argument('--refresh', action='store_true', help='Refresh display after updates')
    
    args = parser.parse_args()
    
    # Update files based on arguments
    updates = {}
    if args.device_name:
        updates['device_name'] = args.device_name
    if args.device_ip:
        updates['device_ip'] = args.device_ip
    if args.ndi_status:
        updates['ndi_status'] = args.ndi_status
    if args.ndi_resolution:
        updates['ndi_resolution'] = args.ndi_resolution
    if args.output_resolution:
        updates['output_resolution'] = args.output_resolution
    
    # Update data files
    for key, value in updates.items():
        update_data_file(key, value)
    
    # Refresh display if requested or if updates were made
    if args.refresh or updates:
        refresh_display()
