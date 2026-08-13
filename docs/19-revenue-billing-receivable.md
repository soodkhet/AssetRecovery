# 19-revenue-billing-receivable.md

# 19 — Revenue, Billing & Receivable (รายได้ วางบิล และลูกหนี้การค้า)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Finance Core Module
> เอกสารอ้างอิง: `10-finance-companies.md` §9.2, `12-service-fee.md`, `13-accounting-finance-settings.md` §6.1/§6.5, `41-field-tracker-mobile.md` §10.1, `44-asset-custody-handover.md` §6/§11, `02-database-schema-design.md` §8 (revenues, billing_batches table), `20-adjustment.md`, `31-accounting-sales-and-receipts.md`, `35-bank-reconciliation.md`, `92-platform-data-model.md` §6.1
> 🔶 ดูหมายเหตุสำคัญเรื่องการตรวจทานโดยนักบัญชีในไฟล์ 10 — ใช้กับไฟล์นี้เช่นกัน โดยเฉพาะเรื่อง VAT versioning (§6.3)

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Revenue trigger logic (Warehouse gate), VAT versioning, AR Aging |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — ตรวจสอบ enum `revenue_status`/`billing_batch_status` เทียบกับ `02-database-schema-design.md` แล้ว **ตรงกันทุกตัว ไม่พบ conflict** — **เนื้อหา business logic เดิมคงไว้ครบ** |
| v2.1 | 04/07/2569 | **บันทึก Open Item ใหม่ใน §18 (ยังไม่ตัดสิน)**: หมายเหตุท้าย §6.1 ("เคสไม่มี expense → สร้าง Revenue ทันทีที่ terminal") **ขัดแย้งกับ Warehouse gate** สำหรับกรณี `closed_success` — ถ้าเคสสำเร็จแต่ไม่มี expense เลย ตามหมายเหตุเดิมจะข้ามเงื่อนไข `HandoverLot.confirmed` ไป ซึ่งขัดกับกฎหลัก 3 เงื่อนไข (§17 ข้อแรก, ไฟล์ 44 §11, ไฟล์ 92 §6.1) — รอ Product Owner ตัดสิน ไม่แก้ business logic เอง (sync เข้า `93-roadmap-open-items.md` §7.1 แล้ว) |
| v2.2 | 04/07/2569 | **ปิด Open Item — Product Owner ตัดสินแล้ว (DEC-006/D6 = Option A)**: เคส `closed_success` ที่ไม่มี expense เลย **ยังต้องรอ `HandoverLot.confirmed` ก่อนเสมอ** — Warehouse gate ใช้ทุกกรณีไม่มีข้อยกเว้น (เหตุผลของ gate คือกันวางบิลก่อนส่งมอบเครื่องจริง ไม่เกี่ยวกับว่ามีค่าใช้จ่ายหรือไม่) — แก้หมายเหตุใน §6.1 + เพิ่ม test case §16 + decision §17 |

ขอบเขตเอกสารนี้: สร้างรายการรายได้จากเคสที่ปิดงานสำเร็จ รวมเป็นรอบวางบิล (Billing Batch) ส่งให้บริษัทไฟแนนซ์ และติดตามยอดค้างรับ (AR Aging) — รวม **Revenue Trigger Logic ที่ซับซ้อนที่สุดในระบบ** (ต้องผ่าน Warehouse gate)

**ไม่รวมอยู่ในไฟล์นี้**: การบันทึกบัญชีขาย/รับเงินตามมาตรฐานบัญชี (ดู `31-accounting-sales-and-receipts.md`), การออกใบกำกับภาษี/ใบเสร็จรับเงินที่เป็นเอกสารทางการ (ดู `31-accounting-sales-and-receipts.md` §8, `28-finance-export-pdf-spec.md`), การกระทบยอดธนาคารกับเงินที่รับจริง (ดู `35-bank-reconciliation.md`)

---

## 1. Summary

