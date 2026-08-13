# 15-claims-and-advances.md

# 15 — Claims and Advances (รายการเบิกและเงินทดรองจ่าย)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — แก้ไข Advance status enum)
> Document Level: Finance Core Module
> เอกสารอ้างอิง: `41-field-tracker-mobile.md` §6.6 (expense.status enum), `02-database-schema-design.md` §3/§8 (expenses, advances table), `16-compensation-approval.md`, `13-accounting-finance-settings.md` §6.2
> **สำคัญ**: `expense.status` enum (`pending_warehouse_confirm`/`pending_approval`/`pending_finance_approval`/`approved`/`rejected`/`needs_revision`/`superseded`) ถูกกำหนดไว้แล้วในไฟล์ 41 §6.6 — ไฟล์นี้ใช้ enum เดียวกัน ไม่สร้างใหม่ซ้ำซ้อน

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Claim (auto+manual) + Advance workflow |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + **แก้ไข §7.2/§9.1 (Advance status)**: พบว่า enum เดิมในไฟล์นี้ (`pending_approval`/`approved`/`waiting_settlement`/`settled`/`rejected` — 5 ค่า) ไม่ตรงกับ `advance_status` enum ใน `02-database-schema-design.md` (เดิมมีแค่ 4 ค่า: `pending_approval`/`approved`/`cleared`/`overdue` ไม่มี `rejected`) — ยืนยันกับ Product Owner แล้วว่าใช้ **5 สถานะ**: `pending_approval` / `approved` / `overdue` / `cleared` / `rejected` — **ตัด `waiting_settlement` ออก** (ซ้ำซ้อนกับ `approved` เพราะ "อนุมัติแล้ว = เงินออกแล้ว = รอเคลียร์อยู่แล้วโดยนิยาม"), **เปลี่ยน `settled` → `cleared`** (ใช้ชื่อจาก schema เป็นหลักเพราะกระทบ migration น้อยกว่า), **เพิ่ม `overdue`** (auto-mark โดย background job เมื่อเลย `due_clear_date`) — แก้ schema ในไฟล์ 02 ให้ตรงกันแล้วเช่นกัน (เพิ่ม `rejected`) |

ขอบเขตเอกสารนี้: รวมรายการเบิกเงิน (Claim) ทุกประเภทที่รออนุมัติจ่าย และจัดการเงินทดรองจ่าย (Advance) ที่ทีมงานเบิกล่วงหน้าไปใช้จ่ายก่อนแล้วมาเคลียร์ยอดทีหลัง

**ไม่รวมอยู่ในไฟล์นี้**: การคำนวณยอด Claim เริ่มต้น (เกิดที่ไฟล์ 41 อัตโนมัติ), Approval flow รายละเอียด/สายอนุมัติ (ดู `16-compensation-approval.md`), การรวมเป็นรอบจ่ายเงินจริง (ดู `17-payroll-and-payout.md`)

---

## 1. Summary

รวมรายการเบิกเงิน (Claim) ทุกประเภทที่รออนุมัติจ่าย และจัดการเงินทดรองจ่าย (Advance) ที่ทีมงานเบิกล่วงหน้าไปใช้จ่ายก่อนแล้วมาเคลียร์ยอดทีหลัง

## 2. Purpose

เป็นจุดรวมที่การเงินตรวจสอบ/อนุมัติรายการเบิกทั้งหมดก่อนเข้าสู่รอบจ่ายเงิน (ไฟล์ 17) — Claim ส่วนใหญ่มาจากไฟล์ 41 (ค่าน้ำมัน/เบี้ยเลี้ยง/ที่พัก) อัตโนมัติ แต่บางส่วนเป็นการขอเบิกแบบ manual (เช่น เงินทดรองจ่าย)

## 3. In Scope

- ตรวจสอบ/อนุมัติ Claim ที่มาจากไฟล์ 41 (fuel/allowance/hotel)
- เงินทดรองจ่าย (Advance): ขอเบิกล่วงหน้า → ใช้จ่ายจริง → เคลียร์ยอด

## 4. Out of Scope

