# 26-finance-data-model.md

# 26 — Finance Data Model (โครงสร้างข้อมูลรวม)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — sync กับ DEC-004)
> Document Level: Finance Reference — เอกสารอ้างอิงเชิงเทคนิค ไม่มีหน้าจอ UI ของตัวเอง
> เอกสารอ้างอิง: สรุปรวม Entity ทั้งหมดจากไฟล์ 10-21, 30-37, `02-database-schema-design.md`, `94-decision-log.md` (DEC-004), `92-platform-data-model.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — Entity list + relationship diagram (ข้อความ), polymorphic reference คำแนะนำเบื้องต้น |
| v1.1 | 02/07/2569 | DEC-004 ปิด: ตัดสินใจใช้ Separate FK columns แทน polymorphic target_type/target_id |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + **แก้ §6.3**: ปรับคำอธิบายจาก "คำแนะนำเชิงเทคนิค" เป็นข้อเท็จจริงที่ implement แล้วจริงใน schema (Separate FK columns ทั้ง Adjustment และ BankTransaction) — ย้าย DEC-004 confirmation จาก Open Items ไป Decisions ให้ถูกหมวด |

ขอบเขตเอกสารนี้: รวม Entity และความสัมพันธ์ (relationship) ทั้งหมดของโมดูล Finance/Accounting เป็นแผนภาพเดียว สำหรับออกแบบฐานข้อมูลจริง (Prisma schema)

**ไม่รวมอยู่ในไฟล์นี้**: Field เต็มของแต่ละ entity (ดู `02-database-schema-design.md` เป็น source of truth), Relationship ระดับทั้งระบบ (ดู `92-platform-data-model.md` สำหรับภาพรวมข้าม module)

---

## 1. Summary

รวม Entity และความสัมพันธ์ (relationship) ทั้งหมดของโมดูล Finance/Accounting เป็นแผนภาพเดียว สำหรับออกแบบฐานข้อมูลจริง (Prisma schema)

## 2. Purpose

ให้นักพัฒนาเห็นภาพรวมความสัมพันธ์ระหว่าง entity ก่อนเขียน schema จริง ป้องกัน foreign key ขาดหายหรือออกแบบผิดทิศทาง

## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้)

เอกสารนี้เป็น technical reference ล้วน — ไม่มี Scope/Actor ของตัวเอง

## 6. Entity ทั้งหมดและความสัมพันธ์

### 6.1 รายชื่อ Entity หลัก (อ้างอิงไฟล์ต้นทาง)

| Entity | ไฟล์ต้นทาง | Primary Relationship |
|---|---|---|
| FinanceCompany | 10 | 1 → N ServiceFeeTemplate (ผ่าน FK), 1 → N CompanyUser |
| ServiceFeeTemplate | 12 | N → 1 FinanceCompany (current), snapshot ลงใน Case (ไฟล์ 38) |
| BillingCycle, ApprovalMatrix, BankAccount, TaxProfile, VATRate, CostCenter, TaxInvoiceNumbering, PeriodLockPolicy | 13 | Settings — ไม่มี FK ขาเข้า อ้างอิงจากที่อื่น |
| Revenue | 19 | N → 1 FinanceCompany, N → 1 Case (ไฟล์ 38), N → 1 BillingBatch (nullable) |
| BillingBatch | 19 | 1 → N Revenue, N → 1 FinanceCompany |
| ManualClaim / Expense | 15 (ใช้ entity เดียวกับไฟล์ 41 §6.6) | N → 1 Case (nullable สำหรับ manual), N → 1 Payee |
| Advance | 15 | N → 1 Payee (requester) |
| PayoutBatch | 17 | 1 → N PayoutBatchItem |
| PayoutBatchItem | 17 | N → 1 PayoutBatch, N → 1 Payee, N → 1 Expense (source) |
| PayeeProfile | 18 | N → 1 User, N → 1 TaxProfile |
| Adjustment | 20 | N → 1 (Revenue/Expense/BillingBatch/PayoutBatch) ผ่าน **Separate FK columns** (`revenue_id`/`expense_id`/`billing_batch_id`/`payout_batch_id`) |
| AccountingPeriod | 30 | 1 → N Exception, ครอบทุก entity ทางอ้อมผ่านวันที่ |
| SalesRecord | 31 | 1:1 BillingBatch |
| TaxInvoice | 31 | N → 1 SalesRecord |
| CashReceipt | 31 | N → 1 BillingBatch, N → 1 BankTransaction |
| ExpenseRecord (accounting view) | 32 | 1:1 PayoutBatchItem, N → 1 CostCenter |
| WHTCertificate | 33 | N → 1 PayeeProfile, N → 1 ExpenseRecord |
| WHTFilingPeriodSummary | 33 | 1 → N WHTCertificate (aggregate ตามเดือน) |
| Exception | 34 | N → 1 AccountingPeriod, polymorphic reference ไปยังรายการต้นทาง (free text, ดู §6.3) |
| AuthorizedException | 34 | N → 1 Exception |
| BankTransaction | 35 | N → 1 BankAccount, **Separate FK columns** (`matched_billing_id`/`matched_payout_id`) กับ BillingBatch/PayoutBatch |
| AccountantQuestion | 36 | N → 1 AccountingPeriod |
| ExportRecord | 37 | N → 1 AccountingPeriod |

### 6.2 แผนภาพความสัมพันธ์ (ภาพรวมเชิงข้อความ)

```
FinanceCompany ──┬── ServiceFeeTemplate (current)
                  └── CompanyUser
                  └── Revenue ──── BillingBatch ──┬── SalesRecord ── TaxInvoice
                                                    └── CashReceipt ── BankTransaction

