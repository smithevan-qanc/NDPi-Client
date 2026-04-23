#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

BRANCH="$(head -n 1 version-git.txt)"

git fetch origin $BRANCH

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$BRANCH)

if [ "$LOCAL" != "$REMOTE" ]; then
    git reset --hard origin/$BRANCH
    chmod +x git-update.sh
    chmod +x install-update.sh
    echo ""
    echo "PREPARING TO UPDATE"
    sleep 1
    sudo ./install-update.sh
fi