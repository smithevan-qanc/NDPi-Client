#!/usr/bin/python
# -*- coding: UTF-8 -*-
import os
import sys 
import time
import logging
sys.path.append("..")
from lib import LCD_1inch69
from PIL import Image, ImageDraw, ImageFont

# Raspberry Pi pin configuration
RST = 27
DC = 25
BL = 18
bus = 0 
device = 0 
# logging.basicConfig(level=logging.DEBUG)

def read_file(filepath):
    try:
        with open(filepath, 'r') as f:
            return f.read().strip()
    except:
        return "N/A"

try:
    # Initialize display ONCE at startup
    disp = LCD_1inch69.LCD_1inch69()
    disp.Init()
    disp.clear()
    disp.bl_DutyCycle(100)
    
    Font1 = ImageFont.truetype("../Font/Font02.ttf", 35)
    Font2 = ImageFont.truetype("../Font/Font02.ttf", 30)
    Font3 = ImageFont.truetype("../Font/Font02.ttf", 25)
    Font4 = ImageFont.truetype("../Font/Font02.ttf", 20)
    
    print("Display initialized. Starting loop...")
    
    # Loop forever, reading files every 5 seconds
    while True:
        # Read files
        device_name = read_file('device_name')
        device_id = read_file('device_id')
        device_ip = read_file('device_ip')
        ndpi_version = read_file('ndpi_version')
        ndpi_status_ndi = read_file('ndpi_status_ndi')

        # Draw on display
        image1 = Image.new("RGB", (disp.height, disp.width), "BLACK")
        draw = ImageDraw.Draw(image1)
        
        # logging.info(f"Updating: {device_name} | {device_ip} | {ndi_status}")
        draw.text((20, 20),     device_name,     fill="GREEN", font=Font1)
        draw.text((25, 69),     "ID:",           fill="GRAY", font=Font4)
        draw.text((55, 68),     device_id,       fill="GREEN", font=Font3)
        draw.text((25, 114),    "IP:",           fill="GRAY", font=Font4)
        draw.text((57, 110),    device_ip,       fill="GREEN", font=Font2)
        draw.text((20, 157),    "NDI:",          fill="GRAY", font=Font4)
        draw.text((60, 150),    ndpi_status_ndi, fill="GREEN", font=Font2)
        draw.text((20, 198),    "VER:",          fill="GRAY", font=Font4)
        draw.text((60, 195),    ndpi_version,    fill="GREEN", font=Font3)
        
        disp.ShowImage(image1)
        
        # Wait 5 seconds before next update
        time.sleep(1)

except KeyboardInterrupt:
    print("\nStopping...")
    disp.module_exit()
except Exception as e:
    logging.error(f"Error: {e}")
    disp.module_exit()