# 02_OPEN_DECISIONS.md — ผลรีวิวรอบ Developer (จุดที่ spec ยังไม่เคลียร์)

---

## ✅ มติ Product Owner — 2026-08-12 (มีผลเหนือสถานะ ⬜ รายข้อด้านล่างทั้งหมด)

PO (Boonphone) เคาะหลักการครอบทุกข้อในไฟล์นี้:

1. **เรื่องระบบ / flow / โครงสร้าง ที่ต้องเลือกอย่างใดอย่างหนึ่ง → ใช้ตามตัวเลือกที่แนะนำ (ก / default) ทุกข้อ** — ถือเป็นการตัดสินใจอย่างเป็นทางการ implement ได้เลยโดยไม่ต้องถามซ้ำ แล้วแก้ spec ต้นทาง + changelog ให้สอดคล้อง
2. **เรื่องเทมเพลต / รูปแบบ / ค่าที่ต้องรอคำตอบจากงานจริง (เช่นนักบัญชี) → ทำเป็นตัวเลือกที่หน้าตั้งค่า** พร้อมค่า default ตามที่แนะนำ — ระบบเดินได้ทันที ค่าจริงมาเมื่อไหร่ค่อยปรับที่เมนูตั้งค่า ไม่ต้องแก้โค้ด

### รายการที่แปลงเป็น Setting ตามมติข้อ 2 (เพิ่มจากที่ spec มีอยู่แล้ว)

| ข้อ | Setting ใหม่ | อยู่แท็บ | Default |
|---|---|---|---|
| A1 | อัตรา WHT ที่ลูกค้าหักจากเรา (ต่อบริษัทไฟแนนซ์: ไม่หัก/3%/กำหนดเอง) | ตั้งค่าบริษัทไฟแนนซ์ (`10`) | 3% |
| A3 | `charge_per_tracking_round` — คิดค่าบริการต่อรอบการติดตามหรือไม่ | Service Fee Template (`12`) | เปิด (แต่ละรอบอิสระ = ตัวเลือก ก) ✅ column ลงแล้ว Phase 1.1 |
| B3 | จำนวนเงินขั้นต่ำ WHT | มีแล้ว (`13` §6.4) | 1,000 บาท |
| B4 | `write_off_tolerance_satang` — เพดานตัดส่วนต่างค่าธรรมเนียมธนาคารอัตโนมัติ | ตั้งค่าบัญชี/การเงิน (`13`) | 5,000 satang ✅ column ลงแล้ว Phase 1.1 |
| D3 | เพดานขนาด/จำนวนไฟล์สื่อ (รูป/วิดีโอ/เสียง/เอกสาร) | ตั้งค่าระบบ | ตามตาราง D3 |
| D4 | เกณฑ์ GPS flag (`accuracy_warn_m`, `distance_warn_km`) | ตั้งค่าระบบ | 100m / 2km |
| D8 | เพดานแถว import + เกณฑ์เข้า background job | ตั้งค่าระบบ | 1,000 / 200 แถว |
| D12 | เกณฑ์ตัด advance ไม่มีใบเสร็จเป็นลูกหนี้พนักงาน | ตั้งค่าบัญชี/การเงิน (`13`) | เปิด + หักจาก payout รอบถัดไป ✅ column ลงแล้ว Phase 1.1 |

### ⚠️ ข้อยกเว้น 3 เรื่องที่ **ห้ามทำเป็น setting** (fix ในโค้ดเท่านั้น — เปลี่ยนภายหลังต้องออก DEC ใหม่)

- **B1/B2 กฎปัดเศษ (half-up ระดับ satang, ปัดที่ item)** — ถ้าเป็น toggle แล้วมีคนสลับกลางทาง ตัวเลขบนเอกสารที่ออกไปแล้วจะขัดกับการคำนวณซ้ำทันที ตรวจสอบย้อนหลังไม่ได้ — ต้องเป็นค่าคงที่ในโค้ด + นักบัญชีเซ็นรับก่อนออกเอกสารจริงใบแรก
- **B3 ฐานรวม WHT (ต่อ payee ต่อรอบจ่าย)** — เป็นการตีความกฎหมาย ไม่ใช่ preference (จำนวนเงิน threshold เป็น setting ได้ แต่*วิธีรวมฐาน*ห้ามสลับ)
- **C1/C2 Revenue trigger + revenue_date** — เป็นหัวใจ integrity ของระบบ ถ้า configurable จะทดสอบไม่ได้ครบทุก combination

### สิ่งที่มตินี้ยังไม่ครอบ (blocker ภายนอก — ติดตามใน `93` §7.1 + PROGRESS.md)

สมัคร GitHub/Vercel/Supabase (ก่อน 0.1) · Google Maps API key (ก่อน 2.9) · spec แดชบอร์ดหลัก (6.6 ⏸️) · Auth method Client Portal (Phase 7 🔒) · ทดสอบ Bank File กับธนาคารจริง + ค่าเริ่มต้นเลขใบกำกับ (ก่อนใช้เงินจริง) · PDPA sign-off (ก่อน go-live) · 🔶 รายการที่ติดธง "นักบัญชีเซ็นรับ": B1, B2, B3(ฐานรวม), A1(อัตราจริงรายบริษัท), D12(เกณฑ์ลูกหนี้พนักงาน) — ไม่บล็อกโค้ด แต่บล็อกการออกเอกสาร/จ่ายเงินจริงครั้งแรก

---