- การคำนวณยอด Claim เริ่มต้น (เกิดที่ไฟล์ 41 อัตโนมัติ)
- Approval flow รายละเอียด/สายอนุมัติ (ไฟล์ 16)
- การรวมเป็นรอบจ่ายเงินจริง (ไฟล์ 17)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| การเงิน (Finance) | ตรวจสอบ/อนุมัติ/ตีกลับ Claim, อนุมัติ Advance, เคลียร์ยอด Advance | Full |
| Field Agent (inhouse/outsource) | ขอเงินทดรองจ่าย, เคลียร์ยอดที่ใช้จริง | Own scope |
| ผู้จัดการทีม | อนุมัติขั้นต้นตาม Approval Matrix (ไฟล์ 13 §6.2 / ไฟล์ 16) | Team scope |

## 6. Core Concepts

### 6.1 Claim (รายการเบิก) — มาจาก 2 แหล่ง

1. **Auto-generated จากไฟล์ 41** — ค่าน้ำมัน/เบี้ยเลี้ยง (ผูกกับเคส) และค่าที่พัก (เบิกแยก) — ใช้ `expense.status` enum ตามที่กำหนดไว้แล้ว
2. **Manual จากไฟล์นี้** — กรณีอื่นที่ไม่ผูกกับเคสติดตามทรัพย์โดยตรง (เช่น ค่าใช้จ่ายเบ็ดเตล็ดของทีม) — ใช้ flow เดียวกันแต่สร้างจากฟอร์มในไฟล์นี้ ไม่ใช่ auto

### 6.2 Advance (เงินทดรองจ่าย)

ต่างจาก Claim — Advance คือ **เบิกเงินล่วงหน้า** ไปสำรองจ่ายค่าใช้จ่ายที่ยังไม่เกิดขึ้นจริง (เช่น เดินทางไปต่างจังหวัดหลายวัน) แล้วมา**เคลียร์ยอด**ทีหลังด้วยใบเสร็จจริง — มียอดเบิก (request), ยอดใช้จริง (used), ยอดคืน (return = request - used ถ้า used < request)

> **กฎสำคัญ**: ต้องเคลียร์ยอด Advance เดิมให้เสร็จก่อน จึงขอเบิกรอบใหม่ได้ (ป้องกันถือเงินทดรองหลายยอดพร้อมกันไม่จบ) — สถานะ `approved` และ `overdue` ถือว่า "ยังไม่เคลียร์" ทั้งคู่ บล็อกการขอใหม่เหมือนกัน (ดู §9.2)

## 7. Data Entities / Required Objects

### 7.1 Manual Claim

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| requester_id | uuid | yes | ผู้เบิก |
| team_id | uuid | yes | — |
| case_ref | string \| null | no | อ้างอิงเคส (ถ้ามี) — free text ไม่บังคับ join จริง เพราะ manual claim อาจไม่ผูกเคส |
| claim_type | string | yes | ประเภท (เช่น "ค่าน้ำมัน", "ค่าที่พัก", อื่นๆ ที่ไม่ auto จากไฟล์ 41) |
| amount | decimal | yes | — |
| date | date | yes | — |
| status | enum | yes | ใช้ enum เดียวกับไฟล์ 41 §6.6: `pending_approval` / `approved` / `rejected` / `needs_revision` |

### 7.2 Advance (แก้ไขแล้ว — ดู Changelog v2)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| requester_id | uuid | yes | — |
| team_id | uuid | yes | — |
| requested_amount (`requested_satang`) | decimal | yes | ยอดที่ขอเบิก |
| purpose | text | yes | วัตถุประสงค์ (บังคับกรอก) |
| case_ref | string \| null | no | อ้างอิงเคส (ถ้ามี) |
| due_clear_date | date | yes | กำหนดเคลียร์ยอด |
| used_amount (`used_satang`) | decimal \| null | — | ยอดใช้จริง — กรอกตอนเคลียร์ยอด |
| return_amount (`return_satang`) | decimal \| null | — | `requested_amount - used_amount` ถ้า `used_amount < requested_amount` (คืนเงินส่วนเกิน) — ถ้า `used_amount > requested_amount` ต้องเบิกเพิ่มแยก ไม่ใช่ field นี้ |
| rejection_reason | string \| null | conditional | บังคับกรอกเมื่อ status = `rejected` |
| status | enum | yes | **`pending_approval` / `approved` (รวมความหมาย "รอเคลียร์ยอด") / `overdue` (เกินกำหนดเคลียร์ — auto-mark) / `cleared` (เคลียร์ยอดเสร็จ, terminal) / `rejected` (การเงินไม่อนุมัติ, terminal)** — ตรงกับ enum `advance_status` ใน `02-database-schema-design.md` §3 |