สร้างรายการรายได้จากเคสที่ปิดงานสำเร็จ รวมเป็นรอบวางบิล (Billing Batch) ส่งให้บริษัทไฟแนนซ์ และติดตามยอดค้างรับ (AR Aging)

## 2. Purpose

เป็นมุมมองฝั่งการเงิน (ก่อนส่งต่อให้บัญชีบันทึกบัญชีจริงที่ไฟล์ 31) ใช้ติดตาม cashflow ฝั่งรายรับและสร้างเอกสารวางบิลส่งบริษัทไฟแนนซ์

## 3. In Scope

- สร้างรายการรายได้ (Revenue) อัตโนมัติเมื่อเคสปิดงานตามเงื่อนไข Service Fee Template (ไฟล์ 12)
- รวมรายได้เป็นรอบวางบิล (Billing Batch) ต่อบริษัทต่อรอบเดือน
- ติดตามยอดรับชำระ (Received) เทียบยอดวางบิล → คำนวณ AR คงค้าง
- AR Aging report

## 4. Out of Scope

- การบันทึกบัญชีขาย/รับเงินตามมาตรฐานบัญชี (อยู่ไฟล์ 31)
- การออกใบกำกับภาษี/ใบเสร็จรับเงินที่เป็นเอกสารทางการ (อยู่ไฟล์ 31 §8 และ 28)
- การกระทบยอดธนาคารกับเงินที่รับจริง (อยู่ไฟล์ 35)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| การเงิน (Finance) | สร้าง/ตรวจสอบ Billing Batch, ติดตาม AR | Full |
| บัญชี (Accounting) | ดู Revenue/Billing เพื่อบันทึกบัญชี (ไฟล์ 31) | Read |
| บริษัทไฟแนนซ์ (company user) | ดูยอดวางบิล/ยอดค้างของบริษัทตัวเอง | Own scope read-only |

## 6. Core Concepts

### 6.1 Revenue Record (รายการรายได้) 🔑 Complex Trigger Logic

**เกิดเมื่อเคสผ่านขั้นตรวจสอบสุดท้ายแล้วเท่านั้น** ไม่ใช่ทันทีที่ `closed_success`/`closed_fail` — เพราะเคสยังมีโอกาสถูกเจ้าหน้าที่อนุมัติเคสตีกลับ (`reject_evidence` → `needs_revision`) ได้ตามไฟล์ 41 §10.1 ถ้าสร้าง Revenue ทันทีตั้งแต่ปิดงาน จะต้องมาจัดการย้อนหลังตอนเคสถูกตีกลับ ซึ่งซับซ้อนกว่าการรอให้แน่ใจก่อน

**จุดที่ Revenue เกิดจริง**: เมื่อรายการเบิก (expense) ของเคสนั้นผ่านขั้นอนุมัติจนถึง `approved` แล้ว (ไม่ใช่แค่ `closed_success`) — เพราะขั้นอนุมัติจ่ายเงิน (ไฟล์ 16) ทำหน้าที่ตรวจสอบครั้งสุดท้ายแทน QC แยกตามที่ตกลงกันไว้ ถ้าผ่านขั้นนี้แล้วถือว่าเคส "จบจริง" ไม่มีโอกาสถูกตีกลับอีก

เงื่อนไขการเกิดตามเงื่อนไข Service Fee Template (snapshot ในตัวเคส ตามไฟล์ 10 §9.2):

- `SUCCESS_FEE`: เกิดเมื่อ `closed_success` **และ** expense ของเคสนั้นเข้าสู่ `approved` **และ** `HandoverLot.status = confirmed` (ไฟล์ 44 §6) — ทั้งสามเงื่อนไขต้องครบพร้อมกัน
- `FLAT`/`HYBRID` ที่ `charge_on_fail = true`: เกิดเมื่อ expense `approved` ไม่ว่า outcome จะเป็น `closed_success` หรือ `closed_fail` (สำหรับ `closed_success` ต้องรอ Lot confirmed ด้วย)
- `FLAT`/`HYBRID` ที่ `charge_on_fail = false`: เกิดเฉพาะ `closed_success` ที่ expense `approved` **และ** Lot confirmed แล้ว

