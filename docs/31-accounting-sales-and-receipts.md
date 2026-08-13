# 31-accounting-sales-and-receipts.md

# 31 — Accounting: Sales and Receipts (บัญชีขายและเงินรับ)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — แก้ไข Tax Invoice status enum)
> Document Level: Accounting Module
> เอกสารอ้างอิง: `19-revenue-billing-receivable.md`, `10-finance-companies.md`, `13-accounting-finance-settings.md` §6.12, `02-database-schema-design.md` §9 (tax_invoices table), `35-bank-reconciliation.md`
> 🔶 ดูหมายเหตุสำคัญเรื่องการตรวจทานโดยนักบัญชีในไฟล์ 10 — ใช้กับไฟล์นี้เช่นกัน โดยเฉพาะเรื่องใบกำกับภาษี (§6.2) ซึ่งมีข้อกำหนดทางกฎหมายเข้มงวด

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Sales Record, Tax Invoice (auto-number), Cash Receipt |
| v2 | 03/07/2569 | **แก้ไข §7.2 (Tax Invoice status)**: เดิมระบุ 3 สถานะ `draft`/`issued`/`cancelled` ซึ่ง**ไม่ตรงกับ** enum `tax_invoice_status` ใน `02-database-schema-design.md` ที่มีแค่ `active`/`cancelled` — ตรวจสอบ workflow §9.1 ในไฟล์นี้เองแล้วพบว่า **ไม่เคยมีขั้น draft จริงในทางปฏิบัติ** (กดปุ่ม "ออกใบกำกับภาษี" แล้วออกทันที ไม่มีขั้นร่างค้างไว้ก่อน) จึงแก้เป็น 2 สถานะ `active`/`cancelled` ให้ตรงกับ schema — ปิด flag ที่ตั้งไว้ใน `23-finance-state-machines.md` §6.10 — Reformat header ตามมาตรฐานเอกสารชุดใหม่ |

ขอบเขตเอกสารนี้: มุมมองฝั่งบัญชีของรายได้ (ต่อจากไฟล์ 19 ฝั่งการเงิน) — บันทึกรายการขาย/บริการตามมาตรฐานบัญชี ออกใบกำกับภาษี และบันทึกเงินรับจริงที่กระทบยอดกับธนาคารแล้ว

**ไม่รวมอยู่ในไฟล์นี้**: การสร้างรายได้เริ่มต้น/Billing Batch (ดู `19-revenue-billing-receivable.md`), การกระทบยอดธนาคารเชิงเทคนิค (ดู `35-bank-reconciliation.md`), ค่าใช้จ่าย/WHT ฝั่งจ่าย (ดู `32-accounting-expenses-payments.md`, `33-accounting-wht-data.md`)

---

## 1. Summary

มุมมองฝั่งบัญชีของรายได้ (ต่อจากไฟล์ 19 ฝั่งการเงิน) — บันทึกรายการขาย/บริการตามมาตรฐานบัญชี ออกใบกำกับภาษี และบันทึกเงินรับจริงที่กระทบยอดกับธนาคารแล้ว

## 2. Purpose

เป็นข้อมูลที่บัญชี/สำนักงานบัญชีใช้บันทึกบัญชีจริงและยื่นภาษีมูลค่าเพิ่ม (ภ.พ.30) — ต่างจากไฟล์ 19 ที่เป็นมุมมอง "ติดตามเงิน" ไฟล์นี้คือ "บันทึกบัญชี" ตามรอบที่ปิดแล้ว

## 3. In Scope

- รายการขาย/รายได้ (Sales Record) ที่ sync มาจาก Revenue (ไฟล์ 19) พร้อมข้อมูลที่บัญชีต้องใช้เพิ่ม
- การออกใบกำกับภาษี (Tax Invoice) ตามที่กฎหมายกำหนด
- บันทึกเงินรับจริง (Cash Receipt) ที่กระทบยอดกับ Bank Statement แล้ว (ไฟล์ 35)
- ใบเสร็จรับเงิน (Receipt)

## 4. Out of Scope

