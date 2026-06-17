#!/usr/bin/python
# -*- coding: UTF-8 -*-
import os
import sys 
import time
import logging
import signal
from datetime import datetime
sys.path.append("..")
from python.lib import LCD_1inch69
from PIL import Image, ImageDraw, ImageFont

# Global variable for display instance
disp = None

def cleanup(signum=None, frame=None):
    """Cleanup function called on exit or signal"""
    global disp
    try:
        if disp is not None:
            imageClear = Image.new("RGB", (disp.height, disp.width), "BLACK")
            disp.ShowImage(imageClear)
            time.sleep(0.1)
            disp.module_exit()
    except Exception as e:
        logging.error(f"Error during cleanup: {e}")
    sys.exit(0)

def signal_handler(signum, frame):
    """Handle signals gracefully"""
    signal_names = {
        signal.SIGTERM: "SIGTERM",
        signal.SIGINT: "SIGINT",
        signal.SIGHUP: "SIGHUP",
    }
    signal_name = signal_names.get(signum, f"Signal {signum}")
    print(f"\nReceived {signal_name}. Stopping...")
    cleanup()

# Raspberry Pi pin configuration
RST = 27
DC = 25
BL = 18
bus = 0
device = 0
# logging.basicConfig(level=logging.DEBUG)

# Margin in pixels
screen_margin = 15

script_dir = os.path.dirname(os.path.abspath(__file__))
font_dir = os.path.join(script_dir, "python", "Font")

def read_file(filepath):
    try:
        with open(filepath, 'r') as f:
            return f.read().strip()
    except:
        return ""
    
def get_centered_x(text, font_size, display_width=240):
    text_width = len(text) * (font_size * 0.55)
    x_coordinate = (display_width - text_width) / 2
    return max(screen_margin, int(round(x_coordinate)))

def get_right_x(text, font_size, margin=10, display_width=240):
    text_width = len(text) * (font_size * 0.55)
    x_coordinate = (display_width - text_width - margin)
    return max(screen_margin, int(round(x_coordinate)))
    
Consolas_Bold_30 = ImageFont.truetype(os.path.join(font_dir, "ConsolasBold.ttf"), 30)
Consolas_Bold_25 = ImageFont.truetype(os.path.join(font_dir, "ConsolasBold.ttf"), 25)
Consolas_25 = ImageFont.truetype(os.path.join(font_dir, "Consolas.ttf"), 25)
Consolas_Bold_20 = ImageFont.truetype(os.path.join(font_dir, "ConsolasBold.ttf"), 20)
Roboto_25 = ImageFont.truetype(os.path.join(font_dir, "RobotoCondensed-Regular.ttf"), 25)

def font_roboto(style, size):
    return ImageFont.truetype(os.path.join(font_dir, f"RobotoCondensed-{style}.ttf"), size)

try:
    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGHUP, signal_handler)
    
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
        dev_nam_x = screen_margin  # get_centered_x(device_name.strip(), 30)

        device_id = read_file('python/script/device_id')
        dev_id_x = screen_margin  # get_centered_x(device_id, 20)

        device_ip = read_file('python/script/device_ip')
        ndpi_version = read_file('python/script/ndpi_version')
        ndpi_status_ndi_status = read_file('python/script/ndpi_status_ndi_status').upper()

        target_source = read_file('python/script/ndpi_status_ndi_source_active').upper()
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
        image1 = Image.new("RGB", (disp.width, disp.height), "#070C1A")
        draw = ImageDraw.Draw(image1)
        
        # Device Name ----------------------------------------------------------------
        draw.text((dev_nam_x, screen_margin), device_name, fill="GRAY", font=font_roboto("Black", 22))

        # Device IP ------------------------------------------------------------------
        draw.text((screen_margin, 50), device_ip, fill="GRAY", font=font_roboto("Medium", 20))

        # Device ID ------------------------------------------------------------------
        draw.text((screen_margin, 80), device_id, fill="GRAY", font=font_roboto("Medium", 20))



        # Gray Line ------------------------------------------------------------------
        draw.line([(0, 112), (240, 112)], fill = "GRAY", width = 1)



        # NDI Status Label -----------------------------------------------------------
        draw.text((screen_margin, 120), "NDI® Status", fill="GRAY", font=font_roboto("Light", 20))

        # NDI Current State ----------------------------------------------------------
        draw.text((screen_margin, 140), ndpi_status_ndi_status, fill="GRAY", font=font_roboto("SemiBold", 20))

        # NDI Target Source ----------------------------------------------------------
        draw.text((screen_margin + screen_margin, 175), src_line_1, fill="WHITE", font=font_roboto("Light", 18))
        draw.text((screen_margin + screen_margin, 195), src_line_2, fill="WHITE", font=font_roboto("Light", 14))



        # Gray Line ------------------------------------------------------------------
        draw.line([(0, 230), (240, 230)], fill = "GRAY", width = 1)



        # NDPi Version & Device IP ---------------------------------------------------
        line_dev_info = f"Version {ndpi_version}".strip()
        draw.text((screen_margin + screen_margin, 240), line_dev_info, fill="GRAY", font=font_roboto("Thin", 20))
        
        # Display --------------------------------------------------------------------
        disp.ShowImage(image1)
        time.sleep(1)

except KeyboardInterrupt:
    print("\nKeyboard interrupt received.")
    cleanup()
except Exception as e:
    print(f"Error: {e}")
    logging.error(f"Error: {e}")
    try:
        if disp is not None:
            errImg = Image.new("RGB", (disp.height, disp.width), "RED")
            drawErr = ImageDraw.Draw(errImg)
            disp.ShowImage(errImg)
            time.sleep(1)
    except Exception as err:
        logging.error(f"Error displaying error image: {err}")
    cleanup()