# 18-payee-and-tax-profile.md

# 18 — Payee and Tax Profile (ผู้รับเงินและกติกาภาษีรายบุคคล)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — เติม schema column ที่ขาด)
> Document Level: Finance Core Module
> เอกสารอ้างอิง: `08-users.md`, `11-compensation.md`, `13-accounting-finance-settings.md` §6.4, `16-compensation-approval.md`, `17-payroll-and-payout.md`, `02-database-schema-design.md` §8 (payee_profiles table), `22-finance-calculation-spec.md` §6.9
> 🔶 ดูหมายเหตุสำคัญเรื่องการตรวจทานโดยนักบัญชีในไฟล์ 10 — ใช้กับไฟล์นี้เช่นกัน

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Payee Profile, **WHT Priority: Payee level ชนะ Plan level** (Key Business Rule ของทั้งระบบ) |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + **พบว่า `02-database-schema-design.md` ขาด column `payee_type` และ `id_document_url` ที่ไฟล์นี้ต้องใช้ (§7.1, §10)** — เติมเข้า schema แล้ว (ไม่ใช่เปลี่ยน design เพราะไม่มีอะไรขัดแย้งกัน แค่ schema ยังไม่ครบ) — แยก Decisions/Open Items ชัดเจน — **เนื้อหา business logic เดิมคงไว้ครบ** |

ขอบเขตเอกสารนี้: จัดการข้อมูลผู้รับเงิน (Payee) ที่ AssetRecovery จ่ายค่าตอบแทนให้ — ครอบคลุมพนักงาน inhouse (เฉพาะค่าตอบแทนจากเคส ไม่ใช่เงินเดือน) และทีม/บุคคล outsource — เก็บข้อมูลบัญชีธนาคารและ Tax Profile ที่ผูกกับแต่ละราย รวมถึง **กฎ WHT Priority ที่สำคัญที่สุดของระบบการเงินทั้งหมด**

**ไม่รวมอยู่ในไฟล์นี้**: การคำนวณยอดเบิก/ค่าตอบแทนจริง (ดู `15-claims-and-advances.md`, `16-compensation-approval.md`), การสร้างไฟล์โอนเงิน (ดู `17-payroll-and-payout.md`)

---

## 1. Summary

จัดการข้อมูลผู้รับเงิน (Payee) ที่ AssetRecovery จ่ายค่าตอบแทนให้ — ครอบคลุมพนักงาน inhouse (เฉพาะค่าตอบแทนจากเคส ไม่ใช่เงินเดือน — ดูไฟล์ 13 §6.4.1) และทีม/บุคคล outsource — เก็บข้อมูลบัญชีธนาคารและ Tax Profile ที่ผูกกับแต่ละราย

## 2. Purpose

เป็นฐานข้อมูลที่ไฟล์ 16 (Compensation Approval) และ 17 (Payroll/Payout) ใช้คำนวณยอดจ่ายสุทธิ (Net) หลังหัก WHT และใช้สร้างไฟล์โอนเงินธนาคาร

## 3. In Scope

- ข้อมูล Payee: ชื่อ, ประเภท (บุคคลธรรมดา/นิติบุคคล), Tax ID, บัญชีธนาคาร
- ผูก Tax Profile (จากไฟล์ 13 §6.4) เข้ากับ Payee แต่ละราย
- สถานะการยืนยันข้อมูล Payee (verified/unverified) ก่อนจ่ายเงินจริงได้

## 4. Out of Scope

- การคำนวณยอดเบิก/ค่าตอบแทนจริง (ไฟล์ 15/16)
- การสร้างไฟล์โอนเงิน (ไฟล์ 17)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| การเงิน (Finance) | สร้าง/แก้ไข/ยืนยัน Payee Profile | Full |
| บัญชี (Accounting) | ดู Payee เพื่ออ้างอิงตอนสรุป WHT (ไฟล์ 33) | Read-only |
| พนักงาน (ทุกฝั่ง) | ดูข้อมูล Payee ของตัวเอง แก้ไขเองไม่ได้ (ต้องแจ้งการเงิน) | Own scope read-only |

