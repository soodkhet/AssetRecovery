# 33-accounting-wht-data.md

# 33 — Accounting: WHT Data (ข้อมูลหัก ณ ที่จ่ายและหนังสือรับรอง)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Accounting Module
> เอกสารอ้างอิง: `17-payroll-and-payout.md`, `13-accounting-finance-settings.md` §6.4, `18-payee-and-tax-profile.md`, `32-accounting-expenses-payments.md`, `02-database-schema-design.md` §9 (wht_certificates, wht_filing_summaries table), `31-accounting-sales-and-receipts.md` (pattern เดียวกันสำหรับ delivery_format)
> 🔶 ดูหมายเหตุสำคัญเรื่องการตรวจทานโดยนักบัญชีในไฟล์ 10 — ใช้กับไฟล์นี้เช่นกัน โดยเฉพาะกำหนดเวลานำส่งภาษีที่มีโทษปรับจริงหากพลาด

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — WHT Certificate (ใบ 50 ทวิ), ภ.ง.ด.3/53, due date countdown |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — ตรวจสอบ enum `wht_filing_status` เทียบกับ `02-database-schema-design.md` แล้ว **ตรงกันทุกตัว ไม่พบ conflict** (ยืนยันตามที่บันทึกไว้แล้วใน `23-finance-state-machines.md` §6.11) — **เนื้อหา business logic เดิมคงไว้ครบ** |
| v3 | 04/07/2569 | **Batch 6 (DEC-006/D4) — เติมกลไกยกเลิกหนังสือรับรองให้ครบวงจร**: §10 เดิมกำหนดว่า "ผิดต้องออกใหม่พร้อมอ้างอิงยกเลิกฉบับเดิม" แต่ schema ไม่มี field รองรับ — เพิ่ม `status` (`active`/`cancelled`), `cancel_reason`, `replaces_certificate_id` (§7.1), endpoint cancel (§14), validation `WHT_CANCEL_REQUIRES_REASON` (§11), workflow (§9), test case (§16) — sync `02` v3.5 (รวมแก้ `delivery_format` TEXT → enum) และไฟล์ 24/27 แล้ว — หลักการเดียวกับ Tax Invoice ไฟล์ 31 |

ขอบเขตเอกสารนี้: สรุปข้อมูลภาษีหัก ณ ที่จ่ายทั้งหมดที่เกิดจากการจ่ายเงิน (ไฟล์ 17/32) พร้อมออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ) ให้ผู้ถูกหัก และเตรียมข้อมูลสำหรับยื่นแบบ ภ.ง.ด.3/53 ส่งกรมสรรพากร

**ไม่รวมอยู่ในไฟล์นี้**: การยื่นแบบจริงต่อกรมสรรพากร (ทำนอกระบบ/ผ่านสำนักงานบัญชี — ระบบแค่เตรียมข้อมูลให้), การคำนวณ WHT เริ่มต้น (เกิดที่ไฟล์ 17 ตาม Tax Profile ไฟล์ 13/18)

---

## 1. Summary

สรุปข้อมูลภาษีหัก ณ ที่จ่ายทั้งหมดที่เกิดจากการจ่ายเงิน (ไฟล์ 17/32) พร้อมออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ) ให้ผู้ถูกหัก และเตรียมข้อมูลสำหรับยื่นแบบ ภ.ง.ด.3/53 ส่งกรมสรรพากร

## 2. Purpose

ให้บัญชี/สำนักงานบัญชีมีข้อมูลครบสำหรับการยื่นภาษีหัก ณ ที่จ่ายรายเดือน และให้ผู้ถูกหักภาษี (Payee) ได้รับหนังสือรับรองที่ถูกต้องตามกฎหมาย

## 3. In Scope

- สรุปข้อมูล WHT ต่อรอบเดือน แยกตามประเภทผู้รับ (บุคคลธรรมดา/นิติบุคคล)
- ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ)
- เตือนกำหนดเวลานำส่งภาษี (ภ.ง.ด.3/53)

## 4. Out of Scope

- การยื่นแบบจริงต่อกรมสรรพากร (ทำนอกระบบ/ผ่านสำนักงานบัญชี — ระบบแค่เตรียมข้อมูลให้)
- การคำนวณ WHT เริ่มต้น (เกิดที่ไฟล์ 17 ตาม Tax Profile ไฟล์ 13/18)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| บัญชี (Accounting) | สรุปข้อมูล WHT, ออกหนังสือรับรอง, เตรียมข้อมูลส่งสำนักงานบัญชี | Full |

## 6. Core Concepts

### 6.1 WHT Summary (สรุปข้อมูลหัก ณ ที่จ่ายรอนำส่ง)

รวมรายการ WHT ทั้งหมดของรอบเดือน แยกตาม:

- **ภ.ง.ด.3**: ผู้ถูกหักเป็นบุคคลธรรมดา
- **ภ.ง.ด.53**: ผู้ถูกหักเป็นนิติบุคคล

