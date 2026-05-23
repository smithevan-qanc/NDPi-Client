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
logging.basicConfig(level=logging.DEBUG)

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
    
    Font1 = ImageFont.truetype("../Font/Font01.ttf", 25)
    Font2 = ImageFont.truetype("../Font/Font01.ttf", 35)
    Font3 = ImageFont.truetype("../Font/Font02.ttf", 32)
    
    print("Display initialized. Starting loop...")
    
    # Loop forever, reading files every 5 seconds
    while True:
        # Read files
        device_name = read_file('../../../DATA_ndpi/device_name')
        device_ip = read_file('../../../DATA_ndpi/device_ip')
        ndi_status = read_file('../../../DATA_ndpi/ndpi_status_ndi')
        
        # Draw on display
        image1 = Image.new("RGB", (disp.height, disp.width), "BLACK")
        draw = ImageDraw.Draw(image1)
        
        logging.info(f"Updating: {device_name} | {device_ip} | {ndi_status}")
        draw.text((25, 120), device_name, fill="GREEN", font=Font3)
        draw.text((21, 155), device_ip, fill="GREEN", font=Font3)
        draw.text((25, 190), ndi_status, fill="GREEN", font=Font3)
        
        disp.ShowImage(image1)
        
        # Wait 5 seconds before next update
        time.sleep(5)

except KeyboardInterrupt:
    print("\nStopping...")
    disp.module_exit()
except Exception as e:
    logging.error(f"Error: {e}")
    disp.module_exit()