> **ที่มา**: รีวิวเชิง implementation ทั้งชุด spec เมื่อ 2026-08-12 — หา "จุดที่ developer จะต้องหยุดถามหรือเดา" นอกเหนือจาก Open Items ที่บันทึกใน `93` §7.1 อยู่แล้ว
> **วิธีใช้**: ตอบในช่อง `คำตอบ:` ของแต่ละข้อ → เปลี่ยน ⬜ เป็น ✅ → session ที่ implement task นั้นจะอ่านไฟล์นี้ตาม reading list · ข้อที่มี **[default]** = ถ้าไม่ตอบ ระบบจะใช้ตาม default ที่เสนอ (เลือกให้แล้วอย่างมีเหตุผล) · ข้อที่ไม่มี default = **ต้องตอบก่อนถึง task ที่ระบุ ห้ามเดา**
> เมื่อคำตอบทำให้ต้องแก้ spec ต้นทาง ให้แก้ไฟล์นั้น + เพิ่ม changelog + อัปเดตข้อนี้เป็น ✅ พร้อมอ้าง commit

---

## หมวด A — กระทบ Schema ต้องตอบก่อน Phase 1.1–1.2 (Prisma migration)

> retrofit ทีหลังแพงที่สุด — ควรเคาะทั้งหมวดก่อนเริ่มเขียน `schema.prisma`

### ✅ A1 — WHT ที่ "ลูกค้าหักจากเรา" ไม่มีที่เก็บในระบบ (ร้ายแรงสุดของรอบรีวิว)
- **ปัญหา**: AssetRecovery เป็นผู้ให้บริการ → บริษัทไฟแนนซ์จะหัก WHT 3% จากค่าบริการเราแทบทุกใบ แต่ Billing Batch (`19` §7.2), Cash Receipt (`31` §7.3) ไม่มี field รองรับ และ `33` เป็น WHT ฝั่งเราหักคนอื่นล้วน (มีร่องรอยแค่คอลัมน์ "WHT ลูกค้าหัก (ถ้ามี)" ใน `31` §8)
- **ผล**: เงินเข้าจริงน้อยกว่ายอดบิล 3% เสมอ → auto-match (`35` §6.2 เทียบยอดตรงเป๊ะ) ไม่ติดทุกใบ, AR ค้าง 3% ตลอดกาล, ปิดงวดไม่ผ่าน, และไม่มีที่เก็บใบ 50 ทวิที่ลูกค้าออกให้ (เครดิตภาษีของบริษัท = เงินจริง)
- **เสนอ**: เพิ่ม `wht_withheld_by_customer_satang` ที่ billing_batches + cash_receipts, auto-match เทียบ `total − expected_wht` ด้วย, เพิ่ม entity เก็บใบ 50 ทวิฝั่งรับ (เลขที่/วันที่/ยอด/ไฟล์)
- **ผู้ตอบ**: นักบัญชี (ยืนยันว่าไฟแนนซ์หักจริงไหม อัตราเท่าไร) + PO · **บล็อก**: 1.2, 3.6, 4.2
- **คำตอบ**: ✅ ตามมติ PO 2026-08-12 (setting ต่อบริษัท default 3%) — **ทำแล้วบางส่วนใน Phase 1.1**: `finance_companies.wht_withheld_by_customer_pct` (`02` v3.7) · ส่วนที่เหลือ (`billing_batches`/`cash_receipts` + entity เก็บใบ 50 ทวิฝั่งรับ + auto-match เทียบ `total − expected_wht`) อยู่ใน **1.2 / 3.6 / 4.2** · 🔶 อัตราจริงรายบริษัทรอนักบัญชียืนยันก่อนวางบิลจริงใบแรก

### ✅ A2 — เงินเข้า 1 ก้อน จ่ายหลาย billing batch / จ่ายบางส่วน — schema รองรับไม่ได้
- **ปัญหา**: `bank_transactions` เป็น FK เดี่ยว `matched_billing_id` (1:1) แต่ไฟแนนซ์ปกติโอนรวมหลายรอบบิลใน 1 transaction — โครงสร้างปัจจุบัน match ไม่ได้เลย และไม่มีกฎเมื่อจ่ายเกิน (`ar` ติดลบ)
- **เสนอ**: ตารางกลาง `bank_transaction_allocations` (transaction↔batch many-to-many + allocated_satang) · เงินเกิน → เก็บเป็น credit balance ของบริษัท ไม่ให้ AR ติดลบ
- **ผู้ตอบ**: PO (+นักบัญชีเรื่อง credit) · **บล็อก**: 1.2, 4.2
- **คำตอบ**: ✅ ตามมติ PO 2026-08-12 (ใช้ default) — **schema ทำแล้วใน Phase 1.2** (`02` v3.8): ตาราง `bank_transaction_allocations` (transaction ↔ billing batch + `allocated_satang`) · ส่วนเกิน = แถว `is_credit = true` (`billing_batch_id` NULL) เก็บเป็น credit ของบริษัท ไม่ให้ AR ติดลบ · `bank_transactions.is_split_allocation` แยกโหมดจับคู่แบ่งยอดออกจากจับคู่ 1:1 (CHECK `bank_tx_status_fk_shape` ขยายรองรับแล้ว) · **logic auto-match/ตัด credit อยู่ใน 4.2** · 🔶 กติกาการใช้ credit รอบถัดไปรอนักบัญชียืนยัน