### 6.2 กำหนดเวลานำส่งภาษี 🔶 มีโทษปรับจริงหากพลาด — ต้องเตือนให้ชัดเจน

ตามกฎหมาย ภาษีหัก ณ ที่จ่ายของเดือนใด ต้องนำส่งภายในวันที่ 7 ของเดือนถัดไป (ยื่นแบบกระดาษ) หรือขยายได้ถึงวันที่ 15 ถ้ายื่นผ่านอินเทอร์เน็ต — ปัจจุบันกรมสรรพากรผลักดันให้ยื่นแบบอิเล็กทรอนิกส์เพื่อป้องกันการปลอมแปลงหนังสือรับรอง — ระบบต้องคำนวณ due date อัตโนมัติจากเดือนที่จ่ายเงินจริง และแสดง countdown/เตือนล่วงหน้าก่อนถึงกำหนด

### 6.3 หนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ)

ออกให้ผู้ถูกหักทุกราย — ต้องมีข้อมูลครบตามที่กฎหมายกำหนด (ผู้จ่าย, ผู้ถูกหัก, ประเภทเงินได้, วันที่จ่าย, จำนวนเงินที่จ่าย, ภาษีที่หัก) — ออกได้ทั้งกระดาษและอิเล็กทรอนิกส์ (สอดคล้องกับนโยบาย e-Withholding Tax ที่กรมสรรพากรผลักดัน)

## 7. Data Entities / Required Objects

### 7.1 WHT Certificate (หนังสือรับรองหัก ณ ที่จ่าย)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| certificate_number | string | yes | เลขที่หนังสือรับรอง — running number |
| payee_id | uuid | yes | ผู้ถูกหัก (อ้างอิงไฟล์ 18) |
| expense_record_id | uuid | yes | อ้างอิงรายการจ่ายต้นทาง (ไฟล์ 32) |
| income_type | string | yes | ประเภทเงินได้ตามมาตรา (เช่น "ค่าจ้างทำของ มาตรา 40(8)") |
| payment_date | date | yes | — |
| gross_amount | decimal | yes | — |
| wht_amount | decimal | yes | — |
| filing_form | enum | yes | `PND3` (บุคคลธรรมดา) / `PND53` (นิติบุคคล) |
| delivery_format | enum | yes | `e_withholding` / `paper` — สอดคล้องกับ pattern เดียวกันที่ไฟล์ 31 ใช้กับใบกำกับภาษี (schema: enum `wht_delivery_format`) |
| status | enum | yes | `active` (ออกแล้วใช้งานอยู่) / `cancelled` (ยกเลิก, terminal — ห้ามลบ) — เพิ่ม 04/07/2569 DEC-006/D4 |
| cancel_reason | string \| null | conditional | บังคับกรอกเมื่อ status = `cancelled` (WHT_CANCEL_REQUIRES_REASON) |
| replaces_certificate_id | uuid \| null | — | ใบใหม่ที่ออกแทน อ้างอิงกลับมาที่ฉบับที่ถูกยกเลิก — trace ได้สองทาง |

### 7.2 WHT Filing Period Summary

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| period | string | yes | รอบเดือนที่จ่ายเงิน |
| filing_due_date | date | yes | คำนวณอัตโนมัติ: วันที่ 7 ของเดือนถัดไป (กระดาษ) หรือวันที่ 15 (อิเล็กทรอนิกส์) — ใช้ค่าหลังเป็น default เพราะสนับสนุนทิศทางของกรมสรรพากร |
| pnd3_total, pnd53_total | decimal | yes | ยอดรวม WHT แยกตามแบบ |
| status | enum | yes | `pending` / `filed` (บัญชี mark เองว่ายื่นแล้วนอกระบบ) |

## 8. UI / UX Rules

อ้างอิงจาก `accounting.html` (`wht_docs` tab):

- Table: ผู้ถูกหัก, Tax ID, ประเภทเงินได้, ฐานหัก, ยอด WHT, อ้างอิง (เช่น payout batch), ปุ่ม "หนังสือรับรอง"
- แสดง countdown/banner เตือนกำหนดเวลานำส่งภาษีเด่นชัดด้านบนหน้า (เช่น "เหลือ 5 วันก่อนกำหนดนำส่ง ภ.ง.ด.3/53 ของเดือนนี้")

## 9. Workflow / Lifecycle

`Payout Batch completed (ไฟล์ 17) → สร้าง WHT Certificate อัตโนมัติต่อรายการ (status = active) → รวมเป็น WHT Filing Period Summary ต่อเดือน → บัญชีดาวน์โหลด/ส่งหนังสือรับรองให้ผู้ถูกหัก → ยื่นแบบจริงนอกระบบ → mark status = filed`

