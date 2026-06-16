#!/usr/bin/python
# -*- coding: UTF-8 -*-
import os
import sys 
import time
import logging
from datetime import datetime
sys.path.append("..")
from python.lib import LCD_1inch69
from PIL import Image, ImageDraw, ImageFont

# Raspberry Pi pin configuration
RST = 27
DC = 25
BL = 18
bus = 0 
device = 0 
# logging.basicConfig(level=logging.DEBUG)

script_dir = os.path.dirname(os.path.abspath(__file__))
font_dir = os.path.join(script_dir, "python", "Font")

def read_file(filepath):
    try:
        with open(filepath, 'r') as f:
            return f.read().strip()
    except:
        return "N/A"
    
def get_centered_x(text, font_size, display_width=280):
    text_width = len(text) * (font_size * 0.55)
    x_coordinate = (display_width - text_width) / 2
    return max(5, int(round(x_coordinate)))

def get_right_x(text, font_size, margin=10, display_width=280):
    text_width = len(text) * (font_size * 0.55)
    x_coordinate = (display_width - text_width - margin)
    return max(5, int(round(x_coordinate)))
    
Consolas_Bold_30 = ImageFont.truetype(os.path.join(font_dir, "ConsolasBold.ttf"), 30)
Consolas_Bold_25 = ImageFont.truetype(os.path.join(font_dir, "ConsolasBold.ttf"), 25)
Consolas_25 = ImageFont.truetype(os.path.join(font_dir, "Consolas.ttf"), 25)
Consolas_Bold_20 = ImageFont.truetype(os.path.join(font_dir, "ConsolasBold.ttf"), 20)
Roboto_25 = ImageFont.truetype(os.path.join(font_dir, "RobotoCondensed-Regular.ttf"), 25)


try:
    # def font_roboto(style, size):
    #     return ImageFont.truetype(os.path.join(font_dir, f"RobotoCondensed-{style}"), size)
    # Initialize display ONCE at startup
    disp = LCD_1inch69.LCD_1inch69()
    disp.Init()
    disp.clear()
    disp.bl_DutyCycle(100)
    
    print("Display initialized. Starting loop...")
    
    while True:

        # date_time_string = datetime.now().strftime("%m-%d-%Y %H:%M")
        time_string = datetime.now().strftime("%H:%M")
        
        # Read files
        device_name = read_file('python/script/device_name')
        dev_nam_x = get_centered_x(device_name.strip(), 30)

        device_id = read_file('python/script/device_id')
        dev_id_x = get_centered_x(device_id, 20)

        device_ip = read_file('python/script/device_ip')
        ndpi_version = read_file('python/script/ndpi_version')
        ndpi_status_ndi_status = read_file('python/script/ndpi_status_ndi_status').upper()

        target_source = read_file('python/script/ndpi_status_ndi_source_target').upper()
        target_src = target_source.split('(')
        
        try:
            src_line_1 = target_src[0].strip()
        except IndexError:
            src_line_1 = ""

        try:
            src_line_2 = f"({target_src[1].strip()}"
        except IndexError:
            src_line_2 = ""

        # Draw on display ------------------------------------------------------------
        image1 = Image.new("RGB", (disp.height, disp.width), "BLACK")
        draw = ImageDraw.Draw(image1)
        
        # Device Name ---------------------------------------------------------------- font_roboto("Black", 25)
        draw.text((dev_nam_x, 15), device_name, fill="GREEN", font=Roboto_25)

        # Gray Line ------------------------------------------------------------------
        draw.line([(0, 52), (280, 52)], fill = "GRAY", width = 1)

        # NDI Status Label -----------------------------------------------------------
        draw.text((10, 60), "NDI\nStatus", fill="GRAY", font=Consolas_Bold_20)

        # NDI Current State ----------------------------------------------------------
        ndi_status_x = get_right_x(ndpi_status_ndi_status, 25)
        draw.text((ndi_status_x, 60), ndpi_status_ndi_status, fill="GREEN", font=Consolas_25)

        # NDI Target Source ----------------------------------------------------------
        src_x_1 = get_centered_x(src_line_1, 25)
        src_x_2 = get_centered_x(src_line_2, 25)
        draw.text((src_x_1, 105), src_line_1, fill="GREEN", font=Consolas_Bold_25)
        draw.text((src_x_2, 132), src_line_2, fill="GREEN", font=Consolas_25)

        # Gray Line ------------------------------------------------------------------
        draw.line([(0, 170), (280, 170)], fill = "GRAY", width = 1)

        # CPU Temperature ------------------------------------------------------------
        # sys_temp = f"{format(int(read_file('../../../../sys/class/thermal/thermal_zone0/temp'))/1000, ".2f")}°C"
        # sys_fan_rpm = f"{read_file('../../../../sys/class/hwmon/hwmon2/fan1_input')}"
        # sys_temp_x = get_centered_x(" ##:## | ##.#°C | ####", 20)
        # draw.text((sys_temp_x, 175), f"{time_string} | {sys_temp} | {sys_fan_rpm}", fill="GREEN", font=Consolas_Bold_20)


        # NDPi Version & Device IP ---------------------------------------------------
        line_dev_info = f"(v{ndpi_version}) {device_ip}".strip()
        line_dev_info_x = get_centered_x(line_dev_info, 20)
        draw.text((line_dev_info_x, 195), line_dev_info, fill="GREEN", font=Consolas_Bold_20)

        # Device ID ------------------------------------------------------------------
        draw.text((dev_id_x, 215), device_id, fill="GREEN", font=Consolas_Bold_20)
        
        # Display --------------------------------------------------------------------
        disp.ShowImage(image1)
        time.sleep(1)

except KeyboardInterrupt:
    print("\nStopping...")
    imageClear = Image.new("RGB", (disp.height, disp.width), "BLACK")
    disp.ShowImage(imageClear)
    time.sleep(0.1)
    disp.module_exit()
except Exception as e:
    print(e)
    logging.error(f"Error: {e}")
    errImg = Image.new("RGB", (disp.height, disp.width), "RED")
    drawErr = ImageDraw.Draw(errImg)
    disp.ShowImage(errImg)
    time.sleep(1)
    disp.module_exit()