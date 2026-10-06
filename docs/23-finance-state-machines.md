# 23-finance-state-machines.md

# 23 — Finance State Machines (สถานะรวมทุก Entity)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — sync กับ Batch 3)
> Document Level: Finance Reference — เอกสารอ้างอิงเชิงเทคนิค ไม่มีหน้าจอ UI ของตัวเอง
> เอกสารอ้างอิง: สรุปรวมจากไฟล์ 10, 15, 16, 17, 18, 19, 20, 30, 31, 33, 34, 35, 36, 37, `02-database-schema-design.md` §3 (enum ทั้งหมด)

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — รวม state machine 16 entity |
| v2 | 03/07/2569 | **Sync กับการแก้ไขใน Batch 3**: §6.3 (Expense) เติม `pending_warehouse_confirm`/`pending_finance_approval`/`superseded` ที่ตกหล่น, §6.4 (Advance) แก้เป็น 5 สถานะใหม่ (`pending_approval`/`approved`/`overdue`/`cleared`/`rejected` — ตรงกับไฟล์ 15 v2), §6.6 (Payout Batch) เติม `draft` ที่ตกหล่น — **ส่วน state machine ฝั่ง Accounting (§6.10-6.16) ยังไม่ตรวจสอบกับ schema เพราะไฟล์ 30-37 ยังไม่ถึงคิว reformat (Batch 5)** ทำเครื่องหมายไว้ใน Open Items ชัดเจน ไม่เดาแก้เอง |
| v2.1 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U30 · BUG-109)** — §6.4 หมายเหตุ: การปิดยอดคืนเงินทดรอง **ไม่เพิ่ม state** ใน `advance_status` (ยอดค้าง/ปิด อนุมานจากสมุดย่อย `advance_returns`) |
| v2.2 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U40/U41)**: §6.14 Bank Transaction เพิ่ม `suspense` (เงินรับรอตรวจสอบ — เงินเข้าไม่ทราบที่มา) + `suspense_refunded` (คืนเงินผู้โอน — terminal) · §6.14.1 ใหม่: 50 ทวิ ที่ลูกค้าหักเรา (`customer_wht_status` `pending → received`) — enum ตาม `02` v4.23 |
| v2.3 | 05/10/2569 | **UAT BUG-092 (S4 — งานแก้ของ fixer AK ตามรายการที่ PO มอบ 05/10/2569)** — §6.3 เพิ่ม transition `pending_approval → pending_warehouse_confirm` (action `hold_for_warehouse`) **เฉพาะแถวรายวัน** (job `daily_field_allowance` / เบิกย้อนหลัง U50) ที่ถูกสร้างตอนเคสยังเปิด แล้วเคสปิดสำเร็จภายหลัง — ทำในทรานแซกชันเดียวกับการปิดงาน (และการส่งหลักฐานใหม่) เฉพาะแถวที่ยังไม่มีผู้อนุมัติขั้นใดประทับ/ไม่อยู่ในรอบจ่าย · ปลดกลับด้วย `warehouse_confirm` ตอนล็อต confirmed ตามเดิม · แถวที่มีผู้อนุมัติแล้วบางขั้น/อนุมัติครบ/ตีกลับ/เข้ารอบจ่าย **ไม่แตะ** (รอมติ PO) · ไม่มี state ใหม่ |
| v2.4 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U67)** — §6.6 เพิ่มสถานะ terminal `cancelled` (ยกเลิกรอบจ่ายก่อนโอนจริง จาก `draft`/`checking`/`file_generated` · `completed` ยกเลิกไม่ได้) — enum `payout_batch_status` ใน `02` §3 v4.25 |
| v2.5 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U74)** — §6.4 เงื่อนไขเพิ่มของ `settle` (approved/overdue → cleared): เงินทดรองต้องไม่อยู่ในรอบจ่าย (§6.6) ที่ยังไม่ `completed` — ไม่เช่นนั้น `ADVANCE_IN_PENDING_PAYOUT` · ไม่เพิ่ม state |
| v2.6 | 06/10/2569 | **มติ PO 06/10/2569 (UAT U83)** — §6.4 guard ของ `settle` เพิ่ม: ต้อง**เคยอยู่ในรอบจ่าย (§6.6) ที่ `completed`** อย่างน้อยหนึ่งรอบ (จ่ายจริงแล้ว) — ไม่เช่นนั้น `ADVANCE_IN_PENDING_PAYOUT` · ไม่เพิ่ม state |
| v2.7 | 06/10/2569 | **มติ PO 06/10/2569 U95 + U96 #8** — §6.10 ใบกำกับภาษีมี 2 ชนิด (`tax_invoice_doc_kind`: `tax_invoice` เดิม / `receipt_tax_invoice` ออกตอนรับเงิน) — **state machine เดิม** `active → cancelled` ไม่เพิ่ม state · guard การออก: เงินรับ 1 รายการมีใบ active ได้ 1 ใบ · ใบที่ยกเลิกถูกออกแทนได้ครั้งเดียว (`replaces_tax_invoice_id`) · §7 flow รายได้: วางบิล ⇒ ใบแจ้งหนี้ (ไม่ใช่เอกสารภาษี) · รับเงิน ⇒ ใบเสร็จรับเงิน/ใบกำกับภาษี |
| v2.8 | 06/10/2569 | **มติ PO 06/10/2569 (U103)**: เพิ่ม §6.17 Substitute Receipt (`pending_signature` → `signed`) — ใบรับรองแทนใบเสร็จรับเงิน · ไม่มีสถานะยกเลิก (ใบของใบเบิกที่ถูกปฏิเสธไม่นับเพดาน) |
| v2.9 | 06/10/2569 | **มติ PO 06/10/2569 (U107)**: §6.17 เพิ่มสถานะ `cancelled` (terminal) — `pending_signature`/`signed` → `cancelled` ครั้งเดียว · เหตุผลบังคับ (`CANCEL_REQUIRES_REASON`) + audit · ใบเดิมห้ามลบ PDF พิมพ์ป้าย "ยกเลิก" · ไม่นับเพดานต่อเดือน · ออกใบใหม่แทนได้ (เลขใหม่ ผูกรายการเดิม) · ยกเลิกไม่ได้ถ้าใบเบิกที่ผูกอนุมัติจ่ายแล้ว (`SUBSTITUTE_RECEIPT_NOT_CANCELLABLE`) |
| v2.10 | 06/10/2569 | **มติ PO 06/10/2569 (U117 ข้อ 3)** — §6.3 เส้น `pending_approval → rejected` (ปฏิเสธถาวร) เปิดใช้จริงสำหรับใบเบิกค่าที่พัก (`PATCH /api/claims/:id/reject-permanent`) · **ไม่เพิ่มเส้นใหม่** — โค้ดเดิมที่ยอมจาก `pending_finance_approval` ถูกปรับให้ตรงเอกสาร (จาก `pending_approval` เท่านั้น) |
| v2.11 | 06/10/2569 | **มติ PO 06/10/2569 (U118)** — §6.3 เพิ่มเส้น `pending_finance_approval → rejected` และ `needs_revision → rejected` (ปฏิเสธถาวรใบเบิกค่าที่พัก) · เหตุผลบังคับ + audit · สิทธิ์: ขั้นที่รายการรออยู่ หรือขั้นที่ตีกลับครั้งล่าสุดเมื่อ `needs_revision` · ใบรับรองแทนใบเสร็จที่ผูกไม่นับเพดานต่อเดือนทันที |
| v2.12 | 07/10/2569 | **มติ PO U155 → U159**: เพิ่ม §6.18 หมายเหตุ Model Phone — `device_catalog_status` เป็น**ค่าที่ผู้ดูแลตั้งด้วยมือ** (ไม่ใช่ state machine · ไม่มีขั้นรอตรวจ) |
| v2.13 | 07/10/2569 | **มติ PO O74**: §6.4 guard ของ `approved → overdue` — ต้องจ่ายออกแล้ว (เคยอยู่ในรอบจ่าย `completed` — U83) · ยังไม่จ่ายคง `approved` · ไม่เพิ่ม state |
| v2.14 | 07/10/2569 | **มติ PO U166 → U167 (DEC-017)**: §6.18 job เปลี่ยนเป็น `device_tac_sync` (รายวัน · ไม่เปลี่ยน `manual_status` · ไม่ทับ TAC เดิม) · รุ่นไม่ทราบปีจากฐาน TAC ไม่แสดงตั้งต้น · `device_tacs.source` เป็นแหล่งที่มา ไม่ใช่ state · `device_tac_updates.status` บันทึกครั้งเดียว — ยังไม่ใช่ state machine |
| v2.15 | 07/10/2569 | **มติ O75**: §6.8 เพิ่มเส้น `paid → partially_paid` เมื่อเอกสาร (ใบเพิ่มหนี้/ยกเลิกใบลดหนี้) ทำให้ยอดตามเอกสารค้าง > 0 · สถานะทั้งตอนรับเงินและตอนเอกสารเปลี่ยนยอดเทียบ**ยอดตามเอกสาร** |

