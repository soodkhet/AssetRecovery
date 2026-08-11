# 16-compensation-approval.md

# 16 — Compensation Approval (สายการอนุมัติค่าตอบแทน)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Finance Core Module
> เอกสารอ้างอิง: `41-field-tracker-mobile.md` §10.1/§8/§6.6 (expense.status enum, reject_expense/reject_evidence), `13-accounting-finance-settings.md` §6.2 (Approval Matrix), `02-database-schema-design.md` §8 (expenses table)
> **สำคัญ**: ไฟล์นี้คือเจ้าของ flow การอนุมัติที่ไฟล์ 41 อ้างถึงว่า "ผู้อนุมัติจ่าย (บัญชี/การเงิน ไฟล์ 16/17)" — ทุก action ในไฟล์นี้ต้องสอดคล้องกับ `expense.status` enum ที่กำหนดไว้แล้วในไฟล์ 41 §6.6 (ตรวจสอบแล้วว่าตรงกับ `02-database-schema-design.md` §3 — ไม่มี conflict)

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Multi-step approval ตาม Approval Matrix, ความสัมพันธ์กับ QC Outcome |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** (ตรวจสอบ `expense.status` enum เทียบกับ `02-database-schema-design.md` แล้ว ไม่พบ conflict) |
| v2.1 | 04/07/2569 | **Schema sync (DEC-006/D5)**: field multi-step ใน §7 (`approval_step_current`, `approval_step_total`, `approval_history`) เดิม**ไม่มี column รองรับ**ในตาราง `expenses` — `02` v3.5 เพิ่มครบแล้ว พร้อม `executive_approved_by/at` (ขั้นเกินเพดาน) และ `approval_matrix_id` (snapshot ว่ารายการใช้ matrix แถวไหน) — ไม่มีการเปลี่ยน business logic ในไฟล์นี้ |

ขอบเขตเอกสารนี้: ตรวจสอบและอนุมัติค่าตอบแทนที่เกิดจากการทำเคส (ค่าน้ำมัน, เบี้ยเลี้ยง, คอมมิชชั่น) ก่อนเข้าสู่รอบจ่ายเงินจริง — เป็นจุดที่ "ขั้นอนุมัติจ่ายเงินทำหน้าที่ตรวจสอบ" แทน QC แยก

**ไม่รวมอยู่ในไฟล์นี้**: การคำนวณยอด fuel/allowance เริ่มต้น (เกิดที่ไฟล์ 41 อัตโนมัติตามไฟล์ 11), การคำนวณ commission (เกิดจาก state machine ของเคส), การรวมเป็นรอบจ่ายเงิน (ดู `17-payroll-and-payout.md`)

---

## 1. Summary

ตรวจสอบและอนุมัติค่าตอบแทนที่เกิดจากการทำเคส (ค่าน้ำมัน, เบี้ยเลี้ยง, คอมมิชชั่น) ก่อนเข้าสู่รอบจ่ายเงินจริง (ไฟล์ 17) — เป็นจุดที่ "ขั้นอนุมัติจ่ายเงินทำหน้าที่ตรวจสอบ" แทน QC แยก ตามที่ตกลงไว้ในไฟล์ 41 §10.1

## 2. Purpose

ให้การเงินเห็นภาพรวมค่าตอบแทนทุกประเภทต่อเคส พร้อมสูตรคำนวณที่ใช้ และมีช่องทาง "ตีกลับ" เอกสารที่ไม่ถูกต้องกลับไปให้ field agent แก้ไข (สอดคล้องกับ §10.1 ของไฟล์ 41)

## 3. In Scope

- แสดงรายการค่าตอบแทนต่อเคส (fuel, allowance, commission) พร้อมสูตรคำนวณที่ใช้
- Action `approve_expense` / `reject_expense` ตาม Approval Matrix (ไฟล์ 13 §6.2)
- Multi-step approval ตามเงื่อนไขเพดานเงิน (Manager → การเงิน → Executive)

## 4. Out of Scope

- การคำนวณยอด fuel/allowance เริ่มต้น (เกิดที่ไฟล์ 41 อัตโนมัติตามไฟล์ 11)
- การคำนวณ commission (เกิดจาก state machine ของเคส — outcome `closed_success`)
- การรวมเป็นรอบจ่ายเงิน (ไฟล์ 17)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| ผู้จัดการทีมติดตามทรัพย์ (Manager) | อนุมัติขั้นต้น (ถ้า Approval Matrix กำหนดให้ผ่าน Manager ก่อน) | หลายทีม (เฉพาะทีมที่ตนดูแลผ่าน `team_managers`) |
| การเงิน (Finance) | อนุมัติ/ตีกลับขั้นถัดไป — เป็น role หลักที่ทำหน้าที่ `reject_expense` ตามไฟล์ 41 | Full |
| บริหาร (Executive) | อนุมัติขั้นสุดท้ายเฉพาะรายการที่เกินเพดาน (ตาม Approval Matrix) | เกินเพดานเท่านั้น |

