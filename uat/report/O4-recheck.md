# O4 recheck — เคสค้างเกิน SLA (`sla-breach`) · 06/10/2569 14:04

> ตรวจซ้ำตามข้อจำกัดเวลา R9 (มติ O29 · `uat/steps/R9.md` §0.5 + R9.23) · อ่านอย่างเดียว (SELECT + เปิดหน้า/GET API) ไม่แก้ข้อมูล

## กฎในโค้ด
- `lib/reports/operations/providers.ts` (`slaBreachProvider`) + `sla-breach-report.ts` / `sla.ts` (pure)
- ค้าง = สถานะ `pending_review | need_info | approved | active | pending_recycle_review` (ไม่นับ draft/rejected/closed_*), `deleted_at IS NULL`
- เกิน SLA = `created_at + sla_alert_hours < now` (ครบพอดีไม่นับ) · ไม่ผูกช่วงเวลาที่เลือก
- `sla_alert_hours` จากค่าตั้งองค์กร = **72** (ฐาน dev ตอนนี้)
- scope: ผู้จัดการ/หัวหน้า = เฉพาะ `assigned_team_id` ในทีมตัวเอง · บริหาร = ทั้งองค์กร · ธุรการ (`uat.admin`) ไม่มีสิทธิ์หมวด O → 403

## ฐานข้อมูลตอนนี้ (11 เคส)
| เคส | สถานะ | created_at (ไทย) | ปิดงาน (updated_at ไทย) | projected |
|---|---|---|---|---|
| UAT-CO2-007 (C7) | closed_success | 03/10/2569 14:01 | 05/10/2569 23:16 (R13) | 749000 |
| UAT-CO1-006 (C6) | closed_success | 03/10/2569 14:02 | 06/10/2569 10:51 (R14) | 100000 |
- เคสอื่น: closed_success 7 · closed_fail 1 (C3) · rejected 1 (C8) · draft 1 (UAT-CO1-902)
- ⇒ **ไม่มีเคสสถานะ "ค้าง" เลยแม้แต่ใบเดียว** → ผลที่ถูกต้องตามกฎ = 0 แถว ทุก persona

## ผลจริง (หน้า `/reports/sla-breach` + `GET /api/reports/sla-breach`)
| persona | HTTP | แถว | KPI เคสเกิน SLA / ประมาณการค้าง / ค้างนานสุด |
|---|---|---|---|
| uat.mgr.in (ทีม A) | 200 | 0 | 0 / 0.00 / — · empty state |
| uat.exec (ทั้งองค์กร) | 200 | 0 | 0 / 0.00 / — · empty state |
| uat.mgr.out (ทีม C) | 200 | 0 | 0 / 0.00 / — |
| uat.admin (ธุรการ) | 403 | — | ไม่มีสิทธิ์หมวด O (ตรง matrix R9 §0.4) |
- ป้าย "ข้อมูล ณ 06/10/2569 14:04 (จากแคช)" → แคชสร้างหลัง 14:02 ไม่ใช่ค่าค้างเก่า · console/5xx error 0 (หน้ารายงาน)
- ภาพ: `uat/shots/O4/o4-uat.mgr.in.png`, `o4-uat.exec.png`, `o4-uat.mgr.out.png`, `o4-uat.admin.png` (gitignored)

## สรุป
- **ผลตรงกฎ ✅** — 2 แถวที่ R9 คาด (C6 + C7) หายเพราะทั้งสองใบ**ปิดงานแล้ว** (C7 ใน R13 · C6 ใน R14) ก่อนถึงเวลา 72 ชม. ของ C6 (06/10 14:02) ⇒ ตามกฎ "นับเฉพาะเคสที่ยังไม่ปิด" ต้องเป็น 0 แถว ไม่ใช่บั๊ก
  - C7 เคยข้ามเกณฑ์ (03/10 14:01 + 72 ชม. = 06/10 14:01) แต่ปิดไปตั้งแต่ 05/10 23:16 ⇒ ไม่เคยมีช่วงที่ "ค้างเกิน" บนฐานจริง
- **ยอด 849000 satang** = `projected_revenue_satang` ของ C7 (749000) + C6 (100000) = มุมมองทั้งองค์กร (exec) · มุม `uat.mgr.in` ตาม R9.23 เดิม = 749000 (C6 ตอนนั้นยังไม่มีทีม) — ไม่ใช่ยอดหนี้/ค่าบริการจริง แต่เป็นประมาณการ best-case
- ไม่มีเคสอื่นในฐานปัจจุบันที่ควรขึ้น O4 (เคสเปิดเหลือ 0 · UAT-CO1-902 เป็น draft ไม่นับ)

## ข้อเสนอเพื่อพิสูจน์ว่า O4 แสดงแถวได้จริง (ไม่ได้ทำ — รอ orchestrator ตัดสิน)
1. **(แนะนำ)** restore `uat/snapshots/R12-end-v1.dump` ลง**ฐานแยก** (เช่น `assetrecovery_o4`, `pg_restore --no-owner`) แล้วรัน SELECT เทียบกฎ (`status in (...) and created_at + 72h < now()`) — ไม่แตะฐาน dev · คาด C7 (+C6 ถ้ายังเปิด) ขึ้น ยอดทั้งองค์กร 849000 · ถ้าต้องดูหน้า UI ด้วยต้องชี้ server ชั่วคราวไปฐานนั้น (หรือใช้ `uat/bin/restore.sh R12-end-v1` บน dev แล้ว restore `R14-end` คืน — กระทบฐาน dev)
2. หรือพึ่ง test ที่มีอยู่: `lib/reports/operations/sla-breach-report.test.ts` / `sla.test.ts` (ขอบเวลา) + `operations-reports.db.test.ts` (scope ทีม) — พิสูจน์ตรรกะได้ แต่ไม่ใช่ end-to-end บนข้อมูล UAT
3. รอบ UAT ถัดไปที่สร้างเคสใหม่ (ปล่อยค้าง > 72 ชม.) จะพิสูจน์ได้เองตามธรรมชาติ

## ข้อสังเกตเล็ก (ไม่ใช่บั๊กกฎ)
- empty state ของ O4 เขียน "ไม่มีข้อมูลในช่วงเวลาที่เลือก — ลองเปลี่ยนช่วงเวลา" + มีตัวเลือกช่วงเวลา แต่ O4 ไม่ผูกช่วงเวลา ⇒ ข้อความชวนเข้าใจผิดเล็กน้อย (UX ระดับต่ำ)
