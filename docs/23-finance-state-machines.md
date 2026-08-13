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
pending_approval → rejected (terminal — ปฏิเสธถาวร ไม่ใช่ขอแก้ไข)
approved → superseded (ถูกแทนที่ด้วยรอบ recycle ใหม่ — ไฟล์ 41)
```

> เติม `pending_warehouse_confirm`, `pending_finance_approval`, `superseded` ที่ตกหล่นจาก v1 — ตรงกับ enum `expense_status` เต็มใน `02-database-schema-design.md` §3

### 6.4 Advance — เงินทดรองจ่าย (ไฟล์ 15) — แก้ไขแล้ว (5 สถานะ)

```
pending_approval → approved (รวมความหมาย "รอเคลียร์ยอด")
approved → overdue (auto-mark โดย background job เมื่อเลย due_clear_date)
approved/overdue → cleared (terminal, เคลียร์ยอดเสร็จ)
pending_approval → rejected (terminal, การเงินไม่อนุมัติ)
```

> แก้ไขจาก v1 (`waiting_settlement`/`settled` เดิม) — ตัด `waiting_settlement` (ซ้ำซ้อนกับ approved), เปลี่ยน `settled`→`cleared`, เพิ่ม `overdue`/`rejected` — sync กับไฟล์ 15 v2 และ `02-database-schema-design.md` v3.1 แล้ว

### 6.5 Compensation Approval — Multi-step (ไฟล์ 16, ผูกกับ §6.3 ด้านบน)

```
pending_approval (step=1) → approve step 1 → step=2 → ... → approve step สุดท้าย → approved
ขั้นใดขั้นหนึ่ง reject → needs_revision → resubmit → กลับไป step=1 ใหม่ทั้งหมด
```

### 6.6 Payout Batch (ไฟล์ 17) — เติม `draft` แล้ว

```
draft (กำลังรวบรวมรายการ) → checking → file_generated → completed
```

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
```

### 6.9 Adjustment (ไฟล์ 20)

```
pending_approval → approved   (ระดับอนุมัติขึ้นกับ period_status_at_target — ดู §6.13)
pending_approval → rejected (terminal)
```

### 6.10 Tax Invoice (ไฟล์ 31) — แก้ไขแล้ว ✅

```
active → cancelled   (ต้องระบุเหตุผล — ออกใบใหม่แทน ไม่ใช้เลขเดิมซ้ำ)
```

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

---

**สรุป: ทุก flag ในไฟล์นี้ปิดครบแล้วหลัง Batch 5 เสร็จสมบูรณ์** — state machine ทั้งหมดในโมดูล Finance/Accounting ตรวจสอบและ sync กับ `02-database-schema-design.md` เรียบร้อย

## 7. ความสัมพันธ์ระหว่าง State Machines (Cross-Entity Flow)

```
Expense (§6.3) เข้าสู่ approved
  → trigger สร้าง Revenue (§6.7) ตามเงื่อนไข Service Fee Template (ดูไฟล์ 19 §6.1, 22 §6.5-6.7)
  → Revenue: ready_for_billing

Expense (§6.3) approved → Payout Batch (§6.6) รวมรายการ → completed
  → sync เป็น Expense Record มุมมองบัญชี (ไฟล์ 32, ไม่มี state แยก — เป็น snapshot)
  → สร้าง WHT Certificate (ไฟล์ 33) อัตโนมัติ

Revenue (§6.7) ready_for_billing → รวมเข้า Billing Batch (§6.8) → sent
  → sync เป็น Sales Record (ไฟล์ 31) → ออก Tax Invoice (§6.10)
  → Bank Transaction (§6.14) matched → สร้าง Cash Receipt (ไฟล์ 31) → อัปเดต received_amount ของ Billing Batch

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