ขอบเขตเอกสารนี้: รวม state machine ของทุก entity ในโมดูล Finance/Accounting ไว้ในที่เดียว เพื่อให้เห็นภาพรวมและตรวจสอบความสอดคล้องระหว่างกัน

**ไม่รวมอยู่ในไฟล์นี้**: สูตรคำนวณ (ดู `22-finance-calculation-spec.md`), Validation rules ที่ไม่ใช่ state transition (ดู `24-finance-validation-rules.md`)

---

## 1. Summary

รวม state machine ของทุก entity ในโมดูล Finance/Accounting ไว้ในที่เดียว เพื่อให้เห็นภาพรวมและตรวจสอบความสอดคล้องระหว่างกัน

## 2. Purpose

ป้องกัน state ขัดแย้งกันระหว่างโมดูล และเป็นจุดอ้างอิงเดียวสำหรับนักพัฒนาตอน implement transition logic

## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้)

เอกสารนี้เป็น technical reference ล้วน — ไม่มี Scope/Actor ของตัวเองนอกเหนือจากที่ไฟล์ต้นทางแต่ละ state กำหนดไว้

## 6. State Machines ทั้งหมด

### 6.1 Finance Company (ไฟล์ 10)

```
active ⇄ suspended   (ต้องระบุเหตุผลเมื่อเปลี่ยนเป็น suspended)
```