> **เหตุผลที่เพิ่มเงื่อนไข Lot confirmed**: ป้องกันการวางบิลรายได้ก่อนที่จะส่งมอบเครื่องให้บริษัทไฟแนนซ์จริง — ถ้าเครื่องมีปัญหา (IMEI ไม่ตรง/ชำรุด) ที่พบในคลัง ยังสามารถตีกลับเคสได้ก่อนรายได้เกิด — นี่คือ **"Warehouse gate"** ที่บันทึกไว้เป็นหลักการสำคัญใน `92-platform-data-model.md` §6.1

> หมายเหตุ (แก้ไข 04/07/2569 — DEC-006/D6): ถ้าเคสไม่มี expense เกิดขึ้นเลย (กรณีหายาก) เงื่อนไข `expense.approved` ตกไป แต่ **Warehouse gate ยังใช้เสมอ**: `closed_fail` → สร้าง Revenue ทันทีที่เคสเข้าสถานะ terminal (ถ้า model คิดเงินกรณี fail) / `closed_success` → **ต้องรอ `HandoverLot.confirmed` ก่อนเสมอ** ไม่มีข้อยกเว้น — เหตุผลของ gate (กันวางบิลก่อนส่งมอบเครื่องจริง) ไม่ได้หายไปเพราะเคสไม่มีค่าใช้จ่าย

### 6.2 Billing Batch (รอบวางบิล)

รวม Revenue Record หลายรายการของบริษัทเดียวกันในรอบเดือนเดียวกัน (ตาม Billing Cycle ที่ตั้งไว้ในไฟล์ 13 §6.1) เป็นเอกสารวางบิลก้อนเดียว — ไม่วางบิลทีละเคส

### 6.3 VAT Handling 🔶 สำคัญมาก — อัตราอาจเปลี่ยนใน 3 เดือนข้างหน้า

AssetRecovery จด VAT (ยืนยันจาก Product Owner) — รายได้ที่เรียกเก็บจากบริษัทไฟแนนซ์ที่ `vat_registered = true` (ไฟล์ 10) ต้องคิด VAT ตามอัตราที่มีผลในขณะนั้น

**สถานะ ณ วันที่เขียนสเปคนี้ (29 มิ.ย. 2569)**: อัตรา VAT ปัจจุบันคือ **7%** (อัตราลดพิเศษตามพระราชกฤษฎีกา ขยายเวลาถึง 30 กันยายน 2569) — อัตราตามกฎหมายจริงคือ 10% และ**มีความเป็นไปได้ที่จะกลับไปใช้ 10% ตั้งแต่ 1 ตุลาคม 2569** หากไม่มีการขยายเวลาลดอัตราต่อ

**ดังนั้นห้าม hardcode อัตรา VAT เป็น 7% ตายตัวเด็ดขาด** — ต้องมีโครงสร้างดังนี้:

| Field | Type | Description |
|---|---|---|
| vat_rate_history | array | เก็บประวัติอัตรา VAT แยกตามช่วงเวลา: `{rate: decimal, effective_from: date, effective_to: date \| null}` |

- เมื่อสร้าง Revenue Record หรือ Billing Batch ระบบดึงอัตรา VAT ที่ `effective_from <= revenue_date <= effective_to (หรือ null = ยังใช้อยู่)` มาใช้คำนวณ — ไม่ใช่ดึงอัตรา "ปัจจุบัน" แบบ global constant
- Invoice/Billing Batch ที่ออกไปแล้วเก็บอัตรา VAT ที่ใช้ ณ ตอนนั้นไว้ (snapshot) — ถ้าอัตราเปลี่ยนทีหลัง ไม่กระทบเอกสารเก่า
- ตั้งค่าอัตรา VAT ใหม่ทำที่ไฟล์ 13 §6.5 (VAT Rate Setting)

