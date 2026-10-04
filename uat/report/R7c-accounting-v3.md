# R7c v3 — งานบัญชีปลายงวด: ยกเลิก-ออกแทน 50 ทวิ · ภ.ง.ด.3/53 · Exception · ความพร้อมปิดงวด · Export Pack · ส่งสำนักงานบัญชี (uat.account · uat.finance · uat.exec · uat.agent.in1)

> วันที่ทดสอบ: 04/10/2569 11:56–12:03 น. · snapshot ต้นรอบ: `R7b-end-v3` · ปลายรอบ: **ยังไม่ถึง `R7-end-v3`** (หยุดที่ R7.32 — S2) · step sheet `uat/steps/R7.md` v1 (R7.26–R7.36)
> T2 = `2026-10-04 04:56:46+00` · สคริปต์ `uat/bin/r7v3/s26.mjs … s35.mjs` · log `uat/bin/r7v3/run.log` · ภาพ `uat/shots/R7v3/26a…35-*` (26 ภาพ) · ไฟล์ที่ดาวน์โหลด `uat/fixtures/downloads-R7cv3/` (PDF 50 ทวิ 2 ไฟล์)
> **ผล: ✅ 7 ขั้น (R7.26–R7.31, R7.35) / 🐞 บั๊กใหม่ 6 ตัว (S2 ×1 บล็อก, S4 ×2, S5 ×3) / ⛔ ยังไม่ได้ทำ 3 ขั้น (R7.33, R7.34, R7.36 เต็ม) / ❓ 4**
> ⛔ **หยุดที่ R7.32**: สร้าง Export Pack ไม่ได้เลย — `POST /api/accounting/export-pack` ได้ 500 ทุกครั้ง (R7cv3-B01) · มติ O16 ให้ส่งงวดเป็นขั้นท้ายสุดหลัง Export ⇒ **ไม่ได้ส่งงวดให้สำนักงานบัญชี** และไม่ตั้งข้อซักถาม (ทำหลังส่งตามลำดับ sheet) · งวด ต.ค. ยังเป็น `collecting`

---

## 0. ก่อนเริ่ม
ค่าต้นรอบตรงทุกตัว: 50 ทวิ active 15 / 28500 · bank_transactions 4 (3 auto_matched + 12345 unmatched) · exceptions 0 · export_records 0 · ภ.ง.ด.3 28500 / ภ.ง.ด.53 0 pending · งวด ต.ค. `collecting` · dev server 200 · ไม่ได้ restore อะไร

---

### R7.26 ยกเลิกหนังสือรับรอง 50 ทวิ แล้วออกใบแทน
**เมนู**: `uat.account` → บัญชี → แท็บ **เอกสาร & WHT** → ตาราง "หนังสือรับรองการหัก ณ ที่จ่าย (ใบ 50 ทวิ)"
![](../shots/R7v3/26a-wht-before.png)
**ใบที่เลือก**: WHT-2569-009 = อนันต์ ตามทรัพย์ (in1) · รอบจ่าย UAT IN-1 · ค่าจ้างทำของ มาตรา 40(8) · ฐาน ฿75.00 · หัก ฿2.25 · PND3 (ตามมติ O17)
**ทำ**:
1. probe API เหตุผลว่าง `PATCH …/wht-certificates/<009>/cancel {reason:''}` และ `{reason:'   '}` → **400 `REQUIRED_MISSING`** fields.reason "ต้องระบุเหตุผลการยกเลิก" · ไม่มี audit (🐞 R7cv3-B03 — สเปคกำหนด code `WHT_CANCEL_REQUIRES_REASON`)
2. กดปุ่ม **ยกเลิก** ท้ายแถว → modal "ยกเลิกหนังสือรับรอง — WHT-2569-009" · ช่องเหตุผลว่าง → ปุ่ม **ยืนยันยกเลิก** กดไม่ได้
![](../shots/R7v3/26b-cancel-modal-empty.png)
3. กรอกเหตุผล `UAT R7 ที่อยู่ผู้มีเงินได้พิมพ์ผิด ออกใบแทน` + ติ๊ก "ออกใบแทนทันทีด้วยข้อมูลปัจจุบัน — ใบใหม่จะได้เลขที่ถัดไปและอ้างกลับฉบับนี้ (replaces_certificate_id)" (🐞 R7cv3-B05 ชื่อคอลัมน์โผล่บนจอ) → ดับเบิลคลิก **ยืนยันยกเลิก**
![](../shots/R7v3/26c-cancel-modal-filled.png)
**ผลบนจอ**: toast "ยกเลิก WHT-2569-009 แล้ว / ออกใบแทนเลขที่ WHT-2569-016 เรียบร้อย" · แถวใหม่ **WHT-2569-016** มีบรรทัดย่อย "ออกแทน WHT-2569-009" · แถว 009 เป็นสีจาง ป้าย "ยกเลิก" + เหตุผลใต้ป้าย · การ์ด ใบที่ใช้งานอยู่ 15 · ภ.ง.ด.3 ฿285.00 · ใบที่ยกเลิก **1**
![](../shots/R7v3/26d-wht-after.png)
**probe ยกเลิกซ้ำ** (API) → 400 `WHT_CERTIFICATE_INVALID_STATUS` "ใบที่ยกเลิกแล้วเป็นสถานะสุดท้าย…" ✅
**ผลหลังบ้าน**:
| เลขที่ | สถานะ | ฐาน | WHT | cancel_reason | replaces |
|---|---|---|---|---|---|
| WHT-2569-009 | cancelled (ไม่ถูกลบ — trigger no_delete) | 7500 | 225 | UAT R7 ที่อยู่ผู้มีเงินได้พิมพ์ผิด ออกใบแทน | — |
| WHT-2569-016 | active | 7500 | 225 | — | WHT-2569-009 |

active 15 / **28500** · cancelled 1 · ทั้งหมด 16 แถว · `wht_filing_summaries` ภ.ง.ด.3 **28500** / ภ.ง.ด.53 0 (ไม่เปลี่ยน) · ดับเบิลคลิกได้ใบแทนใบเดียว
audit 2 แถว: `status_change` wht_certificates 921a2ee7 reason = เหตุผลที่กรอก · `create` wht_certificates 0f1a77ad reason "ออกหนังสือรับรอง WHT-2569-016 แทนฉบับที่ถูกยกเลิก"
**สถานะ**: ✅ (ตรง golden · 🐞 B03/B05 เล็กน้อย)

