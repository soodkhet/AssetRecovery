# 10-finance-companies.md

# 10 — Finance Companies (บริษัทไฟแนนซ์คู่ค้า)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — แก้ไขจุด snapshot timing)
> Document Level: Settings Module
> เอกสารอ้างอิง: `38-case-submission.md`, `12-service-fee.md`, `19-revenue-billing-receivable.md`, `31-accounting-sales-and-receipts.md`, `02-database-schema-design.md` §6 (cases table)
> **หมายเหตุสำคัญ (คงจากต้นฉบับ)**: เนื้อหานี้เขียนโดย Claude ตามคำขอของ Product Owner ที่ไม่ทราบรายละเอียดเงื่อนไขบัญชี-การเงินเชิงลึก — ใช้มาตรฐานบัญชี/ภาษีไทยทั่วไปเป็นฐาน แต่ **ต้องให้นักบัญชี/สำนักงานบัญชีที่จะใช้งานจริงตรวจทานก่อน implement จริง** จุดที่เป็นข้อสันนิษฐานจะระบุไว้ชัดเจนด้วย 🔶

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — โครงสร้างหลักบริษัทไฟแนนซ์ + Service Fee Template snapshot pattern |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + **แก้ไข §9.2**: ข้อความเดิมระบุว่า snapshot เกิด "เมื่อสร้างเคสใหม่" แต่ตรวจสอบกับ `38-case-submission.md` (กฎ `CASE_LOCKED_AFTER_APPROVAL`, `edit_case` แก้ได้เฉพาะก่อน approved) และ comment ใน `02-database-schema-design.md` cases table ("snapshot ตอน approved") แล้วพบว่า **snapshot ตัวจริงต้องเกิดตอนเคส `approved` ไม่ใช่ตอนสร้าง** เพราะก่อนหน้านั้นเคสยังแก้ไขได้ (draft/pending_review/need_info) ตัวเลขที่แสดงตอนสร้างเป็นแค่ `projected_revenue_amount` (ค่าประมาณการ ไม่ใช่ snapshot จริง) — แก้ไขให้ตรงกับหลักฐานทั้งสองแหล่งแล้ว |

ขอบเขตเอกสารนี้: จัดการข้อมูลบริษัทไฟแนนซ์ที่เป็นคู่ค้าส่งเคสมาให้ AssetRecovery ติดตามทรัพย์ รวมถึงข้อมูลผู้ติดต่อ ผู้มีอำนาจลงนาม และการผูก Service Fee Template

**ไม่รวมอยู่ในไฟล์นี้**: Service Fee Template logic เชิงคำนวณ (ดู `12-service-fee.md` + `22-finance-calculation-spec.md`), การคำนวณรายได้จริงต่อเคส (ดู `19-revenue-billing-receivable.md`), Workflow รับเคส/อนุมัติเคส (ดู `38-case-submission.md`)

---

## 1. Summary

จัดการข้อมูลบริษัทไฟแนนซ์ที่เป็นคู่ค้าส่งเคสมาให้ AssetRecovery ติดตามทรัพย์ รวมถึงข้อมูลผู้ติดต่อ ผู้มีอำนาจลงนาม และการผูก Service Fee Template (กติกาค่าบริการที่เรียกเก็บจากบริษัทนั้น)

## 2. Purpose

เป็นฐานข้อมูลหลักของฝั่งรายรับ (AR) — ทุกเคสที่เข้าระบบ (ไฟล์ 38) ต้องผูกกับ Finance Company หนึ่งราย และทุกรายได้ (ไฟล์ 19/31) ต้องคำนวณจาก Service Fee Template ที่บริษัทนั้นผูกไว้

## 3. In Scope

- CRUD ข้อมูลบริษัทไฟแนนซ์: ชื่อ, เลขประจำตัวผู้เสียภาษี, ที่อยู่, ผู้ติดต่อ, ผู้มีอำนาจลงนาม
- ผูก Service Fee Template ของบริษัท (1 บริษัท ผูกได้ 1 template ที่ active ในขณะนั้น — ดู §9 versioning)
- สถานะบริษัท: `active` / `suspended`
- บัญชีผู้ใช้งานฝั่งบริษัทไฟแนนซ์ (company user) ที่เข้าระบบมาดูสถานะเคสของตัวเองได้

