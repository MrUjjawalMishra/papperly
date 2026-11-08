#!/bin/sh
set -eu
# Serialize the first definition update and daemon load. Otherwise a replaced
# database can be mistaken for the baseline while the old inode is still loading.
freshclam --foreground --stdout
exec /init