### 6.4 AR Aging

แสดงยอดค้างรับแยกตามช่วงอายุหนี้ นับจาก due date ของ Billing Batch (ตาม `due_rule` ในไฟล์ 13 §6.1) — ช่วงอายุหนี้ (bucket) ตั้งค่าได้ที่ไฟล์ 13 (`ar_aging_buckets` — ค่าเริ่มต้นมาตรฐาน 0-30/31-60/61-90/90+ วัน) ปรับได้ตามนโยบายบัญชี

## 7. Data Entities / Required Objects

### 7.1 Revenue

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| case_id | uuid | yes | เคสต้นทาง (ไฟล์ 38) |
| company_id | uuid | yes | บริษัทไฟแนนซ์ |
| revenue_date | date | yes | วันที่เกิดรายได้ (= วันปิดงานของเคส) |
| model | enum | yes | snapshot จาก Service Fee Template ของเคสนั้น (`SUCCESS_FEE`/`FLAT`/`HYBRID`) |
| gross_amount | decimal | yes | ยอดก่อน VAT |
| vat_amount | decimal | yes | 0 ถ้า `vat_mode = no_vat`, คำนวณตามอัตราที่ effective ณ `revenue_date` ถ้าไม่ใช่ |
| vat_rate_used | decimal | yes | อัตรา VAT ที่ใช้คำนวณจริง — snapshot ไว้กันอัตราเปลี่ยนย้อนหลัง |
| total_amount | decimal | yes | `gross_amount + vat_amount` |
| billing_batch_id | uuid \| null | — | ผูกกับ Billing Batch เมื่อถูกรวมเข้ารอบวางบิลแล้ว — `null` แปลว่ายัง "ready_for_billing" รอรวมรอบ |
| status | enum | yes | `ready_for_billing` / `billed` (ดู §9) |

### 7.2 Billing Batch

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| company_id | uuid | yes | — |
| period | string | yes | รอบเดือนที่วางบิล (เช่น "มิถุนายน 2569") |
| total_amount | decimal | yes | รวมยอด Revenue ทุกตัวในรอบ (รวม VAT) |
| received_amount | decimal | yes | ยอดที่รับชำระแล้ว — อัปเดตจากไฟล์ 31/35 เมื่อมีเงินเข้าจริง |
| status | enum | yes | `draft` / `sent` / `partially_paid` / `paid` (ดู §9) |
| due_date | date | yes | คำนวณจาก `due_rule` ของ Billing Cycle |

## 8. UI / UX Rules

อ้างอิงจาก `finance.html`:

- แท็บ "รายได้และวางบิล" แสดง table: บริษัท, รอบเดือน, ยอดเรียกเก็บ, รับชำระแล้ว, ยอดคงค้าง (AR), สถานะ, ปุ่ม "เอกสาร"
- AR คงค้างแสดงเป็นสีแดงเด่นเมื่อ > 0
- รายการ Revenue ดิบ (ก่อนรวมเป็น batch) แสดงแยกอีก table: บริษัท, Case Ref, วันที่รายได้, Model, Gross, VAT Flag, Billing Batch ที่ถูกรวมเข้า (หรือ "-" ถ้ายังไม่รวม), สถานะ

## 9. Workflow / Lifecycle

### 9.1 Revenue → Billing Batch

`เคสปิดงานตามเงื่อนไข → สร้าง Revenue (status: ready_for_billing) → ถึงวันตัดรอบ (cut-off) → การเงินกด "สร้างรอบวางบิล" รวม Revenue ทั้งหมดของบริษัทในรอบนั้น → Billing Batch (status: draft) → ตรวจสอบ/ยืนยัน → ส่งเอกสารจริง (status: sent) → รอรับชำระ`

