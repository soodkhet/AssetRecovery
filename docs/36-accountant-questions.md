# 36-accountant-questions.md

# 36 — Accountant Questions (ข้อซักถามจากสำนักงานบัญชี)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Accounting Module
> เอกสารอ้างอิง: `30-accounting-handover-monthly-close.md`, `20-adjustment.md`, `02-database-schema-design.md` §9 (accountant_questions table), `23-finance-state-machines.md` §6.15

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Question entity, open/answered workflow |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + ชี้แจงว่า schema เก็บ status เป็น `is_resolved BOOLEAN` ไม่ใช่ enum สองค่า — **ความหมายตรงกัน** (`is_resolved=false`→`open`, `is_resolved=true`→`answered`) ไม่ใช่ conflict เพียงต่างระดับ representation — ปิด flag ที่ตั้งไว้ใน `23-finance-state-machines.md` §6.15 — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |

ขอบเขตเอกสารนี้: บันทึกคำถามที่สำนักงานบัญชีภายนอกถามกลับมาหลังตรวจสอบ Accounting Pack ที่ส่งไป พร้อมติดตามการตอบและกำหนดเวลา

**ไม่รวมอยู่ในไฟล์นี้**: การแก้ไขข้อมูลจริงที่เป็นต้นเหตุของคำถาม (ทำที่โมดูลต้นทาง — อาจต้องสร้าง Adjustment ดู `20-adjustment.md` ถ้ากระทบยอด)

---

## 1. Summary

บันทึกคำถามที่สำนักงานบัญชีภายนอกถามกลับมาหลังตรวจสอบ Accounting Pack ที่ส่งไป พร้อมติดตามการตอบและกำหนดเวลา

## 2. Purpose

เป็นช่องทางสื่อสารที่มีหลักฐาน (ไม่ใช่แค่คุยทางไลน์/อีเมลแล้วหายไป) ระหว่าง AssetRecovery กับสำนักงานบัญชี เพื่อ trace ได้ว่าถามอะไร ตอบว่าอะไร เมื่อไหร่

## 3. In Scope

- บันทึกคำถามจากสำนักงานบัญชี พร้อมอ้างอิงไปยังรายการที่เกี่ยวข้อง
- ตอบคำถาม + ติดตามกำหนดเวลา (Due Date)

## 4. Out of Scope

- การแก้ไขข้อมูลจริงที่เป็นต้นเหตุของคำถาม (ทำที่โมดูลต้นทาง — อาจต้องสร้าง Adjustment ไฟล์ 20 ถ้ากระทบยอด)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| บัญชี (Accounting) | บันทึกคำถาม, ตอบคำถาม | Full |

## 6. Data Entities / Required Objects

### 6.1 Question (status อธิบายเพิ่มแล้ว — ดู Changelog v2)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| accounting_period | string | yes | รอบเดือนที่เกี่ยวข้อง |
| question | text | yes | คำถามจากสำนักงานบัญชี |
| reference | string \| null | — | อ้างอิงรายการที่เกี่ยวข้อง (เช่น "BT-002") |
| due_date | date | yes | กำหนดเวลาตอบ |
| answer | text \| null | — | คำตอบ |
| answered_at | timestamptz \| null | — | — |
| status | enum (`open`/`answered`) | yes | **schema เก็บเป็น `is_resolved BOOLEAN`** — `false`=`open`, `true`=`answered` — ความหมายตรงกัน ไม่ใช่ conflict (ดู §8) |

## 7. UI / UX Rules

อ้างอิงจาก `accounting.html`:

- Table: รอบเดือน, คำถาม, อ้างอิง (Ref), Due Date (สีแดง), สถานะ, ปุ่ม "ตอบคำถาม"
- ปุ่ม "เพิ่มคำถาม" มุมขวาบน

## 8. Workflow / Lifecycle

`บัญชีบันทึกคำถามที่ได้รับ (open / is_resolved=false) → ตอบคำถาม (กรอก answer) → answered / is_resolved=true`

## 9. Security / Control Rules

- ไม่มีข้อกำหนดพิเศษ — เป็นข้อมูล log การสื่อสารทั่วไป

## 10. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| REQUIRED_MISSING | ไม่กรอกคำถาม/due_date | inline error |

## 11. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| บันทึก/ตอบคำถาม | บัญชี | full |
| ดูทั้งหมด | การเงิน | read-only |

## 12. Audit Log Requirements

- การตอบคำถามบันทึก timestamp ปกติ — ไม่ต้องการ audit ระดับเข้มเหมือนรายการเงิน

## 13. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/accounting/questions | list |
| POST | /api/accounting/questions | สร้าง |
| PATCH | /api/accounting/questions/:id/answer | ตอบคำถาม (ตั้ง is_resolved=true) |

## 14. Acceptance Criteria

- บันทึก/ตอบคำถามได้ครบ พร้อมติดตาม due date

## 15. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| ตอบคำถาม | กรอก answer แล้วบันทึก | is_resolved เปลี่ยนเป็น true, answered_at บันทึกเวลา |

---

## 16. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Status representation: schema ใช้ `is_resolved BOOLEAN`** ความหมายตรงกับ open/answered ที่เอกสารอธิบาย — ไม่ใช่ conflict แค่ต่าง representation (§6.1)
- **เป็น log การสื่อสารทั่วไป ไม่ต้องการ audit เข้มเท่ารายการเงิน** (§12)

## 17. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — เป็นฟีเจอร์ง่ายไม่มี business logic ซับซ้อน

---

*เอกสารนี้เป็นไฟล์ที่ 7 ในหมวด Accounting Module (30–37) ต่อจาก `35-bank-reconciliation.md` และก่อน `37-accounting-pack-export-history.md`*