### ✅ B3 — Recycle รอบ 2 สำเร็จ → เก็บเงินไฟแนนซ์ซ้ำไหม / commission ทับ no_success_fee ไหม
- **ปัญหา**: รอบ 1 `closed_fail` + model `charge_on_fail=true` → เกิด Revenue ใบ 1 + จ่าย no_success_fee แล้ว → recycle → รอบ 2 `closed_success` → spec ไม่ห้ามเกิด Revenue ใบ 2 (บิลซ้ำสำหรับทรัพย์ชิ้นเดียว) + จ่าย commission ทับ · `revenues` ไม่มี field `tracking_round` เลย
- **เสนอ**: เพิ่ม `tracking_round` ลง revenues + payout_batch_items ตั้งแต่ตอนนี้ไม่ว่าคำตอบเป็นอะไร · ตัวเลือก: (a) แต่ละรอบอิสระเก็บได้ทุกรอบ (b) รอบใหม่หักกลบรอบเก่า (c) รอบเก่าต้องออก Credit Note
- **ผู้ตอบ**: PO (ขึ้นกับสัญญากับไฟแนนซ์) · **บล็อก**: 1.2 (เพิ่ม column), 3.6 (logic)
- **คำตอบ**: ✅ ตามมติ PO 2026-08-12 — **column ทำแล้วใน Phase 1.2** (`02` v3.8): `revenues.tracking_round` + `payout_batch_items.tracking_round` (default 1) · ตัวเลือกกติกาเก็บเงิน = (a) แต่ละรอบอิสระ ตาม `service_fee_templates.charge_per_tracking_round` ที่ลงไว้แล้วใน 1.1 (A3) · **logic กันบิลซ้ำ/commission ทับ อยู่ใน 3.6**

### ✅ A4 — Advance ไม่มีเส้นทางจ่ายเงินออก/รับเงินคืน
- **ปัญหา**: `payout_batch_items.source_expense_id` บังคับ → Advance (ไม่ใช่ expense) เข้ารอบจ่ายไม่ได้ = เงินออกนอกระบบ → bank reconciliation มีรายการ match ไม่ได้ทุกครั้งที่เบิก และเงินคืน (`return_satang`) ก็ไม่มี flow รับ
- **เสนอ**: `source_expense_id` เป็น nullable + เพิ่ม `source_advance_id` (separate FK ตาม DEC-004) + เพิ่ม `matched_advance_id` ฝั่ง bank_transactions สำหรับขาเงินคืน
- **ผู้ตอบ**: PO ยืนยันแนวทาง (เรื่อง technical ผมเสนอให้แล้ว) · **บล็อก**: 1.2, 3.3, 3.4, 4.2
- **คำตอบ**: ✅ ตามมติ PO 2026-08-12 (ใช้ default) — **schema ทำแล้วใน Phase 1.2** (`02` v3.8): `payout_batch_items.expense_id` เป็น nullable + `advance_id` + CHECK `pbi_one_source` (exactly-one non-null ตาม DEC-004) · `advances.payout_batch_item_id` (ขาจ่ายออก) · `bank_transactions.matched_advance_id` (ขารับคืน) · **ชื่อคอลัมน์ใช้ `expense_id`/`advance_id` ไม่ใช่ `source_*`** เพราะ `02` เป็น SSOT ของชื่อคอลัมน์และคอลัมน์เดิมชื่อ `expense_id` อยู่แล้ว · **logic เข้ารอบจ่าย/รับคืน อยู่ใน 3.3–3.4 / 4.2**

### ✅ A5 — `due_rule` เป็น free text คำนวณไม่ได้
- **ปัญหา**: `13` §6.1 เก็บ "Net 30 Days" / "วันที่ 5 ของเดือนถัดไป" เป็น string แต่ `19` §7.2 ให้คำนวณ `due_date` จากมัน → AR Aging ทั้งรายงานตั้งอยู่บน parser ที่ต้องเดา
- **เสนอ [default]**: เปลี่ยนเป็น structured `{type: 'net_days'|'day_of_next_month'|'month_end', value}` + เก็บ free text เป็น label · วันที่เกินจำนวนวันในเดือน → clamp วันสุดท้ายของเดือน
- **ผู้ตอบ**: ไม่ค้าน = ใช้ default · **บล็อก**: 1.2, 1.10
- **คำตอบ**: ✅ ทำแล้วใน **Phase 1.1** ตาม default — enum `due_rule_type` + `due_rule_value` + คง `due_rule` เดิมเป็น label + CHECK `cycles_due_rule_shape` บังคับให้ `net_days`/`day_of_next_month` มีค่าตัวเลขเสมอ (`02` v3.7) · การ clamp วันสุดท้ายของเดือนทำที่ business logic ตอน 1.10

### ✅ A6 — IMEI: `38` เก็บ free text "IMEI หรือ Serial" แต่ `44` บังคับ 15 หลัก + UNIQUE
- **ปัญหา**: tablet Wi-Fi ไม่มี IMEI (มี serial) → asset auto-create ชน validation ทันทีที่มีเคส tablet · และเคส recycle/เครื่องเดิมกลับมาอีกรอบจะชน `UNIQUE(org, imei_contract)`
- **เสนอ [default]**: แยก `imei` (15 หลัก, nullable) + `serial_no` · unique เป็น partial `WHERE imei IS NOT NULL AND asset_status <> 'handed_over'` + business check ตอน intake พร้อมข้อความอ่านออก
- **ผู้ตอบ**: ไม่ค้าน = ใช้ default · **บล็อก**: 1.2, 2.2, 2.13
- **คำตอบ**: ✅ ตาม default — **schema ทำแล้วใน Phase 1.2** (`02` v3.8): `cases.serial_no` + `assets.serial_contract`/`serial_actual` · `assets.imei_contract` เป็น nullable + CHECK `assets_identifier_required` (ต้องมี IMEI หรือ serial อย่างน้อย 1) · partial unique `uniq_assets_active_imei` (เฉพาะ `imei_contract IS NOT NULL AND asset_status <> 'handed_over' AND deleted_at IS NULL`) แทน UNIQUE เต็มตารางเดิม · **business check ตอน intake + ข้อความ error อ่านออก อยู่ใน 2.13** (IMEI ยังเป็น exact match 15 หลัก ห้าม fuzzy — `44` §6.5)