### 9.2 Billing Batch Payment Tracking

`sent → (รับเงินบางส่วน) → partially_paid → (รับเงินครบ) → paid`

รับเงินจริงอัปเดตจากไฟล์ 35 (Bank Reconciliation) ที่จับคู่ statement กับ Billing Batch — ไม่ใช่กรอกมือในไฟล์นี้โดยตรง (กันข้อมูลไม่ตรงกับธนาคารจริง)

## 10. Security / Control Rules

- ห้ามแก้ไข `gross_amount`/`vat_amount` ของ Revenue ที่ถูกรวมเข้า Billing Batch ที่ `status != draft` แล้ว — ต้องใช้ Adjustment (ไฟล์ 20) แทน
- ห้ามลบ Billing Batch ที่ `status != draft`

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| NO_REVENUE_TO_BILL | กด "สร้างรอบวางบิล" แต่ไม่มี Revenue ที่ `ready_for_billing` ของบริษัทนั้นในรอบ | reject พร้อมข้อความแจ้ง |
| EDIT_BILLED_REVENUE | พยายามแก้ Revenue ที่ผูก Billing Batch ที่ไม่ใช่ draft แล้ว | reject พร้อมแนะนำให้สร้าง Adjustment |
| VAT_RATE_NOT_FOUND | ไม่มี vat_rate_history ครอบคลุมวันที่ revenue_date | reject พร้อมแจ้งให้ตั้งค่าอัตรา VAT ก่อน |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| สร้าง/จัดการ Billing Batch | การเงิน | full |
| ดู Revenue/Billing ทั้งหมด | บัญชี, ผู้บริหาร | read-only |
| ดูยอดของบริษัทตัวเอง | Company User | own scope |

## 13. Audit Log Requirements

- การสร้าง/ส่ง Billing Batch ต้องบันทึก audit
- การแก้ไขผ่าน Adjustment ต้องอ้างอิงกลับมาที่ Revenue/Billing Batch ต้นทางเสมอ

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/revenues | list (filter: company, status, date range) |
| GET | /api/billing-batches | list |
| POST | /api/billing-batches | สร้างรอบวางบิลใหม่ (รวม Revenue ที่ ready_for_billing) |
| PATCH | /api/billing-batches/:id/send | เปลี่ยนสถานะเป็น sent |
| GET | /api/ar-aging | รายงาน AR Aging |

## 15. Acceptance Criteria

