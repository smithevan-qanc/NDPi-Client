#!/bin/bash
set -e

# This script is executed on the remote machine automatically after the update from GitHub is downloaded.
# Write the script (if any is required) inside the install() function below.

# NOTE:
#   The contents of this file will RESET automatically after running 'updateGit.sh'.

install() {
    # Write Update Script Here
    echo "INSTALLING UPDATE"
    local CopyOf="config/default/unclutter"
    local CopyToDir="/etc/default"
    echo $CopyOf
    echo $CopyToDir
    sudo cp $CopyOf $CopyToDir/unclutter
}
install

echo "INSTALLATION COMPLETE"