### 6.2 Payee Profile (ไฟล์ 18)

```
unverified → verified   (การเงินยืนยัน)
verified → unverified   (auto-reset เมื่อแก้ไขข้อมูลธนาคาร/ภาษีสำคัญ)
```

> หมายเหตุ: schema เก็บเป็น `is_verified BOOLEAN` ไม่ใช่ enum แต่ความหมาย state ตรงกัน (ดูไฟล์ 18 §7.1)

### 6.3 Expense / Claim (ไฟล์ 15, 41 §6.6 — entity เดียวกัน enum เดียวกัน) — แก้ไขแล้ว

```
pending_warehouse_confirm (เฉพาะ closed_success รอคลังยืนยัน) → pending_approval
pending_approval → pending_finance_approval → approved
pending_approval/pending_finance_approval → needs_revision (reject_expense, ต้องมี reason) → pending_approval (resubmit)
pending_approval/pending_finance_approval/needs_revision → rejected (reject_permanent — terminal ปฏิเสธถาวร ไม่ใช่ขอแก้ไข · เหตุผลบังคับ · มติ PO U118: ใบที่ needs_revision ใช้สิทธิ์ของขั้นที่ตีกลับมา)
approved → superseded (ถูกแทนที่ด้วยรอบ recycle ใหม่ — ไฟล์ 41)
pending_approval → pending_warehouse_confirm (hold_for_warehouse — เฉพาะแถวรายวันที่ยังไม่มีผู้อนุมัติ เมื่อเคสปิดสำเร็จภายหลัง · BUG-092)
```

> เติม `pending_warehouse_confirm`, `pending_finance_approval`, `superseded` ที่ตกหล่นจาก v1 — ตรงกับ enum `expense_status` เต็มใน `02-database-schema-design.md` §3

### 6.4 Advance — เงินทดรองจ่าย (ไฟล์ 15) — แก้ไขแล้ว (5 สถานะ)

```
pending_approval → approved (รวมความหมาย "รอเคลียร์ยอด")
approved → overdue (auto-mark โดย background job เมื่อเลย due_clear_date **และจ่ายออกแล้ว** — เคยอยู่ในรอบจ่าย completed · มติ PO O74)
approved/overdue → cleared (terminal, เคลียร์ยอดเสร็จ)
pending_approval → rejected (terminal, การเงินไม่อนุมัติ)
```