## 6. Core Concepts

### 6.1 Multi-step Approval ตาม Approval Matrix

ดึงเงื่อนไขจากไฟล์ 13 §6.2 — แต่ละรายการเช็ค `condition_threshold` แล้วกำหนดว่าต้องผ่านกี่ขั้น:

- ปกติไม่เกินเพดาน: `Manager → การเงิน`
- เกินเพดาน: `Manager → การเงิน → Executive`

รายการต้องผ่าน**ทุกขั้นที่กำหนด**ตามลำดับ ถึงจะเปลี่ยนเป็น `approved` สมบูรณ์ — ถ้าขั้นใดขั้นหนึ่งตีกลับ (`reject_expense`) กลับไป `needs_revision` ทันที (ไม่ต้องรอขั้นถัดไป)

### 6.2 ความสัมพันธ์กับ QC Outcome (ไฟล์ 41 §10.1)

ตามที่ตกลงไว้แล้ว — **ไม่มีขั้น QC แยกก่อนปิดงาน** เพราะขั้นอนุมัติจ่ายเงินในไฟล์นี้ทำหน้าที่ตรวจสอบในตัว:

- ถ้าผู้อนุมัติ (role ในไฟล์นี้) พบว่า**เอกสารบัญชี/ใบเสร็จผิดหรือไม่ชัด** → ใช้ `reject_expense` (กระทบแค่ `expense.status` ของรายการนั้น)
- ถ้าพบว่า**หลักฐานปิดงานเองน่าสงสัย** (ไม่ใช่แค่เอกสารบัญชี) → **ไม่ใช่หน้าที่ของ role ในไฟล์นี้** ต้องแจ้งเจ้าหน้าที่อนุมัติเคส (system role) ให้ใช้ `reject_evidence` แทน (ดูไฟล์ 41 §10.1 ตารางสรุป) — สองสิทธิ์นี้แยกกันชัดเจน ห้ามสับสน

## 7. Data Entities / Required Objects

ใช้ entity เดียวกับไฟล์ 41 §6.6 (expense ผูกกับเคส) และไฟล์ 15 §7.1 (manual claim) — ไฟล์นี้เพิ่มเฉพาะ field ที่เกี่ยวกับ multi-step approval:

| Field | Type | Required | Description |
|---|---|---|---|
| approval_step_current | integer | yes | ขั้นอนุมัติปัจจุบัน (1, 2, 3...) ตาม approval_flow ที่ Approval Matrix กำหนด |
| approval_step_total | integer | yes | จำนวนขั้นทั้งหมดที่ต้องผ่าน |
| approval_history | array | yes | ประวัติแต่ละขั้น: `{step, approver_id, action (approve/reject), timestamp, reason}` |

## 8. UI / UX Rules

อ้างอิงจาก `finance.html` (`comp` tab):

- Table: เคส, ทีม, ประเภท (ค่าน้ำมัน/Commission/เบี้ยเลี้ยง), สูตร/ฐานคิด (แสดงเป็น text สรุป เช่น "128.5 กม. × 3.50"), Gross, WHT, Net, สถานะ, ปุ่ม "ดูสูตร"
- ปุ่ม "ดูสูตร" เปิด modal แสดงรายละเอียดการคำนวณเต็ม (อ้างอิงไฟล์ 22 สำหรับสูตรเชิงคำนวณ)
- แสดง progress ของ multi-step approval เป็น stepper เล็กๆ ในแถว (เช่น "ขั้น 1/2: รอ การเงิน")

## 9. Workflow / Lifecycle

`เกิดรายการ (pending_approval, approval_step_current=1) → ผ่านขั้น 1 (approve_expense) → step_current++ → ... → ผ่านขั้นสุดท้าย → approved`

`ขั้นใดขั้นหนึ่ง reject_expense → needs_revision (พร้อม reject_reason) → field agent แก้ไข (resubmit_expense ตามไฟล์ 41) → กลับเข้า pending_approval เริ่มที่ step_current=1 ใหม่ (ต้องผ่านทุกขั้นใหม่ทั้งหมด ไม่ resume จากขั้นที่ตีกลับ — เพื่อความปลอดภัย เผื่อแก้ไขกระทบยอดที่ขั้นก่อนหน้าอนุมัติไปแล้ว)`

## 10. Security / Control Rules