## 6. Core Concepts

### 6.1 Payee = บุคคล/นิติบุคคลที่รับเงินจาก AssetRecovery

**ไม่ใช่แนวคิดเดียวกับ "User"** (ไฟล์ 08) — User คือบัญชี login เข้าระบบ ส่วน Payee คือ identity ทางการเงิน/ภาษีที่ผูกกับ User นั้น (1 User มี 1 Payee Profile เสมอถ้าต้องรับเงินจากระบบ)

### 6.2 Verification ก่อนจ่ายเงิน

Payee ที่ยังไม่ `verified` (ข้อมูลธนาคาร/ภาษีไม่ครบหรือยังไม่ตรวจสอบ) **ห้ามรวมเข้ารอบจ่ายเงิน (Payout Batch ไฟล์ 17)** — ป้องกันโอนผิดบัญชี/ข้อมูลภาษีไม่ครบ

### 6.3 WHT Rate Priority — Payee Level vs Plan Level 🔑 Key Business Rule

ระบบมีการกำหนด WHT rate ได้ 2 ระดับ ซึ่งอาจขัดแย้งกัน:

| ระดับ | ที่ตั้งค่า | ตัวอย่าง |
|---|---|---|
| **Compensation Plan level** (ไฟล์ 11) | `plan.wht_rate` — ตั้งที่แผนค่าตอบแทนของทีม | outsource plan ตั้ง WHT 3% |
| **Payee Profile level** (ไฟล์ 18) | `payee.tax_profile_id → TaxProfile.wht_rate` — ตั้งรายบุคคล | บุคคลนี้ตกลงพิเศษ WHT 1% |

**กฎ Priority: Payee Profile level ชนะเสมอ**

```
WHT rate ที่ใช้จริง = payee.tax_profile.wht_rate
                      (ไม่สนใจ plan.wht_rate)
```

> **เหตุผล**: WHT เป็นภาระภาษีของผู้รับเงินรายบุคคล ซึ่งขึ้นกับประเภทเงินได้และสถานะภาษีของบุคคลนั้นโดยตรง (ม.40) — Plan-level เป็นแค่ค่า default ตั้งต้น ไม่ใช่ rule ผูกมัด

> **กรณีที่ Payee ยังไม่มี Tax Profile**: ใช้ WHT rate จาก Compensation Plan เป็น fallback ชั่วคราว แต่ต้องเตือนเจ้าหน้าที่ให้ผูก Tax Profile กับ Payee โดยเร็ว

**การ implement**: ไฟล์ 22 §6.9 (WHT Net Calculation) ต้องดึง rate จาก `PayeeProfile.tax_profile.wht_rate` ก่อนเสมอ ถ้า null ค่อย fallback ไป `CompensationPlan.wht_rate`

## 7. Data Entities / Required Objects

### 7.1 Payee Profile (field name ตรงกับ `02-database-schema-design.md` §8 หลังเติม column ที่ขาดแล้ว)

