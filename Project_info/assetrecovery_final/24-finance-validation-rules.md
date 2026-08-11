# 24-finance-validation-rules.md

# 24 — Finance Validation Rules (กฎตรวจสอบรวมทั้งระบบ)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — sync กับ Batch 3)
> Document Level: Finance Reference — เอกสารอ้างอิงเชิงเทคนิค ไม่มีหน้าจอ UI ของตัวเอง
> เอกสารอ้างอิง: สรุปรวม Validation Error Code ทั้งหมดจากไฟล์ 10, 12, 13, 15, 16, 17, 18, 19, 20, 30, 31, 32, 34, 35

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — รวม Error Code 30 ตัวจาก 14 ไฟล์ |
| v2 | 03/07/2569 | **แก้ไข §6.4**: `ADVANCE_PENDING_SETTLEMENT` เดิมอ้างถึง state `waiting_settlement` ที่ถูกตัดออกแล้ว — แก้ condition ให้ตรงกับ state ใหม่ (`approved`/`overdue`) + เพิ่ม `REJECTION_REASON_REQUIRED` ที่ตกหล่นจากไฟล์ 15 v2 — sync กับ Batch 3 |
| v3 | 04/07/2569 | (1) **ปิด Open Item §18**: ตรวจ error code หมวด §6.8 (ไฟล์ 31/32/33/34) เทียบกับไฟล์ต้นทาง v2 หลัง Batch 5 ครบแล้ว — ตรงกันทุกตัว ไม่พบ conflict (2) **เติม §6.7**: `NOT_READY_BILLING_REVENUE_MISMATCH` — Readiness Check ของไฟล์ 30 §6.2 มี 3 เงื่อนไข แต่เดิมมี error code รองรับแค่ 2 (ขาดเงื่อนไข "ยอดบิลตรงกับรายได้") (3) **อัปเดต §6.4**: `REJECTION_REASON_REQUIRED` ขยาย source ครอบคลุมไฟล์ 20 (ปฏิเสธ Adjustment) — ความหมายเดียวกัน ใช้ code ร่วมกันตาม pattern ของ `REJECT_REASON_REQUIRED` |
| v3.1 | 04/07/2569 | **เติม §6.8**: `WHT_CANCEL_REQUIRES_REASON` ตามไฟล์ 33 v3 (DEC-006/D4 — กลไกยกเลิก WHT Certificate) |

ขอบเขตเอกสารนี้: รวม Error Code และเงื่อนไขการ validate ทั้งหมดของระบบไว้จุดเดียว เพื่อให้ frontend/backend ใช้ code เดียวกันสม่ำเสมอ และนักพัฒนาเช็คได้ว่ามี code ซ้ำ/ขัดแย้งกันหรือไม่

**ไม่รวมอยู่ในไฟล์นี้**: สูตรคำนวณ (ดู `22-finance-calculation-spec.md`), State machine (ดู `23-finance-state-machines.md`)

---

## 1. Summary

รวม Error Code และเงื่อนไขการ validate ทั้งหมดของระบบไว้จุดเดียว เพื่อให้ frontend/backend ใช้ code เดียวกันสม่ำเสมอ และนักพัฒนาเช็คได้ว่ามี code ซ้ำ/ขัดแย้งกันหรือไม่

## 2. Purpose

เป็น error code dictionary กลาง — แต่ละไฟล์ business logic อ้าง code จากที่นี่ ไม่ตั้งชื่อใหม่ซ้ำซ้อนหรือสะกดต่างกัน

## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้)

เอกสารนี้เป็น technical reference ล้วน — ไม่มี Scope/Actor ของตัวเอง

## 6. Validation Rules แยกตามหมวด

### 6.1 หมวดข้อมูลพื้นฐาน (Master Data — ไฟล์ 10, 12, 18)

| Code | Condition | Source File |
|---|---|---|
| REQUIRED_MISSING | ฟิลด์บังคับไม่ครบ (ใช้ร่วมกันทุกฟอร์มในระบบ) | ทุกไฟล์ |
| DUPLICATE_TAX_ID | `tax_id` ซ้ำกับบริษัท/payee อื่นที่มีอยู่ | 10 |
| INVALID_TAX_ID_FORMAT | `tax_id` ไม่ใช่ตัวเลข 13 หลัก | 10, 18 |
| SUSPEND_REASON_REQUIRED | เปลี่ยนบริษัทเป็น suspended โดยไม่กรอกเหตุผล | 10 |
| SUSPENDED_COMPANY_NEW_CASE | พยายามสร้างเคสใหม่จากบริษัทที่ suspended | 10 (บังคับใช้ที่ไฟล์ 38) |
| INVALID_RATE_RANGE | `rate` ของ Service Fee Template ไม่อยู่ระหว่าง 0-100 | 12 |
| TEMPLATE_IN_USE | พยายามปิดใช้งานเทมเพลตที่มีบริษัทผูกอยู่ | 12 |
| BANK_ACCOUNT_NAME_MISMATCH | ชื่อบัญชีธนาคารไม่ตรงกับชื่อ payee (เตือน ไม่ reject) | 18 |

