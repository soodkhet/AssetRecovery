# REUSE_INDEX.md — ของที่มีแล้ว / แม่แบบ / กับดัก (เช็คก่อนเขียนโค้ดใหม่ทุกครั้ง)

> **กติกา**: ก่อนสร้าง component/util/service ใหม่ ให้ Grep ตารางนี้ก่อน — มีแล้วให้ reuse · สร้างของใหม่ที่คนอื่นใช้ได้ → **ต้องเพิ่มแถวที่นี่ใน commit เดียวกัน** · เจอกับดัก/บั๊กที่แก้ยากให้บันทึกไว้หมวด "กับดัก"

## Shared Components (Frontend)

| ชื่อ | ที่อยู่ | สร้างใน task | หมายเหตุ |
|---|---|---|---|
| (รอเริ่ม — Phase 1.5 จะสร้าง UI Kit ชุดแรก: Button/Table/Modal/Badge/Input/Card/Toast + statusBadge mapper + loading/empty/error states) | | | |

รายการที่**ต้องเกิด**เป็น shared ตามแผน (อย่าสร้างซ้ำในโมดูลตัวเอง):
- `statusBadge()` mapper 10 กลุ่มสี (`04` §8.1) — Phase 1.5
- datetime utils `fmtDate`/`fmtDateTime` พ.ศ. (`03` §6.5) — Phase 1.5
- satang ↔ display utils (÷100 + comma) — Phase 1.5
- 3-tab nested shell (แอดมิน/เจ้าหน้าที่/บริษัทไฟแนนซ์) ใช้ทั้งไฟล์ 07+08 — Phase 1.6
- Address component ×3 ที่อยู่ + cascading จังหวัด/อำเภอ/ตำบล (`38` §6.1.2) — Phase 2.4, ไฟล์ 41 ใช้ซ้ำ
- Case Detail component (`38` §7.5) — Phase 2.5, ใช้ซ้ำใน 40 (Assignment Modal) และ 41 (3 จุด)
- Doc viewer + image lightbox — Phase 2.5
- DateRangePicker + preset / KPI card + MoM / table + virtual scroll — Phase 6.1

## Shared Services / Utils (Backend)

| ชื่อ | ที่อยู่ | สร้างใน task | หมายเหตุ |
|---|---|---|---|
| (รอเริ่ม) | | | |

รายการที่**ต้องเกิด**เป็น shared ตามแผน:
- `requirePermission(action, resource, scope)` + scope resolver — Phase 1.3 (ทุก endpoint ต้องใช้)
- Audit emit helper (9 fields + immutable) — Phase 1.4 (ทุก mutation ต้องผ่าน)
- Pure calculation modules ครบ 13 สูตร (`22`) — Phase 3.1 (ห้ามคำนวณเงินนอก module นี้)
- `success_rate` service กลาง (`40` §6.2) — Phase 2.6 (Report ใช้ซ้ำ)
- Response envelope + error catalog — Phase 2.1
- Period Lock guard interceptor — Phase 4.1 (write endpoint การเงิน/บัญชีทุกตัว)
- VAT resolver / WHT resolver — Phase 3.1 (19/31/33 ใช้ร่วม)

## กับดัก (Lessons Learned)

| วันที่ | เรื่อง | รายละเอียด |
|---|---|---|
| (ยังไม่มี — บันทึกเมื่อเจอจริง) | | |
