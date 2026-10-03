#!/usr/bin/env bash
# snapshot ฐาน dev: uat/bin/snap.sh <label>   เช่น R1-end
set -euo pipefail
export PGPASSWORD=assetrecovery
mkdir -p uat/snapshots
out="uat/snapshots/$1.dump"
pg_dump -h localhost -U assetrecovery -Fc assetrecovery_dev > "$out"
echo "snapshot $out ($(du -h "$out" | cut -f1))"
