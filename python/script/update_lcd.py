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
    
    Font1 = ImageFont.truetype("../Font/ConsolasBold.ttf", 30)
    Font2 = ImageFont.truetype("../Font/Consolas.ttf", 30)
    Font3 = ImageFont.truetype("../Font/Consolas.ttf", 25)
    Font4 = ImageFont.truetype("../Font/ConsolasBold.ttf", 20)
    
    print("Display initialized. Starting loop...")
    
    # Loop forever, reading files every 5 seconds
    while True:
        # Read files
        device_name = read_file('device_name')
        device_id = read_file('device_id')
        device_ip = read_file('device_ip')
        ndpi_version = read_file('ndpi_version')
        ndpi_status_ndi = read_file('ndpi_status_ndi')
        target_source = read_file('ndpi_status_ndi_source_target')
        
        target_src = "\n(".join(target_source.split('('))


        # Draw on display
        image1 = Image.new("RGB", (disp.height, disp.width), "BLACK")
        draw = ImageDraw.Draw(image1)
        
        # logging.info(f"Updating: {device_name} | {device_ip} | {ndi_status}")
        draw.text((25, 15),     device_name,     fill="GREEN", font=Font1)
        draw.text((20, 52),     "IP:",           fill="GRAY", font=Font4)
        draw.text((10, 82),     "NDI:",          fill="GRAY", font=Font4)
        draw.text((60, 50),     device_ip,       fill="GREEN", font=Font3)
        draw.text((60, 80),     ndpi_status_ndi, fill="GREEN", font=Font3)
        draw.text((60, 115),    target_src,      fill="GREEN", font=Font4)
        draw.text((15, 187),    "ID",           fill="GRAY", font=Font4)
        draw.text((50, 185),    device_id,       fill="GREEN", font=Font3)
        draw.text((50, 207),    "VER",          fill="GRAY", font=Font4)
        draw.text((100, 205),    ndpi_version,    fill="GREEN", font=Font3)
        
        disp.ShowImage(image1)
        
        # Wait 5 seconds before next update
        time.sleep(1)

except KeyboardInterrupt:
    print("\nStopping...")
    disp.module_exit()
except Exception as e:
    logging.error(f"Error: {e}")
    disp.module_exit()