Case (ไฟล์ 38) ──┬── Revenue (snapshot service fee)
                  └── Expense/Claim ── PayoutBatchItem ── PayoutBatch
                                            │
                                       PayeeProfile ── TaxProfile
                                            │
                                       WHTCertificate ── WHTFilingPeriodSummary

AccountingPeriod ──┬── Exception ── AuthorizedException
                    ├── ExportRecord
                    └── AccountantQuestion

Adjustment ── (Separate FK, ดู §6.3) ── Revenue / ExpenseRecord / BillingBatch / PayoutBatch
```

### 6.3 Polymorphic References (แก้ไขแล้ว — implement จริงตาม DEC-004)

หลาย entity **เคย**วางแผนใช้ `target_type` + `target_id` แบบ polymorphic แต่หลัง DEC-004 (02/07/2569) **เปลี่ยนมาใช้ Separate FK columns ทั้งหมดแล้วจริงใน schema**:

- **Adjustment** (ไฟล์ 20): ใช้ column แยก `revenue_id`, `expense_id`, `billing_batch_id`, `payout_batch_id` (nullable ทั้งหมด) + DB CHECK constraint บังคับว่าต้องมีค่า **เพียง 1 column** ที่ไม่ null ต่อ 1 record
- **Exception** (ไฟล์ 34): ยังคงใช้ `source_reference` (free text) — **ไม่ใช่ strict FK** เพราะ exception อาจไม่ผูกกับ record เฉพาะเจาะจง (เป็นข้อยกเว้นที่ตั้งใจ ไม่ใช่จุดที่ DEC-004 ครอบคลุม)
- **BankTransaction** (ไฟล์ 35): ใช้ column แยก `matched_billing_id`, `matched_payout_id` (nullable ทั้งคู่) + CHECK constraint ว่าไม่ให้ทั้งสอง column มีค่าพร้อมกัน (`matched_billing_id IS NULL OR matched_payout_id IS NULL`)

> **เหตุผล (DEC-004)**: ได้ FK constraint จริงจาก DB ป้องกัน orphan record, Prisma type-safe กว่า discriminator string, query ง่ายกว่า `WHERE claim_id = ?` โดยตรง — ดูเหตุผลเต็มที่ `94-decision-log.md`

## 7-16. (ไม่ใช้กับไฟล์ประเภทนี้)

ดูรายละเอียดเชิง business ของแต่ละ entity ที่ไฟล์ต้นทาง

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **DEC-004 ปิดแล้ว**: Polymorphic relation ทั้งหมดในโมดูล Finance/Accounting ใช้ **Separate FK columns** ไม่ใช่ `target_type`/`target_id` string — ใช้กับ Adjustment และ BankTransaction (§6.3)
- **Exception เป็นข้อยกเว้น** ยังใช้ `source_reference` free text เพราะธรรมชาติของ exception ไม่ผูกกับ record เฉพาะเจาะจงเสมอไป (§6.3)
- **Entity list นี้เป็น index รวม ไม่ duplicate field detail** — field เต็มอยู่ที่ `02-database-schema-design.md` เท่านั้น (สอดคล้องหลักการเดียวกับ `92-platform-data-model.md`)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — DEC-004 ปิดแล้วและ implement จริงใน schema ครบทั้ง Adjustment และ BankTransaction

---

*เอกสารนี้เป็นไฟล์ที่ 5 ในหมวด Finance Reference (22–29) ต่อจาก `25-finance-permission-matrix.md` และก่อน `27-finance-api-contracts.md`*
