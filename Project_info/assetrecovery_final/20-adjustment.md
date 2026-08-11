# 20-adjustment.md

# 20 — Adjustment (รายการปรับปรุง)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Finance Core Module
> เอกสารอ้างอิง: `13-accounting-finance-settings.md` §6.11 (Period Lock Policy), `02-database-schema-design.md` §8 (adjustments table — DEC-004 Separate FK columns), `19-revenue-billing-receivable.md`, `30-accounting-handover-monthly-close.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Adjustment ไม่แก้ของเดิม, ระดับอนุมัติตาม Period Lock |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — ตรวจสอบ `target_type` เทียบกับ DEC-004 (Separate FK columns) ใน `02-database-schema-design.md` แล้ว **สอดคล้องกัน** — **เนื้อหา business logic เดิมคงไว้ครบ** |
| v2.1 | 04/07/2569 | **เติม endpoint/validation ปฏิเสธ Adjustment ที่ตกหล่น**: state machine (ไฟล์ 23 §6.9) และ enum `adjustment_status` ใน schema มี `rejected` (terminal) พร้อม column `rejection_reason` อยู่แล้ว แต่ไฟล์นี้ไม่เคยมี endpoint/validation รองรับ — เติม `PATCH /api/adjustments/:id/reject` (§14), validation `REJECTION_REASON_REQUIRED` (§11 — ใช้ code เดียวกับไฟล์ 15 ความหมายเดียวกัน สอดคล้องกฎ audit กลางที่บังคับ reason กับทุก mutation ที่กระทบเงิน) และ test case (§16) — sync ไฟล์ 24/27 แล้ว |

ขอบเขตเอกสารนี้: สร้างรายการปรับปรุงยอดเงิน (เพิ่ม/ลด) สำหรับกรณีที่ต้องแก้ไขข้อมูลย้อนหลังแต่**ห้ามแก้ source record ตรง** ตามนโยบาย Period Lock — เป็นกลไกเดียวที่อนุญาตให้แก้ไขยอดเงินของรายการที่ผ่านการประมวลผลไปแล้ว

**ไม่รวมอยู่ในไฟล์นี้**: การแก้ไข source record ตรง (ห้ามทำเด็ดขาดเมื่อรอบ locked), Period Lock Policy เอง (กำหนดไว้ที่ `13-accounting-finance-settings.md` §6.11)

---

## 1. Summary

สร้างรายการปรับปรุงยอดเงิน (เพิ่ม/ลด) สำหรับกรณีที่ต้องแก้ไขข้อมูลย้อนหลังแต่**ห้ามแก้ source record ตรง** ตามนโยบาย Period Lock (ไฟล์ 13 §6.11)

## 2. Purpose

เป็นกลไกเดียวที่อนุญาตให้แก้ไขยอดเงินของรายการที่ผ่านการประมวลผลไปแล้ว (Revenue, Expense, Billing) โดยไม่ทำลายความถูกต้องของข้อมูลเดิม — เก็บ audit trail ครบว่าทำไมต้องปรับ

## 3. In Scope

- สร้าง Adjustment record ผูกกับรายการต้นทาง (Revenue/Expense/Billing Batch/Payout Batch)
- Approval flow สำหรับ Adjustment (ตามความเสี่ยง/สถานะรอบบัญชี — ดูไฟล์ 13 §6.11)

## 4. Out of Scope

- การแก้ไข source record ตรง (ห้ามทำเด็ดขาดเมื่อรอบ locked)
- Period Lock Policy เอง (กำหนดไว้ที่ไฟล์ 13 §6.11)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| การเงิน (Finance) | สร้าง Adjustment | Full |
| บริหาร (Executive) | อนุมัติ Adjustment ที่กระทบรอบบัญชี `locked` | เฉพาะกรณีจำเป็น |

## 6. Core Concepts

### 6.1 Adjustment ไม่แก้ของเดิม แต่สร้างรายการใหม่ชดเชย

ตามหลักการบัญชีที่ดี — Adjustment คือการสร้าง**รายการใหม่**ที่บวก/ลบยอดจากของเดิม ไม่ใช่ไปเขียนทับตัวเลขเดิม เพื่อให้ตรวจสอบย้อนหลังได้ว่า "ของเดิมคืออะไร ปรับเพราะอะไร ปรับไปเท่าไหร่"

### 6.2 ระดับการอนุมัติตาม Period Lock Policy (ไฟล์ 13 §6.11)

| สถานะรอบบัญชีของรายการต้นทาง | ผู้อนุมัติ Adjustment |
|---|---|
| `collecting` | การเงิน (อนุมัติตัวเองได้ ถือเป็นการแก้ไขปกติ) |
| `sent_to_accountant` | การเงิน + Executive |
| `locked` | Executive + บันทึก audit log แยกชัดเจน |

## 7. Data Entities / Required Objects

### 7.1 Adjustment (target ใช้ Separate FK columns ตาม DEC-004)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| adjustment_number | string | yes | เลขที่อ้างอิง (เช่น "ADJ-001") |
| target_type | enum | yes | `revenue` / `expense` / `billing_batch` / `payout_batch` — **ระดับ schema จริงใช้ FK column แยก** (`revenue_id`/`expense_id`/`billing_batch_id`/`payout_batch_id` + CHECK constraint exactly one non-null ตาม DEC-004) ไม่ใช่ discriminator string ตรงๆ |
| target_id | uuid | yes | รายการต้นทางที่ถูกปรับปรุง |
| adjustment_type | enum | yes | `increase` (เพิ่มยอด) / `decrease` (ลดยอด) |
| amount | decimal | yes | ยอดที่ปรับ (เป็นค่าบวกเสมอ — ทิศทางดูจาก adjustment_type) |
| reason | text | yes | เหตุผล — บังคับกรอกเสมอ |
| period_status_at_target | enum | yes | snapshot สถานะรอบบัญชีของรายการต้นทาง ณ ตอนสร้าง Adjustment — ใช้กำหนดระดับอนุมัติที่ต้องใช้ |
| status | enum | yes | `pending_approval` / `approved` / `rejected` (ดู §9) |

## 8. UI / UX Rules

อ้างอิงจาก `finance.html` (`adjustment` tab):

- Table: เลขที่, อ้างอิง (target), ประเภท (เพิ่มยอด/ลดยอด), เหตุผล, ยอดปรับ, สถานะ, ปุ่ม "ดู"
- ฟอร์มสร้าง Adjustment ต้องเลือก target ก่อน (ค้นหาจากเลขที่อ้างอิง) แล้วระบบ snapshot `period_status_at_target` อัตโนมัติ พร้อมแสดงว่าต้องผ่านการอนุมัติระดับไหน

## 9. Workflow / Lifecycle

`เลือกรายการต้นทาง → ระบบเช็ค period_status → สร้าง Adjustment (pending_approval) → ผ่านระดับอนุมัติตาม §6.2 → approved → ยอดสุทธิของรายการต้นทาง = ยอดเดิม + Adjustment (แสดงผลรวมในรายงาน ไม่ใช่เขียนทับ)`

## 10. Security / Control Rules

- ห้ามสร้าง Adjustment โดยไม่ระบุ `reason`
- Adjustment ของรายการที่ `locked` ต้องผ่าน Executive เท่านั้น — ระบบบล็อกถ้าผู้สร้างไม่ใช่ Executive และพยายาม approve เอง

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| REASON_REQUIRED | ไม่กรอกเหตุผล | reject |
| REJECTION_REASON_REQUIRED | ปฏิเสธ Adjustment (`rejected`) โดยไม่กรอก `rejection_reason` | reject |
| INSUFFICIENT_APPROVAL_LEVEL | รายการต้นทาง locked แต่ผู้อนุมัติไม่ใช่ Executive | reject |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| สร้าง Adjustment | การเงิน | full |
| อนุมัติ Adjustment (collecting/sent) | การเงิน (+Executive ถ้า sent) | ตาม §6.2 |
| อนุมัติ Adjustment (locked) | Executive only | — |

## 13. Audit Log Requirements

- ทุก Adjustment ต้อง audit ครบ พร้อม `period_status_at_target` และผู้อนุมัติ

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/adjustments | list |
| POST | /api/adjustments | สร้างใหม่ (ต้องมี reason) |
| PATCH | /api/adjustments/:id/approve | อนุมัติ (เช็คระดับสิทธิ์ตาม period_status) |
| PATCH | /api/adjustments/:id/reject | ปฏิเสธ (terminal — ต้องมี rejection_reason, ระดับสิทธิ์เดียวกับ approve) |

## 15. Acceptance Criteria

- สร้าง Adjustment ได้ครบ ไม่กระทบ source record เดิม
- ระดับอนุมัติถูกบังคับใช้ถูกต้องตามสถานะรอบบัญชีของรายการต้นทาง

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| Adjustment รอบ locked ต้อง Executive | การเงิน (ไม่ใช่ Executive) พยายามอนุมัติ Adjustment ของรายการ locked | reject INSUFFICIENT_APPROVAL_LEVEL |
| ไม่กรอกเหตุผล | สร้าง Adjustment โดยไม่กรอก reason | reject REASON_REQUIRED |
| ปฏิเสธไม่กรอกเหตุผล | ปฏิเสธ Adjustment โดยไม่กรอก rejection_reason | reject REJECTION_REASON_REQUIRED |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Adjustment ไม่แก้ source record เดิมเด็ดขาด — สร้างรายการใหม่ชดเชยเสมอ** (§6.1) — เป็นหลักการบัญชีพื้นฐานที่ใช้ร่วมกับ Period Lock Policy
- **ระดับอนุมัติ 3 ขั้นตามสถานะรอบบัญชีของรายการต้นทาง**: collecting (การเงินอนุมัติเอง) → sent_to_accountant (การเงิน+Executive) → locked (Executive เท่านั้น) (§6.2)
- **target ใช้ Separate FK columns ตาม DEC-004** ไม่ใช่ discriminator string — สอดคล้องกับ schema (§7.1)
- **`reason` บังคับกรอกทุกครั้งไม่มีข้อยกเว้น** (§10, §11)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — กฎหลักอ้างอิงจาก Period Lock Policy (ไฟล์ 13) ที่ชัดเจนแล้ว

---

*เอกสารนี้เป็นไฟล์ที่ 7 ในหมวด Finance Core (14–21) ต่อจาก `19-revenue-billing-receivable.md` และก่อน `21-profitability-report.md`*