## 4. Out of Scope

- Service Fee Template logic เชิงคำนวณ (อยู่ไฟล์ 12 + 22)
- การคำนวณรายได้จริงต่อเคส (อยู่ไฟล์ 19/31)
- Workflow รับเคส/อนุมัติเคส (อยู่ไฟล์ 38)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| Superadmin only | สร้าง/แก้ไข/ระงับบริษัทไฟแนนซ์, ผูก Service Fee Template | Global |
| การเงิน (Finance) | ดูข้อมูลบริษัทเพื่ออ้างอิงตอนวางบิล/ตรวจรายได้ | Read-only |
| บัญชี (Accounting) | ดูข้อมูลบริษัทเพื่ออ้างอิงตอนออกใบกำกับภาษี/ใบเสร็จ | Read-only |
| บริษัทไฟแนนซ์ (company user) | ดูสถานะเคสของบริษัทตัวเอง, ดูข้อมูลบริษัทตัวเอง (แก้ไขเองไม่ได้ — ต้องแจ้ง Admin) | Own company scope |

## 6. Core Concepts

| Concept | Meaning | Implementation Notes |
|---|---|---|
| Finance Company | นิติบุคคลคู่ค้าที่ส่งเคสมาติดตาม | 1 บริษัท = 1 เลขประจำตัวผู้เสียภาษี ห้ามซ้ำ |
| Service Fee Template Snapshot | ค่าบริการที่ใช้คำนวณรายได้ **ณ ขณะที่เคสได้รับอนุมัติ (approved)** | เคสเก่าใช้ template เวอร์ชันที่ผูกไว้ ณ ตอนอนุมัติเคส แม้ template จะถูกแก้ไขทีหลัง (ดู §9.2 ที่แก้ไขแล้ว) |
| Signer (ผู้มีอำนาจลงนาม) | ผู้ลงนามในสัญญา/เอกสารสำคัญฝั่งบริษัทไฟแนนซ์ | เพื่ออ้างอิงตอนออกเอกสารทางการ ไม่ใช่ user login |

## 7. Data Entities / Required Objects

### 7.1 Finance Company

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | รหัสบริษัท |
| name | string | yes | ชื่อนิติบุคคลเต็ม (เช่น "บริษัท สยามไฟแนนซ์ จำกัด") |
| tax_id | string(13) | yes | เลขประจำตัวผู้เสียภาษีนิติบุคคล 13 หลัก 🔶 — ตามกรมสรรพากร นิติบุคคลไทยใช้เลขทะเบียนนิติบุคคล 13 หลักที่ออกโดยกรมพัฒนาธุรกิจการค้าเป็นเลขประจำตัวผู้เสียภาษี ไม่มี checksum algorithm สาธารณะ จึง validate แค่รูปแบบ "ตัวเลข 13 หลักเท่านั้น" ไม่ทำ checksum |
| address | text | yes | ที่อยู่ตามที่จดทะเบียน (ใช้ออกเอกสารทางการ/ใบกำกับภาษี) |
| phone | string | yes | เบอร์โทรสำนักงาน |
| contact_name | string | yes | ชื่อผู้ติดต่อประจำวัน (ผู้ประสานงานเคส) |
| contact_phone | string | yes | เบอร์โทรผู้ติดต่อ |
| signer_name | string | yes | ชื่อผู้มีอำนาจลงนาม |
| signer_phone | string | no | เบอร์โทรผู้ลงนาม |
| service_fee_template_id | uuid | yes | Template ที่ผูกอยู่ปัจจุบัน (ดูไฟล์ 12) |
| vat_registered | boolean | yes | บริษัทไฟแนนซ์จด VAT หรือไม่ — กระทบว่าใบกำกับภาษีที่ AssetRecovery ออกให้ต้องระบุ VAT แยกหรือไม่ (ดูไฟล์ 19 §6) |
| default_invoice_delivery_format | enum | yes | `e_tax_invoice` / `paper_pdf` — ค่าเริ่มต้นเมื่อออกใบกำกับภาษีให้บริษัทนี้ (เลือกเปลี่ยนต่อใบได้ทีหลัง ดูไฟล์ 31 §6.2) |
| status | enum | yes | `active` / `suspended` (ดู §9 state machine) |
| suspended_reason | string \| null | — | เหตุผลที่ระงับ — บังคับกรอกเมื่อเปลี่ยนเป็น `suspended` |
| created_at, updated_at | timestamptz | yes | — |

