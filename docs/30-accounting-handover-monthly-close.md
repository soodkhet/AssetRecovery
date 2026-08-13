# 30-accounting-handover-monthly-close.md

# 30 — Accounting Handover & Monthly Close (ปิดงวดบัญชีรายเดือน)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Accounting Module
> เอกสารอ้างอิง: `13-accounting-finance-settings.md` §6.11 (Period Lock Policy), `02-database-schema-design.md` §9 (accounting_periods table), `34-accounting-document-checklist-exceptions.md`, `35-bank-reconciliation.md`, `37-accounting-pack-export-history.md`, `20-adjustment.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Accounting Period state machine, Readiness Check 3 เงื่อนไข |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — ตรวจสอบ enum `accounting_period_status` เทียบกับ `02-database-schema-design.md` แล้ว **ตรงกันทุกตัว ไม่พบ conflict** (ปิด flag ที่ตั้งไว้ใน `23-finance-state-machines.md` §6.13) — **เนื้อหา business logic เดิมคงไว้ครบ** |
| v2.1 | 04/07/2569 | **เติม error code เงื่อนไขที่ 3 ของ Readiness Check**: §6.2 กำหนด 3 เงื่อนไข แต่ §11 เดิมมี error code แค่ 2 ตัว — เติม `NOT_READY_BILLING_REVENUE_MISMATCH` (ยอดบิลไม่ตรงกับรายได้) พร้อม test case §16 — sync กับไฟล์ 24 v3 แล้ว — หมายเหตุเพิ่มเติม: `critical_count`/`warning_count` ใน §7.1 เป็น **derived field** (นับ real-time จากตาราง `exceptions` ผ่าน index `idx_exceptions_period`) ไม่ใช่ column จริงในตาราง `accounting_periods` — ระบุให้ชัดกัน dev สร้าง column ซ้ำซ้อน |

ขอบเขตเอกสารนี้: จัดการ "รอบบัญชี" (Accounting Period) แต่ละเดือน — ติดตามสถานะตั้งแต่เก็บข้อมูล จนถึงส่งมอบและล็อกรอบ ครอบคลุม flow ของทั้งกลุ่ม Accounting (31-37) — เป็น**จุดควบคุมกลาง**ที่ Period Lock Policy บังคับใช้

**ไม่รวมอยู่ในไฟล์นี้**: รายละเอียด Exception เอง (ดู `34-accounting-document-checklist-exceptions.md`), รายละเอียดการ Export (ดู `37-accounting-pack-export-history.md`), Adjustment (ดู `20-adjustment.md` — ใช้เมื่อรอบ locked แล้วต้องแก้ไข)

---

## 1. Summary

จัดการ "รอบบัญชี" (Accounting Period) แต่ละเดือน — ติดตามสถานะตั้งแต่เก็บข้อมูล จนถึงส่งมอบและล็อกรอบ ครอบคลุม flow ของทั้งกลุ่ม Accounting (31-37)

## 2. Purpose

เป็นจุดควบคุมกลางว่าแต่ละเดือน "พร้อมปิดงวดหรือยัง" — เชื่อมกับ Period Lock Policy (ไฟล์ 13 §6.11) ที่กำหนดว่าแก้ไขอะไรได้/ไม่ได้ในแต่ละสถานะ

## 3. In Scope

- Accounting Period entity และ state machine (`collecting` → `sent_to_accountant` → `locked`)
- ภาพรวมความพร้อมของแต่ละรอบ (จำนวน Critical/Warning Exception)
- เชื่อมต่อกับไฟล์ 34 (Exception), 37 (Export)

## 4. Out of Scope

- รายละเอียด Exception เอง (ไฟล์ 34)
- รายละเอียดการ Export (ไฟล์ 37)
- Adjustment (ไฟล์ 20 — ใช้เมื่อรอบ locked แล้วต้องแก้ไข)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| บัญชี (Accounting) | ดูแลรอบบัญชี, ตรวจสอบความพร้อม, Export | Full |
| บริหาร (Executive) | อนุมัติปลดล็อกรอบที่ `locked` | เฉพาะกรณีจำเป็น |

## 6. Core Concepts

### 6.1 Accounting Period State Machine

ใช้ state เดียวกับที่กำหนดไว้แล้วในไฟล์ 13 §6.11:

- `collecting` — กำลังเก็บข้อมูล แก้ไขเคสเดิมได้อิสระ
- `sent_to_accountant` — ส่งมอบให้สำนักงานบัญชีแล้ว (ผ่านไฟล์ 37) — แก้ไขได้จำกัด
- `locked` — ปิดงวดสมบูรณ์ — ห้ามแก้ source record โดยตรงเด็ดขาด ต้องใช้ Adjustment เท่านั้น

### 6.2 ความพร้อมก่อนปิดงวด (Readiness Check)

ก่อนเปลี่ยนสถานะจาก `collecting` → `sent_to_accountant` ระบบเช็คอัตโนมัติ (สอดคล้องกับ "ตรวจสอบความพร้อม" ใน UI):

- ยอดบิลตรงกับรายได้ (Billing Batch กับ Revenue ไฟล์ 19 sync กันครบ)
- Bank Reconcile จับคู่ครบ 100% (ไม่มี `unmatched` transaction ค้างในรอบนั้น — ไฟล์ 35)
- ไม่มี Critical Exception เปิดอยู่ (ไฟล์ 34) — ถ้ามี Warning ผ่านได้แต่ต้องแสดงเตือน

## 7. Data Entities / Required Objects

### 7.1 Accounting Period

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| month | string | yes | เช่น "มิถุนายน 2569" |
| status | enum | yes | `collecting` / `sent_to_accountant` / `locked` |
| critical_count, warning_count | integer | yes | นับจาก Exception ของรอบนั้น (ไฟล์ 34) — **derived field คำนวณ real-time จากตาราง `exceptions`** ไม่ใช่ column จริงใน `accounting_periods` (schema ไฟล์ 02 มี index `idx_exceptions_period(period_id, level, status)` รองรับอยู่แล้ว) |
| exported_at | timestamptz \| null | — | วันที่ Export ล่าสุด (อ้างอิงไฟล์ 37) |
| locked_at | timestamptz \| null | — | — |
| locked_by | uuid \| null | — | — |

## 8. UI / UX Rules

อ้างอิงจาก `accounting.html`:

- Table: เดือน, สถานะ (badge), จำนวน Critical (แดง) + Warning (ส้ม), วันที่ Export ล่าสุด, ปุ่ม "ตรวจความพร้อม" + ปุ่ม "Export Pack"
- Modal "ตรวจความพร้อม" (accounting-checklist): checklist แสดงสถานะแต่ละเงื่อนไข (ตาม §6.2) พร้อม icon ติ๊กเขียว/เตือนเหลือง

## 9. Workflow / Lifecycle

`เดือนใหม่เริ่มต้น → status: collecting (ข้อมูลทยอยเข้าจากทุกโมดูลตามปกติ) → ถึงปลายเดือน → บัญชีกด "ตรวจความพร้อม" → ผ่านเงื่อนไข §6.2 (warning ผ่านได้ critical ห้าม) → Export Pack (ไฟล์ 37) → status: sent_to_accountant → สำนักงานบัญชีตรวจสอบ/ถามคำถาม (ไฟล์ 36) ถ้ามี → แก้ไขจนเรียบร้อย → บัญชี/Executive ยืนยันปิดงวด → status: locked`

`ปลดล็อกรอบ locked` (กรณีจำเป็นต้องแก้ไขเพิ่มเติมจริงๆ) `→ ต้อง Executive อนุมัติ + บันทึก audit log ชัดเจน (ตามไฟล์ 13 §6.11) → กลับไป sent_to_accountant ชั่วคราว → แก้ไขผ่าน Adjustment → ล็อกใหม่`

## 10. Security / Control Rules

- เปลี่ยนสถานะ `collecting → sent_to_accountant` ต้องผ่าน Readiness Check เสมอ ห้าม force ข้าม
- ปลดล็อกรอบ `locked` ต้อง Executive เท่านั้น (ตามไฟล์ 13 §6.11)

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| NOT_READY_CRITICAL_OPEN | พยายามเปลี่ยนเป็น sent_to_accountant ขณะมี critical เปิดอยู่ | reject พร้อมรายชื่อ critical (เชื่อมไฟล์ 34) |
| NOT_READY_RECONCILE_INCOMPLETE | Bank Reconcile ยังไม่ครบ 100% | reject พร้อมจำนวนรายการ unmatched ที่เหลือ |
| NOT_READY_BILLING_REVENUE_MISMATCH | ยอด Billing Batch ยังไม่ sync ตรงกับ Revenue ของรอบนั้น (เงื่อนไขที่ 3 ตาม §6.2) | reject พร้อมรายการที่ไม่ตรง |
| UNLOCK_REQUIRES_EXECUTIVE | พยายามปลดล็อกรอบ locked โดยไม่ใช่ Executive | reject |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| จัดการรอบบัญชี (collecting → sent) | บัญชี | full |
| ปลดล็อกรอบ locked | Executive only | — |
| ดูภาพรวมทั้งหมด | การเงิน, ผู้บริหาร | read-only |

## 13. Audit Log Requirements

- การเปลี่ยนสถานะทุกครั้งต้อง audit
- การปลดล็อกรอบ locked ต้องบันทึกแยกชัดเจนพร้อมเหตุผล

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/accounting/periods | list |
| GET | /api/accounting/periods/:id/readiness | เช็คความพร้อม (real-time) |
| PATCH | /api/accounting/periods/:id/send | เปลี่ยนเป็น sent_to_accountant (เช็ค readiness ก่อน) |
| PATCH | /api/accounting/periods/:id/lock | ล็อกรอบ |
| PATCH | /api/accounting/periods/:id/unlock | ปลดล็อก (Executive only) |

## 15. Acceptance Criteria

- Readiness Check ทำงานถูกต้องครบทั้ง 3 เงื่อนไข (§6.2)
- State machine ทำงานถูกต้องตาม Period Lock Policy ของไฟล์ 13
- ปลดล็อกรอบ locked ทำได้เฉพาะ Executive พร้อม audit

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| ปิดงวดมี Critical ค้าง | พยายาม send ขณะมี critical exception เปิด | reject NOT_READY_CRITICAL_OPEN |
| Bank Reconcile ไม่ครบ | พยายาม send ขณะมี unmatched transaction | reject NOT_READY_RECONCILE_INCOMPLETE |
| ยอดบิลไม่ตรงรายได้ | พยายาม send ขณะ Billing/Revenue ของรอบยังไม่ sync กัน | reject NOT_READY_BILLING_REVENUE_MISMATCH |
| ปลดล็อกโดยไม่ใช่ Executive | บัญชี (ไม่ใช่ Executive) พยายามปลดล็อกรอบ locked | reject UNLOCK_REQUIRES_EXECUTIVE |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Accounting Period เป็น "state แม่" ที่ควบคุม Period Lock Policy ทั้งระบบ** — ตรงกับที่บันทึกไว้ใน `23-finance-state-machines.md` §6.13 (ยืนยันไม่มี conflict กับ schema)
- **Readiness Check ต้องผ่านครบ 3 เงื่อนไข**: Billing=Revenue sync, Bank Reconcile 100%, ไม่มี Critical Exception — Warning ผ่านได้ (§6.2)
- **ปลดล็อกรอบ locked ต้อง Executive เท่านั้น พร้อม audit แยกชัดเจน** (§10, §12, §13)
- **ปลดล็อกแล้วกลับไป `sent_to_accountant` ชั่วคราว ไม่ใช่กลับ `collecting`** — แก้ไขผ่าน Adjustment แล้วล็อกใหม่ (§9)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — โครงสร้าง state machine อ้างอิงจาก Period Lock Policy (ไฟล์ 13) ที่ชัดเจนแล้ว และตรวจสอบกับ schema แล้วไม่พบ conflict

---

*เอกสารนี้เป็นไฟล์แรกในหมวด Accounting Module (30–37) ต่อด้วย `31-accounting-sales-and-receipts.md`*