> **Guard ของ `settle` (มติ PO 05/10/2569 — UAT U74)**: เงินทดรองที่ถูกดึงเข้ารอบจ่าย (§6.6 — ผ่าน `advances.payout_batch_item_id`) ซึ่งยังเป็น `draft`/`checking`/`file_generated` ⇒ **ห้าม settle** (`ADVANCE_IN_PENDING_PAYOUT`) จนกว่ารอบนั้น `completed` · รอบ `cancelled` ⇒ เงินทดรองหลุดจากรอบแล้ว ไม่ติด guard · การสร้างรอบจ่ายดึงเฉพาะเงินทดรอง `approved`/`overdue` (ตรวจซ้ำตอนยึดรายการ) ⇒ เงินทดรอง `cleared` ไม่ถูกดึงเข้ารอบอีก
>
> **Guard เพิ่ม (มติ PO 06/10/2569 — UAT U83)**: `settle` ทำได้เฉพาะเงินทดรองที่**เคยอยู่ในรอบจ่ายที่ `completed`** (จ่ายจริงแล้ว) อย่างน้อยหนึ่งรอบ — ยังไม่เคยถูกดึงเข้ารอบ / รอบถูกยกเลิก ⇒ `ADVANCE_IN_PENDING_PAYOUT` ("ยังไม่ได้จ่ายเงินทดรองนี้ — เคลียร์ได้หลังจ่ายแล้ว")

> แก้ไขจาก v1 (`waiting_settlement`/`settled` เดิม) — ตัด `waiting_settlement` (ซ้ำซ้อนกับ approved), เปลี่ยน `settled`→`cleared`, เพิ่ม `overdue`/`rejected` — sync กับไฟล์ 15 v2 และ `02-database-schema-design.md` v3.1 แล้ว

### 6.5 Compensation Approval — Multi-step (ไฟล์ 16, ผูกกับ §6.3 ด้านบน)

```
pending_approval (step=1) → approve step 1 → step=2 → ... → approve step สุดท้าย → approved
ขั้นใดขั้นหนึ่ง reject → needs_revision → resubmit → กลับไป step=1 ใหม่ทั้งหมด
```

> **ยอดคืนเงินทดรอง (มติ PO 05/10/2569 U30)** — ไม่มี state ใหม่: หลัง `cleared` ยอดคืนค้าง/ปิด อนุมานจากสมุดย่อย `advance_returns` (`15` §9.3 · `22` §6.14) · วิธีคืน (`advance_return_method`) เปลี่ยนได้โดยการเงินเมื่อยังมียอดค้าง

### 6.6 Payout Batch (ไฟล์ 17) — เติม `draft` แล้ว

```
draft (กำลังรวบรวมรายการ) → checking → file_generated → completed
draft | checking | file_generated --(ยกเลิก + เหตุผล)--> cancelled   (มติ PO U67)
```

> **`cancelled` (มติ PO 05/10/2569 — UAT U67)** — terminal · ได้เฉพาะ**ก่อนโอนจริง** (`completed` / มีบัญชีค่าใช้จ่ายของรอบ / จับคู่รายการเดินบัญชีแล้ว ⇒ `PAYOUT_BATCH_ALREADY_PAID` — แก้ผ่าน Adjustment) · `file_generated` ต้องยืนยันว่ายังไม่ส่งไฟล์เข้าธนาคาร (`PAYOUT_CANCEL_FILE_CONFIRM_REQUIRED`) · เหตุผลบังคับ (`CANCEL_REQUIRES_REASON`) · endpoint `POST /api/payout-batches/:id/cancel` · ผลในทรานแซกชันเดียว: รายการเบิก (§6.3 `approved`) / เงินทดรอง (§6.4 `approved`/`overdue`) **ไม่เปลี่ยนสถานะ** แค่หลุดจากรอบกลับไปรอจ่าย + ยอดหักคืนเงินทดรองของรอบกลับเป็นค้าง · รายละเอียด `17` §9.1

> เติม `draft` ที่ตกหล่นจาก v1 — ตรงกับ enum `payout_batch_status` ใน `02-database-schema-design.md` §3 และไฟล์ 17 v2

### 6.7 Revenue (ไฟล์ 19)

```
(ยังไม่เกิด — รอ expense ของเคสเข้าสู่ approved) → ready_for_billing → billed (เมื่อถูกรวมเข้า Billing Batch)
```

> **สำคัญ**: Revenue ไม่ได้ถูกสร้างทันทีที่เคส `closed_success`/`closed_fail` — trigger การสร้างคือ expense ของเคสนั้นเข้าสู่ `approved` (§6.3) **และ** (สำหรับ closed_success) `HandoverLot.confirmed` แล้วเท่านั้น (ดูไฟล์ 19 §6.1 — Warehouse gate) ถ้าเคสถูกตีกลับ (`needs_revision`) ก่อนถึงจุดนั้น จะไม่มี Revenue เกิดขึ้นเลย ไม่ต้องย้อนกลับมาแก้ไข