### 6.2 หมวดภาษี/VAT (ไฟล์ 13, 19)

| Code | Condition | Source File |
|---|---|---|
| INVALID_WHT_RATE | `wht_rate` ติดลบหรือมากกว่า 100 | 13 |
| VAT_RATE_OVERLAP | ช่วงเวลา VAT Rate ใหม่ทับกับรายการเดิม | 13 |
| VAT_RATE_NOT_FOUND | ไม่มี vat_rate_history ครอบคลุมวันที่ revenue_date | 19 |

### 6.3 หมวดธนาคาร/ไฟล์ (ไฟล์ 13, 17, 35)

| Code | Condition | Source File |
|---|---|---|
| BANK_FILE_NOT_TESTED | ใช้ bank file format ที่ยังไม่ผ่านทดสอบไปสร้างไฟล์โอนจริง | 13 |
| DUPLICATE_PAYMENT_FILE | สร้างไฟล์โอนซ้ำสำหรับ batch ที่มี idempotency_key อยู่แล้ว (เตือน ไม่ reject ทันที) | 17 |
| MIXED_SIDE_BATCH | พยายามรวมรายการ inhouse และ outsource ในรอบเดียวกัน | 17 |
| MATCH_NOTE_REQUIRED | จับคู่ manual ที่ยอดไม่ตรงเป๊ะ โดยไม่กรอกหมายเหตุ | 35 |
| ALREADY_MATCHED | พยายามจับคู่ transaction ที่ matched ไปแล้ว (เตือน) | 35 |

### 6.4 หมวด Claim/Advance/Approval (ไฟล์ 15, 16) — แก้ไขแล้ว

| Code | Condition | Source File |
|---|---|---|
| ADVANCE_PENDING_SETTLEMENT | ขอ Advance ใหม่ทั้งที่มียอดเดิม **`approved` หรือ `overdue`** ค้างอยู่ (แก้จาก `waiting_settlement` เดิมที่ถูกตัดออก) | 15 |
| USED_EXCEEDS_REQUEST_NO_TOPUP | เคลียร์ยอด Advance ที่ used_amount > requested_amount | 15 |
| REJECTION_REASON_REQUIRED | ปฏิเสธ Advance หรือ Adjustment (`rejected`) โดยไม่กรอก rejection_reason | 15, 20 |
| REJECT_REASON_REQUIRED | กด reject_expense โดยไม่กรอกเหตุผล | 15, 16, 41 |
| APPROVAL_STEP_OUT_OF_ORDER | อนุมัติขั้นที่ยังไม่ถึงตา | 16 |
| SEGREGATION_OF_DUTIES_VIOLATION | ผู้อนุมัติคนเดียวกันอนุมัติซ้ำ 2 ขั้น ขณะ enforce_segregation_of_duties=true | 16 |

### 6.5 หมวด Payout/Payee (ไฟล์ 17, 18)

| Code | Condition | Source File |
|---|---|---|
| UNVERIFIED_PAYEE_IN_PAYOUT | รวม Payee ที่ unverified เข้า Payout Batch | 17, 18 |

### 6.6 หมวด Revenue/Billing (ไฟล์ 19)

| Code | Condition | Source File |
|---|---|---|
| NO_REVENUE_TO_BILL | สร้างรอบวางบิลแต่ไม่มี Revenue ที่ ready_for_billing | 19 |
| EDIT_BILLED_REVENUE | แก้ Revenue ที่ผูก Billing Batch ที่ไม่ใช่ draft แล้ว | 19 |

### 6.7 หมวด Adjustment / Period Lock (ไฟล์ 13, 20, 30)