- การสร้างรายได้เริ่มต้น/Billing Batch (ไฟล์ 19)
- การกระทบยอดธนาคารเชิงเทคนิค (ไฟล์ 35)
- ค่าใช้จ่าย/WHT ฝั่งจ่าย (ไฟล์ 32/33)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| บัญชี (Accounting) | ออกใบกำกับภาษี, บันทึกเงินรับ, ตรวจสอบความครบถ้วนก่อนส่งสำนักงานบัญชี | Full |
| การเงิน (Finance) | ดู Sales/Receipt เพื่ออ้างอิง — แก้ไขเองไม่ได้ | Read-only |

## 6. Core Concepts

### 6.1 Sales Record (รายการขาย — มุมมองบัญชี)

1:1 กับ Billing Batch ของไฟล์ 19 แต่เพิ่มข้อมูลที่บัญชีต้องใช้ (วันที่บันทึกบัญชี, เลขที่ใบกำกับภาษี) — sync อัตโนมัติเมื่อ Billing Batch เปลี่ยนเป็น `sent`

### 6.2 Tax Invoice (ใบกำกับภาษี) 🔶 มีข้อกำหนดทางกฎหมายเข้มงวด — ต้องให้นักบัญชียืนยันก่อนใช้จริง

ตามประมวลรัษฎากร ผู้ประกอบการจด VAT ต้องออกใบกำกับภาษีทุกครั้งที่ขายสินค้า/ให้บริการ ใบกำกับภาษีแบบเต็มรูปต้องมีข้อมูลครบตามที่กฎหมายกำหนด — ระบบต้อง generate ครบทุกฟิลด์บังคับ (ดู §7.2) ก่อนอนุญาตให้ "ออก" ใบกำกับภาษีจริง

**เลขที่ใบกำกับภาษีต้องเรียงลำดับต่อเนื่องไม่ขาดช่วงเสมอ** (ตามข้อกำหนดกรมสรรพากร) แต่ **รูปแบบ running number ตั้งค่าได้** (ดูไฟล์ 13 §6.12 — เลือกได้ว่าจะต่อเนื่องไม่มีวันสิ้นสุด หรือขึ้นต้นใหม่ทุกปีปฏิทินพร้อม prefix ปี เช่น `INV-2569-0001`) — เลือกรูปแบบแล้วเปลี่ยนทีหลังไม่ได้ (กระทบความต่อเนื่องของเลขเอกสารตามกฎหมาย)

**รูปแบบเอกสาร**: ระบบรองรับทั้ง **e-Tax Invoice** (อิเล็กทรอนิกส์ ส่งเข้าระบบกรมสรรพากร) และ **กระดาษ/PDF** (พิมพ์ส่งทางไปรษณีย์/อีเมล) — เลือกได้ต่อใบ หรือตั้งเป็นค่า default ต่อบริษัทไฟแนนซ์ (ดู §7.2 ฟิลด์ `delivery_format`)

### 6.3 Cash Receipt (เงินรับจริง)

sync มาจากไฟล์ 35 (Bank Reconciliation) เมื่อ statement ธนาคารถูกจับคู่กับ Billing Batch สำเร็จแล้ว — ไม่ใช่กรอกมือในไฟล์นี้ เพื่อป้องกันข้อมูลไม่ตรงกับเงินที่เข้าจริง

### 6.4 Receipt (ใบเสร็จรับเงิน)

ออกคู่กับ Cash Receipt ทุกครั้งที่มีเงินรับจริงเข้ามา — เอกสารยืนยันการรับเงิน (ต่างจากใบกำกับภาษีที่ยืนยันการขาย/ให้บริการ)

## 7. Data Entities / Required Objects

### 7.1 Sales Record

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| billing_batch_id | uuid | yes | อ้างอิงไฟล์ 19 |
| company_id | uuid | yes | — |
| accounting_date | date | yes | วันที่บันทึกบัญชี (อาจต่างจากวันวางบิลถ้ารอบบัญชีปิดช้า) |
| tax_invoice_id | uuid \| null | — | ผูกกับ Tax Invoice ที่ออกแล้ว — `null` แปลว่ายังไม่ออก |