- ผู้อนุมัติขั้นที่ N เห็นได้แค่รายการที่ผ่านขั้น 1 ถึง N-1 มาแล้วเท่านั้น (ไม่เห็นรายการที่ยังไม่ถึงตา)
- Manager อนุมัติได้แค่ของทีมตัวเอง (scope จำกัด)
- ห้ามผู้อนุมัติคนเดียวกันอนุมัติซ้ำ 2 ขั้นในรายการเดียวกัน **เมื่อ `enforce_segregation_of_duties = true`** ตามที่ตั้งค่าไว้ใน Approval Matrix ของเงื่อนไขนั้น (ไฟล์ 13 §6.2) — ถ้าตั้งค่าเป็น `false` (ค่าเริ่มต้น) อนุญาตให้คนเดียวกันอนุมัติได้หลายขั้น เพื่อรองรับทีมเล็กที่มีคนจำกัด

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| APPROVAL_STEP_OUT_OF_ORDER | พยายามอนุมัติขั้นที่ยังไม่ถึงตา (เช่น ขั้น 1 ยังไม่ผ่าน แต่กดอนุมัติขั้น 2) | reject |
| SEGREGATION_OF_DUTIES_VIOLATION | ผู้อนุมัติคนเดียวกันพยายามอนุมัติขั้นที่ 2 ของรายการเดียวกัน ขณะที่ `enforce_segregation_of_duties = true` | reject |
| REJECT_REASON_REQUIRED | กด reject_expense โดยไม่กรอกเหตุผล | reject (ตามที่กำหนดไว้แล้วในไฟล์ 41) |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| อนุมัติขั้น Manager | ผู้จัดการทีมติดตามทรัพย์ (Manager — ไฟล์ 09/40) | เฉพาะทีมตัวเอง |
| อนุมัติขั้น การเงิน / reject_expense | การเงิน | ตามไฟล์ 41 |
| อนุมัติขั้น Executive | บริหาร | เฉพาะรายการเกินเพดาน |

## 13. Audit Log Requirements

- ทุกขั้นอนุมัติ/ตีกลับเก็บใน `approval_history` พร้อม audit log แยกอีกชุดตามมาตรฐานเดิม

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/compensation | list พร้อม approval_step ปัจจุบัน |
| PATCH | /api/compensation/:id/approve | อนุมัติขั้นปัจจุบัน (เช็ค role ตรงกับขั้นนั้น) |
| PATCH | /api/compensation/:id/reject | ตีกลับ (= reject_expense ตามไฟล์ 41) |

## 15. Acceptance Criteria

- Multi-step approval ทำงานถูกต้องตามเงื่อนไขเพดานใน Approval Matrix
- ตีกลับแล้วต้องผ่านทุกขั้นใหม่ทั้งหมด ไม่ resume จากขั้นที่ค้าง
- เชื่อมกับ `expense.status` ของไฟล์ 41 ได้ถูกต้อง ไม่มี enum ขัดแย้งกัน

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| อนุมัติข้ามขั้น | กดอนุมัติขั้น 2 ทั้งที่ขั้น 1 ยังไม่ผ่าน | reject APPROVAL_STEP_OUT_OF_ORDER |
| ตีกลับแล้วเริ่มใหม่ | รายการผ่านขั้น 1 แล้ว ถูกตีกลับที่ขั้น 2 แล้วแก้ไขส่งใหม่ | กลับไปขั้น 1 ใหม่ ไม่ resume ที่ขั้น 2 |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **ไม่มีขั้น QC แยกก่อนปิดงาน** — ขั้นอนุมัติจ่ายเงินทำหน้าที่ตรวจสอบเอกสารบัญชีในตัว แยกจาก `reject_evidence` ที่เป็นสิทธิ์ของเจ้าหน้าที่อนุมัติเคสเท่านั้น (§6.2)
- **Multi-step approval ตามเพดานเงิน**: ปกติ `Manager → การเงิน`, เกินเพดาน `Manager → การเงิน → Executive` (§6.1)
- **Reject ที่ขั้นใดก็ตาม ต้องเริ่มขั้น 1 ใหม่ทั้งหมด ไม่ resume** — ป้องกันความเสี่ยงจากการแก้ไขที่กระทบยอดซึ่งขั้นก่อนหน้าอนุมัติไปแล้ว (§9)
- **Segregation of Duties ปรับได้ต่อเงื่อนไข** ผ่าน `enforce_segregation_of_duties` ใน Approval Matrix — ค่าเริ่มต้น `false` รองรับทีมเล็ก (§10)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — Segregation of Duties ทำเป็นค่าตั้งค่า `enforce_segregation_of_duties` ในไฟล์ 13 §6.2 ให้ปรับได้ตามขนาดทีมจริง (ค่าเริ่มต้น false รองรับทีมเล็ก)

---

*เอกสารนี้เป็นไฟล์ที่ 3 ในหมวด Finance Core (14–21) ต่อจาก `15-claims-and-advances.md` และก่อน `17-payroll-and-payout.md`*