**ยกเลิกหนังสือรับรอง (เพิ่ม 04/07/2569 — DEC-006/D4)**: `พบข้อผิดพลาดในใบที่ออกแล้ว → บัญชีกด "ยกเลิก" กรอก cancel_reason บังคับ → status: cancelled (terminal — ยอดใบนี้ไม่ถูกนับใน pnd3_total/pnd53_total อีก) → ออกใบใหม่ตาม flow ปกติ พร้อม replaces_certificate_id ชี้กลับฉบับเดิม`

## 10. Security / Control Rules

- WHT Certificate ที่ออกแล้วห้ามแก้ไขยอด — ถ้าผิดต้อง **ยกเลิก (`active → cancelled` พร้อม cancel_reason)** แล้วออกใบใหม่ที่อ้าง `replaces_certificate_id` กลับฉบับเดิม (เหมือนหลักการเดียวกับใบกำกับภาษีไฟล์ 31)
- ใบที่ `cancelled` ห้ามลบและห้าม reverse (Immutable Rule ไฟล์ 02 §13) — ยอดของใบที่ยกเลิกต้องไม่ถูกนับรวมใน Filing Summary

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| FILING_OVERDUE_WARNING | วันนี้เลย `filing_due_date` แล้วแต่ status ยังเป็น `pending` | แสดง warning เด่นชัด (ไม่ block การทำงาน แต่เตือนเรื่องโทษปรับ) |
| WHT_CANCEL_REQUIRES_REASON | ยกเลิกหนังสือรับรองโดยไม่กรอก `cancel_reason` | reject (เพิ่ม 04/07/2569 — DEC-006/D4) |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| ออกหนังสือรับรอง, mark filed | บัญชี | full |
| ดูทั้งหมด | การเงิน | read-only |

## 13. Audit Log Requirements

- ออกหนังสือรับรองทุกฉบับต้อง audit

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/accounting/wht-certificates | list |
| PATCH | /api/accounting/wht-certificates/:id/cancel | ยกเลิกหนังสือรับรอง (ต้องมี cancel_reason) — เพิ่ม 04/07/2569 DEC-006/D4 |
| GET | /api/accounting/wht-filing-summary | สรุปต่อรอบเดือน |
| PATCH | /api/accounting/wht-filing-summary/:id/mark-filed | mark ว่ายื่นแล้ว |

## 15. Acceptance Criteria

- WHT Certificate สร้างอัตโนมัติถูกต้องจาก Payout Batch ที่ completed
- คำนวณ filing_due_date ถูกต้องตามกฎหมาย พร้อมเตือนล่วงหน้า

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| เลยกำหนดนำส่ง | วันนี้เลย filing_due_date แล้ว status ยัง pending | แสดง FILING_OVERDUE_WARNING |
| แยกแบบถูกประเภท | มี payee ทั้งบุคคลธรรมดาและนิติบุคคลในรอบเดียวกัน | แยกยอด pnd3_total/pnd53_total ถูกต้อง |
| ยกเลิกไม่กรอกเหตุผล | กดยกเลิกหนังสือรับรองโดยไม่กรอก cancel_reason | reject WHT_CANCEL_REQUIRES_REASON |
| ยอดใบยกเลิกไม่ถูกนับ | ยกเลิกใบรับรอง 1 ฉบับแล้วดู Filing Summary | pnd3_total/pnd53_total ไม่รวมยอดของใบที่ cancelled |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **WHT Certificate สร้างอัตโนมัติจาก Payout Batch ที่ `completed` เท่านั้น** — 1 รายการจ่าย = 1 ใบรับรอง (§9)
- **filing_due_date ใช้ default วันที่ 15 (อิเล็กทรอนิกส์)** สนับสนุนทิศทางกรมสรรพากร ไม่ใช่วันที่ 7 (กระดาษ) (§7.2)
- **WHT Certificate ออกแล้วห้ามแก้ไขยอด** — ต้องออกใหม่พร้อมอ้างอิงยกเลิกฉบับเดิม เหมือนหลักการเดียวกับ Tax Invoice (§10)
- **FILING_OVERDUE เป็น warning ไม่ใช่ block** — เตือนเรื่องโทษปรับแต่ไม่หยุดการทำงาน (§11)
- **WHT Certificate ใช้ status model `active`/`cancelled` + `replaces_certificate_id`** — หลักการเดียวกับ Tax Invoice, ยอดใบยกเลิกไม่นับใน Filing Summary (DEC-006/D4, 04/07/2569)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ยังไม่ได้สัมภาษณ์ว่า AssetRecovery จะยื่น e-Withholding Tax ผ่านระบบธนาคารหรือยื่นตรงกับกรมสรรพากร — กระทบ field/integration เพิ่มเติมถ้าต้อง automate การยื่นจริง (ปัจจุบันออกแบบไว้แค่เตรียมข้อมูล ไม่ automate การยื่นจริง)

---

*เอกสารนี้เป็นไฟล์ที่ 4 ในหมวด Accounting Module (30–37) ต่อจาก `32-accounting-expenses-payments.md` และก่อน `34-accounting-document-checklist-exceptions.md`*