- Revenue เกิดอัตโนมัติถูกต้องตามเงื่อนไข model/charge_on_fail ของ Service Fee Template ที่ snapshot ไว้
- VAT คำนวณถูกต้องตามอัตราที่ effective ณ revenue_date — ทดสอบกรณีอัตราเปลี่ยนข้ามช่วงเวลาได้
- Billing Batch รวมยอดถูกต้อง ติดตาม AR ได้แม่นยำ

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| VAT คำนวณถูกตามอัตรา ณ วันนั้น | สร้าง Revenue วันที่อยู่ในช่วง VAT 7% | vat_amount = gross × 0.07 |
| VAT เปลี่ยนอัตราไม่กระทบของเก่า | เปลี่ยน vat_rate_history เพิ่มอัตราใหม่ 10% มีผล 1 ต.ค. 2569 แล้วดู Revenue เก่าก่อนหน้านั้น | vat_rate_used ของ Revenue เก่ายังเป็น 7% เหมือนเดิม |
| แก้ Revenue ที่ billed แล้ว | พยายามแก้ gross_amount ของ Revenue ที่ผูก Billing Batch สถานะ sent | reject EDIT_BILLED_REVENUE |
| Revenue ไม่เกิดทันที closed_success | เคส closed_success แต่ expense ยังอยู่ที่ pending_warehouse_confirm/pending_approval (ยังไม่ approved) | ยังไม่มี Revenue เกิดขึ้น |
| Revenue เกิดหลัง expense approved (closed_fail) | เคส closed_fail และ expense เข้าสู่ approved แล้ว | Revenue ถูกสร้างขึ้นตอนนี้ (ถ้า model charge_on_fail = true) |
| Revenue เกิดหลัง expense approved + Lot confirmed (closed_success) | เคส closed_success, expense = approved, HandoverLot = confirmed | Revenue ถูกสร้างขึ้น |
| Revenue ยังไม่เกิดแม้ expense approved แต่ Lot ยังไม่ confirmed | เคส closed_success, expense = approved แต่ HandoverLot ยังเป็น pending_attach | Revenue ยังไม่เกิด — รอ Lot confirmed ก่อน (ไฟล์ 44) |
| เคสถูกตีกลับก่อน Revenue เกิด | เคส closed_success ถูก reject_evidence เป็น needs_revision ก่อนที่ expense จะ approved | ไม่มี Revenue เกิดขึ้นเลย — ไม่ต้องย้อนกลับแก้ไขอะไร เพราะยังไม่เคยสร้าง |
| เคสไม่มี expense ยังติด Warehouse gate | เคส closed_success ไม่มี expense ใดๆ, HandoverLot ยัง pending_attach | Revenue ยังไม่เกิด — รอ Lot confirmed ก่อนเสมอ (DEC-006/D6) |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **🔑 Revenue Trigger ต้องผ่าน "Warehouse gate" เสมอสำหรับเคส closed_success**: `closed_success` + `expense.approved` + `HandoverLot.confirmed` ครบทั้ง 3 เงื่อนไข — ไม่ generate ตอน case close ตรงๆ (§6.1, ตรงกับ `92-platform-data-model.md` §6.1)
- **Revenue เกิดที่จุด `expense.approved` ไม่ใช่ `case closed`** เพราะขั้นอนุมัติจ่ายเงินทำหน้าที่ตรวจสอบครั้งสุดท้ายแทน QC (§6.1)
- **VAT ต้องมี effective date versioning เสมอ ห้าม hardcode** — Revenue/Billing เก็บ `vat_rate_used` เป็น snapshot (§6.3)
- **Billing Batch รวมหลายเคสของบริษัทเดียวกันในรอบเดียว** ไม่วางบิลทีละเคส (§6.2)
- **แก้ไข Revenue/Billing ที่ผ่าน draft แล้วต้องใช้ Adjustment เท่านั้น** ห้ามแก้ตรง (§10, §11)
- **รับเงินจริงอัปเดตจาก Bank Reconciliation (ไฟล์ 35) เท่านั้น** ไม่กรอกมือใน Billing Batch โดยตรง (§9.2)
- **Warehouse gate ใช้กับเคส closed_success ทุกกรณี รวมเคสที่ไม่มี expense** — ยืนยันโดย Product Owner 04/07/2569 (DEC-006/D6) (§6.1)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — VAT Rate Setting เพิ่มเข้าไฟล์ 13 §6.5 เรียบร้อยแล้ว (`vat_rate_history`), ช่วงอายุหนี้ (AR Aging bucket) ทำเป็นค่าตั้งค่า `ar_aging_buckets` ในไฟล์ 13 ปรับได้ตามนโยบายบัญชีจริง
- เงื่อนไข Revenue trigger สำหรับเคส closed_success ที่ต้องรอ HandoverLot confirmed — ออกแบบเสร็จแล้ว ดูไฟล์ 44 §6 (Asset Custody & Handover)
- ~~Edge case เคสไม่มี expense + closed_success~~ → ✅ **ปิดแล้ว 04/07/2569 (DEC-006/D6)** — Warehouse gate ใช้เสมอ ดู §6.1 หมายเหตุฉบับแก้ไข

---

*เอกสารนี้เป็นไฟล์ที่ 6 ในหมวด Finance Core (14–21) ต่อจาก `18-payee-and-tax-profile.md` และก่อน `20-adjustment.md`*
