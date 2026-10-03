#!/usr/bin/env bash
# ย้อนฐาน dev ไป snapshot: uat/bin/restore.sh <label>
# หยุด dev server ก่อน (ปลด connection + ล้าง session cache ในหน่วยความจำ) แล้วเปิดใหม่
set -euo pipefail
export PGPASSWORD=assetrecovery
f="uat/snapshots/$1.dump"; [ -f "$f" ] || { echo "ไม่พบ $f" >&2; exit 1; }
~/bin/dev stop asset >/dev/null
psql -h localhost -U assetrecovery -d postgres -qc "select pg_terminate_backend(pid) from pg_stat_activity where datname='assetrecovery_dev' and pid<>pg_backend_pid()" >/dev/null
pg_restore -h localhost -U assetrecovery -d assetrecovery_dev --clean --if-exists --no-owner "$f"
rm -f uat/.auth/*.json   # session เก่าอาจชี้ผู้ใช้ที่ไม่มีแล้ว
# dump เก่าอาจมี schema/สิทธิ์ตั้งต้นตามโค้ดตอนนั้น → ยก schema + เติมแถวสิทธิ์ใหม่ให้ตรงโค้ดปัจจุบัน (seed ไม่ทับแถวเดิม)
pnpm -s db:deploy >/dev/null
pnpm -s db:seed 2>&1 | grep "สร้างใหม่" || true
~/bin/dev asset >/dev/null
for i in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login)" = 200 ] && break; sleep 2; done
echo "restored $f · server up"
