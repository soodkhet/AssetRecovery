# 17-payroll-and-payout.md

# 17 — Payroll and Payout (รอบจ่ายเงินและไฟล์โอนธนาคาร)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Finance Core Module
> เอกสารอ้างอิง: `16-compensation-approval.md`, `18-payee-and-tax-profile.md`, `13-accounting-finance-settings.md` §6.1/§6.4/§6.8, `02-database-schema-design.md` §8 (payout_batches, payout_batch_items table), `35-bank-reconciliation.md`
> **ชื่อไฟล์ทำให้เข้าใจผิดได้**: "Payroll" ในชื่อไฟล์นี้**ไม่ใช่เงินเดือนพนักงานประจำ** (ซึ่งไม่อยู่ในขอบเขตของระบบ ดูไฟล์ 13 §6.4.1) — คือ "รอบจ่ายค่าตอบแทนจากการทำเคส" ให้ทั้ง inhouse และ outsource

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Payout Batch แยกฝั่ง, WHT calculation, Idempotency Key |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + เติมสถานะ `draft` ใน §7.1 ที่ตกหล่นจาก enum `payout_batch_status` ใน `02-database-schema-design.md` (schema มี 4 ค่า: draft/checking/file_generated/completed แต่เอกสารเดิมมีแค่ 3 ค่า ไม่มี draft) + แยก Decisions/Open Items ชัดเจน — **เนื้อหา business logic เดิมคงไว้ครบ** |
| v2.1 | 04/07/2569 | **ระบุ trigger ของ transition `draft → checking` ให้ชัดใน §9** — เดิม §7.1 บอกแล้วว่า `draft` เป็น transient state แต่ §9 ไม่ได้ระบุว่าใคร/อะไรเป็นคนเปลี่ยนเป็น `checking` — ชี้แจงว่าเป็น **ระบบเปลี่ยนอัตโนมัติทันทีที่ดึงรายการ approved ครบตาม cutoff** (ไม่มีปุ่มให้ user กด) ตามความหมาย transient ที่ §7.1 นิยามไว้แล้ว — เป็นการขยายความ ไม่ใช่ logic ใหม่ |

ขอบเขตเอกสารนี้: รวมรายการค่าตอบแทนที่ผ่านการอนุมัติแล้ว (ไฟล์ 16) เป็นรอบจ่ายเงิน (Payout Batch) แยกฝั่ง inhouse/outsource พร้อมหัก WHT และสร้างไฟล์โอนเงินธนาคาร

**ไม่รวมอยู่ในไฟล์นี้**: การอนุมัติรายการก่อนเข้ารอบจ่าย (ดู `16-compensation-approval.md`), การออกหนังสือรับรองหัก ณ ที่จ่าย (ใบ 50 ทวิ) ที่เป็นเอกสารทางการครบชุด (ดู `33-accounting-wht-data.md`)

---

## 1. Summary

รวมรายการค่าตอบแทนที่ผ่านการอนุมัติแล้ว (ไฟล์ 16) เป็นรอบจ่ายเงิน (Payout Batch) แยกฝั่ง inhouse/outsource พร้อมหัก WHT และสร้างไฟล์โอนเงินธนาคาร

## 2. Purpose

เป็นขั้นสุดท้ายของฝั่งรายจ่าย (AP) — แปลงรายการที่อนุมัติแล้วเป็นการจ่ายเงินจริง พร้อมเอกสารประกอบ (WHT certificate, payment voucher)

## 3. In Scope

- สร้าง Payout Batch แยกฝั่ง inhouse/outsource ตามรอบตัดที่กำหนด (ไฟล์ 13 §6.1)
- คำนวณ WHT ตาม Tax Profile ของ Payee แต่ละราย (ไฟล์ 13 §6.4, ไฟล์ 18)
- สร้างไฟล์โอนเงินธนาคาร (Bank Payment File) ตาม format ที่ตั้งไว้ (ไฟล์ 13 §6.8)
- Idempotency control ป้องกันโอนเงินซ้ำ

