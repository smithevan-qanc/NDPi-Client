#!/bin/bash
# X initialization script for NDPi Client Display

# Disable screen blanking and power management
xset s off
xset -dpms
xset s noblank

# Start window manager (lightweight)
openbox &