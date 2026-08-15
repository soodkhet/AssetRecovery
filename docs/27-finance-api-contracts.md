# 27-finance-api-contracts.md

# 27 — Finance API Contracts (รวม API Endpoint ทั้งระบบ)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — sync กับ Batch 3)
> Document Level: Finance Reference — เอกสารอ้างอิงเชิงเทคนิค ไม่มีหน้าจอ UI ของตัวเอง
> เอกสารอ้างอิง: สรุปรวมจากไฟล์ 10-21, 30-37 ทั้งหมด, `45-case-warehouse-api-contracts.md` (ใช้ convention เดียวกัน)

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — รวม endpoint 16 กลุ่ม |
| v2 | 03/07/2569 | **เติม endpoint §6.4**: `PATCH /api/advances/:id/approve` และ `PATCH /api/advances/:id/reject` ที่ตกหล่นจากไฟล์ 15 v2 (แยก approve/reject ออกจาก settle ชัดเจนตาม state machine 5 สถานะใหม่) — Reformat header ตามมาตรฐานเอกสารชุดใหม่ |
| v3 | 04/07/2569 | **Sync endpoint กับไฟล์ต้นทางหลังการแก้ Batch 5**: (1) §6.8 เติม `PATCH /api/adjustments/:id/reject` — state machine (ไฟล์ 23 §6.9) มี `pending_approval → rejected` และ schema มี `rejection_reason` อยู่แล้ว แต่ไม่เคยมี endpoint รองรับ (2) §6.13 เติม `PATCH /api/exceptions/:id/resolve` ตามไฟล์ 34 §14 (3) §6.14 เติม `PATCH /api/bank-reconciliation/transactions/:id/resolve-unmatched` ตามไฟล์ 35 v2 (รองรับ state `unmatched_resolved` ที่เพิ่มใน Batch 5) — ทั้งหมดเป็นการรวบรวมจากไฟล์ต้นทาง/state machine ที่มีอยู่แล้ว ไม่ใช่ business logic ใหม่ |
| v3.1 | 04/07/2569 | **เติม §6.12**: `PATCH /api/accounting/wht-certificates/:id/cancel` ตามไฟล์ 33 v3 (DEC-006/D4) |
| v3.4 | 15/08/2569 | **เติม §6.8** (Phase 3.7 — Adjustment `20`): `GET /api/adjustments/targets` — ฟอร์มสร้าง Adjustment ตาม `20` §8 ต้องค้นรายการต้นทางจากเลขที่อ้างอิง แล้วแสดง `period_status_at_target` + ระดับอนุมัติที่ต้องใช้ก่อนกดสร้าง ซึ่งอ่านจาก `accounting_periods` ที่หน้าจอเข้าไม่ถึง — เป็น endpoint ที่ flow ใน §8 ต้องใช้อยู่แล้วแต่ตกหล่นจากรายการ ไม่ใช่ business logic ใหม่ (แนวเดียวกับ v3/v3.2/v3.3 · sync `20` §14 v2.2 แล้ว) |
| v3.3 | 15/08/2569 | **เติม §6.7** (Phase 3.6 — Revenue/Billing `19`): `GET /api/billing-batches/:id` (ปุ่ม "เอกสาร" ของตาราง `19` §8 ต้องเปิดรายละเอียดรอบ + รายการรายได้ในรอบ) และ `DELETE /api/billing-batches/:id` (`19` §10 ระบุกติกา "ห้ามลบ Billing Batch ที่ `status != draft`" ไว้ตรง ๆ ⇒ ต้องมี endpoint ให้ลบรอบ `draft` ได้จริง) — เป็น endpoint ที่ flow ใน `19` §8/§10 ต้องใช้อยู่แล้วแต่ตกหล่นจากรายการ ไม่ใช่ business logic ใหม่ (แนวเดียวกับ v3/v3.2) |
| v3.2 | 15/08/2569 | **เติม §6.6** (Phase 3.4 — Payout Batch `17`): `GET /api/payout-batches/:id` (ปุ่ม "ดู" ของตารางรอบจ่าย `17` §8 ต้องมีรายละเอียด+รายการในรอบ) และ `GET /api/payout-batches/:id/payment-file` (ไฟล์โอนเก็บใน bucket private ⇒ ดาวน์โหลดต้องผ่าน endpoint ที่ตรวจ `generate_payment_file` ทุกครั้ง ห้ามแจก signed URL) — เป็น endpoint ที่ flow ใน `17` §8/§9 ต้องใช้อยู่แล้วแต่ตกหล่นจากรายการ ไม่ใช่ business logic ใหม่ (แนวเดียวกับ v3) |