## 4. Out of Scope

- การอนุมัติรายการก่อนเข้ารอบจ่าย (ไฟล์ 16)
- การออกหนังสือรับรองหัก ณ ที่จ่าย (ใบ 50 ทวิ) ที่เป็นเอกสารทางการครบชุด (ไฟล์ 33)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| การเงิน (Finance) | สร้าง Payout Batch, สร้างไฟล์โอนเงิน, ยืนยันการจ่ายสำเร็จ | Full |
| บัญชี (Accounting) | ดู Payout Batch เพื่ออ้างอิงตอนสรุป WHT (ไฟล์ 33) | Read-only |

## 6. Core Concepts

### 6.1 Payout Batch แยกฝั่ง inhouse / outsource

แยกเพราะ**เงื่อนไขภาษีต่างกัน**: inhouse (ดูไฟล์ 13 §6.4.1 — ค่าตอบแทนจากเคส ใช้ Tax Profile เดียวกับ outsource ได้ แต่แยก batch เพื่อความชัดเจนในการจัดการ) vs outsource (หัก WHT 3% ตามมาตรฐาน) — ไม่ปนกันในรอบเดียวกัน เพื่อให้ตรวจสอบ/รายงานง่าย

### 6.2 WHT Calculation ต่อ Payout Batch

แต่ละรายการใน batch หัก WHT ตาม Tax Profile ที่ผูกกับ Payee นั้น (ไฟล์ 18) — ยอดรวม WHT ของ batch = ผลรวม WHT ของทุกรายการ — `net = gross - wht` ที่โอนจริง

### 6.3 Idempotency Key (กันโอนซ้ำ) 🔶 สำคัญมากด้านความปลอดภัยทางการเงิน

ตามที่ UI ระบุไว้ชัดเจน ("ระบบจะสร้างไฟล์เข้ารหัสและแนบ Idempotency Key ป้องกันการนำไฟล์ไปอัปโหลดซ้ำสองครั้งอัตโนมัติ") — ทุกครั้งที่สร้างไฟล์โอนเงิน ระบบ generate unique key ผูกกับ Payout Batch นั้น ถ้ามีการพยายามสร้าง/ดาวน์โหลดไฟล์โอนซ้ำสำหรับ batch เดียวกันที่จ่ายไปแล้ว ต้องเตือนชัดเจนว่า "Batch นี้สร้างไฟล์โอนไปแล้วเมื่อ [วันที่] — แน่ใจหรือไม่ว่าต้องการสร้างซ้ำ"

## 7. Data Entities / Required Objects

### 7.1 Payout Batch (เติมสถานะ `draft` — ดู Changelog v2)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| name | string | yes | ชื่อรอบจ่าย (เช่น "รอบจ่าย Outsource ประจำวันที่ 15 มิ.ย. 69") |
| side | enum | yes | `inhouse` / `outsource` |
| cutoff_date | date | yes | วันสิ้นสุดตัดรอบ — ดึงรายการที่ approved แล้วจนถึงวันนี้ |
| gross_amount | decimal | yes | ยอดรวมก่อนหัก WHT |
| wht_amount | decimal | yes | ยอดรวม WHT |
| net_amount | decimal | yes | `gross_amount - wht_amount` = ยอดโอนจริง |
| item_count | integer | yes | จำนวนรายการในรอบ |
| status | enum | yes | **`draft`** (กำลังรวบรวมรายการ — transient state ทันทีหลังสร้าง ก่อนระบบดึงรายการมาครบ) / `checking` (กำลังตรวจสอบก่อนสร้างไฟล์) / `file_generated` / `completed` (ดู §9) — ตรงกับ enum `payout_batch_status` ใน `02-database-schema-design.md` §3 |
| idempotency_key | string | yes | unique key ผูกกับ batch — generate ตอนสร้างไฟล์โอนครั้งแรก |
| payment_file_generated_at | timestamptz \| null | — | — |