## 8. UI / UX Rules

อ้างอิงจาก `finance.html`:

- แท็บ "รออนุมัติ": table Claim (วันที่/อ้างอิง, ประเภท, ผู้เบิก+ทีม, ยอดเงิน, สถานะ, ปุ่มอนุมัติ/ปฏิเสธ) + table Advance แยกด้านล่าง (เลขที่, ผู้เบิก, ยอดขอเบิก, ใช้จริง, ยอดคืน, สถานะ, ปุ่ม "เคลียร์ยอด")
- ฟอร์มขอเงินทดรอง: banner เตือนสีเหลือง "กรุณาเคลียร์ยอดเดิมก่อนเบิกยอดใหม่เสมอ" ด้านบนฟอร์มเสมอ + ฟิลด์ยอดเบิก, วัตถุประสงค์ (textarea บังคับ), อ้างอิงเคส (ไม่บังคับ), กำหนดเคลียร์ยอด
- Advance ที่สถานะ `overdue` แสดง badge สีแดงเด่นชัดในตาราง แยกจาก `approved` ปกติ เพื่อให้การเงินเห็นได้ทันทีว่ารายการไหนเลยกำหนดแล้ว

## 9. Workflow / Lifecycle

### 9.1 Advance (แก้ไขแล้ว)

`ขอเบิก (pending_approval) → อนุมัติ (approved) หรือ ปฏิเสธ (rejected, terminal) → [ถ้า approved] เลยกำหนด due_clear_date ยังไม่เคลียร์ → เปลี่ยนเป็น overdue อัตโนมัติ (background job) → ใช้จ่ายจริงแล้ว กด "เคลียร์ยอด" กรอก used_amount + แนบใบเสร็จ (ทำได้ทั้งจากสถานะ approved หรือ overdue) → cleared (terminal, + คืนเงินส่วนเกินถ้ามี return_amount > 0)`

### 9.2 ห้ามเบิกซ้อน

`มี Advance ที่ status = approved หรือ overdue ค้างอยู่ → requester คนนั้นขอเบิก Advance ใหม่ไม่ได้จนกว่าจะ cleared ยอดเดิม`

## 10. Security / Control Rules

- ห้ามขอ Advance ใหม่ถ้ามียอดเดิมที่ `approved` หรือ `overdue` ค้างอยู่ (ดู §9.2)
- การอนุมัติ/ปฏิเสธ Claim ต้องตาม Approval Matrix (ไฟล์ 13 §6.2 / ไฟล์ 16) — ไม่ใช่ใครก็กดอนุมัติได้
- เปลี่ยนสถานะเป็น `overdue` เป็น background job อัตโนมัติเท่านั้น ไม่มีปุ่มให้ user กดเปลี่ยนเอง

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| REQUIRED_MISSING | ฟิลด์บังคับไม่ครบ (เช่น purpose ของ Advance) | inline error |
| ADVANCE_PENDING_SETTLEMENT | พยายามขอ Advance ใหม่ทั้งที่มียอดเดิม `approved`/`overdue` | reject พร้อมแจ้งให้เคลียร์ยอดเดิมก่อน |
| USED_EXCEEDS_REQUEST_NO_TOPUP | กรอก used_amount > requested_amount โดยไม่มีกลไกเบิกเพิ่ม | เตือนให้สร้าง Claim เพิ่มเติมแยกสำหรับส่วนที่เกิน ไม่ปล่อยให้ return_amount ติดลบ |
| ADVANCE_EXCEEDS_MAX | `requested_amount` เกิน `advance_max_amount_per_request` ที่ตั้งค่าไว้ (ไฟล์ 13 §6.2) | reject — ถ้าค่าตั้งค่าเป็น null ไม่มีการเช็คนี้เลย |
| REJECTION_REASON_REQUIRED | เปลี่ยน Advance เป็น `rejected` แต่ไม่กรอก `rejection_reason` | reject |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| อนุมัติ/ปฏิเสธ Claim | การเงิน (ตาม Approval Matrix) | ดูไฟล์ 16 |
| ขอเงินทดรองจ่าย | Field Agent ทุกฝั่ง | own scope |
| เคลียร์ยอด Advance | เจ้าของ Advance (กรอกยอดใช้จริง) + การเงิน (ตรวจสอบยืนยัน) | — |