### ✅ A7 — `finance_companies` ขาดฟิลด์ที่ไฟล์ `10` §7.1 + mockup ใช้จริง (พบตอนเริ่ม Phase 1.8)
- **ปัญหา**: `02` §5 ไม่มี `suspended_reason` (การ์ดบริษัทแสดงกล่องเหตุผลระงับ · §11 `SUSPEND_REASON_REQUIRED`) และไม่มี `default_invoice_delivery_format` (§7.1 บังคับ) · comment ของ `status` เขียน `active | inactive` ขณะที่ `10` §9.3 + mockup ใช้ `active | suspended`
- **ผู้ตอบ**: **PO 14/08/2569 — เลือกตัวเลือกที่ 1** (เพิ่ม migration 2 คอลัมน์ + enum `invoice_delivery_format` + แก้ comment `status` พร้อม changelog `02`)
- **คำตอบ**: ✅ ทำแล้วใน **Phase 1.8** (`02` v3.9) — migration `20260814043410_finance_company_suspend_delivery_format` · คง `status` เป็น TEXT ไม่แปลงเป็น enum

### ⬜ A8 — `finance_companies.signer_phone` ยังไม่มีที่เก็บ (ต่อเนื่องจาก A7)
- **ปัญหา**: `10` §7.1 มีฟิลด์ `signer_phone` (เบอร์ผู้มีอำนาจลงนาม) และ mockup การ์ดบริษัทก็แสดง แต่ `02` §5 ไม่มีคอลัมน์นี้ — มติ 14/08/2569 อนุมัติเฉพาะ 2 คอลัมน์ของ A7 จึง**ยังไม่เพิ่ม**
- **[default]**: เพิ่ม `signer_phone VARCHAR(20)` คู่กับ `signer_name` ตอน task ถัดไปที่แตะตารางนี้ (เอกสารทางการอ้าง `signer_name` เป็นหลัก เบอร์เป็นข้อมูลติดต่อประกอบ) · **บล็อก**: ไม่บล็อก — ฟอร์ม/การ์ดของ 1.8 ไม่มีช่องนี้ไปก่อน · **คำตอบ**:

---

## หมวด B — กติกาเงินที่ต้องให้นักบัญชีเคาะ (รวมถามพร้อม A2/C3/C4/D2 ของ `QUESTIONS-FOR-ACCOUNTANT.md` รอบเดียว)

### ⬜ B1 — กฎปัดเศษ (ไม่มีในสเปคเลยทั้งชุด)
- **ปัญหา**: ทุกสูตร % บนฐาน satang ได้ผลไม่ลงตัว (`include_vat`: 1,000,000×7/107 = 65,420.56 satang) — ปัดขึ้น/ลง/half-up ไม่มีใครกำหนด → ตัวเลขบนใบกำกับ vs AR vs ธนาคารเพี้ยนแบบสุ่มถ้า dev แต่ละโมดูลเขียนต่างกัน
- **เสนอ [default]**: **half-up ที่ระดับ satang เสมอ** ผ่าน util กลาง `calcPercent()` ตัวเดียว ห้าม inline · `include_vat` คำนวณ VAT แล้ว derive `gross = total − vat` (ห้ามคำนวณสองขาแยก)
- **บล็อก**: 3.1 · **คำตอบ**:

### ⬜ B2 — ปัดเศษที่ระดับ item เท่านั้น (สูตร batch ใน `22` §6.10 ขัดกันเอง)
- **ปัญหา**: `batch.net = batch.gross − batch.wht` และ `= SUM(item.net)` เป็นจริงพร้อมกันไม่ได้ → ไฟล์โอนธนาคาร (รวมรายบรรทัด) ไม่ตรงยอด batch
- **เสนอ [default]**: ปัดครั้งเดียวที่ระดับรายการ ทุก aggregate = SUM ของ integer ห้าม recompute จาก % → แก้ `22` §6.10 ให้เหลือ SUM
- **บล็อก**: 3.1, 3.4 · **คำตอบ**:

### ⬜ B3 — WHT threshold 1,000 บาท เช็คต่ออะไร + ไฟล์โอน 1 บรรทัดต่อ payee?
- **ปัญหา**: payee 1 คนมี 3 รายการ ๆ ละ 400 — ต่อ item = ไม่หักเลย / รวมต่อคนต่อ batch = หัก 36 · กฎหมายดูที่การจ่ายจริงต่อครั้ง · และ `17` ไม่เคยบอกว่าไฟล์โอนมีกี่บรรทัดต่อคน · `33` §9 "1 รายการจ่าย = 1 ใบรับรอง" จะกลายเป็น 3 ใบต่อการโอน 1 ครั้ง
- **เสนอ [default]**: รวมต่อ payee ต่อ batch → WHT คำนวณครั้งเดียว, ไฟล์โอน 1 บรรทัด/payee, ใบ 50 ทวิ 1 ฉบับ/payee/batch
- **บล็อก**: 3.1, 3.4, 4.5 · **คำตอบ**:

### ⬜ B4 — ยอดโอนคลาดจากค่าธรรมเนียมธนาคาร (10–25 บาท) ทำยังไง
- **ปัญหา**: `35` §6.3 บอกแค่ต้องกรอก match_note — ไม่บอกว่า `received_amount` ลงยอดจริงหรือยอดเต็ม → batch ไม่มีวัน `paid` หรือระบบไม่ตรงธนาคาร
- **เสนอ [default]**: ตั้ง `write_off_tolerance_satang` ระดับองค์กร (เสนอ 5,000 satang) — ส่วนต่าง ≤ tolerance สร้าง write-off entry อัตโนมัติ (ลงบัญชีค่าธรรมเนียมธนาคาร) แล้วปิด batch ได้ · นักบัญชีเคาะตัวเลข tolerance
- **บล็อก**: 4.2 · **คำตอบ**:

### ⬜ B5 — Adjustment กระทบ VAT/ใบกำกับที่ออกแล้วไหม + adjust batch ที่ `paid` ได้ไหม
- **ปัญหา**: `20` มีแค่ `amount` เดียว (ไม่มี vat/wht) — ปรับ Revenue แล้ว VAT ตามไหม? ใบกำกับที่ `active` จะขัดยอดจริง · batch `paid` โดน adjust แล้วสถานะถอยกลับไม่ได้ (state machine ทางเดียว) = AR หายเงียบ
- **เสนอ [default]**: Adjustment ห้ามใช้กับรายการที่กระทบฐานภาษีที่ออกใบกำกับแล้ว → ต้องใช้ Credit Note (ผูกกับคำถาม C4 ที่รอนักบัญชี) · ห้าม adjust batch `paid`
- **บล็อก**: 3.7 · **คำตอบ**:

---

## หมวด C — Spec ขัดกันเอง (ต้องแก้ไฟล์ — ผมเสนอ default ไว้ ถ้าไม่ค้านจะแก้ตามนี้ตอนถึง task)

### ⬜ C1 — `revenue_date` นิยามขัดกันในไฟล์เดียว (`19` §7.1 = วันปิดเคส vs §6.1 = เกิดตอนเงื่อนไขครบ)
- **ผล**: ช่วง VAT 7%→10% (1 ต.ค. 2569) เคสปิด 28 ก.ย. Lot confirm 3 ต.ค. → เลือกผิด = ใบกำกับผิดอัตรา 3% ทั้งบิล
- **[default]**: `revenue_date` = วันที่เงื่อนไขครบข้อสุดท้าย (วันที่ record ถูกสร้างจริง) → แก้ §7.1 · **บล็อก**: 3.6 · **คำตอบ**:

### ⬜ C2 — Revenue trigger เมื่อเคสมีหลาย expense — "approved" หมายถึงใบไหน
- **ผล**: ตีความ "ใบแรก" = วางบิลก่อนเคสจบ / "ทุกใบ" โดยไม่มี alert = เคสที่มีใบค้าง needs_revision ไม่เกิดรายได้เงียบ ๆ
- **[default]**: ทุก expense ของเคสที่ไม่ใช่ superseded/rejected ต้อง approved ครบ + สร้าง exception "closed_success เกิน N วันยังไม่มี Revenue" ใน `34` · **บล็อก**: 3.6 · **คำตอบ**:

### ⬜ C3 — `success_rate` สูตรขัดกัน (`40` §6.2 หารด้วยเคสที่ได้รับมอบหมาย vs `41` §6.8 หารด้วยเคสที่ปิดแล้ว)
- **[default]**: ตัวหาร = เคสที่ปิดงานแล้ว · `reassigned_away` ไม่นับทั้งเศษ/ส่วน · recycle นับต่อ assignment · แก้ `40` §6.2 · **บล็อก**: 2.6 · **คำตอบ**:

### ⬜ C4 — Audit log: `90` §12 ให้การเงิน/บัญชีดูได้ แต่เมนูอยู่ใต้ Settings ที่ `06` §7.2 ห้ามเข้า
- **[default]**: แยก Audit Log เป็นเมนู/หน้าของตัวเอง (ไม่อยู่ใต้ Settings) + แก้ matrix `06` §7.2 · **บล็อก**: 1.5, 5.2 · **คำตอบ**:

### ⬜ C5 — Role "ธุรการ (Admin)" หายจาก Top Nav matrix ทั้งคอลัมน์ (`06` §7.2 มี 8 คอลัมน์ไม่มีธุรการ แต่ `08` ให้ธุรการจัดการ user ได้)
- **ไม่มี default — ต้อง PO เคาะ**: ธุรการเห็นเมนูอะไรบ้าง (เสนอ: แดชบอร์ด + จัดการเคส + คลังสินค้า + Settings เฉพาะ sub-tab users) · **บล็อก**: 1.5 · **คำตอบ**:

### ⬜ C6 — Supervisor กับรายงาน: `06` §7.2 ให้ดู O1–O5 แต่ `96` §5/§10 ไม่มี Supervisor เลย
- **[default]**: เติม Supervisor ใน `96` §10 = ดู O1–O5 เฉพาะทีมเดียวที่สังกัด · **บล็อก**: 6.3 · **คำตอบ**:

### ⬜ C7 — `97` เมนู "รายงานสรุป" ถูกยุบเข้า Dashboard แล้ว (v3) แต่ §8/§13 ยังอ้างเมนูเดิม และ §5 อธิบาย Dashboard ไม่ครบ
- **[default]**: Dashboard = KPI 4 ใบ + Revenue trend 6 เดือน + AR Aging · แก้ §5/§8 ให้ตรง v3 · **บล็อก**: 7.3 · **คำตอบ**:

