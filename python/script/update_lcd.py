#!/usr/bin/python
# -*- coding: UTF-8 -*-
import os
import sys 
import time
import logging
import math
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
    
def get_centered_x(text, font_size, display_width=280):
    text_width = len(text) * (font_size * 0.55)
    x_coordinate = (display_width - text_width) / 2
    return max(0, int(round(x_coordinate)))

try:
    # Initialize display ONCE at startup
    disp = LCD_1inch69.LCD_1inch69()
    disp.Init()
    disp.clear()
    disp.bl_DutyCycle(100)
    
    Font1 = ImageFont.truetype("../Font/ConsolasBold.ttf", 30)
    Font2 = ImageFont.truetype("../Font/ConsolasBold.ttf", 25)
    Font3 = ImageFont.truetype("../Font/Consolas.ttf", 25)
    Font4 = ImageFont.truetype("../Font/ConsolasBold.ttf", 20)
    
    print("Display initialized. Starting loop...")
    
    # Loop forever, reading files every 5 seconds
    while True:
        # Read files
        device_name = read_file('device_name')
        dev_nam_x = get_centered_x(device_name.strip(), 30)

        device_id = read_file('device_id')
        device_ip = read_file('device_ip')
        ndpi_version = read_file('ndpi_version')
        ndpi_status_ndi = read_file('ndpi_status_ndi').upper()

        sys_temp = str(round(int(read_file('../../../../../sys/class/thermal/thermal_zone0/temp'))/1000))

        target_source = read_file('ndpi_status_ndi_source_target').upper()
        target_src = target_source.split('(')

        try:
            src_line_1 = target_src[0].strip()
        except IndexError:
            src_line_1 = ""
        try:
            src_line_2 = f"({target_src[1].strip()}"
        except IndexError:
            src_line_2 = ""
        
        src_x_1 = get_centered_x(src_line_1, 25)
        src_x_2 = get_centered_x(src_line_2, 25)

        # Draw on display
        image1 = Image.new("RGB", (disp.height, disp.width), "BLACK")
        draw = ImageDraw.Draw(image1)
        
        # logging.info(f"Updating: {device_name} | {device_ip} | {ndi_status}")
        draw.text((dev_nam_x, 15),     device_name,     fill="GREEN", font=Font1)
        draw.line([(0, 52), (280, 52)], fill = "GRAY", width = 1)

        draw.text((10, 62),     "Status",           fill="GRAY", font=Font4)
        draw.text((80, 60),     ndpi_status_ndi, fill="GREEN", font=Font3)

        draw.text((src_x_1, 100),    src_line_1,      fill="GREEN", font=Font2)
        draw.text((src_x_2, 128),    src_line_2,      fill="GREEN", font=Font2)

        # draw.text((50, 60),     device_ip,       fill="GREEN", font=Font3)

        draw.line([(0, 190), (280, 190)], fill = "GRAY", width = 1)

        draw.text((65, 165),    sys_temp,        fill="GREEN", font=Font4)

        # draw.text((10, 183),    "VER",           fill="GRAY", font=Font4)
        draw.text((15, 195),    ndpi_version + " - " + device_ip,    fill="GREEN", font=Font4)

        # draw.text((10, 205),    "ID",            fill="GRAY", font=Font4)
        draw.text((65, 215),    device_id,       fill="GREEN", font=Font4)
        
        disp.ShowImage(image1)
        
        # Wait 5 seconds before next update
        time.sleep(1)

except KeyboardInterrupt:
    print("\nStopping...")
    disp.module_exit()
except Exception as e:
    logging.error(f"Error: {e}")
    disp.module_exit()