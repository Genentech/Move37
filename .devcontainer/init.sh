#!/bin/bash
# first time project setup
docker compose -f .devcontainer/compose.yml build base
docker compose -f .devcontainer/compose.yml build tools
USRID=$(id -u) USRNAME=$(whoami) docker compose -f .devcontainer/compose.yml build --no-cache --pull=false