### ⬜ C8 — `job_type` 5 ตัว (`91` §6.1) แต่ §14.1/§17 ยังเขียน 4 ตัว (ตกหล่น `advance_overdue`)
- **[default]**: dev trigger รองรับครบ 5 · แก้ §14.1/§17 · **บล็อก**: 5.3 · **คำตอบ**:

---

## หมวด D — Flow ที่ไม่มีทางเดิน (จะจอดตอน implement — ต้องเคาะก่อนถึง task ที่ระบุ)

### ✅ D1 — First-login / invite flow ไม่มีเลย (สร้าง user แล้วตั้งรหัสผ่านครั้งแรกยังไง?)
- **[default]**: Supabase `inviteUserByEmail` → user ตั้งรหัสเอง · PO เคาะ: อายุลิงก์, ใครส่งซ้ำได้ · **บล็อก**: 1.3, 1.9 (บล็อก sprint แรกจริง) · **คำตอบ (PO 14/08/2569)**: ใช้ `inviteUserByEmail` ส่งลิงก์ให้ผู้ใช้ตั้งรหัสผ่านเอง — implement แล้วใน Phase 1.9
  - สร้างผู้ใช้ = เชิญอัตโนมัติ · ส่งซ้ำได้ที่ `POST /api/users/:id/invite` (สิทธิ์ `manage:manage_users` — ชุดเดียวกับคนที่สร้างผู้ใช้ได้ · บังคับ `reason` เพราะแตะ `supabase_uid`)
  - **อายุลิงก์** = ค่าของ Supabase project (Dashboard → Auth → Email link expiry) ไม่ override รายครั้ง
  - ปลายทางลิงก์ = `/auth/set-password` (ต้องเพิ่มใน Redirect URLs ของทุก environment) · รหัสผ่านขั้นต่ำ 8 ตัว มีทั้งตัวอักษรและตัวเลข (`lib/auth/schemas.ts`)
  - เชิญไม่สำเร็จตอนสร้าง = ไม่ reject งาน — บันทึกผู้ใช้โดย `supabase_uid = null` (UI ขึ้นป้าย "รอตั้งรหัสผ่าน") แล้วส่งซ้ำได้

### ⬜ D2 — ลืมรหัสผ่านไม่มีในสเปค (0 hit ทั้งโปรเจกต์)
- **[default]**: Supabase reset email + custom template ภาษาไทย + rate limit · user suspended กด reset ไม่ได้แบบไม่ leak · **บล็อก**: 1.3 · **คำตอบ**:

### ⬜ D3 — สถาปัตยกรรม upload: Vercel API route จำกัด body ~4.5MB แต่วิดีโอบังคับทุกเคส
- **[default]**: signed-URL direct-to-Supabase-Storage ทุกไฟล์สื่อ ไม่ผ่าน API route · อัปทันทีที่เลือกไฟล์ (เก็บ file_id ลง draft ทีละไฟล์) + retry ต่อไฟล์ · เพดานกลาง: รูป ≤10MB, วิดีโอ ≤200MB/≤60วิ (แนะนำ transcode 720p ฝั่ง client), เสียง ≤25MB, เอกสาร ≤20MB · จำนวน: photos ≤15, videos ≤5, audio ≤3, other_doc ≤10 → เขียนเป็นตารางเดียวใน `03` · **PO เคาะตัวเลข** · **บล็อก**: 2.2, 2.9, 2.11 · **คำตอบ**:

### ⬜ D4 — GPS ไม่มี guard (accuracy / mock / ระยะห่างจากที่อยู่ลูกหนี้) ทั้งที่เป็นฐานจ่ายเงิน PER_KM
- **[default]**: ไม่ hard-block — เก็บ `accuracy_m`, `is_mock_suspected`, `distance_from_debtor_m` ลง checkin + flag เตือนผู้อนุมัติเมื่อ accuracy >100m หรือห่าง >2km · **บล็อก**: 2.8 · **คำตอบ**:

### ⬜ D5 — `reject_evidence` หลังของเดินไปแล้ว (asset in_custody / lot confirmed / expense จ่ายแล้ว) — enum ไม่มีทางย้อน
- **[default]**: block `reject_evidence` เมื่อ asset พ้น `pending_intake` หรือ expense พ้น `approved` (error ใหม่ `EVIDENCE_REJECT_BLOCKED_DOWNSTREAM`) — ปัญหาหลังจากนั้นใช้ Adjustment/Credit Note · **บล็อก**: 2.9, 2.13 · **คำตอบ**:

### ⬜ D6 — Warehouse ขาด 2 state: "ยกเลิก Lot ก่อน confirm" และ "เครื่องหาย/พังในคลัง"
- **[default]**: เพิ่ม `POST /handover-lots/:id/cancel` + state `cancelled` (rollback asset → in_custody, เลข Lot ไม่ recycle) · เพิ่ม `asset_status = lost` (terminal, reason + ผู้อนุมัติ + audit event) — ผลต่อ Revenue ของเคสนั้นให้ PO เคาะ · **บล็อก**: 1.2 (enum), 2.13 · **คำตอบ**:

### ⬜ D7 — Agent ถูก suspend ระหว่างถือเคส / ทีม deactivate ที่มีเคส active — ไม่มี flow
- **[default]**: suspend → แสดงจำนวนเคส active ก่อนยืนยัน + เคสของ user suspended reassign ได้ทันทีข้ามขั้นยินยอม (resolution `agent_suspended`) · ทีม: error `TEAM_HAS_ACTIVE_CASES` + modal bulk reassign ก่อนปิดทีม · **บล็อก**: 1.9, 2.6 · **คำตอบ**:

### ⬜ D8 — Import เคส: spec บางเกิน (ไม่มี template/เพดานแถว/พฤติกรรม error) + เคส import แนบเอกสารไม่ได้ → ค้าง draft ถาวร
- **[default]**: column template ตายตัว + ไฟล์ตัวอย่างดาวน์โหลด · เพดาน 1,000 แถว (>200 แถวเป็น background job) · preview → ผู้ใช้ยืนยัน "สร้างเฉพาะแถวที่ผ่าน" + error report · เพิ่ม queue "draft — ขาดเอกสาร" เติมเอกสารต่อเนื่องไม่ต้องกลับ list · **บล็อก**: 2.3, 2.5 · **คำตอบ**:

### ⬜ D9 — Recycle รอบใหม่: ทีมเดิมหรือ route ใหม่ + ประวัติรอบเก่าแสดงที่ไหน
- **[default]**: สร้าง assignment record ใหม่เสมอ · re-run team suggestion จาก province ปัจจุบัน + pre-select ทีมเดิม · Case Detail มีแท็บ "รอบก่อนหน้า" ดูหลักฐาน/ผลรอบเก่า · **บล็อก**: 2.3, 2.6 · **คำตอบ**:

### ⬜ D10 — Google Maps ล่ม/quota หมดตอนปิดงาน + expense ยอด 0 + payout batch ว่าง
- **[default]**: ปิดงานสำเร็จเสมอ — fuel เป็น `pending_calculation` แล้ว retry ด้วย background job · expense ยอด 0 ไม่สร้าง record (เข้าเงื่อนไข "เคสไม่มี expense" DEC-006/D6 — เขียนกำกับใน `19` §6.1) · เพิ่ม `EMPTY_PAYOUT_BATCH` reject batch 0 รายการ · **บล็อก**: 2.9, 3.4 · **คำตอบ**:

### ⬜ D11 — เลขรันนิ่งเอกสาร: กัน race + ขอบปี + receipt/50ทวิ ไม่มี format config
- **[default]**: `SELECT ... FOR UPDATE` ใน transaction เดียวกับ insert (ห้ามใช้ PG sequence — gap ตอน rollback ผิดกฎ "ห้ามขาดช่วง") · ตัดปี yearly_reset ด้วย issue_date เวลาไทย · ขยาย `13` §6.12 ครอบ receipt + wht_certificate (sequence แยกต่อชนิด) · **บล็อก**: 4.3, 4.5 · **คำตอบ**:

### ⬜ D12 — Advance เคลียร์บางส่วน / overdue ค้างข้ามงวด
- **[default]**: เคลียร์ครั้งเดียวเหมือนเดิม + เพิ่ม flow "ตัดส่วนไม่มีใบเสร็จเป็นลูกหนี้พนักงาน หักจาก payout รอบถัดไป" · advance overdue ไม่ block ปิดงวดแต่ขึ้น warning exception — **นักบัญชีเคาะ** · **บล็อก**: 3.3 · **คำตอบ**:

---

## หมวด E — มาตรฐานกลาง UI/Platform ที่หายไป (ผมตั้ง default ให้แล้ว — รับทราบ/ค้านพอ จะเขียนเป็นกฎเพิ่มใน `03`/`04` ตอน task 1.5)