| Code | Condition | Source File |
|---|---|---|
| PERIOD_LOCKED_DIRECT_EDIT | แก้ source record ตรงขณะรอบบัญชี locked | 13, 30 |
| REASON_REQUIRED | สร้าง Adjustment โดยไม่ระบุเหตุผล | 20 |
| INSUFFICIENT_APPROVAL_LEVEL | อนุมัติ Adjustment ของรายการ locked โดยไม่ใช่ Executive | 20 |
| NOT_READY_CRITICAL_OPEN | ปิดงวดขณะมี critical exception เปิดอยู่ | 30 |
| NOT_READY_RECONCILE_INCOMPLETE | ปิดงวดขณะ Bank Reconcile ยังไม่ครบ 100% | 30 |
| NOT_READY_BILLING_REVENUE_MISMATCH | ปิดงวดขณะยอด Billing Batch ยังไม่ sync ตรงกับ Revenue ของรอบนั้น (เงื่อนไขที่ 3 ของ Readiness Check ไฟล์ 30 §6.2) | 30 |
| UNLOCK_REQUIRES_EXECUTIVE | ปลดล็อกรอบ locked โดยไม่ใช่ Executive | 30 |

### 6.8 หมวดเอกสารทางการ/บัญชี (ไฟล์ 31, 32, 34)

| Code | Condition | Source File |
|---|---|---|
| TAX_INVOICE_FIELD_MISSING | ฟิลด์บังคับของใบกำกับภาษีไม่ครบ | 31 |
| INVOICE_NUMBER_GAP | generate invoice_number ไม่ต่อเนื่อง (ไม่ควรเกิดในทางปฏิบัติ) | 31 |
| CANCEL_REQUIRES_REASON | ยกเลิกใบกำกับภาษีโดยไม่ระบุเหตุผล | 31 |
| EDIT_AMOUNT_DIRECTLY | แก้ยอดเงินตรงในไฟล์ 32 (ต้องผ่าน Adjustment) | 32 |
| COST_CENTER_AUTO_EDIT | แก้ cost_center ของรายการที่ mapping_rule = auto | 32 |
| EXPORT_BLOCKED_CRITICAL | Export Pack ขณะมี critical exception เปิดอยู่ | 34, 37 |
| AUTHORIZED_EXCEPTION_REASON_REQUIRED | สร้าง Authorized Exception โดยไม่กรอกเหตุผล | 34 |
| FILING_OVERDUE_WARNING | เลยกำหนดนำส่งภาษีแต่ยัง pending (เตือน ไม่ block) | 33 |
| WHT_CANCEL_REQUIRES_REASON | ยกเลิก WHT Certificate โดยไม่กรอก cancel_reason | 33 |

## 7. Validation Code Naming Convention

ตรวจสอบแล้วไม่มี code ซ้ำกันข้ามไฟล์ — ใช้ pattern `[ENTITY/CONTEXT]_[CONDITION]` เป็นภาษาอังกฤษตัวพิมพ์ใหญ่ คั่นด้วย underscore เสมอ ทุก code ใหม่ที่เพิ่มทีหลังต้องเช็ค list นี้ก่อนว่าซ้ำหรือไม่

## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้)

ดูรายละเอียดเชิง business ของแต่ละ validation ที่ไฟล์ต้นทาง

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Error code ทุกตัวใช้ pattern `[ENTITY/CONTEXT]_[CONDITION]`** ภาษาอังกฤษตัวพิมพ์ใหญ่ underscore คั่น — ไม่มี code ซ้ำข้ามไฟล์ (§7)
- **ไฟล์นี้เป็น single source of truth ของ error code ทั้งระบบ** — code ใหม่ต้องเช็คที่นี่ก่อนตั้งชื่อ

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — Error code หมวด §6.8 ตรวจสอบกับไฟล์ต้นทาง (31/32/33/34 v2) หลัง Batch 5 ครบแล้วเมื่อ 04/07/2569: `TAX_INVOICE_FIELD_MISSING`/`INVOICE_NUMBER_GAP`/`CANCEL_REQUIRES_REASON` (31 §11), `EDIT_AMOUNT_DIRECTLY`/`COST_CENTER_AUTO_EDIT` (32 §11), `FILING_OVERDUE_WARNING` (33 §11), `EXPORT_BLOCKED_CRITICAL`/`AUTHORIZED_EXCEPTION_REASON_REQUIRED` (34 §11) — ตรงกันทุกตัว (ปิด flag ที่ค้างจาก v2)

---

*เอกสารนี้เป็นไฟล์ที่ 3 ในหมวด Finance Reference (22–29) ต่อจาก `23-finance-state-machines.md` และก่อน `25-finance-permission-matrix.md`*