### 6.8 Billing Batch (ไฟล์ 19)

```
draft → sent → partially_paid → paid
draft → sent → paid   (ถ้าจ่ายครบทีเดียว ข้าม partially_paid)
paid → partially_paid (มติ O75 — บันทึกใบเพิ่มหนี้/ยกเลิกใบลดหนี้จนยอดตามเอกสารค้าง > 0)
```

> **มติ O75 (07/10/2569)**: สถานะของรอบตัดสินจาก**ยอดตามเอกสาร** (ใบแจ้งหนี้ − ใบลดหนี้ + ใบเพิ่มหนี้ active) เทียบยอดชำระแล้ว (รับ + ภาษีลูกค้าหัก + ส่วนต่างค่าธรรมเนียม) ทั้งตอนรับเงิน (`resolveBillingStatusAfterReceipt`) และตอนเอกสารเปลี่ยนยอด (`resolveBillingStatusAfterDocumentChange` — เรียกใน transaction เดียวกับการบันทึก/ยกเลิกใบลดหนี้-ใบเพิ่มหนี้ · audit `status_change` พร้อมเหตุผล) · `paid` ที่ค้าง > 0 ⇒ `partially_paid` · `partially_paid` ที่ชำระครบตามเอกสาร ⇒ `paid` · `draft`/`sent` ไม่ถูกแตะ

### 6.9 Adjustment (ไฟล์ 20)

```
pending_approval → approved   (ระดับอนุมัติขึ้นกับ period_status_at_target — ดู §6.13)
pending_approval → rejected (terminal)
```

### 6.10 Tax Invoice (ไฟล์ 31) — แก้ไขแล้ว ✅

```
active → cancelled   (ต้องระบุเหตุผล — ออกใบใหม่แทน ไม่ใช้เลขเดิมซ้ำ)
```

> **มติ PO U95/U96 #8 (06/10/2569)**: ทะเบียนนี้มี 2 ชนิด (`doc_kind`) — `receipt_tax_invoice` = **ใบเสร็จรับเงิน/ใบกำกับภาษี** ออกตอนรับเงิน (1 เงินรับมีใบ `active` ได้ 1 ใบ) · `tax_invoice` = ใบเดิมตอนวางบิล (ข้อมูลก่อน U95) — **ไม่มี state ใหม่** · ออกใหม่หลังยกเลิก = ใบใหม่ `active` ที่ผูก `replaces_tax_invoice_id` (ใบเดิมถูกออกแทนได้ครั้งเดียว) · เงินรับที่มีใบ `active` เปลี่ยนการจับคู่ไม่ได้ (`CASH_RECEIPT_HAS_TAX_INVOICE`)

> ✅ **แก้ไขแล้ว**: เดิมเขียนเป็น `draft`/`issued`/`cancelled` (3 states) ไม่ตรงกับ schema — ตรวจสอบไฟล์ 31 §9.1 แล้วพบว่า workflow จริงไม่มีขั้น draft (สร้าง=ออกทันที) จึงแก้เป็น `active`/`cancelled` (2 states) ตรงกับ enum `tax_invoice_status` ใน `02-database-schema-design.md` แล้ว

### 6.11 WHT Filing Period Summary (ไฟล์ 33)

```
pending → filed   (บัญชี mark เองหลังยื่นแบบจริงนอกระบบ)
```

> ตรงกับ enum `wht_filing_status` ใน schema (`pending`/`filed`) ✅ ไม่มี conflict

### 6.12 Exception (ไฟล์ 34) — แก้ไขแล้ว ✅

```
open → resolved
open → authorized (Executive อนุมัติข้ามได้เฉพาะรอบบัญชีนั้น — ไม่สืบทอดข้ามรอบ)
```

> ✅ **แก้ไขแล้ว**: เดิมเขียนเป็น `open`/`in_progress`/`resolved` และมี "Authorized Exception" เป็น entity แยก — ตรวจสอบกับ schema แล้วพบว่า `in_progress` ไม่มีจริง และ authorized fields ฝังอยู่ในตาราง `exceptions` เอง ไม่ใช่ entity แยก — ยืนยันกับ Product Owner แล้วว่า authorize แล้ว status → `authorized` ทันที (ไม่ใช่ยัง open) พร้อมมาตรการป้องกันไม่ให้ authorized "หายเงียบ" (แยกแสดงผลจาก resolved เสมอ, ไม่สืบทอดข้ามรอบบัญชี) — ตรงกับ enum `exception_status` ใน `02-database-schema-design.md` แล้ว