ขอบเขตเอกสารนี้: รวม API Endpoint ทั้งหมดของโมดูล Finance/Accounting เป็นรายการเดียว จัดกลุ่มตาม resource เพื่อให้ backend implement ตาม REST convention เดียวกันทั้งระบบ

**ไม่รวมอยู่ในไฟล์นี้**: API ของโมดูล Case/Warehouse (ดู `45-case-warehouse-api-contracts.md`), Request/Response body schema แบบเต็ม (ดูไฟล์ต้นทางแต่ละ resource)

---

## 1. Summary

รวม API Endpoint ทั้งหมดของโมดูล Finance/Accounting เป็นรายการเดียว จัดกลุ่มตาม resource เพื่อให้ backend implement ตาม REST convention เดียวกันทั้งระบบ

## 2. Purpose

ป้องกัน endpoint ซ้ำซ้อน/ตั้งชื่อไม่สอดคล้องกัน และเป็น checklist ความครบถ้วนก่อน implement

## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้)

เอกสารนี้เป็น technical reference ล้วน — ไม่มี Scope/Actor ของตัวเอง

## 6. API Endpoints รวมทั้งหมด (จัดกลุ่มตาม Resource)

### 6.1 Settings (ไฟล์ 13)

```
GET/POST/PATCH /api/settings/cycles
GET/POST/PATCH /api/settings/approval-matrix
GET/POST/PATCH /api/settings/bank-accounts
GET/POST/PATCH /api/settings/tax-profiles
GET/POST/PATCH /api/settings/vat-rates
GET/PATCH      /api/settings/tax-invoice-numbering
GET/POST/PATCH /api/settings/cost-centers
GET            /api/settings/document-templates
GET/POST/PATCH /api/settings/bank-file-formats
POST           /api/settings/bank-file-formats/:id/test
GET            /api/settings/export-formats
GET/PATCH      /api/settings/functional-permissions
GET/PATCH      /api/settings/period-lock-policy
```

### 6.2 Master Data (ไฟล์ 10, 12)

```
GET    /api/finance-companies
GET    /api/finance-companies/:id
POST   /api/finance-companies
PATCH  /api/finance-companies/:id
GET    /api/finance-companies/:id/users
POST   /api/finance-companies/:id/users
GET    /api/service-fee-templates
POST   /api/service-fee-templates
PATCH  /api/service-fee-templates/:id
```

### 6.3 Payee (ไฟล์ 18)

```
GET    /api/payees
POST   /api/payees
PATCH  /api/payees/:id
PATCH  /api/payees/:id/verify
```

### 6.4 Claims & Advances (ไฟล์ 15) — เติม endpoint แล้ว

```
GET    /api/claims
POST   /api/claims
PATCH  /api/claims/:id/approve
PATCH  /api/claims/:id/reject
GET    /api/advances
POST   /api/advances
PATCH  /api/advances/:id/approve
PATCH  /api/advances/:id/reject
PATCH  /api/advances/:id/settle
```

### 6.5 Compensation Approval (ไฟล์ 16)

```
GET    /api/compensation
PATCH  /api/compensation/:id/approve
PATCH  /api/compensation/:id/reject
```

### 6.6 Payout (ไฟล์ 17)

```
GET    /api/payout-batches
GET    /api/payout-batches/:id                          (v3.2 — รายละเอียด + รายการในรอบ)
POST   /api/payout-batches
POST   /api/payout-batches/:id/generate-payment-file
GET    /api/payout-batches/:id/payment-file             (v3.2 — ดาวน์โหลดไฟล์โอนล่าสุด)
PATCH  /api/payout-batches/:id/complete
```

### 6.7 Revenue & Billing (ไฟล์ 19)

```
GET    /api/revenues
GET    /api/billing-batches
POST   /api/billing-batches
GET    /api/billing-batches/:id                         (v3.3 — รายละเอียดรอบ + รายการรายได้ในรอบ)
DELETE /api/billing-batches/:id                         (v3.3 — ลบได้เฉพาะ draft · `19` §10)
PATCH  /api/billing-batches/:id/send
GET    /api/ar-aging
```

