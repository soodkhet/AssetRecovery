รีวิวโค้ดที่เพิ่งเขียนเทียบกับ `CLAUDE.md` + `.claude/rules/*` + spec ใน `docs/` โดยเฉพาะ:

**เงิน (ผิดข้อเดียว = แก้ก่อนอย่างอื่น)**
- เงินเป็น `INTEGER` satang ทุกจุด ไม่มี float/Decimal หลุด (ยกเว้น `rate_pct`/`wht_pct` = NUMERIC(5,2)) · field ลงท้าย `_satang`
- สูตรทุกสูตรเรียกจาก pure module ตาม `docs/22` **ไม่มีการ hardcode สูตรซ้ำใน route/UI**
- VAT ไม่ hardcode 7% (resolve จาก `vat_rate_history` + snapshot `vat_rate_used`) · WHT: Payee-level ชนะ Plan-level, ฐาน before_vat, threshold 1,000
- หารศูนย์: `revenue = 0` → margin "N/A" · advance `used > requested` → return = 0 ไม่ติดลบ
- Snapshot ครบตาม `92` §7.1 (ไม่คำนวณย้อนหลังจาก live template)

**สิทธิ์ + audit**
- ทุก endpoint ผ่าน `requirePermission(action, resource, scope)` — ไม่มีตัวไหนหลุด · scope ย่อย (ทีม/บริษัท/own) enforce จริงใน business logic
- ทุก mutation ลง audit ครบ 9 fields · `reason` บังคับเมื่อกระทบเงิน/สิทธิ์/ธนาคาร/ภาษี/lock period
- ไม่มีทางรั่วข้อมูลข้ามบริษัท (`organization_id` / `company_id` filter ครบ)

**สถานะ + validation**
- state transition ตรง `docs/23` และ enum ตรง `docs/02` §3 เป๊ะ ไม่มีสถานะที่คิดขึ้นเอง
- error code มาจาก `docs/24` เท่านั้น · reject/cancel ทุกชนิดมี reason
- Zod schema เดียวใช้ร่วม FE/BE · ไม่มี `any`

**วันเวลา + UI**
- แสดงผลเป็น พ.ศ. `DD/MM/YYYY` ผ่าน utils กลาง (ค.ศ. บนหน้าจอ = bug) · storage เป็น UTC
- ใช้ component/สี/badge จาก UI Kit กลาง ไม่มีสีสุ่มนอก `04` §8.1 · ทุกหน้ามี loading/empty/error state

**test**
- งานการเงินในก้อนนี้มี unit test ในก้อนเดียวกันจริง · test ที่ spec ระบุชื่อไว้ (§16/§17) มีครบ
- ไม่มีการแก้เทสต์ให้ผ่านแทนการแก้โค้ด

**reuse**
- ของที่สร้างใหม่และ reuse ได้ ถูกเพิ่มใน `docs/REUSE_INDEX.md` แล้ว · ไม่ได้สร้างซ้ำของที่มีอยู่แล้วในนั้น

รายงานเป็นตาราง: จุดที่ผ่าน / จุดที่ต้องแก้ (พร้อม `ไฟล์:บรรทัด`) แล้ว**แก้ให้เลย** + verify + commit
