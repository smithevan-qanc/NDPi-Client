#!/usr/bin/env bash
# X initialization script for NDPi Client Display

# Disable screen blanking and power management
echo "Setting DPMS"
xset s off
xset -dpms
xset s noblank

hsetroot -solid "#000000"
# hsetroot -solid "#000066"

echo "Starting Xcompmgr"
xcompmgr -d :0 -fFn &

# Start window manager (lightweight)
echo "Starting Openbox"
openbox &