| Field (เอกสาร) | Field (schema จริง) | Type | Required | Description |
|---|---|---|---|---|
| id | id | uuid | yes | — |
| user_id | user_id | uuid | yes | ผูกกับ User (ไฟล์ 08) |
| payee_type | payee_type | enum | yes | `individual` (บุคคลธรรมดา) / `corporate` (นิติบุคคล) — เลือกตามสถานะจริงของผู้รับเงิน ไม่ใช่ตาม inhouse/outsource (เช่น outsource บางทีมจดเป็นนิติบุคคล) — **เพิ่มเข้า schema แล้ว (v2)** |
| name | *(ผูกผ่าน user_id → users.full_name)* | string | yes | ชื่อ-นามสกุล หรือชื่อนิติบุคคล "ตามหน้าสมุดบัญชี" (ใช้ตรงตัวสำหรับโอนเงิน) |
| tax_id | national_id | string(13) | yes | เลขบัตรประชาชน (บุคคลธรรมดา) หรือเลขทะเบียนนิติบุคคล (นิติบุคคล) — รูปแบบเดียวกัน 13 หลัก validate แค่ format ไม่ทำ checksum |
| tax_profile_id | tax_profile_id | uuid | yes | ผูกกับ Tax Profile (ไฟล์ 13 §6.4) กำหนดอัตรา WHT ที่ใช้กับ payee รายนี้ |
| bank_name | bank_name | string | yes | — |
| bank_account_number | account_number | string | yes | — |
| bank_account_name | account_name | string | yes | ชื่อบัญชีธนาคาร — ต้องตรงกับชื่อ payee เพื่อกันโอนผิดบัญชี (validate ตรงกันหรือเตือนถ้าไม่ตรง) |
| status | *(derive จาก `is_verified` boolean)* | enum/boolean | yes | `verified` / `unverified` (ดู §9) — schema เก็บเป็น `is_verified BOOLEAN` ไม่ใช่ enum แต่ความหมายเดียวกัน |
| verified_by, verified_at | verified_by, verified_at | uuid, timestamptz \| null | — | — |
| id_document_url | id_document_url | string \| null | — | ไฟล์แนบยืนยันตัวตน (สำเนาบัตรประชาชน/หนังสือรับรองบริษัท) — ไม่บังคับเป็นค่าเริ่มต้น แต่ตั้งค่าให้บังคับได้ที่ไฟล์ 13 (ดู §10) — **เพิ่มเข้า schema แล้ว (v2)** |

## 8. UI / UX Rules

อ้างอิงจาก `settings.html` (`renderSettingsPayee`, `payee-form`):

- Table: ชื่อ Payee (+ทีมด้านล่างชื่อ), ประเภท, Tax ID, บัญชีธนาคาร, อัตรา WHT, สถานะ, ปุ่มแก้ไข
- ฟอร์ม: เลือกประเภท (radio บุคคลธรรมดา/นิติบุคคล) → ชื่อ-นามสกุล/ชื่อบริษัท ("ตามหน้าสมุดบัญชี") → Tax ID → อัตรา WHT (dropdown 3%/1%/ไม่หัก) → ส่วนข้อมูลธนาคาร (เลือกธนาคาร + เลขบัญชี)

## 9. Workflow / Lifecycle

`สร้าง Payee Profile → กรอกข้อมูลครบ → การเงินกด "ยืนยัน" → is_verified = true → พร้อมรวมเข้ารอบจ่ายเงิน (ไฟล์ 17)`

แก้ไขข้อมูลธนาคาร/ภาษีของ Payee ที่ verified แล้ว → กลับไปเป็น unverified อัตโนมัติ (`is_verified = false`) ต้องยืนยันใหม่ก่อนจ่ายเงินรอบถัดไป (กันแก้ข้อมูลผิดแล้วจ่ายเงินผิดบัญชีโดยไม่รู้ตัว)

## 10. Security / Control Rules

- Payee ที่ `is_verified = false` ห้ามถูกรวมเข้า Payout Batch เด็ดขาด (validation บล็อกที่ไฟล์ 17)
- แก้ไขข้อมูลธนาคาร/Tax ID ต้อง audit log เสมอ (ความเสี่ยงสูงเรื่องการเงิน)
- ถ้าตั้งค่า `require_payee_id_document = true` (ไฟล์ 13) การยืนยัน Payee ต้องมี `id_document_url` แนบมาก่อนเท่านั้น — ถ้า `false` (ค่าเริ่มต้น) ไม่บังคับ ให้การเงินใช้ดุลยพินิจเป็นรายกรณี

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| REQUIRED_MISSING | ฟิลด์บังคับไม่ครบ | inline error |
| BANK_ACCOUNT_NAME_MISMATCH | `account_name` ไม่ตรงกับชื่อ payee | เตือน (ไม่ reject) — ให้การเงินตรวจสอบก่อนยืนยัน เพราะบางกรณีอาจตรงแต่เขียนคนละรูปแบบ |
| UNVERIFIED_PAYEE_IN_PAYOUT | พยายามรวม Payee ที่ `is_verified = false` เข้า Payout Batch | reject ที่ไฟล์ 17 |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| สร้าง/แก้ไข/ยืนยัน Payee | การเงิน | full |
| ดู Payee ทั้งหมด | บัญชี | read-only |
| ดู Payee ของตัวเอง | ทุก User | own scope |

