#!/bin/bash
set -e

# This script is executed on the remote machine automatically after the update from GitHub is downloaded.
# Write the script (if any is required) inside the install() function below.

# NOTE:
#   The contents of this file will RESET automatically after running 'updateGit.sh'.

install() {
    # Write Update Script Here
    echo "INSTALLING UPDATE"
    sleep 1
    cp /home/ndpi-client/ndpi/config/openbox/rpd-rc.xml /home/ndpi-client/.config/openbox/rpd-rc.xml
    chown ndpi-client:ndpi-client /home/ndpi-client/.config/openbox/rpd-rc.xml
    sudo reboot
}
install

echo "INSTALLATION COMPLETE"