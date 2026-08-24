#!/usr/bin/env bash
set -e

SSH_LOGIN="ndpi-client@10.1.1.122"

ssh "ndpi-client@10.1.1.122" "-i $HOME/.ssh/id_ed25519" "sudo systemctl stop kiosk-client.service"
exit 0

sleep 1
ssh "${SSH_LOGIN}" "sudo systemctl disable kiosk-client.service"
sleep 1
ssh "${SSH_LOGIN}" "sudo systemctl stop ndpi-monitor-client.service"
sleep 1
ssh "${SSH_LOGIN}" "sudo systemctl disable ndpi-monitor-client.service"


sudo systemctl stop kiosk-client.service \
sudo systemctl disable kiosk-client.service \
sudo systemctl stop ndpi-monitor-client.service \
sudo systemctl disable ndpi-monitor-client.service