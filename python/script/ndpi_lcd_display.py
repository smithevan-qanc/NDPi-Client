#!/usr/bin/python
# -*- coding: UTF-8 -*-
"""
NDPi LCD Display Monitor
Reads data from text files and displays on Waveshare 1.69" LCD
Call this script whenever you want to update the display
"""

import os
import sys
import logging
from pathlib import Path
import spidev as SPI
from PIL import Image, ImageDraw, ImageFont

# Add parent directory to path for imports
sys.path.append("..")
from lib import LCD_1inch69

# ============================================================================
# Configuration
# ============================================================================

# Raspberry Pi pin configuration
RST = 27
DC = 25
BL = 18
bus = 0
device = 0

# Configure logging
logging.basicConfig(level=logging.INFO)

# ============================================================================
# File Reading Functions
# ============================================================================

def read_file(file_path):
    """
    Read contents of a file and return as string
    Returns empty string if file doesn't exist
    """
    try:
        with open(file_path, 'r') as f:
            return f.read().strip()
    except FileNotFoundError:
        logging.warning(f"File not found: {file_path}")
        return "N/A"
    except Exception as e:
        logging.error(f"Error reading {file_path}: {e}")
        return "Error"


def read_config_from_txt(config_file):
    """
    Read configuration file with paths to data files
    Format (one per line):
        device_name_path=/path/to/device_name.txt
        device_ip_path=/path/to/device_ip.txt
        ndi_status_path=/path/to/ndi_status.txt
        etc.
    """
    config = {}
    try:
        with open(config_file, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):  # Skip comments and empty lines
                    continue
                if '=' in line:
                    key, value = line.split('=', 1)
                    config[key.strip()] = value.strip()
    except FileNotFoundError:
        logging.error(f"Config file not found: {config_file}")
    return config


def load_display_data(config):
    """
    Read all data files specified in config and return as dictionary
    """
    data = {
        'device_name': read_file(config.get('device_name_path', '')),
        'device_ip': read_file(config.get('device_ip_path', '')),
        'ndi_status': read_file(config.get('ndi_status_path', '')),
        'ndi_resolution': read_file(config.get('ndi_resolution_path', '')),
        'output_resolution': read_file(config.get('output_resolution_path', ''))
    }
    return data


def truncate_text(text, max_length=20):
    """
    Truncate text to fit on display
    """
    if len(text) > max_length:
        return text[:max_length-3] + "..."
    return text


# ============================================================================
# Display Functions
# ============================================================================

def get_status_color(status):
    """
    Return color based on NDI status
    """
    status = status.lower()
    if 'receiving' in status or 'connected' in status:
        return (0, 255, 0)  # Green
    elif 'idle' in status:
        return (255, 255, 0)  # Yellow
    else:
        return (255, 0, 0)  # Red


def render_display(disp, data):
    """
    Draw all data on the display
    """
    # Create blank image for drawing
    image = Image.new("RGB", (disp.width, disp.height), "BLACK")
    draw = ImageDraw.Draw(image)
    
    # Load fonts
    try:
        font_large = ImageFont.truetype("../Font/Font01.ttf", 20)
        font_normal = ImageFont.truetype("../Font/Font01.ttf", 16)
        font_small = ImageFont.truetype("../Font/Font01.ttf", 12)
    except Exception as e:
        logging.error(f"Font loading error: {e}")
        font_large = font_normal = font_small = ImageFont.load_default()
    
    # Starting Y position
    y = 5
    line_height = 18
    
    # Device Name
    draw.text((5, y), "Device:", fill=(100, 100, 255), font=font_small)  # Blue label
    y += 12
    device_name = truncate_text(data['device_name'], 18)
    draw.text((5, y), device_name, fill=(255, 255, 255), font=font_small)  # White value
    y += line_height
    
    # NDI Status
    draw.text((5, y), "NDI Status:", fill=(100, 100, 255), font=font_small)  # Blue label
    y += 12
    ndi_status = truncate_text(data['ndi_status'], 18)
    status_color = get_status_color(ndi_status)
    draw.text((5, y), ndi_status, fill=status_color, font=font_small)
    y += line_height
    
    # IP Address
    draw.text((5, y), "IP Address:", fill=(100, 100, 255), font=font_small)  # Blue label
    y += 12
    device_ip = truncate_text(data['device_ip'], 18)
    draw.text((5, y), device_ip, fill=(255, 255, 255), font=font_small)  # White value
    y += line_height
    
    # NDI Resolution
    draw.text((5, y), "NDI Res:", fill=(100, 100, 255), font=font_small)  # Blue label
    y += 12
    ndi_res = truncate_text(data['ndi_resolution'], 16)
    draw.text((5, y), ndi_res, fill=(255, 255, 255), font=font_small)  # White value
    y += line_height
    
    # Output Resolution
    draw.text((5, y), "Out Res:", fill=(100, 100, 255), font=font_small)  # Blue label
    y += 12
    out_res = truncate_text(data['output_resolution'], 16)
    draw.text((5, y), out_res, fill=(255, 255, 255), font=font_small)  # White value
    
    # Display the image
    disp.ShowImage(image)
    logging.info("Display updated successfully")


# ============================================================================
# Main Function
# ============================================================================

def main():
    """
    Main entry point - read config, load data, and display
    """
    try:
        # Initialize display
        logging.info("Initializing display...")
        disp = LCD_1inch69.LCD_1inch69()
        disp.Init()
        disp.clear()
        disp.bl_DutyCycle(100)  # Set backlight to 100%
        
        # Read configuration
        script_dir = os.path.dirname(os.path.abspath(__file__))
        config_file = os.path.join(script_dir, "lcd_config.txt")
        
        logging.info(f"Reading config from: {config_file}")
        config = read_config_from_txt(config_file)
        
        if not config:
            logging.error("No configuration found! Create lcd_config.txt")
            return 1
        
        # Load display data
        logging.info("Loading data from files...")
        data = load_display_data(config)
        
        # Display data
        logging.info("Rendering display...")
        render_display(disp, data)
        
        # Cleanup
        disp.module_exit()
        logging.info("Done!")
        return 0
        
    except IOError as e:
        logging.error(f"IO Error: {e}")
        return 1
    except KeyboardInterrupt:
        logging.info("Interrupted by user")
        try:
            disp.module_exit()
        except:
            pass
        return 0
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