### 6.13 Accounting Period — Period Lock Policy (ไฟล์ 13 §6.11, ไฟล์ 30) — **state แม่ที่ควบคุม transition ของไฟล์อื่น**

```
collecting → sent_to_accountant   (ต้องผ่าน Readiness Check: ไม่มี critical exception + bank reconcile ครบ 100% + billing ตรงกับ revenue)
sent_to_accountant → locked       (Executive ยืนยันปิดงวด)
locked → sent_to_accountant       (ปลดล็อกชั่วคราว — เฉพาะ Executive อนุมัติ + audit log)
```

> ตรงกับ enum `accounting_period_status` ใน schema ✅ ไม่มี conflict

> **ผลกระทบของ Period Lock ต่อ entity อื่น**: เมื่อ Accounting Period ของรายการใดเป็น `locked` ห้ามแก้ source record (Revenue/Expense/Billing/Payout) ของรายการนั้นโดยตรงเด็ดขาด — ต้องสร้าง Adjustment (§6.9) แทนเสมอ

### 6.14 Bank Transaction (ไฟล์ 35) — แก้ไขแล้ว ✅

```
unmatched → auto_matched   (ระบบจับคู่อัตโนมัติ)
unmatched → manual_matched (บัญชีจับคู่มือ)
unmatched → unmatched_resolved (ไม่มีทางจับคู่ได้จริง เช่น ค่าธรรมเนียมธนาคาร — ต้องมีเหตุผล)
matched (auto/manual) → unmatched (re-match — ต้อง audit)
unmatched → suspense (มติ PO U41 — เงินเข้าไม่ทราบที่มา "เงินรับรอตรวจสอบ" · เงินเข้าเท่านั้น · เหตุผลบังคับ · ไม่สร้างเงินรับ/ไม่ลด AR/ไม่รับรู้รายได้)
suspense → manual_matched (ทราบที่มาภายหลัง — จับคู่กับรอบวางบิลตามสายปกติ · เหตุผลบังคับ · ไม่มี auto-match)
suspense → suspense_refunded (คืนเงินผู้โอน — วันที่ + หลักฐาน + เหตุผล · terminal)
```

> มติ PO 05/10/2569 U41: `suspense` ไม่นับเป็นรายการค้างจับคู่ของ Readiness (ตัดสินแล้วว่าเป็นหนี้สินรอตรวจสอบ) แต่แสดงคำเตือนยอดคงค้าง · รายการที่ปิดเป็น `unmatched_resolved` ไปก่อนมติไม่ย้าย

#### 6.14.1 50 ทวิ ที่ลูกค้าหักเรา (`customer_wht_certificates` — มติ PO 05/10/2569 U40)

```
(จับคู่เงินรับที่ลูกค้าหักภาษี) → pending (รอ 50 ทวิ จากลูกค้า — เกิดอัตโนมัติ ไม่มีการสร้างมือ)
pending → received (กรอกเลขที่/วันที่/ยอดในหนังสือ + แนบไฟล์ · ยอดไม่ตรงยอดที่ถูกหัก = เตือน ไม่บล็อก) — terminal
pending → (soft delete) เมื่อเงินรับต้นเหตุถูกถอน (เปลี่ยนการจับคู่) — audit พร้อมเหตุผล
```

> ✅ **แก้ไขแล้ว**: เดิมมีแค่ `matched`/`unmatched` (2 states) และใช้ `matched_with_type`/`matched_with_id` (polymorphic) — แก้เป็น 4 states ตรงกับ enum `bank_match_status` ใน schema และเปลี่ยนเป็น Separate FK columns (`matched_billing_id`/`matched_payout_id`) ตาม DEC-004

### 6.15 Accountant Question (ไฟล์ 36) — ตรวจสอบแล้ว ✅

```
open → answered
```

> ✅ schema เก็บเป็น `is_resolved BOOLEAN` (`false`=open, `true`=answered) — ความหมายตรงกัน ไม่ใช่ conflict แค่ต่าง representation

### 6.16 Export Record (ไฟล์ 37) — แก้ไขแล้ว ✅

```
generated → sent → accepted
```

> ✅ **แก้ไขแล้ว**: เดิมมี 4 สถานะ (`not_exported`/`draft`/`exported`/`accepted`) แต่ `not_exported`/`draft` ไม่เคยใช้จริงในทางปฏิบัติ — แก้เป็น 3 สถานะตรงกับ enum `export_record_status` ใน schema พร้อมเพิ่มขั้น "mark ว่าส่งแล้ว" (`sent`) ที่ขาดหายไป