| # | เรื่อง | Default ที่จะใช้ |
|---|---|---|
| E1 | Pagination | server-side เสมอ, `?page=&limit=` default 25, envelope `{data,total,page,limit}` · audit log/cases ใช้ cursor-based · mobile card list = infinite scroll ทีละ 20 |
| E2 | Sort | default `created_at DESC` ทุก list (เว้นระบุ) · sort ได้เฉพาะคอลัมน์วันที่/จำนวนเงิน/สถานะ · ส่งไป server เสมอ ห้าม client-sort เมื่อมี pagination |
| E3 | Search | debounce 300ms, ขั้นต่ำ 2 ตัวอักษร, `ILIKE '%x%'`, เบอร์โทร strip ขีดก่อนค้น, ตาราง cases ใช้ trigram index |
| E4 | Filter/state | filter/sort/page อยู่ใน URL query เสมอ (Back/แชร์ลิงก์ทำงานถูก) · เปลี่ยน filter → กลับหน้า 1 |
| E5 | Number format | เงิน = comma + ทศนิยม 2 ตำแหน่ง, ติดลบ `-1,234.50` สีแดง, % 1 ตำแหน่ง, ปัดเฉพาะตอนแสดงผล → util `fmtMoney()` คู่ `fmtDate()` (เพิ่มเป็น `03` §6.6) |
| E6 | ข้อความ error ไทย | message catalog กลางไฟล์เดียว map error code → ข้อความไทย · API คืน code เสมอ UI เป็นคนแปล · เฟส 1 ไทยล้วน ไม่ทำ i18n framework |
| E7 | Business date | ทุกการแปลง timestamp → วันที่เชิงธุรกิจ (นับวันเบี้ยเลี้ยง, ตัดรอบ, ตัดปีเลขเอกสาร) ใช้ `AT TIME ZONE 'Asia/Bangkok'` เสมอ — ห้าม `ts::date` เปล่า (เพิ่มใน `03` §6.5 + review checklist) |
| E8 | Cutoff | `<= cutoff_date 23:59:59 เวลาไทย` (รวมทั้งวัน) · เดือนสั้น clamp วันสุดท้าย |
| E9 | Session UX | access token 1 ชม. (Supabase default) + refresh 24 ชม. absolute · เตือนก่อนหมด 5 นาที · ฟอร์มยาวเก็บ draft localStorage + restore หลัง re-login · **permission cache TTL ≤15 นาที + revoke ทันทีเมื่อ suspend/เปลี่ยน role** (ช่องโหว่จริงถ้าไม่ทำ) |
| E10 | Concurrent edit | optimistic lock ด้วย `updated_at` → 409 `STALE_RECORD` เฉพาะตารางกระทบเงิน/สิทธิ์ (13 ทุกแท็บ, 11, 12, 07, 08) · ที่เหลือ last-write-wins |
| E11 | Notification | เปิด dropdown ไม่ auto-mark (mark เมื่อคลิกรายการ) · เพิ่ม `GET /unread-count` · badge cap 99+ · delivery = polling 30–60 วิ (ไม่ทำ realtime เฟส 1) · retention 90 วัน + job `notification_cleanup` |
| E12 | Audit payload | เก็บ diff เฉพาะ field ที่เปลี่ยน · mask ข้อมูลอ่อนไหว (เลขบัตร/บัญชี/ภาษี เก็บ 4 ตัวท้าย) · ห้าม password/token ลง audit — สำคัญเพราะ audit immutable 5 ปี ลบทีหลังไม่ได้ (PDPA) |
| E13 | Report export | ≤5,000 แถว sync stream, เกิน = background job (`report_export` ใหม่ใน `91`) + แจ้งเตือนเมื่อเสร็จ · ชื่อไฟล์ `{code}_{ชื่อ}_{วันที่พ.ศ.}_{เวลา}.xlsx` · PDF ฝัง Noto Sans Thai · Excel เก็บวันที่เป็น text พ.ศ. |
| E14 | Report cache | เก็บในตาราง `report_cache` (global per report+filter, ไม่เพิ่ม Redis) · ปุ่มรีเฟรช cooldown 5 นาที/รายงาน · Cron ทุกตัวเขียนเป็น UTC พร้อมกำกับเวลาไทย (refresh เที่ยงคืนไทย = `0 17 * * *` UTC) |
| E15 | Responsive | Back Office (การเงิน/บัญชี/ตั้งค่า/รายงาน) = desktop-first ≥1280px, ต่ำกว่า md แสดง banner แนะนำใช้คอม · จัดการเคส/มอบหมาย = responsive · Field Tracker = mobile-first |
| E16 | States | ชุด component กลาง: TableSkeleton / EmptyState / ErrorState+retry / toast (ขวาบน 4 วิ, error ค้างจนปิด) / หน้า 403·404·500 |
| E17 | Draft multi-device (ไฟล์ 41) | merge ระดับ field: checkins/photos/videos เป็น append-only union + `draft_version` → 409 ให้ re-fetch · reorder: server รับเฉพาะ id ที่ valid แล้วต่อท้ายที่ขาด (ไม่เด้ง error) |
| E18 | รูป 7 มุม warehouse | `condition = normal` บังคับ 2 มุม (หน้า+IMEI) · `damaged/partial_loss` บังคับครบ 7 · เก็บเป็น object keyed ตามมุม + error `INTAKE_PHOTOS_INCOMPLETE` |
| E19 | Superadmin guard | ขยายจาก deactivate → block ทุกทาง (suspend/delete/เปลี่ยน role) ถ้าเหลือ Superadmin active คนเดียว |
| E20 | อื่นๆ ที่จะแก้ใน spec ระหว่างทาง | duplicate check `case_ref` ทำงานทั้ง create+update (normalized เป็น generated column) · default filter หน้ารับเคส = สถานะที่ต้องทำงาน · หน้า `intake_rejected` ต้องแจ้ง agent+ผู้จัดการ · แก้ email user = ห้ามในเฟส 1 |

---

## สรุปสำหรับ Product Owner — ตอบชุดแรกแค่ 8 ข้อก็เริ่มยาว ๆ ได้

| ลำดับ | ข้อ | ต้องตอบก่อน | ใครตอบ |
|---|---|---|---|
| 1 | A1 WHT ลูกค้าหักจากเรา | Phase 1.2 | นักบัญชี + PO |
| 2 | A2 เงินเข้า 1 ก้อนหลายบิล | Phase 1.2 | PO |
| 3 | A3 Recycle เก็บเงินซ้ำไหม | Phase 1.2 | PO |
| 4 | A4 Advance เข้ารอบจ่าย | Phase 1.2 | PO (ยืนยัน default) |
| 5 | D1+D2 Invite/Reset password | Phase 1.3 | ✅ D1 ตอบแล้ว 14/08/2569 (invite ทางอีเมล — ทำใน 1.9) · D2 (ลืมรหัสผ่าน) ยังเปิดอยู่ |
| 6 | C5 เมนูของธุรการ | Phase 1.5 | PO |
| 7 | B1–B4 กฎปัดเศษ/WHT/tolerance | Phase 3.1 | นักบัญชี |
| 8 | D3 เพดานไฟล์สื่อ | Phase 2.2 | PO (ยืนยัน default) |

ที่เหลือ (หมวด C default, D default, E ทั้งหมด) — ถ้าไม่ค้านภายในก่อนถึง task ที่ระบุ จะ implement ตาม default ที่เสนอ และแก้ spec ต้นทาง + changelog ให้สอดคล้องทุกครั้ง