### 7.2 Payout Batch Item

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| payout_batch_id | uuid | yes | — |
| payee_id | uuid | yes | ผูกกับไฟล์ 18 — ต้อง `verified` เท่านั้น |
| source_expense_id | uuid | yes | อ้างอิงรายการเบิกต้นทาง (ไฟล์ 41/15/16) |
| gross_amount, wht_amount, net_amount | decimal | yes | — |

## 8. UI / UX Rules

อ้างอิงจาก `finance.html`:

- Table: ชื่อรอบจ่าย (+จำนวนรายการ), กลุ่ม (inhouse/outsource badge สี), Gross, WHT (สีแดง), Net (เด่นสีเขียวตัวใหญ่), สถานะ, ปุ่ม "ไฟล์โอน" + "ดู"
- Modal "สร้างรอบจ่ายเงิน": เลือกฝั่ง (Outsource/Inhouse) + วันตัดรอบ + banner แจ้งว่าระบบจะดึงรายการที่อนุมัติเสร็จแล้วมารวมอัตโนมัติ
- Modal "สร้างไฟล์โอนเงิน": เลือกรูปแบบธนาคารต้นทาง + บัญชีที่จ่าย + สรุปยอด (จำนวนรายการ, ยอดสุทธิ) + ข้อความยืนยันเรื่อง idempotency key

## 9. Workflow / Lifecycle

`สร้าง Payout Batch (เลือกฝั่ง + cutoff date) → status: draft (ระบบดึงรายการ approved ทั้งหมดมารวม) → ระบบเปลี่ยนเป็น status: checking อัตโนมัติทันทีที่ดึงรายการครบ (draft เป็น transient state ตาม §7.1 — ไม่มีปุ่มให้ user เปลี่ยนเอง) → (การเงินตรวจสอบยอด) → กด "สร้างไฟล์โอน" → generate idempotency_key + ไฟล์ → status: file_generated → อัปโหลดเข้าระบบธนาคารจริง (นอกระบบ) → Bank Statement จับคู่สำเร็จ (ไฟล์ 35) → sync อัตโนมัติเป็น status: completed (หรือการเงิน manual confirm ได้เป็นทางเลือกสำรอง)`

## 10. Security / Control Rules

- รายการที่ `payee.status = unverified` ห้ามรวมเข้า Payout Batch (ตามไฟล์ 18 §10)
- สร้างไฟล์โอนซ้ำสำหรับ batch ที่ `file_generated`/`completed` แล้ว ต้องเตือนชัดเจนก่อนยืนยัน (กัน double-pay)
- แก้ไขรายการใน batch ที่ `file_generated` แล้วไม่ได้ — ต้องลบรายการนั้นออกจาก batch ก่อน (ยกเลิก batch ถ้าจำเป็น) แล้วสร้างใหม่

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| UNVERIFIED_PAYEE_IN_PAYOUT | มีรายการที่ payee unverified อยู่ใน batch | reject ตอนสร้าง batch (ตามไฟล์ 18) |
| DUPLICATE_PAYMENT_FILE | สร้างไฟล์โอนซ้ำสำหรับ batch ที่มี idempotency_key อยู่แล้ว | เตือน (ไม่ reject ทันที) ให้ยืนยันซ้ำก่อนดำเนินการ |
| MIXED_SIDE_BATCH | พยายามรวมรายการ inhouse และ outsource ในรอบเดียวกัน | reject — ต้องแยกตาม side เสมอ |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| สร้าง/จัดการ Payout Batch | การเงิน | full |
| สร้างไฟล์โอนเงิน | การเงิน (ไม่มีการแบ่งระดับย่อยภายใน role นี้) | ความเสี่ยงสูง — ถ้าต้องการจำกัดสิทธิ์แคบกว่านี้ ต้องสร้าง permission flag เพิ่มเติมตอน implement |
| ดู Payout Batch | บัญชี, ผู้บริหาร | read-only |

