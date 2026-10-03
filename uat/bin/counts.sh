#!/usr/bin/env bash
# ภาพรวมจำนวนแถวตารางหลัก (ใช้ตรวจหลังจบรอบ) — คืนบรรทัดเดียวต่อตาราง
export PGPASSWORD=assetrecovery
psql -h localhost -U assetrecovery -d assetrecovery_dev -XAt -F' ' -c "
select relname, n_live_tup from pg_stat_user_tables
where n_live_tup > 0 order by relname" 