### R7.27 ภ.ง.ด.3/53 รายเดือน + พิมพ์หนังสือรับรอง
**เมนู**: แท็บ **เอกสาร & WHT** (ส่วนบน + ตาราง "สรุปรอบนำส่ง WHT รายเดือน")
![](../shots/R7v3/27a-wht-pnd-summary.png)
**ผลบนจอ**: แถบ "เหลือ 42 วัน ก่อนกำหนดนำส่ง ภ.ง.ด.3/53 ของรอบ ตุลาคม 2569 — กำหนดนำส่งวันที่ 15/11/2569" · การ์ด ภ.ง.ด.3 ฿285.00 / ภ.ง.ด.53 ฿0.00 (hint "ไม่รวมใบที่ยกเลิก") / ใบที่ยกเลิก 1 · สรุปรอบ ตุลาคม 2569 · 15/11/2569 · ฿285.00 · ฿0.00 · **รอยื่นแบบ** (E10 A1 ✓) · ตัวกรอง "ยกเลิก" เห็น 009 แถวเดียว
![](../shots/R7v3/27b-wht-filter-cancelled.png)
**PDF** (ปุ่ม "หนังสือรับรอง"): ทั้งสองใบ 200 `application/pdf` ชื่อไฟล์ `WHT-2569-009.pdf` (16,715 B) / `WHT-2569-016.pdf` (16,159 B) — เก็บที่ `uat/fixtures/downloads-R7cv3/` · ใบ 009 มีแถบแดง "เอกสารนี้ถูกยกเลิก — ยกเลิกเมื่อ 04/10/2569 — <เหตุผล>" ✅ · วันที่ พ.ศ. ✅
![](../shots/R7v3/27c-pdf-wht009-cancelled.png)
![](../shots/R7v3/27d-pdf-wht016-replacement.png)
⚠️ ภาพ PDF (render ด้วย Quick Look) วงเล็บปิดท้ายหายบางจุด: "มาตรา 40(8", "จำนวนเงินที่จ่าย (บาท", "ผู้มีอำนาจลงนาม (ผู้จ่ายเงิน" → 🐞 R7cv3-B06 (ต้องเปิดด้วย Acrobat ยืนยัน)
❌ ไม่ได้กด **Mark Filed** (ยื่นจริงนอกระบบ — Hybrid Boundary)
**สถานะ**: ✅ (⚠️ B06 รอยืนยัน)

### R7.28 บันทึกข้อยกเว้นระดับวิกฤต
**เมนู**: แท็บ **เอกสารไม่ครบ** → ปุ่ม **บันทึกข้อยกเว้น**
![](../shots/R7v3/28a-exceptions-empty.png)
**ทำ**: ระดับ "ต้องแก้ก่อนปิดงวด" (critical) · โมดูลต้นทาง "รายการเบิก (15/16)" (expense) · รอบบัญชี = ค่าเริ่มต้น (รอบเดือนปัจจุบัน) · หัวข้อ `UAT R7 ใบเสร็จค่าที่พักต้นฉบับยังไม่ส่งสำนักงานบัญชี` · รายละเอียด `ต้องส่งต้นฉบับใบเสร็จโรงแรมของ in1 ฿600 ก่อนปิดงวด` → **บันทึกข้อยกเว้น**
![](../shots/R7v3/28b-exception-form.png)
**ผลบนจอ**: toast "บันทึกข้อยกเว้นใหม่แล้ว / ตุลาคม 2569" · การ์ด ยังไม่จัดการ 1 (วิกฤต 1) · บล็อกการส่งมอบ 1 · แถบแดง "มีข้อยกเว้นระดับวิกฤตเปิดอยู่ 1 รายการ" · แถวแสดงผู้บันทึก ปรีดา บัญชีงาม 04/10/2569 11:58
![](../shots/R7v3/28c-exception-open.png)
**ผลหลังบ้าน**: POST /api/exceptions 201 · `exceptions` 1 แถว critical/open/source_module=expense/period ต.ค. 2569 · audit `create` exceptions
🐞 R7cv3-B04: ตัวเลือกโมดูลมีเลขอ้างอิงสเปคบนจอ "(19)", "(15/16)", "(44)"… และ "รายการเบิก (15/16)" ซ้ำ 2 ตัว (expense กับ claim)
**สถานะ**: ✅

### R7.29 ตรวจความพร้อมปิดงวด — ไม่ผ่าน 2 ข้อ · ส่งงวด/Export ถูกปัด
**เมนู**: แท็บ **รอบส่งบัญชี** → แถว ตุลาคม 2569 → **ตรวจความพร้อม**
![](../shots/R7v3/29a-closing-tab-blocked.png)
**ผลบนจอ** (modal "ตรวจความพร้อมก่อนส่งบัญชี — ตุลาคม 2569"): ✓ ยอดวางบิลตรงกับรายได้ของรอบ · ✗ กระทบยอดธนาคารครบ 100% "ยังมีรายการที่ไม่จับคู่ 1 รายการ" · ✗ ไม่มีข้อยกเว้นระดับวิกฤตที่เปิดอยู่ "ยังมี 1 รายการ…" + รายชื่อ "expense · UAT R7 ใบเสร็จ…" (🐞 B04 — แสดงรหัสโมดูลดิบ) · "ยังไม่พร้อม — แก้รายการที่ติด ✗ ก่อนจึงจะส่งได้"
![](../shots/R7v3/29b-readiness-fail-2.png)
**probe**: `PATCH /periods/<ต.ค.>/send {reason:'probe'}` → 400 **`NOT_READY_CRITICAL_OPEN`** ✅ · `POST /export-pack {periodId}` → 400 **`EXPORT_BLOCKED_CRITICAL`** ✅ · กด **ส่งสำนักงานบัญชี** ผ่าน UI (กรอกเหตุผล) → toast แดง "ยังมีข้อยกเว้นระดับวิกฤตค้างอยู่ / ปิดงวดไม่ได้…" modal ค้างให้แก้ ✅
![](../shots/R7v3/29c-send-ui-blocked.png)
**ผลหลังบ้าน**: งวด `collecting` · export_records 0 · ไม่มี audit จาก probe
**สถานะ**: ✅

### R7.30 ปิดรายการเงินเข้าไม่ทราบที่มา ฿123.45 = เงินรับรอตรวจสอบ (มติ A9)
**เมนู**: แท็บ **กระทบยอด** → แถว "รับโอนไม่ทราบที่มา · อ้างอิง UNKNOWN-01 · +฿123.45 · ยังไม่จับคู่" → **ปิดรายการ**
![](../shots/R7v3/30a-bank-unmatched-row.png)
**ทำ**: probe API เหตุผลว่าง → 400 `REQUIRED_MISSING` fields.matchNote (step sheet คาด `MATCH_NOTE_REQUIRED` — ดู B03) · modal "ปิดรายการโดยไม่จับคู่" (คำเตือน "เป็นสถานะสุดท้าย") ช่องว่าง → ปุ่มกดไม่ได้ · กรอก `เงินรับรอตรวจสอบ ไม่ทราบผู้โอน — บันทึกเป็นหนี้สินรอตรวจสอบ ไม่รับรู้รายได้ แจ้งสำนักงานบัญชี UAT R7` → ดับเบิลคลิก **ยืนยันปิดรายการ**
![](../shots/R7v3/30b-resolve-modal-filled.png)
**ผลบนจอ**: toast "ปิดรายการแล้ว / รายการนี้ถูกนับเป็น "จัดการครบ" ในการตรวจความพร้อมปิดงวด" · การ์ด ยังไม่จับคู่ **0** · แถวป้าย "ปิดรายการแล้ว" + หมายเหตุ
![](../shots/R7v3/30c-bank-after-resolved.png)
**ผลหลังบ้าน**: `unmatched_resolved` · match_note = เหตุผล · matched_billing/payout/advance ว่างทั้งหมด · matched_by/at มีค่า · audit `status_change` bank_transactions reason = เหตุผล (1 แถว — ดับเบิลคลิกไม่ซ้ำ) · ปิดซ้ำ (API) → 400 `BANK_TRANSACTION_INVALID_STATUS`
**ตรวจซ้ำความพร้อม**: ✓ ✓ ✗ (เหลือ critical ข้อเดียว) · send → 400 `NOT_READY_CRITICAL_OPEN` ✅
⚠️ spec-gap ยืนยัน (R7-N2): ไม่มีสถานะ/บัญชีพัก "เงินรับรอตรวจสอบ" — ปิดแล้วเป็นสถานะสุดท้าย ไม่ผูกอะไร ถ้ารู้ผู้โอนภายหลังต้องทำนอกระบบ/Adjustment (ดู ❓-R7c-3)
**สถานะ**: ✅