### 7.2 Tax Invoice (แก้ไข status แล้ว — ดู Changelog v2)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| invoice_number | string | yes | เลขที่ใบกำกับภาษี — running number ต่อเนื่องไม่ขาดช่วง |
| issue_date | date | yes | วันที่ออกใบกำกับภาษี |
| seller_name, seller_tax_id, seller_address | string | yes | ข้อมูล AssetRecovery (ผู้ขาย) — ดึงจากการตั้งค่าองค์กร |
| buyer_name, buyer_tax_id, buyer_address | string | yes | ข้อมูลบริษัทไฟแนนซ์ (ผู้ซื้อ) — ดึงจากไฟล์ 10 |
| description | string | yes | รายละเอียดสินค้า/บริการ (เช่น "ค่าบริการติดตามทรัพย์ รอบเดือน มิถุนายน 2569") |
| amount_before_vat | decimal | yes | — |
| vat_amount | decimal | yes | snapshot จากไฟล์ 19 §6.3 |
| total_amount | decimal | yes | — |
| delivery_format | enum | yes | `e_tax_invoice` (อิเล็กทรอนิกส์ ส่งเข้าระบบกรมสรรพากร) / `paper_pdf` (กระดาษ/PDF) — เลือกได้ต่อใบ มี default ตั้งค่าได้ต่อบริษัทไฟแนนซ์ (ไฟล์ 10) |
| status | enum | yes | **`active`** (ออกแล้วใช้งานอยู่) / **`cancelled`** (ยกเลิก, terminal) — **แก้จาก 3 สถานะเดิม (`draft`/`issued`/`cancelled`) เหลือ 2 สถานะ** ให้ตรงกับ `02-database-schema-design.md` เพราะ workflow จริงไม่มีขั้น draft (ดู §9.1) |

### 7.3 Cash Receipt

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| billing_batch_id | uuid | yes | — |
| bank_transaction_id | uuid | yes | อ้างอิงไฟล์ 35 — รายการ statement ที่จับคู่แล้ว |
| received_date | date | yes | — |
| received_amount | decimal | yes | — |
| receipt_number | string | yes | เลขที่ใบเสร็จ — running number |

## 8. UI / UX Rules

อ้างอิงจาก `accounting.html`:

- แท็บ "รายได้และขาย": table — บริษัท, Case Ref, วันที่รายได้, Model, Gross, VAT Flag, Billing Batch, สถานะ
- แท็บ "เงินรับ": table — วันที่, ผู้จ่าย, ยอด, Bank Ref, Billing Ref, WHT ลูกค้าหัก (ถ้ามี), สถานะจับคู่, ปุ่มจัดการ (จับคู่ Manual ถ้า unmatched / ดูรายละเอียดถ้า matched แล้ว)

## 9. Workflow / Lifecycle

### 9.1 Tax Invoice (แก้ไขแล้ว)

`Billing Batch เปลี่ยนเป็น sent → สร้าง Sales Record → บัญชีกด "ออกใบกำกับภาษี" → ระบบตรวจฟิลด์บังคับครบ + กำหนด invoice_number running ถัดไป → status = active` (สร้างและออกในขั้นตอนเดียว ไม่มีสถานะร่าง (draft) ค้างไว้ก่อน)

**ยกเลิกใบกำกับภาษี**: ทำได้เฉพาะกรณีออกผิดพลาดจริง — `active → cancelled` ต้องระบุเหตุผลและออกใบกำกับภาษีใหม่แทน (ห้ามลบเลขที่เดิม เพื่อรักษาความต่อเนื่องของเลขที่เอกสารตามกฎหมาย)

### 9.2 Cash Receipt

`Bank statement จับคู่กับ Billing Batch สำเร็จ (ไฟล์ 35) → สร้าง Cash Receipt อัตโนมัติ → ออกใบเสร็จรับเงิน → อัปเดต received_amount ที่ Billing Batch (ไฟล์ 19)`

## 10. Security / Control Rules

- ห้ามแก้ไข Tax Invoice ที่ `status = active` — ต้องยกเลิกแล้วออกใหม่เท่านั้น (ตาม §9.1)
- `invoice_number` ต้องไม่ซ้ำและเรียงต่อเนื่อง — ระบบ generate อัตโนมัติ ไม่ให้กรอกมือ
- Cash Receipt สร้างได้จากไฟล์ 35 เท่านั้น ห้ามสร้างมือในไฟล์นี้โดยตรง

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| TAX_INVOICE_FIELD_MISSING | ฟิลด์บังคับของใบกำกับภาษี (§7.2) ไม่ครบ | reject ก่อนออกเอกสารจริง |
| INVOICE_NUMBER_GAP | พยายาม generate invoice_number ที่ไม่ต่อเนื่องจากเลขล่าสุด | reject — ระบบจัดการเลขให้เองเสมอ ไม่ควรเกิด error นี้ในทางปฏิบัติ ยกเว้น race condition |
| CANCEL_REQUIRES_REASON | ยกเลิกใบกำกับภาษีโดยไม่ระบุเหตุผล | reject |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| ออก/ยกเลิกใบกำกับภาษี | บัญชี | full |
| ดูรายการขาย/เงินรับ | การเงิน, ผู้บริหาร | read-only |