### 6.17 Substitute Receipt — ใบรับรองแทนใบเสร็จรับเงิน (ไฟล์ 15 §9.4 · มติ PO 06/10/2569 U103)

```
pending_signature → signed
pending_signature → cancelled      (มติ PO U107)
signed            → cancelled      (มติ PO U107 — ไฟล์ฉบับเซ็นเดิมเก็บไว้)
```

- `pending_signature` — ออกเลข CRT + PDF แล้ว (ตอนเคลียร์เงินทดรอง/ส่งใบเบิกค่าที่พักที่ติ๊ก "ไม่มีใบเสร็จ") รอผู้จ่ายเงินเซ็นแล้วอัปโหลดกลับ
- `signed` — อัปโหลดฉบับเซ็นแล้ว (ครั้งเดียว — ห้ามเปลี่ยนไฟล์ · trigger ระดับ DB) · ใบที่ผูกใบเบิก: เป็นเงื่อนไขก่อนอนุมัติใบเบิก (`SUBSTITUTE_RECEIPT_NOT_SIGNED`)
- `cancelled` (มติ PO 06/10/2569 U107) — terminal · เปลี่ยนได้ครั้งเดียวพร้อมเหตุผล (≥ 5 ตัวอักษร · `CANCEL_REQUIRES_REASON`) + audit `status_change` · ใบเดิม**ห้ามลบ** (trigger) PDF พิมพ์ป้าย "ยกเลิก" + เวลา/เหตุผล · **ไม่นับเพดานต่อเดือน** · ใช้แทนใบเสร็จไม่ได้ (ใบเบิกที่ใช้ไฟล์ฉบับเซ็นของใบนี้ถูกล้างช่องใบเสร็จ — ยามอนุมัติปัดจนกว่าจะออกใบใหม่/แนบใบเสร็จจริง) · **ออกใบใหม่แทน**ได้ (`POST /api/substitute-receipts/:id/reissue` — เลข CRT ใหม่ ผูกใบเบิก/เงินทดรองเดิม · partial unique ไม่นับใบที่ยกเลิก)
- ยกเลิกไม่ได้เมื่อใบเบิกที่ผูก **อนุมัติจ่ายแล้ว** (`approved` หรืออยู่ในรอบจ่าย `completed`) ⇒ `SUBSTITUTE_RECEIPT_NOT_CANCELLABLE` (แก้ผ่านรายการปรับปรุง) · งวดของวันที่ออกใบปิดแล้ว ⇒ `PERIOD_LOCKED_DIRECT_EDIT`
- สิทธิ์: เจ้าของ (ใบเบิกก่อนอนุมัติ) · การเงินที่เห็นทั้งองค์กรของสายนั้น (ใบเบิก: ขั้นการเงิน/บริหาร · เงินทดรอง: `approve_advance`) · Superadmin — ผู้จัดการทีม/เจ้าของใบเงินทดรองยกเลิกเองไม่ได้ (นอก scope = 404)
- ใบของใบเบิกที่ถูกปฏิเสธ/แทนที่ (โดยไม่ยกเลิก) คงอยู่เป็นประวัติแต่ไม่นับในเพดานต่อเดือน (`22` §6.17) · enum `substitute_receipt_status` (`02` §3)

---

**สรุป: ทุก flag ในไฟล์นี้ปิดครบแล้วหลัง Batch 5 เสร็จสมบูรณ์** — state machine ทั้งหมดในโมดูล Finance/Accounting ตรวจสอบและ sync กับ `02-database-schema-design.md` เรียบร้อย

### 6.18 Model Phone — แบรนด์/รุ่นเครื่อง + ฐาน TAC (`13` §6.18 · มติ PO U155 → U159 → U166 → U167) — ไม่ใช่ state machine