## 13. Audit Log Requirements

- แก้ไขข้อมูลธนาคาร/Tax ID/Tax Profile ต้อง audit พร้อม before/after เสมอ
- การยืนยัน (verified) ต้องบันทึกว่าใครยืนยันเมื่อไหร่

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/payees | list |
| POST | /api/payees | create |
| PATCH | /api/payees/:id | update (auto reset เป็น unverified ถ้าแก้ field สำคัญ) |
| PATCH | /api/payees/:id/verify | ยืนยัน Payee |

## 15. Acceptance Criteria

- สร้าง Payee ครบทุกประเภท พร้อมผูก Tax Profile ถูกต้อง
- Payee ที่ unverified ไม่สามารถรวมเข้า Payout Batch ได้
- แก้ไขข้อมูลสำคัญแล้ว reset เป็น unverified อัตโนมัติ
- WHT rate ที่ใช้จริงต้องดึงจาก Payee level ก่อนเสมอ ไม่ใช่ Plan level (ยกเว้นไม่มี Tax Profile ผูกไว้)

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| แก้บัญชีธนาคารแล้วต้องยืนยันใหม่ | แก้ account_number ของ Payee ที่ verified แล้ว | is_verified เปลี่ยนเป็น false อัตโนมัติ |
| รวม unverified payee เข้า payout | พยายามสร้าง Payout Batch ที่มี payee unverified อยู่ในรายการ | reject UNVERIFIED_PAYEE_IN_PAYOUT |
| WHT Priority | Payee มี tax_profile ตั้ง 1% แต่ plan ของทีมตั้ง 3% | ใช้ 1% (Payee level ชนะ) |
| WHT Fallback | Payee ยังไม่มี tax_profile ผูกไว้ | ใช้ WHT rate จาก plan เป็น fallback พร้อมเตือนเจ้าหน้าที่ |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **🔑 WHT Priority: Payee Profile level ชนะ Compensation Plan level เสมอ** — Key Business Rule ที่สำคัญที่สุดของระบบการเงิน (§6.3) — ใช้ Plan level เป็น fallback เฉพาะเมื่อ Payee ยังไม่มี Tax Profile ผูก
- **Payee ≠ User** — Payee คือ identity ทางการเงิน/ภาษี แยกจากบัญชี login (§6.1)
- **Payee ที่ unverified ห้ามรวมเข้า Payout Batch เด็ดขาด** (§6.2, §10, §11)
- **แก้ไขข้อมูลธนาคาร/ภาษีของ Payee ที่ verified แล้ว auto reset เป็น unverified** ต้องยืนยันใหม่เสมอ (§9)
- **เติม `payee_type` และ `id_document_url` เข้า schema** ที่ขาดหายไปจากเดิม — ไม่ใช่การเปลี่ยน design เพราะ business requirement นี้มีอยู่แล้วในไฟล์นี้ตั้งแต่ v1 (§7.1)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — เอกสารแนบยืนยันตัวตนทำเป็นค่าตั้งค่า `require_payee_id_document` ในไฟล์ 13 ให้เปิด/ปิดบังคับได้ (ค่าเริ่มต้น false)

---

*เอกสารนี้เป็นไฟล์ที่ 5 ในหมวด Finance Core (14–21) ต่อจาก `17-payroll-and-payout.md` และก่อน `19-revenue-billing-receivable.md`*