## 13. Audit Log Requirements

- ออก/ยกเลิกใบกำกับภาษีทุกครั้งต้อง audit พร้อมเหตุผล (ถ้ายกเลิก)
- Cash Receipt ที่สร้างอัตโนมัติจากไฟล์ 35 ต้องเก็บ reference กลับไปที่ bank_transaction_id เสมอ เพื่อ trace ได้

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/accounting/sales | list Sales Record |
| POST | /api/accounting/tax-invoices | ออกใบกำกับภาษีใหม่ |
| PATCH | /api/accounting/tax-invoices/:id/cancel | ยกเลิก (ต้องมี reason) |
| GET | /api/accounting/cash-receipts | list (sync จากไฟล์ 35) |

## 15. Acceptance Criteria

- ออกใบกำกับภาษีได้ครบทุกฟิลด์บังคับตามกฎหมาย
- เลขที่ใบกำกับภาษีเรียงต่อเนื่องไม่ขาดช่วงเสมอ แม้มีการยกเลิกเอกสารกลางทาง
- Cash Receipt sync ถูกต้องจากการกระทบยอดธนาคาร

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| ออกใบกำกับภาษีฟิลด์ไม่ครบ | ออกใบกำกับภาษีที่ไม่มี buyer_tax_id | reject TAX_INVOICE_FIELD_MISSING |
| ยกเลิกไม่ระบุเหตุผล | ยกเลิกใบกำกับภาษีโดยไม่กรอก reason | reject CANCEL_REQUIRES_REASON |
| เลขที่ต่อเนื่องหลังยกเลิก | ยกเลิกใบกำกับเลขที่ 005 แล้วออกใบใหม่ | ใบใหม่ได้เลขที่ 006 ไม่ใช่เลขที่ 005 ซ้ำ |
| เลขที่ reset ข้ามปี (yearly_reset mode) | ออกใบกำกับภาษีใบแรกของปีใหม่ เมื่อตั้งค่า numbering_mode = yearly_reset | เลขที่กลับไปเริ่มที่ 0001 พร้อม prefix ปีใหม่ (เช่น INV-2570-0001) |
| ออกแบบ e-Tax Invoice | ออกใบกำกับภาษีเลือก delivery_format = e_tax_invoice | ระบบสร้างเอกสารพร้อมข้อมูลสำหรับส่งเข้าระบบกรมสรรพากร |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Tax Invoice status = 2 สถานะเท่านั้น**: `active`/`cancelled` — ตัด `draft` ออกเพราะ workflow จริงไม่เคยมีขั้นร่างค้างไว้ (สร้าง=ออกทันที) sync กับ schema แล้ว (§7.2, §9.1) — ปิด flag จาก `23-finance-state-machines.md`
- **เลขที่ใบกำกับภาษีต้องต่อเนื่องเสมอแม้ยกเลิกเอกสาร** — ยกเลิกไม่ใช่ลบ ออกใบใหม่แทนด้วยเลขถัดไป (§9.1, §10)
- **รองรับ e-Tax Invoice และ Paper/PDF ทั้งคู่** เลือกได้ต่อใบหรือตั้ง default ต่อบริษัท (§6.2)
- **Cash Receipt สร้างได้จาก Bank Reconciliation เท่านั้น** ห้ามกรอกมือโดยตรง (§6.3, §10)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ยืนยันแล้ว: รูปแบบเลขที่ใบกำกับภาษีตั้งค่าได้ (ดูไฟล์ 13 §6.12) และระบบรองรับทั้ง e-Tax Invoice และกระดาษ/PDF เลือกได้ต่อใบ
- ไม่มี Open Item ค้างอยู่ในไฟล์นี้แล้ว

---

*เอกสารนี้เป็นไฟล์ที่ 2 ในหมวด Accounting Module (30–37) ต่อจาก `30-accounting-handover-monthly-close.md` และก่อน `32-accounting-expenses-payments.md`*