## 13. Audit Log Requirements

- การสร้างไฟล์โอนเงินทุกครั้งต้อง audit พร้อม idempotency_key, ผู้สร้าง, เวลา
- การยืนยัน `completed` ต้องระบุผู้ยืนยันชัดเจน (ความรับผิดทางการเงิน)

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/payout-batches | list |
| POST | /api/payout-batches | สร้างรอบจ่ายใหม่ (รวมรายการ approved อัตโนมัติ) |
| POST | /api/payout-batches/:id/generate-payment-file | สร้างไฟล์โอน (เตือนถ้าซ้ำ) |
| PATCH | /api/payout-batches/:id/complete | ยืนยันจ่ายสำเร็จ |

## 15. Acceptance Criteria

- Payout Batch แยกฝั่ง inhouse/outsource ถูกต้อง ไม่ปนกัน
- คำนวณ WHT ต่อรายการถูกต้องตาม Tax Profile ของแต่ละ Payee
- Idempotency key ป้องกันสร้างไฟล์โอนซ้ำได้จริง (มี warning ชัดเจน)
- Payee ที่ unverified ไม่ถูกรวมเข้า batch

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| รวม unverified payee | สร้าง batch ที่มีรายการของ payee unverified | reject UNVERIFIED_PAYEE_IN_PAYOUT |
| สร้างไฟล์โอนซ้ำ | กดสร้างไฟล์โอนของ batch ที่มี idempotency_key อยู่แล้ว | แสดง warning ก่อนดำเนินการต่อ |
| ปนฝั่ง inhouse/outsource | พยายามรวม 2 ฝั่งในรอบเดียว | reject MIXED_SIDE_BATCH |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Payout Batch แยกฝั่ง inhouse/outsource เสมอ ไม่ปนกันในรอบเดียวกัน** (§6.1, §11 MIXED_SIDE_BATCH)
- **Idempotency Key ผูกกับ batch ตอนสร้างไฟล์โอนครั้งแรก** — สร้างซ้ำต้องเตือนก่อนเสมอ ไม่ reject ทันที (§6.3, §11)
- **Payee ที่ unverified ห้ามรวมเข้า Payout Batch เด็ดขาด** (§10, §11)
- **สถานะ `completed` sync อัตโนมัติจาก Bank Reconciliation (ไฟล์ 35) เป็นหลัก** — แม่นยำกว่า manual confirm — แต่เปิด manual confirm เป็นทางเลือกสำรอง (§9, §18)
- **สถานะ `draft` เป็น transient state สั้นๆ ตอนสร้าง** ก่อนเข้า `checking` — เติมให้ตรงกับ schema แล้ว (§7.1)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — รายชื่อธนาคารและ format ที่รองรับตั้งค่าได้ผ่านไฟล์ 13 §6.8 (Bank File Format) อยู่แล้ว เพิ่ม/แก้ไขได้โดยไม่ต้องแก้โค้ด ไม่ fix ตายตัวว่าต้องเป็นธนาคารใดธนาคารหนึ่ง
- การยืนยันจ่ายสำเร็จ (`completed`) ใช้ sync อัตโนมัติจาก Bank Statement ที่จับคู่สำเร็จ (ไฟล์ 35) เป็นหลัก เพราะแม่นยำกว่าและลดความเสี่ยงคีย์ผิด — แต่เปิดให้การเงิน manual confirm ได้เป็นทางเลือกสำรอง กรณีธนาคารส่ง statement ช้ากว่าที่ควร

---

*เอกสารนี้เป็นไฟล์ที่ 4 ในหมวด Finance Core (14–21) ต่อจาก `16-compensation-approval.md` และก่อน `18-payee-and-tax-profile.md`*
