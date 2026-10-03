#!/usr/bin/env bash
# query อ่านอย่างเดียวบนฐาน dev: uat/bin/q.sh "select ..."
export PGPASSWORD=assetrecovery
psql -h localhost -U assetrecovery -d assetrecovery_dev -X -v ON_ERROR_STOP=1 \
  -c "set default_transaction_read_only = on" -c "$1"