### 7.2 Company User (บัญชีผู้ใช้ฝั่งบริษัทไฟแนนซ์)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| company_id | uuid | yes | ผูกกับ Finance Company |
| name | string | yes | — |
| email | string | yes | ใช้ login |
| phone | string | no | — |
| status | enum | yes | `active` / `deactivated` |

## 8. UI / UX Rules

อ้างอิงจาก `settings.html` (`renderCompaniesContent`):

- แสดงเป็น **card list** (ไม่ใช่ table) — 1 การ์ดต่อบริษัท เรียงจาก active ก่อน suspended
- แต่ละการ์ดแสดง: ชื่อบริษัท, Tax ID (font mono), badge สถานะ (Active สีเขียว / Suspended สีแดง) มุมขวาบน
- Grid 2 คอลัมน์ (responsive → 4 คอลัมน์บนจอใหญ่) แสดง: ผู้ติดต่อบริษัท+เบอร์, ผู้ลงนามสัญญา+เบอร์, เทมเพลตค่าบริการที่ผูกอยู่ (ชื่อ + model แบบ badge)
- แถบล่างการ์ด: จำนวนเคสทั้งหมด, จำนวนบัญชีผู้ใช้ฝั่งบริษัท, ปุ่ม "แก้ไขบริษัท"
- ด้านบน: ช่องค้นหา (ชื่อบริษัท หรือ Tax ID) + filter สถานะ (ทั้งหมด/Active/Suspended)
- ปุ่ม "สร้างบริษัท" มุมขวาบนของหน้า

## 9. Workflow / Lifecycle

### 9.1 สร้างบริษัทใหม่

`สร้างบริษัท → กรอกข้อมูล + ผูก Service Fee Template เริ่มต้น → status = active → (ไม่บังคับ) สร้าง Company User`

### 9.2 Service Fee Template Snapshot (แก้ไขแล้ว — ดู Changelog v2)

ระหว่างเคสยังอยู่สถานะ `draft` / `pending_review` / `need_info` (ยังแก้ไขได้ตาม `38-case-submission.md`) ระบบคำนวณแค่ `projected_revenue_amount` เป็น**ค่าประมาณการ** จาก Service Fee Template ปัจจุบันของบริษัท — **ยังไม่ snapshot ตัวเลขจริง**

เมื่อเคส**ได้รับอนุมัติ (status → `approved`)** ระบบต้อง **snapshot ตัวเลขจริง** (`model`, `base`, `rate`, `basis`) จาก Service Fee Template ที่ผูกกับบริษัทไฟแนนซ์ ณ ขณะนั้น **ลงไปเก็บที่ตัวเคสโดยตรง** (field `service_fee_model_snapshot`, `service_fee_base_satang`, `service_fee_rate_pct`, `service_fee_basis_snapshot` ตาม `02-database-schema-design.md` §6) ไม่ใช่แค่เก็บ `template_id` ไว้อ้างอิง เพื่อให้:

- เคสเก่าไม่ถูกกระทบหากบริษัทเปลี่ยน Service Fee Template ทีหลัง (เจรจาสัญญาใหม่)
- มี audit trail ชัดเจนว่าเคสนั้นใช้เงื่อนไขอะไรคำนวณรายได้ ณ ตอนที่อนุมัติ
- ไฟล์ 19/31 (Revenue/Billing) คำนวณรายได้จากตัวเลขที่ snapshot ไว้ที่เคส ไม่ต้อง join ไปดู template สดทุกครั้ง
- สอดคล้องกับกฎ immutability ของเคสหลัง approved (`CASE_LOCKED_AFTER_APPROVAL` ตามไฟล์ 38) — เคสแก้ไขไม่ได้แล้วหลังจุดนี้ จึง snapshot ตอนนี้แม่นยำที่สุด ไม่ใช่ตอนสร้างที่ข้อมูลยังเปลี่ยนได้

### 9.3 ระงับ/เปิดใช้งานบริษัท

`active → suspended` (ต้องระบุเหตุผล) — เคสที่เปิดอยู่ก่อนระงับยังดำเนินต่อตามปกติ แต่**ห้ามรับเคสใหม่จากบริษัทที่ suspended** (validation ที่ไฟล์ 38 ตอนสร้างเคส)

`suspended → active` — เปิดใช้งานกลับได้ตลอด ไม่มีเงื่อนไขพิเศษ

## 10. Security / Control Rules

- `tax_id` ต้องไม่ซ้ำกันระหว่างบริษัท — เตือนทันทีที่กรอกซ้ำ (ก่อน submit)
- เปลี่ยน `signer_name`, `service_fee_template_id`, หรือ `status` ต้องบันทึก audit log พร้อมเหตุผลเสมอ (กระทบเอกสารทางการ/เงิน)
- Company User เห็นได้แค่ข้อมูลเคสของบริษัทตัวเอง (row-level scope ผ่าน `company_id`)

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| REQUIRED_MISSING | ฟิลด์บังคับไม่ครบ | inline error ใต้ฟิลด์ |
| DUPLICATE_TAX_ID | `tax_id` ซ้ำกับบริษัทอื่น (ที่ยังไม่ลบ) | reject พร้อมชื่อบริษัทที่ซ้ำ |
| INVALID_TAX_ID_FORMAT | `tax_id` ไม่ใช่ตัวเลข 13 หลัก | reject พร้อมข้อความ "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก" |
| SUSPEND_REASON_REQUIRED | เปลี่ยนเป็น `suspended` แต่ไม่กรอกเหตุผล | reject |
| SUSPENDED_COMPANY_NEW_CASE | พยายามสร้างเคสใหม่จากบริษัทที่ `suspended` | reject ที่ไฟล์ 38 พร้อมข้อความแจ้งให้เปิดใช้งานบริษัทก่อน |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| สร้าง/แก้ไข/ระงับบริษัท | Superadmin only | full |
| ผูก/เปลี่ยน Service Fee Template | Superadmin only | ต้อง audit |
| ดูรายการบริษัททั้งหมด | การเงิน, บัญชี, ผู้จัดการ | read-only |
| สร้าง/แก้ไข Company User | Superadmin only | full |
| ดูข้อมูลบริษัทตัวเอง | Company User | เฉพาะ `company_id` ตัวเอง read-only |

## 13. Audit Log Requirements

- ทุก mutation บันทึก `actor_id`, `role`, `action`, `target_type`, `target_id`, `before`, `after`, `reason`, `created_at`
- การเปลี่ยน `service_fee_template_id`, `status`, `signer_name` ต้องมี `reason` บังคับเสมอ
- Audit log ห้ามแก้ไขย้อนหลัง

## 14. API / Integration Draft

| Method | Endpoint | Purpose | Notes |
|---|---|---|---|
| GET | /api/finance-companies | list (filter: search, status) | ตาม permission |
| GET | /api/finance-companies/:id | detail | — |
| POST | /api/finance-companies | create | audit required |
| PATCH | /api/finance-companies/:id | update (ทุกฟิลด์ รวม status) | audit required, reason required สำหรับฟิลด์สำคัญ |
| GET | /api/finance-companies/:id/users | list company users | — |
| POST | /api/finance-companies/:id/users | create company user | — |
| EVENT | finance-company.suspended | บริษัทถูกระงับ | trigger validation ที่ไฟล์ 38 บล็อกเคสใหม่ |

