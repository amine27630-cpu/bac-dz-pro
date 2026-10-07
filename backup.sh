#!/bin/sh
set -eu
mkdir -p backups
docker compose exec -T bacdz sh -c 'cp /app/data/bacdz.sqlite /tmp/bacdz-backup.sqlite'
docker cp bac-dz-pro:/tmp/bacdz-backup.sqlite "./backups/bacdz-$(date +%Y%m%d-%H%M%S).sqlite"
echo "Backup created."