### 6.8 Adjustment (ไฟล์ 20)

```
GET    /api/adjustments
GET    /api/adjustments/targets        ← ตัวเลือกรายการต้นทางของฟอร์ม (ไฟล์ 20 §8/§14 v2.2)
POST   /api/adjustments
PATCH  /api/adjustments/:id/approve
PATCH  /api/adjustments/:id/reject
```

### 6.9 Dashboard & Reports (ไฟล์ 14, 21)

```
GET    /api/finance/dashboard-kpi
GET    /api/finance/exceptions
GET    /api/reports/profitability
GET    /api/reports/profitability/:dimension_id/drilldown
```

### 6.10 Accounting: Sales & Receipts (ไฟล์ 31)

```
GET    /api/accounting/sales
POST   /api/accounting/tax-invoices
PATCH  /api/accounting/tax-invoices/:id/cancel
GET    /api/accounting/cash-receipts
```

### 6.11 Accounting: Expenses (ไฟล์ 32)

```
GET    /api/accounting/expenses
PATCH  /api/accounting/expenses/:id/cost-center
```

### 6.12 Accounting: WHT (ไฟล์ 33)

```
GET    /api/accounting/wht-certificates
PATCH  /api/accounting/wht-certificates/:id/cancel
GET    /api/accounting/wht-filing-summary
PATCH  /api/accounting/wht-filing-summary/:id/mark-filed
```

### 6.13 Exceptions (ไฟล์ 34)

```
GET    /api/exceptions
POST   /api/exceptions
PATCH  /api/exceptions/:id
PATCH  /api/exceptions/:id/resolve
POST   /api/exceptions/:id/authorize
```

### 6.14 Bank Reconciliation (ไฟล์ 35)

```
POST   /api/bank-reconciliation/import
GET    /api/bank-reconciliation/transactions
PATCH  /api/bank-reconciliation/transactions/:id/match
PATCH  /api/bank-reconciliation/transactions/:id/resolve-unmatched
```

### 6.15 Accountant Questions (ไฟล์ 36)

```
GET    /api/accounting/questions
POST   /api/accounting/questions
PATCH  /api/accounting/questions/:id/answer
```

### 6.16 Monthly Close & Export (ไฟล์ 30, 37)

```
GET    /api/accounting/periods
GET    /api/accounting/periods/:id/readiness
PATCH  /api/accounting/periods/:id/send
PATCH  /api/accounting/periods/:id/lock
PATCH  /api/accounting/periods/:id/unlock
GET    /api/accounting/export-history
POST   /api/accounting/export-pack
PATCH  /api/accounting/export-history/:id/accept
```

## 7. REST Convention ที่ใช้สม่ำเสมอทั้งระบบ

- `GET /resource` = list (รองรับ query filter)
- `GET /resource/:id` = detail
- `POST /resource` = create
- `PATCH /resource/:id` = update (partial)
- `PATCH /resource/:id/action-name` = state transition เฉพาะทาง (เช่น approve, reject, verify, lock)
- ทุก endpoint ที่กระทบเงิน/ภาษี ต้องตรวจสิทธิ์ตามไฟล์ 25 (Permission Matrix) ก่อนเสมอ

## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้)

ดูรายละเอียดเชิง business ของแต่ละ endpoint ที่ไฟล์ต้นทาง

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **REST convention เดียวกันทั้งระบบ**: `GET/POST/PATCH` ตาม pattern มาตรฐาน, action พิเศษใช้ `PATCH /resource/:id/action-name` (§7)
- **ทุก endpoint ที่กระทบเงิน/ภาษีต้องผ่าน Permission Matrix (ไฟล์ 25) ก่อนเสมอ** (§7)
- **Advance แยก endpoint approve/reject/settle ชัดเจน** ตาม state machine 5 สถานะที่แก้ไขแล้ว (§6.4)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ใหม่ — รวบรวมจาก endpoint ที่กำหนดไว้แล้วในไฟล์ต้นทางทั้งหมด ตรวจสอบไม่พบชื่อ endpoint ซ้ำกัน (ตรวจไขว้กับไฟล์ 20/34/35 อีกรอบเมื่อ 04/07/2569 — sync ครบแล้ว)

---

*เอกสารนี้เป็นไฟล์ที่ 6 ในหมวด Finance Reference (22–29) ต่อจาก `26-finance-data-model.md` และก่อน `28-finance-export-pdf-spec.md`*