### R7.31 ปิดข้อยกเว้น → ความพร้อมผ่านครบ 3 ข้อ
**เมนู**: แท็บ **เอกสารไม่ครบ** → แถวข้อยกเว้น → **ปิดรายการ**
**ทำ**: probe API หมายเหตุว่าง → 400 `REQUIRED_MISSING` fields.resolutionNote "ต้องอธิบายว่าแก้ไขอย่างไร" ✅ · modal "ปิดข้อยกเว้น (แก้ต้นทางแล้ว)" ช่อง "แก้ไขอย่างไร" ว่าง → ปุ่ม **ยืนยันปิดข้อยกเว้น** กดไม่ได้ · กรอก `ส่งต้นฉบับใบเสร็จโรงแรมให้สำนักงานบัญชีแล้ว UAT R7` → ยืนยัน
![](../shots/R7v3/31a-exception-resolve-modal.png)
**ผลบนจอ**: toast "ปิดข้อยกเว้นแล้ว" · การ์ด แก้ไขแล้ว 1 · ยังไม่จัดการ 0 · "ไม่มีข้อยกเว้นระดับวิกฤตค้าง"
![](../shots/R7v3/31b-exception-resolved.png)
**ผลหลังบ้าน**: critical/**resolved** (authorized_by ว่าง — นับแยกจาก authorized) · audit `status_change` exceptions reason = หมายเหตุ · resolve ซ้ำ → 400 `EXCEPTION_INVALID_STATUS` ✅
**ความพร้อม**: ✓ ✓ ✓ "พร้อมส่งสำนักงานบัญชีแล้ว"
![](../shots/R7v3/31c-readiness-pass.png)
`export_ready` = **false** และ `last_readiness_checked_at` ว่าง (โค้ดบันทึกค่าเหล่านี้ตอนส่งงวดเท่านั้น — คอลัมน์ "ยังไม่เคยตรวจความพร้อม" บนจอจึงยังขึ้นหลังตรวจผ่าน · ข้อสังเกต S5)
🐞 **R7cv3-B02**: หลังปิดข้อยกเว้นแล้ว หน้า "รอบส่งบัญชี" ยังขึ้นแถบแดง "มีข้อยกเว้นระดับวิกฤตเปิดอยู่รวม 1 รายการ" + คอลัมน์ "1 วิกฤต" และ modal Export ขึ้น "ไม่สามารถ Export ได้ — มี 1 Critical Exception เปิดอยู่" (ปุ่มยังกดได้) — นับรวมใบที่ resolved แล้ว
**สถานะ**: ✅ (🐞 B02)

### R7.32 สร้าง Export Pack v1 + v2 — ⛔ บล็อก
**เมนู**: แท็บ **ส่งมอบ** → **สร้างชุดเอกสารใหม่**
![](../shots/R7v3/32a-export-empty.png)
**ทำ**: รอบบัญชี ตุลาคม 2569 · บันทึกช่วยจำ `UAT R7 ชุดแรก` → **ดาวน์โหลดไฟล์ (.zip)**
![](../shots/R7v3/32b-export-modal-stale-critical.png)
**ผลบนจอ**: toast แดง "เชื่อมต่อระบบไม่สำเร็จ / กรุณาลองใหม่" · modal ค้าง · ตารางประวัติยังว่าง
![](../shots/R7v3/32c-export-500-toast.png)
**ผลหลังบ้าน**: `POST /api/accounting/export-pack` **500 body ว่าง** (ลอง 2 ครั้ง 12:01:08 และ 12:02:01) · pm2 err: `PackStorageError: อัปโหลดไฟล์ชุดส่งบัญชีไม่สำเร็จ — Invalid key: 00000000-…0001/2569-10/v1/20261004-0501083-d900aa1f/AccountingPack_ตุลาคม_2569_v1.0.zip` · export_records 0 · audit 0
→ 🐞 **R7cv3-B01 (S2)** — ทำ v1/v2, ตรวจ SHA-256/ห้ามทับ, รายชื่อไฟล์ 01–08 ไม่ได้
**สถานะ**: 🐞 R7cv3-B01 ⛔

### R7.33 ส่งงวดให้สำนักงานบัญชี — ⛔ ไม่ได้ทำ
มติ O16 ให้ส่งเป็นขั้นท้ายสุดหลัง Export · Export ทำไม่ได้ ⇒ ไม่ส่ง (ส่งแล้วงวดจะเป็น `sent_to_accountant` ถาวรก่อนมีชุดเอกสาร) · ความพร้อมผ่านแล้ว ส่งได้ทันทีเมื่อ B01 แก้แล้ว

### R7.34 ข้อซักถามนักบัญชี — ⛔ ไม่ได้ทำ (ตามลำดับ sheet ทำหลังส่งงวด)

### R7.35 สิทธิ์งานบัญชี (probe — body ไม่ครบทุกตัว กันกรณีสิทธิ์รั่วแล้วเกิด mutation)
| endpoint | uat.finance | uat.exec | uat.agent.in1 |
|---|---|---|---|
| POST tax-invoices | 403 | 403 | 403 |
| PATCH wht-certificates/:id/cancel | 403 | 403 | 403 |
| POST export-pack | 403 | 403 | 403 |
| PATCH periods/:id/send | 403 | 403 | 403 |
| POST exceptions | 403 | 403 | 403 |
| POST questions | 403 | 403 | 403 |
| GET wht-certificates | 200 (ดูได้ 👁️) | 403 | **403** ✅ |
| GET periods/:id/readiness | 403 | 200 | 403 |
| GET export-history | 200 (ดูได้ 👁️) | 403 | 403 |
ตรง matrix `25` §7.4–7.5 (การเงิน 👁️ ฝั่งบัญชี · บริหาร "—" · ส่งงวด = บัญชีเท่านั้น) · audit 0 · การเงินเปิด `/accounting` → ถูกส่งไปแดชบอร์ด (ไม่มีเมนูบัญชี) · บริหารเปิดแท็บรอบส่งบัญชีได้ (เห็นแถบ B02 เหมือนกัน)
![](../shots/R7v3/35-finance-accounting.png)
![](../shots/R7v3/35-exec-accounting.png)
**สถานะ**: ✅

### R7.36 ตรวจปลายรอบ (บางส่วน — ยังไม่ถึง `R7-end-v3`)
| เรื่อง | ค่าจริง | golden R7.md | ตรง? |
|---|---|---|---|
| งวด ต.ค. 2569 | `collecting` (readiness 3/3 ผ่าน · export_ready f) | sent_to_accountant | ⛔ (B01) |
| bank_transactions | auto_matched 3 · unmatched_resolved 1 · unmatched 0 | เดียวกัน | ✅ |
| billing paid / AR | 2 / 0 | 2 / 0 | ✅ |
| payout completed | 4 | 4 | ✅ |
| expense_records | 19 / 1580000 / 28500 | 19 | ✅ |
| 50 ทวิ active | 15 / 28500 | 15 / 28500 | ✅ |
| 50 ทวิ cancelled | 1 / 225 (WHT-2569-009) | 1 | ✅ |
| ภ.ง.ด.3 / ภ.ง.ด.53 | 28500 / 0 pending | 28500 / 0 รอยื่น | ✅ |
| tax_invoices active | 2 | 2 | ✅ |
| exceptions | 1 critical resolved · open 0 | 1 resolved / 0 open | ✅ |
| export_records | **0** | 2 (v1, v2 sent) | ⛔ |
| accountant_questions | 0 | 1 (answered) | ⛔ |
| advances | cleared,rejected,overdue,cleared | เดียวกัน | ✅ |
| cash_receipts | 2 | 2 | ✅ |
pm2: 500 เฉพาะ export-pack ×2 (B01) · console มีแต่ 400/500 ที่ตั้งใจ probe · `counts.sh`: audit_logs 396 · exceptions 1 · wht_certificates 16 · bank_transactions 4 · export_records — (0) · notifications 59 · jobs 8

---

## 🐞 บั๊กที่พบ
| # | step | ระดับ | ชนิด | อาการ / คาดหวัง |
|---|---|---|---|---|
| **R7cv3-B01** | R7.32 | **S2** | code | `POST /api/accounting/export-pack` 500 ทุกครั้ง — Supabase Storage ปฏิเสธ key ที่มีอักษรไทย (`packZipFileName()` ใน `lib/exports/pack.ts:116` ใช้ periodLabel "ตุลาคม 2569" ⇒ `AccountingPack_ตุลาคม_2569_v1.0.zip`) · อัปโหลดทำแบบ `Promise.all` (`lib/exports/queries.ts:659`) ⇒ ไฟล์ 01–08 + หน้าปกที่ชื่อเป็น ASCII น่าจะขึ้น Storage ไปแล้วแต่ไม่มี export_records อ้าง (ไฟล์กำพร้า 2 ชุด) · `PackStorageError` ไม่ถูกแปลงเป็น error code ⇒ body ว่าง, UI toast "เชื่อมต่อระบบไม่สำเร็จ" · บล็อก R7.32–R7.34 และ R8 ที่ต้องมี export · คาด: key ใช้อักษร ASCII (เช่น `AccountingPack_2569-10_v1.0.zip`) แล้วใช้ชื่อไทยแค่ใน Content-Disposition, ล้มแล้วไม่ทิ้งไฟล์ค้าง, ตอบเป็น error code ตาม `24` |
| **R7cv3-B02** | R7.31 | S4 | code | หน้ารอบส่งบัญชี (แถบแดง + คอลัมน์ "1 วิกฤต") และ modal Export ("ไม่สามารถ Export ได้ — มี 1 Critical Exception เปิดอยู่") นับข้อยกเว้นวิกฤตที่ **resolved แล้ว** — `toPeriodDto` ส่ง `summary.criticalCount` (ทุกสถานะ) แทน `blockingCritical` (เฉพาะ open) · ทำให้ผู้ใช้เข้าใจผิดว่ายังส่งไม่ได้ (ความพร้อมกับ API ถูกต้อง) |
| **R7cv3-B03** | R7.26/R7.30 | S5 | code | ยกเลิก 50 ทวิ ไม่มีเหตุผลได้ `REQUIRED_MISSING` (Zod ที่ route) ไม่ใช่ `WHT_CANCEL_REQUIRES_REASON` ตาม `24` §6.8 / `33` §11 §16 — code ใน service ไปไม่ถึงทาง HTTP · ปิดรายการธนาคารไม่มีเหตุผลก็ได้ `REQUIRED_MISSING` (step sheet คาด `MATCH_NOTE_REQUIRED`) |
| **R7cv3-B04** | R7.28/R7.29 | S5 | code | ตัวเลือก/ป้ายโมดูลต้นทางของข้อยกเว้นมีเลขอ้างอิงสเปค "(19)", "(15/16)", "(44)"… บนจอ (ขัด Rule 05) · "รายการเบิก (15/16)" ซ้ำ 2 ตัว (expense/claim) · modal ความพร้อมแสดงรหัสดิบ "expense · …" |
| **R7cv3-B05** | R7.26 | S5 | code | modal ยกเลิก 50 ทวิ แสดงชื่อคอลัมน์ "(replaces_certificate_id)" ต่อท้ายข้อความ checkbox |
| **R7cv3-B06** | R7.27 | S4 (รอยืนยัน) | code | PDF หนังสือรับรอง: วงเล็บปิดท้ายหายบางจุด ("ค่าจ้างทำของ มาตรา 40(8", "จำนวนเงินที่จ่าย (บาท", "ผู้มีอำนาจลงนาม (ผู้จ่ายเงิน") — เห็นจาก Quick Look render ของ `uat/fixtures/downloads-R7cv3/WHT-2569-0{09,16}.pdf` · ต้องเปิดด้วย Acrobat/Preview ยืนยัน (ถ้าจริง = ตัดข้อความในเอกสารภาษี) |

ข้อสังเกต (ไม่ให้เลข): ความพร้อมที่ตรวจผ่านไม่ถูกบันทึก (`export_ready`/`last_readiness_checked_at` ตั้งตอนส่งงวดเท่านั้น ⇒ คอลัมน์ "ยังไม่เคยตรวจความพร้อม" ค้าง) · การเงินมีสิทธิ์ดู WHT/ประวัติส่งมอบผ่าน API แต่ไม่มีเมนูบัญชี (ตาม `06`) · กรอบโฟกัส (fixer L): ปุ่มที่คลิกด้วยเมาส์ไม่มีกรอบค้างในภาพทุกภาพ — ไม่พบความผิดปกติ

## ❓ ต้องตัดสินใจ
- **❓-R7c-1 แก้ B01 อย่างไร** · **ก (แนะนำ)** key ใน Storage ใช้ ASCII ล้วน (`AccountingPack_<YYYY_BE>-<MM>_v<n>.zip`) ชื่อไทยใช้แค่ตอนดาวน์โหลด + อัปโหลด zip ก่อน/ล้มแล้วลบไฟล์ของ attempt นั้น + map `PackStorageError` เป็น code ตาม `24` · ข เปลี่ยน periodLabel ใน slug เป็นเลขอย่างเดียว ไม่แตะส่วนอื่น
- **❓-R7c-2 เดินต่อหลังแก้ B01** · **ก (แนะนำ)** เดินต่อจากสถานะปัจจุบันที่ R7.32 (R7.26–R7.31 ผ่าน ข้อมูลสะอาด: export_records 0, งวด collecting) — ไม่ต้อง restore · ข restore `R7b-end-v3` แล้วเล่น R7c ใหม่ทั้งหมด (009 จะถูกยกเลิกใหม่ ได้ผลเดิม)
- **❓-R7c-3 เงินรับไม่ทราบที่มา ฿123.45 (มาตรฐานไทย)** · **ก (แนะนำ)** บันทึกเป็นหนี้สินหมุนเวียน "เงินรับรอการตรวจสอบ" (ไม่รับรู้รายได้ตาม TFRS 15 เพราะไม่มีสัญญา/ภาระที่ต้องปฏิบัติ) ติดตามผู้โอนกับธนาคาร · ถ้าเกินรอบปีบัญชียังไม่ทราบที่มา ให้สำนักงานบัญชีพิจารณาโอนเป็นรายได้อื่น (ต้องนำไปคำนวณภาษีเงินได้นิติบุคคลในปีที่รับรู้) · ระบบควรมีสถานะ "พักรอตรวจสอบ" ที่จับคู่ภายหลังได้แทนการปิดถาวร (spec-gap R7-N2) · ข คงพฤติกรรมเดิม (ปิดถาวร + จัดการนอกระบบ/Adjustment)
- **❓-R7c-4 ข้อซักถามนักบัญชี** — ไม่มี persona สำนักงานบัญชี ⇒ R7.34 ให้ `uat.account` ตั้งและตอบเอง (ข้อจำกัด) · ยืนยันว่ายอมรับได้ หรือเพิ่ม persona/portal ของสำนักงานบัญชีใน UAT รอบท้าย

## ไฟล์ที่เกิดในรอบนี้
- ภาพ 26 ภาพ `uat/shots/R7v3/26a…35-*` (`32b-export-modal-v1.png` จากรอบแรกที่สคริปต์ล้มก่อนถ่ายภาพ toast — ภาพเดียวกับ `32b-export-modal-stale-critical.png`)
- PDF `uat/fixtures/downloads-R7cv3/WHT-2569-009.pdf`, `WHT-2569-016.pdf`
- Storage (Supabase bucket `accounting-packs`) — **น่าจะมีไฟล์กำพร้า** จาก export ที่ล้ม 2 ครั้ง: `00000000-0000-0000-0000-000000000001/2569-10/v1/20261004-0501083-d900aa1f/` และ `…/2569-10/v1/20261004-0502016-ade15be9/` (01–08 + 00_Cover_Sheet.pdf ถ้าอัปโหลดสำเร็จก่อน zip ล้ม) — ไม่ได้ลบ · ไม่ได้ list เพราะต้องใช้ service key
- สคริปต์ `uat/bin/r7v3/s26.mjs s27.mjs s28-29.mjs s30-31.mjs s31b.mjs s32.mjs s32b.mjs s35.mjs`

---

# ส่วนที่ 2 — Export Pack + ส่งสำนักงานบัญชี (หลังแก้ BUG-116)

> วันที่ทดสอบ: 04/10/2569 12:41–12:48 น. (เวลาจริงตามเครื่อง — ไม่ใช่ 14:10 ตามที่ brief ระบุ) · ต้นรอบ = ฐาน dev ปลายส่วนแรก (ไม่ restore) · ขอบเขต R7.32–R7.34 + R7.36 · ปลายรอบ = **พร้อมทำ snapshot `R7-end-v3`**
> สคริปต์ `uat/bin/r7v3/s32c.mjs s32d.mjs s33.mjs s34.mjs s36.mjs` (log ต่อท้าย `run.log`) · ภาพ `uat/shots/R7v3/32f…36a` (20 ภาพ) · ไฟล์ดาวน์โหลด `uat/fixtures/downloads-R7cv3/` (zip 4 + PDF 2 ไฟล์ใหม่)
> **ผล: ✅ 4 ขั้น (R7.32, R7.33, R7.34, R7.36) · BUG-116 ✅ · BUG-117 ✅ · BUG-120 ✅ · 🐞 ใหม่ 2 ตัว (S5 ×2) · ⚠️ 4 · ❓ 2**

## 0. ก่อนเริ่ม
ค่าต้นรอบตรง brief ทุกตัว: งวด ต.ค. `collecting` · export_records 0 · accountant_questions 0 · 50 ทวิ active 15 / 28500 · bank auto_matched 3 + unmatched_resolved 1 · exceptions 1 resolved · audit_logs 396 · dev server 200

### R7.32 (ต่อ) เช็คแถบแดงข้อยกเว้น (BUG-117)
**เมนู**: `uat.account` → บัญชี → แท็บ **รอบส่งบัญชี**
![](../shots/R7v3/32f-closing-no-stale-critical.png)
**ผลบนจอ**: แถว ตุลาคม 2569 คอลัมน์ข้อยกเว้น "**0 วิกฤต**" · ไม่มีแถบแดง "มีข้อยกเว้นระดับวิกฤตเปิดอยู่" แล้ว · modal Export ขึ้น "ไม่มี Critical Exception — พร้อม Export" (เดิมขึ้น "ไม่สามารถ Export ได้ — มี 1 Critical…")
**สถานะ**: ✅ **BUG-117 แก้แล้ว** (R7cv3-B02 ปิด)

### R7.32 สร้าง Export Pack v1 + v2 (ห้ามทับ)
**เมนู**: แท็บ **ส่งมอบ** → **สร้างชุดเอกสารใหม่** → modal "ส่งออก Accounting Pack — ตุลาคม 2569"
**ทำ**:
1. รอบบัญชี "ตุลาคม 2569 · กำลังรวบรวม" · บันทึกช่วยจำ `UAT R7 ชุดแรก` → **ดาวน์โหลดไฟล์ (.zip)**
![](../shots/R7v3/32g-export-modal-v1.png)
2. ทำซ้ำด้วย `UAT R7 ชุดที่ 2 หลังตรวจทาน`
![](../shots/R7v3/32i-export-modal-v2.png)

**ผลบนจอ**: toast "สร้างชุดเอกสาร ตุลาคม 2569 v1.0 แล้ว / กำลังดาวน์โหลดไฟล์ .zip — ชุดนี้ถูกเก็บไว้ในประวัติแล้ว ดาวน์โหลดซ้ำได้เสมอ" และเบราว์เซอร์ดาวน์โหลดไฟล์ชื่อ **`AccountingPack_ตุลาคม_2569_v1.0.zip`** ทันที (ชุดที่ 2 = `…_v1.1.zip`) · ตารางประวัติ 2 แถว: v1.1 / v1.0 · 8 ไฟล์ · ปรีดา บัญชีงาม · 04/10/2569 12:42 · SHA-256 ย่อ · "สร้างไฟล์แล้ว" · ปุ่ม ดาวน์โหลดซ้ำ / Mark ว่าส่งแล้ว
![](../shots/R7v3/32h-export-history-v1.png)
![](../shots/R7v3/32j-export-history-v2.png)
**ผลหลังบ้าน**: `POST /api/accounting/export-pack` **200 ทั้งสองครั้ง** (ไม่มี 500 ใน pm2)
| version | ป้าย | status | file_hash (SHA-256 ของ zip) | ขนาด | object path (bucket `accounting-packs`) |
|---|---|---|---|---|---|
| 1 | v1.0 | generated | `dacb70e1aa7a29d8dccd176e21095889fcd3701af394ad1c95196dddd25173bd` | 41,129 B | `00000000-…0001/2569-10/v1/20261004-0542110-47110c36/AccountingPack_2569-10_v1.0.zip` |
| 2 | v1.1 | generated → sent (R7.33) | `cf67c2a09f79f8be75c124b4990652ebc3218188e37394b6c35f35b265c634c7` | 41,130 B | `00000000-…0001/2569-10/v2/20261004-0542169-24efa374/AccountingPack_2569-10_v1.1.zip` |

- key Storage เป็น ASCII ล้วน ✅ · แต่ละ version อยู่โฟลเดอร์ `v1/`, `v2/` แยกกัน (+ 01–08 + `00_Cover_Sheet.pdf` คนละ object) ⇒ **ไม่ทับ** ✅ · ป้ายเวอร์ชัน v1.0 → v1.1 ตาม `37` §6.2
- ดาวน์โหลดซ้ำ `GET /export-history/<id>/download` 200 `application/zip` · `content-disposition` มี `filename*=UTF-8''AccountingPack_ตุลาคม_2569_v1.x.zip` (ชื่อไทยตอนดาวน์โหลด ✅) · header `x-pack-sha256` = file_hash = SHA-256 ที่คำนวณเองจากไฟล์ที่ได้ ✅ · ไฟล์ที่ดาวน์โหลดจาก UI กับจาก API ตรงกันทุกไบต์
- audit 2 แถว: `export` export_records a5ca12c0 reason "UAT R7 ชุดแรก" · `export` c97f92e8 reason "UAT R7 ชุดที่ 2 หลังตรวจทาน"

**เปิด zip ตรวจ** (ชื่อไฟล์ใน zip เป็น ASCII ทั้งหมด):
| ไฟล์ | เนื้อหาจริง | ตรงคาด? |
|---|---|---|
| `00_Cover_Sheet.pdf` | หน้าปก: รอบ ตุลาคม 2569 · เวอร์ชัน v1.0/v1.1 · จัดทำโดย ปรีดา บัญชีงาม · 04/10/2569 · Readiness 3 ข้อ "ผ่าน" · รายการไฟล์ 8 ไฟล์ · SHA-256 ของไฟล์ข้อมูล 01–08 `dd159f0b…e87c98` (คำนวณซ้ำเองจากไฟล์ที่แตกได้ค่าเดียวกันตามวิธี `packContentDigest`) | ✅ |
| `01_Revenue.csv` | 4 แถว (CO1-001 925.00 / CO1-002 1245.00 / CO2-005 7000.00 / CO1-004 1560.00) = 10,730.00 = revenue ก่อน VAT 1073000 | ✅ (⚠️ ไม่มีไฟล์ใบกำกับ/ยอดรวม VAT — ดูด้านล่าง) |
| `02_Cash_Receipts.csv` | 2 แถว 3879.20 / 7490.00 | ✅ (⚠️ ไม่มีคอลัมน์ภาษีที่ลูกค้าหัก 111.90) |
| `03_Expenses.csv` | 19 แถว (รวมเงินทดรอง 3 แถว WHT 0) | ✅ |
| `04_Payments.csv` | 4 รอบจ่าย net 4891.50 / 7305.00 / 3018.50 / 300.00 = 15,515.00 | ✅ |
| `05_WHT_Data.csv` | **15 แถว active ไม่มี 009 มี 016** · เลขผู้เสียภาษี 13 หลักครบ · รวม 285.00 · "ค่าจ้างทำของ มาตรา 40(8)" | ✅ |
| `06_Bank_Reconciliation.csv` | 4 แถว: auto_matched 3 + `unmatched_resolved` 1 (123.45) | ✅ |
| `07_Adjustment_Log.csv` | หัวคอลัมน์อย่างเดียว (ยังไม่มี Adjustment) | ✅ |
| `08_Document_Checklist.xlsx` | 1 แถว expense · ครบถ้วน · สรุป ครบถ้วน 1 / ขาดเอกสาร (Critical) 0 / รอตรวจสอบ 0 | ✅ (⚠️ source_ref/สรุปเป็น "-") |

**v1 เทียบ v2**: ไฟล์ 01–08 เหมือนกันทุกไบต์ · ต่างเฉพาะ `00_Cover_Sheet.pdf` (เลขเวอร์ชันบนปก) ⇒ SHA-256 ของ zip ต่างกัน ✅ (ตรงคาด "หน้าปกต่าง version")
![](../shots/R7v3/32l-pack-v1-cover-sheet.png)
**สถานะ**: ✅ **BUG-116 แก้แล้ว** (R7cv3-B01 ปิด)

### R7.32 (ต่อ) PDF ไม่ตัดอักษรท้ายข้อความ (BUG-120)
**ทำ**: `uat.account` ดาวน์โหลด PDF หนังสือรับรอง **WHT-2569-016** และ 009 ใหม่ (`GET /api/accounting/wht-certificates/<id>/pdf` 200 `application/pdf`) → ดึงข้อความด้วย `extractPdfText()` (`components/pdf/extract-text.ts` ผ่าน `npx tsx` — เครื่องไม่มี `pdftotext`) เทียบไฟล์เดิมของส่วนแรก
| ข้อความ | ไฟล์เดิม (11:57) | ไฟล์ใหม่ (12:43) |
|---|---|---|
| ประเภทเงินได้ | "ค่าจ้างทำของ มาตรา 40(8" | "ค่าจ้างทำของ มาตรา **40(8)**" ✅ |
| หัวคอลัมน์ | "จำนวนเงินที่จ่าย (บาท" | "จำนวนเงินที่จ่าย **(บาท)**" ✅ |
| แถวรวม | "รวมภาษีที่หักและนำส่" | "รวมภาษีที่หักและนำ**ส่ง**" ✅ |
| ลายเซ็น | "(ผู้จ่ายเงิน" | "**(ผู้จ่ายเงิน)**" ✅ |
หน้าปก Export Pack ก็ครบ ("ผู้จัดทำ (บัญชี)", "หน้า 1/1") · ไม่มี glyph แปลก (�) · ภาพ render ด้วย Quick Look ยืนยัน
![](../shots/R7v3/32k-pdf-wht016-after-bug120.png)
ไฟล์: `uat/fixtures/downloads-R7cv3/WHT-2569-016-after-BUG120.pdf` (16,184 B) · `WHT-2569-009-after-BUG120.pdf` (16,740 B — ยังมีแถบ "เอกสารนี้ถูกยกเลิก")
**สถานะ**: ✅ **BUG-120 แก้แล้ว** (R7cv3-B06 ปิด)

### R7.33 ส่งงวดให้สำนักงานบัญชี
**ก่อนส่ง — probe ฐาน (ไม่ทำลาย)**: `uat.finance` `POST /api/payout-batches {side:inhouse, cutoffDate:2026-10-04}` → 400 `NO_ITEMS_TO_PAY` (ไม่มีรายการค้าง) · `uat.agent.in2` `POST /api/advances` → 400 `ADVANCE_PENDING_SETTLEMENT` (ADV3 overdue) — ใช้เทียบหลังส่ง
**เมนู**: แท็บ **รอบส่งบัญชี** → แถว ตุลาคม 2569 → **ส่งสำนักงานบัญชี**
**ทำ**:
1. probe API `PATCH /periods/<ต.ค.>/send {reason:''}` → 400 `REQUIRED_MISSING` fields.reason "ต้องระบุเหตุผล" ✅ · ไม่ส่ง reason เลย → 400 `REQUIRED_MISSING` แต่ข้อความ field เป็นอังกฤษดิบ (🐞 R7cv3-B08)
2. modal "ส่งมอบรอบบัญชีให้สำนักงานบัญชี — ตุลาคม 2569" ("ระบบตรวจความพร้อม 3 เงื่อนไขอีกครั้งก่อนเปลี่ยนสถานะ…") · เหตุผลว่าง → ปุ่ม **ยืนยันส่งมอบ** กดไม่ได้
![](../shots/R7v3/33a-send-modal-empty.png)
3. กรอก `ส่งชุดเอกสาร ต.ค. 2569 v2 ให้สำนักงานบัญชี UAT R7` → **ดับเบิลคลิก ยืนยันส่งมอบ**
![](../shots/R7v3/33b-send-modal-filled.png)
**ผลบนจอ**: toast "ยืนยันส่งมอบแล้ว — ตุลาคม 2569 / ส่งสำนักงานบัญชีแล้ว" · ป้าย **ส่งสำนักงานบัญชีแล้ว** · บรรทัดย่อย "จำกัด — เฉพาะฟิลด์ที่ไม่กระทบยอดที่ส่งไปแล้ว" · "0 วิกฤต · ตรวจล่าสุด 04/10/2569 12:45" · Export ล่าสุด 04/10/2569 · "ส่ง: ปรีดา บัญชีงาม" · ปุ่มเปลี่ยนเป็น **ล็อกงวด** (ไม่ได้กด — R8)
![](../shots/R7v3/33c-closing-sent.png)
**ผลหลังบ้าน**: ดับเบิลคลิกได้คำขอ 200 แค่ครั้งเดียว · `sent_to_accountant` · sent_at 05:45:48Z · sent_by ✓ · `export_ready` = **t** · `last_readiness_checked_at` มีค่า · audit `status_change` accounting_periods reason = เหตุผลที่กรอก · ส่งซ้ำ (API) → 400 `PERIOD_INVALID_STATUS` ✅
**Mark ว่าส่งแล้ว (v1.1)**: แท็บ ส่งมอบ → แถว v1.1 → **Mark ว่าส่งแล้ว** → modal "Mark ว่าส่งให้สำนักงานบัญชีแล้ว — ตุลาคม 2569" ("…การส่งจริงเกิดนอกระบบ ที่นี่บันทึกไว้เพื่อให้ตามสถานะได้" — ไม่มีช่องหมายเหตุ) → **ยืนยันว่าส่งแล้ว**
![](../shots/R7v3/33d-mark-sent-modal.png)
→ 200 · toast "บันทึกว่าส่ง ตุลาคม 2569 v1.1 ให้สำนักงานบัญชีแล้ว" · ป้าย "ส่งสำนักงานบัญชีแล้ว" · ปุ่มเปลี่ยนเป็น "Mark ว่าตอบรับ" (ไม่ได้กด) · v1.0 ยัง `generated` · audit `status_change` export_records (reason ว่าง — ⚠️) · mark-sent ซ้ำ (API) → 400 `EXPORT_INVALID_STATUS` ✅
![](../shots/R7v3/33e-export-v2-sent.png)
**probe หลังส่ง (การเขียนที่กระทบยอด)**:
| probe | ก่อนส่ง | หลังส่ง |
|---|---|---|
| `uat.finance` สร้างรอบจ่าย cutoff 04/10/2569 | 400 `NO_ITEMS_TO_PAY` | **400 `PERIOD_LOCKED_DIRECT_EDIT`** (periodStatus sent_to_accountant · affectsAmount true) ✅ |
| `uat.agent.in2` ขอเบิกเงินทดรอง ฿1,000 | 400 `ADVANCE_PENDING_SETTLEMENT` | **400 `PERIOD_LOCKED_DIRECT_EDIT`** ✅ |
payout_batches 4 / advances 4 ไม่เปลี่ยน · ไม่มี audit จาก probe · แต่ข้อความบอก "รอบบัญชีถูกล็อกแล้ว / รอบบัญชีนี้ปิดแล้ว" ทั้งที่งวดเพิ่งส่ง ยังไม่ล็อก (🐞 R7cv3-B07)
**สถานะ**: ✅

### R7.34 ข้อซักถามนักบัญชี (uat.account ตั้ง/ตอบเอง — มติ O28)
**เมนู**: แท็บ **ข้อซักถาม** (URL `?tab=qa`)
![](../shots/R7v3/34a-questions-empty.png)
**ทำ**:
1. probe `POST /api/accounting/questions {questionText:'   '}` → 400 `REQUIRED_MISSING` fields.questionText "ต้องระบุคำถาม" ✅
2. **บันทึกข้อซักถาม** → modal "บันทึกข้อซักถามจากสำนักงานบัญชี" (ไม่มีช่องเลือกรอบ — ใช้รอบเดือนปัจจุบัน) · ว่าง → ปุ่มกดไม่ได้ · กรอก `เงินรับ 123.45 บาท ไม่ทราบผู้โอน บันทึกเป็นเงินรับรอตรวจสอบ ถูกต้องหรือไม่` → ดับเบิลคลิก **บันทึกข้อซักถาม**
![](../shots/R7v3/34b-question-form.png)
→ 201 · toast "บันทึกข้อซักถามแล้ว" · แถวสถานะ "รอตอบ" · ดับเบิลคลิกได้แถวเดียว
![](../shots/R7v3/34c-question-open.png)
3. probe ตอบว่าง → 400 `REQUIRED_MISSING` fields.answerText ✅ · ปุ่ม **ตอบคำถาม** → modal "ตอบข้อซักถาม" (คำเตือน "ตอบได้ครั้งเดียว") · กรอก `ถูกต้อง บันทึกเป็นหนี้สินหมุนเวียน-เงินรับรอตรวจสอบ จนกว่าจะทราบที่มา` → ดับเบิลคลิก **ส่งคำตอบ**
![](../shots/R7v3/34d-answer-form.png)
→ 200 · toast "ส่งคำตอบแล้ว / สถานะเปลี่ยนเป็น “ตอบแล้ว”" · การ์ด ทั้งหมด 1 / ยังไม่ได้ตอบ 0 / ตอบแล้ว 1
![](../shots/R7v3/34e-question-answered.png)
**ผลหลังบ้าน**: `accountant_questions` 1 แถว งวด 2569-10 · is_resolved t · answered_by/at ✓ · audit `create` + `update` accountant_questions · ตอบซ้ำ (API) → 400 **`ACCOUNTANT_QUESTION_ALREADY_ANSWERED`** ✅ · ตั้ง/ตอบได้แม้งวดเป็น `sent_to_accountant` (ไม่กระทบยอด — ถูกต้องตามนโยบาย limited)
ข้อจำกัด: ไม่มี persona สำนักงานบัญชี — ผู้ตั้งและผู้ตอบเป็นคนเดียวกัน
**สถานะ**: ✅

### R7.36 ตรวจปลาย R7 (→ snapshot `R7-end-v3`)
**probe สิทธิ์ Export ซ้ำหลังแก้ B01** (body ว่าง — สิทธิ์ตรวจก่อน parse): `uat.finance` / `uat.exec` `POST /export-pack` → **403** · `PATCH /export-history/<v1>/mark-sent` → **403** · ดาวน์โหลด v1: การเงิน **200** (ดูได้ 👁️ ตาม matrix) / บริหาร 403 · audit 0
![](../shots/R7v3/36a-exec-closing-sent.png)
| เรื่อง | ค่าจริง | golden R7.md | ตรง? |
|---|---|---|---|
| งวด ต.ค. 2569 | `sent_to_accountant` (export_ready t) | sent_to_accountant | ✅ |
| bank_transactions | auto_matched 3 · unmatched_resolved 1 · unmatched 0 | เดียวกัน | ✅ |
| billing paid / AR | 2 / 0 | 2 / 0 | ✅ |
| payout completed | 4 | 4 | ✅ |
| expense_records | 19 | 19 | ✅ |
| 50 ทวิ active / cancelled | 15 / 28500 · 1 | 15 / 28500 · 1 | ✅ |
| ภ.ง.ด.3 / 53 | 28500 / 0 pending | 28500 / 0 รอยื่น | ✅ |
| tax_invoices active | 2 | 2 | ✅ |
| exceptions | resolved 1 · open 0 | 1 / 0 | ✅ |
| export_records | **2** (v1.0 generated · v1.1 **sent**) hash ต่างกัน | 2 (v2 sent) hash ต่าง | ✅ |
| accountant_questions | 1 (ตอบแล้ว) | 1 | ✅ |
| advances | cleared,rejected,overdue,cleared | เดียวกัน | ✅ |
| revenues billed | 4 | 4 | ✅ |
| cash_receipts | 2 | 2 | ✅ |
pm2: ไม่มี error/500 ช่วง 12:40–12:48 (error ที่เห็นใน log เป็นของ 12:01/12:02 รอบก่อน) · console error 0 · `counts.sh`: audit_logs **403** (+7: export ×2, ส่งงวด, mark-sent, question create/update — ไม่นับ login) · export_records 2 · accountant_questions 1 · exceptions 1 · wht_certificates 16 · bank_transactions 4 · payout_batches 4 · advances 4 · notifications 61 (+2) · jobs 8
**Storage ใหม่ (ห้ามลบ — จดท้าย STATE)**: bucket `accounting-packs` → `00000000-0000-0000-0000-000000000001/2569-10/v1/20261004-0542110-47110c36/` และ `…/2569-10/v2/20261004-0542169-24efa374/` (โฟลเดอร์ละ 10 object: 01–08, 00_Cover_Sheet.pdf, AccountingPack_2569-10_v1.x.zip) · ไฟล์กำพร้าจาก 2 ครั้งที่ล้มในส่วนแรก (`…/v1/20261004-0501083-d900aa1f/`, `…/v1/20261004-0502016-ade15be9/`) ยังไม่ได้ตรวจ (ต้องใช้ service key)
**สถานะ**: ✅

---

## 🐞 บั๊กที่พบ (ส่วนที่ 2)
| # | step | ระดับ | ชนิด | อาการ / คาดหวัง |
|---|---|---|---|---|
| **R7cv3-B07** | R7.33 | S5 | code | `PERIOD_LOCKED_DIRECT_EDIT` ตอนงวดเป็น `sent_to_accountant` ขึ้น title "รอบบัญชีถูกล็อกแล้ว" + message "รอบบัญชีนี้ปิดแล้ว … ต้องสร้างรายการปรับปรุง (Adjustment) แทน" (`lib/settings/errors.ts` ข้อความเดียวทุกสถานะ) — งวดยังไม่ล็อก ผู้ใช้เข้าใจผิด · คาด: ข้อความแยกตามสถานะ เช่น "ส่งสำนักงานบัญชีแล้ว — แก้รายการที่กระทบยอดไม่ได้" (context มี `periodStatus` อยู่แล้ว) |
| **R7cv3-B08** | R7.33 | S5 | code | `PATCH /periods/:id/send` ไม่ส่ง `reason` → `fields.reason` = "Invalid input: expected string, received undefined" (Zod อังกฤษดิบ — แบบเดียวกับ BUG-114) · เกิดเฉพาะยิง API ตรง (UI ส่ง string เสมอ) · คาด "ต้องระบุเหตุผล" |

## ⚠️ ข้อสังเกต (ไม่ให้เลข)
- **ไม่มีไฟล์ใบกำกับภาษี/ยอดขายรวม VAT ใน Accounting Pack** — step sheet คาด "ไฟล์ขาย 2 ใบกำกับ 1148110" แต่ `37` §6.1 กำหนด 8 ไฟล์ที่ไม่มีไฟล์ขาย · `01_Revenue.csv` มีแค่ยอดก่อน VAT + vat_flag (10,730.00) — สำนักงานบัญชีต้องดึงเลขใบกำกับ/ยอด VAT จากที่อื่น (ดู ❓-R7c-5)
- `02_Cash_Receipts.csv` ไม่มีคอลัมน์ภาษีที่ลูกค้าหัก — เห็นแค่ 3879.20 ไม่เห็นเครดิตภาษี 111.90 (ต่อจาก R7-N1)
- `08_Document_Checklist.xlsx` แถวของข้อยกเว้นที่ resolved แล้วแสดง source_ref "-" และ exception_summary "-" — ไม่เห็นหัวข้อ "ใบเสร็จค่าที่พักต้นฉบับ…" ที่เคยค้าง
- Mark ว่าส่งแล้ว ไม่มีช่องหมายเหตุบนจอ ⇒ audit `status_change` export_records reason ว่าง (API รับ `note` ได้ · step sheet คาดส่ง note) — ไม่ผิดกติกา reason บังคับ แต่ตามรอยว่าส่งช่องทางไหนไม่ได้
- brief เขียน "ต้นรอบ ~14:10" แต่เวลาจริงตอนเล่น 12:41 น.

## ❓ ต้องตัดสินใจ (ส่วนที่ 2)
- **❓-R7c-5 ไฟล์ใบกำกับภาษีใน Accounting Pack** · **ก (แนะนำ)** ยอมรับตาม `37` (8 ไฟล์) และแก้ step sheet/golden — สำนักงานบัญชีใช้รายงานภาษีขายแยก · ข เพิ่มไฟล์ 09_Tax_Invoices.csv (เลขที่/วันที่/ก่อน VAT/VAT/รวม) ต้องแก้ `37` + DEC
- **❓-R7c-6 ข้อความ PERIOD_LOCKED_DIRECT_EDIT ตอน sent_to_accountant (B07)** · **ก (แนะนำ)** แยกข้อความตาม periodStatus ใน code เดิม (ไม่ตั้ง code ใหม่) · ข คงไว้ (ถือว่า "ส่งแล้ว" = ล็อกบางส่วน)

## ไฟล์ที่เกิดในส่วนที่ 2
- ภาพ 20 ภาพ `uat/shots/R7v3/32f…32l, 33a…33e, 34a…34e, 36a` (32k/32l = Quick Look render ของ PDF)
- ดาวน์โหลด `uat/fixtures/downloads-R7cv3/`: `export-pack-v1.zip`, `export-pack-v2.zip` (จาก API) · `ui-1791092532879-AccountingPack_ตุลาคม_2569_v1.0.zip`, `ui-1791092538164-AccountingPack_ตุลาคม_2569_v1.1.zip` (จากปุ่มบนจอ — ไบต์เดียวกับ API) · `WHT-2569-016-after-BUG120.pdf`, `WHT-2569-009-after-BUG120.pdf`
- สคริปต์ `uat/bin/r7v3/s32c.mjs s32d.mjs s33.mjs s34.mjs s36.mjs`
- ไฟล์ขยะ: zip ที่แตกไว้ตรวจและสคริปต์ดึงข้อความ PDF อยู่ใน scratchpad ของ session (นอก repo) · ไม่มีไฟล์ขยะใน repo