- `device_brands.manual_status` / `device_models.manual_status` (enum `device_catalog_status` = `active` | `hidden`) คือ **ค่าที่ผู้ดูแลตั้งด้วยมือ** — `NULL` = ตามตัวกรอง · สลับได้อิสระทุกทิศ (แสดง ↔ ไม่แสดง ↔ ตามตัวกรอง) ไม่มีขั้นรอตรวจ (U156)
- การแสดงจริงคำนวณตอนอ่าน: แบรนด์ = ค่าที่ตั้ง ?? (อยู่ในรายชื่อตัวกรอง) · รุ่น = แบรนด์แสดง ∧ (ค่าที่ตั้ง ?? ออกภายใน N ปี — ไม่ทราบปี: แหล่ง `tacdb` = ไม่แสดง · `manual` = แสดง (U166))
- job `device_tac_sync` (รายวัน · แทน `device_catalog_sync` ที่เลิกใช้ — DEC-017) และการนำเข้าไฟล์เอง **ไม่เปลี่ยนค่านี้เลย** (ห้ามเปิดของที่ถูกปิดกลับ · ห้ามปิดของที่ตั้งให้แสดง) · ไม่ทับแถว TAC เดิม
- `device_tacs.source` (`tacdb` | `learned` | `manual`) เป็น**แหล่งที่มา ไม่ใช่สถานะ**: การนำเข้าเพิ่มเฉพาะ TAC ใหม่ · ระบบจำ (`learned`) เกิดเฉพาะ TAC ที่ยังไม่มี · ผู้ดูแลผูกเอง ⇒ เปลี่ยนเป็น `manual` ได้จากทุกแหล่ง (ชนะเสมอ)
- `device_tac_updates.status` (`success` | `not_modified` | `failed`) = ผลของรอบ บันทึกครั้งเดียว (insert-only) — ไม่มีการเปลี่ยนสถานะภายหลัง

## 7. ความสัมพันธ์ระหว่าง State Machines (Cross-Entity Flow)

```
Expense (§6.3) เข้าสู่ approved
  → trigger สร้าง Revenue (§6.7) ตามเงื่อนไข Service Fee Template (ดูไฟล์ 19 §6.1, 22 §6.5-6.7)
  → Revenue: ready_for_billing

Expense (§6.3) approved → Payout Batch (§6.6) รวมรายการ → completed
  → sync เป็น Expense Record มุมมองบัญชี (ไฟล์ 32, ไม่มี state แยก — เป็น snapshot)
  → สร้าง WHT Certificate (ไฟล์ 33) อัตโนมัติ

Revenue (§6.7) ready_for_billing → รวมเข้า Billing Batch (§6.8) → sent
  → sync เป็น Sales Record (ไฟล์ 31) + ใบแจ้งหนี้/ใบวางบิล (ไม่ใช่เอกสารภาษี — U95)
  → Bank Transaction (§6.14) matched → สร้าง Cash Receipt (ไฟล์ 31) → อัปเดต received_amount ของ Billing Batch
  → ออกใบเสร็จรับเงิน/ใบกำกับภาษี (§6.10 · ต่อเงินรับ · ภาษีขายเดือนตามวันที่เอกสาร)

ทุก state ข้างต้น ถูกครอบด้วย Accounting Period (§6.13) — ถ้า locked ต้องผ่าน Adjustment (§6.9) เท่านั้น
```

## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้)

ไฟล์นี้เป็นเอกสารอ้างอิง state machine เชิงเทคนิค — ดูรายละเอียดเชิง business ที่ไฟล์ต้นทางแต่ละ state อ้างถึง

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Expense/Advance/Payout Batch state machine sync กับ Batch 3 แล้ว** — ดู §6.3, §6.4, §6.6
- **Accounting Period เป็น state แม่ที่ควบคุมทุก entity การเงิน** — locked แล้วต้องผ่าน Adjustment เท่านั้น (§6.13)
- **Revenue trigger ต้องผ่าน Warehouse gate** สำหรับเคส closed_success (§6.7)
- **Tax Invoice, Exception, Bank Transaction, Export Record — ทั้ง 4 entity แก้ไข sync กับ schema ครบแล้วใน Batch 5** (§6.10, §6.12, §6.14, §6.16) — รวม 2 การตัดสินใจสำคัญที่ยืนยันกับ Product Owner: (1) Authorize Exception → status เปลี่ยนทันที พร้อมมาตรการกันหายเงียบ (2) Bank Transaction เพิ่ม `unmatched_resolved` สำหรับรายการที่ไม่มีทางจับคู่ได้จริง

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — state machine ทั้งหมด 16 entity ตรวจสอบและ sync กับ `02-database-schema-design.md` ครบแล้วหลัง Batch 3 และ Batch 5

---

*เอกสารนี้เป็นไฟล์ที่ 2 ในหมวด Finance Reference (22–29) ต่อจาก `22-finance-calculation-spec.md` และก่อน `24-finance-validation-rules.md`*