## 13. Audit Log Requirements

- ทุกการอนุมัติ/ปฏิเสธ/ตีกลับ Claim ต้อง audit
- การเคลียร์ยอด Advance ต้องเก็บ before/after (used_amount, return_amount) พร้อมไฟล์ใบเสร็จอ้างอิง
- การเปลี่ยนเป็น `overdue` โดย background job ต้อง audit เช่นกัน (actor = system job)

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/claims | list (รวม auto จากไฟล์ 41 + manual) |
| POST | /api/claims | สร้าง manual claim |
| PATCH | /api/claims/:id/approve, /reject | ตาม Approval Matrix |
| GET | /api/advances | list |
| POST | /api/advances | ขอเบิก |
| PATCH | /api/advances/:id/approve | อนุมัติ |
| PATCH | /api/advances/:id/reject | ปฏิเสธ — ต้องมี rejection_reason |
| PATCH | /api/advances/:id/settle | เคลียร์ยอด → cleared |
| EVENT | advance.overdue | background job trigger เมื่อเลย due_clear_date | เปลี่ยนสถานะอัตโนมัติ |

## 15. Acceptance Criteria

- Claim จากไฟล์ 41 แสดงรวมในหน้านี้ได้ถูกต้องตาม status เดียวกัน
- ห้ามขอ Advance ซ้อนได้จริง (ทั้ง `approved` และ `overdue`)
- เคลียร์ยอด Advance คำนวณ return_amount ถูกต้อง
- Advance ที่เลย due_clear_date เปลี่ยนเป็น `overdue` อัตโนมัติจริง

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| ขอ Advance ซ้อน (approved) | มี Advance approved ค้างอยู่ แล้วขอใหม่ | reject ADVANCE_PENDING_SETTLEMENT |
| ขอ Advance ซ้อน (overdue) | มี Advance overdue ค้างอยู่ แล้วขอใหม่ | reject ADVANCE_PENDING_SETTLEMENT |
| เคลียร์ยอดมีเงินคืน | requested 5000, used 4200 | return_amount = 800 |
| เคลียร์ยอดใช้เกิน | requested 5000, used 5500 | เตือนให้สร้าง Claim เพิ่มสำหรับ 500 ที่เกิน |
| Auto-mark overdue | Advance approved เลย due_clear_date ไป 1 วัน | background job เปลี่ยนเป็น overdue อัตโนมัติ |
| ปฏิเสธ Advance ไม่กรอกเหตุผล | เปลี่ยนเป็น rejected โดยไม่กรอก rejection_reason | reject REJECTION_REASON_REQUIRED |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Advance status = 5 สถานะ**: `pending_approval` / `approved` / `overdue` / `cleared` / `rejected` — sync กับ `02-database-schema-design.md` แล้ว (แก้ไข v2)
- **`approved` รวมความหมาย "รอเคลียร์ยอด" ในตัว** ไม่มี state คั่นกลางแยก (`waiting_settlement` ถูกตัดออก) — ลดความซับซ้อนของ state machine
- **`overdue` เป็น auto-mark โดย background job เท่านั้น** ไม่มี user action เปลี่ยนสถานะนี้ตรงๆ (§10)
- **`approved` และ `overdue` บล็อกการขอ Advance ใหม่เหมือนกันทั้งคู่** (§9.2, §11)
- **Claim มาจาก 2 แหล่งเสมอ**: auto จากไฟล์ 41 และ manual จากไฟล์นี้ ใช้ enum เดียวกัน (§6.1)
- **`claim_type` ของ manual claim เป็น free text** ไม่ fix รายการตายตัว ยืดหยุ่นสำหรับค่าใช้จ่ายที่ไม่ auto จากไฟล์ 41

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้างเพิ่มเติม — Advance status enum sync กับ schema เรียบร้อยแล้วในรอบนี้

---

*เอกสารนี้เป็นไฟล์ที่ 2 ในหมวด Finance Core (14–21) ต่อจาก `14-finance-dashboard.md` และก่อน `16-compensation-approval.md`*