## 15. Acceptance Criteria

- สร้างบริษัทใหม่ได้ครบทุกฟิลด์บังคับ พร้อม validate tax_id format + duplicate
- ระงับบริษัทแล้วไฟล์ 38 บล็อกการสร้างเคสใหม่จากบริษัทนั้นได้จริง
- เปลี่ยน Service Fee Template แล้วเคสที่ `approved` ไปแล้วก่อนหน้า **ไม่เปลี่ยนยอดรายได้** (snapshot ทำงานถูกต้อง) — เคสที่ยังไม่ approved จะเห็น `projected_revenue_amount` เปลี่ยนตาม template ใหม่ได้ (เพราะยังเป็นแค่ค่าประมาณการ)
- Company User เห็นได้แค่เคสของบริษัทตัวเอง

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| สร้างบริษัทซ้ำ Tax ID | กรอก tax_id ที่มีอยู่แล้ว | reject DUPLICATE_TAX_ID |
| ระงับบริษัทไม่กรอกเหตุผล | เปลี่ยน status เป็น suspended โดยไม่กรอก reason | reject SUSPEND_REASON_REQUIRED |
| สร้างเคสจากบริษัท suspended | ไปที่ไฟล์ 38 เลือกบริษัทที่ suspended | reject SUSPENDED_COMPANY_NEW_CASE |
| เปลี่ยน Template ไม่กระทบเคส approved แล้ว | เปลี่ยน service_fee_template_id ของบริษัท แล้วดูรายได้เคสที่ approved ไปแล้ว | ยอดรายได้เคสเดิมไม่เปลี่ยน (ใช้ snapshot) |
| เปลี่ยน Template กระทบเคสที่ยังไม่ approved | เปลี่ยน template แล้วดูเคสที่ยังเป็น pending_review | `projected_revenue_amount` เปลี่ยนตาม template ใหม่ (ยังเป็นแค่ projection) |
| Company User เห็นเฉพาะของตัวเอง | Login เป็น company user บริษัท A แล้วลองดูเคสบริษัท B | ไม่เห็น/403 |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Service Fee Template Snapshot เกิดตอนเคส `approved` ไม่ใช่ตอนสร้างเคส** (แก้ไขจาก v1 — ดู §9.2) — ยืนยันจากหลักฐาน 2 แหล่งอิสระ: (1) กฎ immutability `CASE_LOCKED_AFTER_APPROVAL` ในไฟล์ 38 (2) comment ใน `02-database-schema-design.md` cases table
- **ก่อน approved เคสแสดงแค่ `projected_revenue_amount` เป็นค่าประมาณการ** เปลี่ยนตาม template ปัจจุบันได้ ไม่ใช่ snapshot จริง (§9.2)
- **1 บริษัท = 1 เลขประจำตัวผู้เสียภาษี ห้ามซ้ำเด็ดขาด** (§6, §11 DUPLICATE_TAX_ID)
- **สร้าง/แก้ไข/ระงับบริษัท และผูก Service Fee Template — Superadmin เท่านั้น** ไม่มี role อื่นทำได้ (§5, §12)
- **บริษัท suspended ห้ามรับเคสใหม่ แต่เคสเก่าที่เปิดอยู่ไม่ถูกกระทบ** (§9.3)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- 🔶 tax_id validation เป็นแค่ตรวจรูปแบบ 13 หลัก ไม่มี checksum — ควรให้นักบัญชียืนยันว่าเพียงพอหรือไม่
- ยังไม่ได้สัมภาษณ์ Product Owner ในรายละเอียดเพิ่มเติมอื่น — โครงสร้างหลัก (1 บริษัท : 1 เทมเพลต active, snapshot ตัวเลขจริงตอน approved) ได้รับการยืนยัน/แก้ไขให้ถูกต้องแล้วในรอบนี้

---

*เอกสารนี้เป็นไฟล์ที่ 4 ในหมวด Settings Module (07–13) ต่อจาก `09-teams.md` และก่อน `11-compensation.md`*
