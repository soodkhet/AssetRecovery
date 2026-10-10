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
| v3.6 | 15/08/2569 | **เติม §6.14** (Phase 4.2 — กระทบยอดธนาคาร `35`): `GET /api/bank-reconciliation/match-candidates` — Modal "จับคู่ Manual" ของ `35` §8 มี dropdown "ค้นหารายการที่จะจับคู่" ซึ่งต้องอ่านรอบวางบิล `sent` / รอบจ่าย `file_generated` ที่ผู้ถือ `manage_bank_reconciliation` (บัญชี) **ไม่มีสิทธิ์** เรียกผ่าน `/api/billing-batches` หรือ `/api/payout-batches` ได้ (`25` §7.4 ให้สองตัวนั้นกับการเงิน) ⇒ ต้องมี endpoint ของโมดูล 35 เอง เป็น endpoint ที่ flow ใน §8 ต้องใช้อยู่แล้วแต่ตกหล่นจากรายการ ไม่ใช่ business logic ใหม่ (แนวเดียวกับ v3/v3.2–v3.5) |
| v3.5 | 15/08/2569 | **เติม §6.3/§6.6 ที่ตกหล่นตอนรีวิว Phase 3**: `GET /api/payees/candidates` (ฟอร์มสร้าง Payee ต้องเลือกจากผู้ใช้ที่ยังไม่มี Payee Profile — กติกา "1 User = 1 Payee" ของ `18` §6.1 บังคับอยู่แล้ว) และ PDF ภายในของรอบจ่าย 3 ใบ `GET /api/payout-batches/:id/{summary,voucher,payslip}-pdf` (เอกสารทั้งสามถูกกำหนดไว้แล้วที่ `28` §6.1 + `01_PLAN` §3.4 แต่ไม่เคยถูกเติมลงรายการ endpoint) — implementation มีอยู่จริงตั้งแต่ Phase 3.2/3.4 เอกสารเป็นฝั่งที่ตามไม่ทัน ไม่ใช่ business logic ใหม่ (แนวเดียวกับ v3.2–v3.4) |
| v3.7 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U3–U8)**: เติม `GET/POST /api/settings/wht-policy` (ค่าตั้งภาษีหัก ณ ที่จ่าย effective-dated — ไฟล์ 13 §6.4.2) |
| v3.8 | 05/10/2569 | **มติ PO 05/10/2569 (U50)** — §6.8 เติม `GET /api/adjustments/field-days` (วันลงพื้นที่ในงวดปิดที่รอเบิกย้อนหลัง · อ่าน: การเงิน/บัญชี) + `POST /api/adjustments/field-days/backdated` (การเงิน `create_adjustment` · body `agentId`/`fieldDate`/`reason` · 201 สร้าง / 200 `created: false` เมื่อมีแล้ว) ตาม `41` §6.6 |
| v3.16 | 07/10/2569 | **มติ PO U135** — §6.8 เติม `GET /api/adjustments/fuel-expenses` + `POST /api/adjustments/fuel-expenses/backdated` (ค่าน้ำมัน `PER_KM` ที่คำนวณได้หลังงวดของวันปิดงานปิดแล้ว — สิทธิ์เหมือน field-days ของ U50) |
| v3.9 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U30 · BUG-109)** — §6.4 เพิ่ม `PATCH /api/advances/:id/return-method` (เปลี่ยนวิธีคืนยอด · เหตุผลบังคับ) + `POST /api/advances/:id/returns` (บันทึกรับคืนแยก + หลักฐาน) — การเงินเท่านั้น (`manage:approve_advance`) · `GET /api/advances?status=return_outstanding` · `PATCH /settle` รับ `returnMethod` |
| v3.10 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U67)**: §6.6 เติม `POST /api/payout-batches/:id/cancel` — ยกเลิกรอบจ่ายก่อนโอนจริง (`{ reason, confirmFileNotSent }` · `manage:manage_payout_batch` · `17` §9.1) |
| v3.11 | 06/10/2569 | **มติ PO 06/10/2569 (U104)** — §6.17 ใหม่ ตัวอย่างเอกสารทั้งหมด: `GET /api/accounting/document-samples` (ทะเบียนตัวอย่าง + เลขถัดไปตามค่าตั้งเลขที่เอกสาร) + `GET /api/accounting/document-samples/:docType/pdf` (PDF ตัวอย่างจาก renderer จริง · ข้อมูลสมมติ · ป้ายตัวอย่างทุกหน้า) — สิทธิ์ `view_document_samples` (`25` §7.1) · อ่านอย่างเดียว ไม่เดินตัวนับ ไม่ลง audit export (`28` §6.5) · `:docType` ที่ไม่รู้จัก ⇒ 400 `REQUIRED_MISSING` + field `docType` (ไม่ตั้ง error code ใหม่) |
| v3.12 | 06/10/2569 | **มติ PO 06/10/2569 (U117)** — §6.4 เติม `PATCH /api/claims/:id/reject-permanent` (ปฏิเสธถาวรใบเบิกค่าที่พัก = `reject_permanent` ของ `23` §6.3 `pending_approval → rejected` · เหตุผลบังคับ `REJECT_REASON_REQUIRED` · สิทธิ์/scope/ขั้นที่รออยู่ชุดเดียวกับ `/reject`) · `GET /api/substitute-receipts/:id` (รายละเอียด + บรรทัดของใบ ให้ฟอร์ม "ออกใบใหม่แทน" ตั้งต้นจากใบที่ยกเลิก · scope เดียวกับ PDF นอก scope 404) · DTO ใบรับรองที่ฝังในรายการเบิก/เงินทดรองเพิ่ม `replacesReceiptNumber` + `cancelledHistory` |
| v3.14 | 06/10/2569 | **มติ PO 06/10/2569 (U121)** — เติม `GET/POST /api/settings/tax-profile-defaults` (Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ 4 ช่อง — ไฟล์ 13 §6.4.3 · `GET` = `view_master_data` คืนชุดที่มีผล + ประวัติ · `POST` = `manage_tax_profiles` body `{ inhouseIndividual, inhouseCorporate, outsourceIndividual, outsourceCorporate, reason }` (id หรือ `null`) · 201) · `POST /api/payout-batches` ปฏิเสธ `WHT_RATE_MISSING` (400) เมื่อมีผู้รับที่ไม่มีอัตราเลย · DTO คิวอนุมัติ `whtRateSource` เพิ่มค่า `type_default` / `none` |
| v3.13 | 06/10/2569 | **มติ PO 06/10/2569 (U118)** — `PATCH /api/claims/:id/reject-permanent` รับจาก `pending_approval`/`pending_finance_approval`/`needs_revision` · DTO คิวอนุมัติเพิ่ม `viewerCanRejectPermanently` |
| v3.14 | 07/10/2569 | **มติ PO 06/10/2569 (U122)** — §6.x settings เติม `POST/DELETE /api/settings/organization/signature` (รูปลายเซ็นผู้มีอำนาจ · Superadmin + reason) และระบุ `GET/PATCH /api/settings/tax-document-templates` (เทมเพลตเอกสาร 3 ชนิด — ข้อความท้าย + เปิด/ปิดพิมพ์ลายเซ็น · ตัดช่องโลโก้/ลายเซ็น URL/ขนาดกระดาษ/ภาษา) |
| v3.15 | 07/10/2569 | **มติ O73 (Final Test ด่าน 5)**: ลบ `GET/PATCH /api/settings/seller-branch` — หน้าจอย้ายไปข้อมูลองค์กร (U99) แล้วไม่มีผู้เรียก · เป็นทางเขียน `organizations.branch_code` ซ้ำซ้อนกับ `PATCH /api/settings/organization` ⇒ ค่าสาขาผู้ขายแก้ที่ข้อมูลองค์กรจุดเดียว |
| v3.4 | 15/08/2569 | **เติม §6.8** (Phase 3.7 — Adjustment `20`): `GET /api/adjustments/targets` — ฟอร์มสร้าง Adjustment ตาม `20` §8 ต้องค้นรายการต้นทางจากเลขที่อ้างอิง แล้วแสดง `period_status_at_target` + ระดับอนุมัติที่ต้องใช้ก่อนกดสร้าง ซึ่งอ่านจาก `accounting_periods` ที่หน้าจอเข้าไม่ถึง — เป็น endpoint ที่ flow ใน §8 ต้องใช้อยู่แล้วแต่ตกหล่นจากรายการ ไม่ใช่ business logic ใหม่ (แนวเดียวกับ v3/v3.2/v3.3 · sync `20` §14 v2.2 แล้ว) |
| v3.3 | 15/08/2569 | **เติม §6.7** (Phase 3.6 — Revenue/Billing `19`): `GET /api/billing-batches/:id` (ปุ่ม "เอกสาร" ของตาราง `19` §8 ต้องเปิดรายละเอียดรอบ + รายการรายได้ในรอบ) และ `DELETE /api/billing-batches/:id` (`19` §10 ระบุกติกา "ห้ามลบ Billing Batch ที่ `status != draft`" ไว้ตรง ๆ ⇒ ต้องมี endpoint ให้ลบรอบ `draft` ได้จริง) — เป็น endpoint ที่ flow ใน `19` §8/§10 ต้องใช้อยู่แล้วแต่ตกหล่นจากรายการ ไม่ใช่ business logic ใหม่ (แนวเดียวกับ v3/v3.2) |
| v3.2 | 15/08/2569 | **เติม §6.6** (Phase 3.4 — Payout Batch `17`): `GET /api/payout-batches/:id` (ปุ่ม "ดู" ของตารางรอบจ่าย `17` §8 ต้องมีรายละเอียด+รายการในรอบ) และ `GET /api/payout-batches/:id/payment-file` (ไฟล์โอนเก็บใน bucket private ⇒ ดาวน์โหลดต้องผ่าน endpoint ที่ตรวจ `generate_payment_file` ทุกครั้ง ห้ามแจก signed URL) — เป็น endpoint ที่ flow ใน `17` §8/§9 ต้องใช้อยู่แล้วแต่ตกหล่นจากรายการ ไม่ใช่ business logic ใหม่ (แนวเดียวกับ v3) |
| v3.17 | 07/10/2569 | **มติ PO 07/10/2569 (U137)** §6.14: `GET /api/bank-reconciliation/match-proposals` (คู่ที่ระบบเสนอ — สิทธิ์ view ของ `manage_bank_reconciliation`) · `PATCH /transactions/:id/match` รับ `fromProposal?: boolean` (audit ระบุที่มา · กติกาเหมือนจับคู่มือ) |
| v3.18 | 07/10/2569 | **มติ PO 07/10/2569 (U170 · BUG-180)**: `GET /api/settings/assumptions?include=current_value` — เพิ่ม `currentValue` (ค่าที่ใช้อยู่) ต่อรายการสำหรับหน้ารวมในเมนูบัญชี · ไม่ส่ง = รูปแบบเดิม (ป้ายบนหน้าตั้งค่า) |
| v3.19 | 07/10/2569 | **มติ PO 07/10/2569 (U127 · U140)**: เพิ่ม `PATCH /api/accounting/wht-filing-summary/:id/mark-supplementary-filed` (ล้างธงต้องยื่นเพิ่มเติม · `manage_wht` · reason บังคับ) · `GET /api/settings/assumptions` + `POST /api/settings/assumptions/:key/confirm` (ป้าย "รอนักบัญชียืนยัน" บนหน้าตั้งค่า · confirm = `manage_accountant_questions` · reason บังคับ) |
| v3.20 | 08/10/2569 | **preship R7-009 · มติชั่วคราว P11 (รอ PO ยืนยัน)** — §6.9 เติม `GET /api/finance/closed-periods` (อ่านอย่างเดียว · สิทธิ์ view ของ `manage_billing` หรือ `manage_payout_batch` · คืน `{ closedPeriods: { yearBe, month }[] }` = งวด `locked`/`sent_to_accountant` · ไม่เปิดงวดใหม่ ไม่ลง audit) ให้หน้าสร้างรอบวางบิล/รอบจ่ายไม่เสนอวันตัดรอบในงวดที่ปิด · `POST /api/billing-batches` · `POST /api/payout-batches` วันตัดรอบในงวดปิด ⇒ `PERIOD_LOCKED_DIRECT_EDIT` เดิม + `reason: "cutoff_in_closed_period"` |
| v3.21 | 10/10/2569 | **staging E-012 (มติ PO 10/10/2569)** — §6.4 เพิ่ม `PATCH /api/advances/:id/clear-review` และ `PATCH /api/advances/:id/reopen-clear` (การเงินเท่านั้น `manage:approve_advance` · ไม่ใช่การเงิน = 404 ไม่ leak) · `AdvanceDto` เพิ่ม `receiptFileUrl`/`clearReviewedAt`/`clearReviewedByName` |
| v3.22 | 10/10/2569 | **staging E-052** — §6.12 `GET /api/accounting/wht-certificates` รับ `?payoutBatchId=<uuid>` กรองใบของรอบจ่ายเดียว (หน้ารอบจ่ายที่ `completed` แสดงปุ่ม "50 ทวิ" ต่อผู้รับ) · สิทธิ์เดิม |
| v3.23 | 10/10/2569 | **staging E-008 (มติ PO 10/10/2569)** — §6.9 เพิ่ม `GET /api/finance/revenue-pending` (อ่านอย่างเดียว · สิทธิ์ view ของ `manage_billing` · scope ภายในองค์กรเท่านั้น ฝั่งบริษัทได้ว่าง · ไม่ลง audit) คืนเคสที่ปิดงานแล้วแต่รายได้รอบปัจจุบันยังไม่เกิด + `reason` (`field_days_not_settled`/`expense_not_approved`/`warehouse_gate`/`no_snapshot`/`missing_basis`/`gates_passed`) + `reasonText` — ตัดสินด้วยเกตเดียวกับ `tryCreateRevenue` (`19` §6.1) |
| v3.24 | 11/10/2569 | **staging E-065** — §6.11 เพิ่ม `POST /api/accounting/expenses/cost-center/bulk` (`{ expenseRecordIds[], costCenterId, reason }` · manage `map_cost_center` · all-or-nothing · `32` §14) |

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
GET/POST       /api/settings/tax-profile-defaults ← Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (มติ PO U121 · insert-only · POST = manage_tax_profiles + reason)
GET/POST/PATCH /api/settings/vat-rates
GET/POST       /api/settings/wht-policy          ← ค่าตั้งภาษีหัก ณ ที่จ่าย (มติ PO 05/10/2569 · insert-only)
GET            /api/settings/assumptions         ← (?include=current_value = + ค่าที่ใช้อยู่ · U170) ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน + สถานะยืนยัน (มติ PO 07/10/2569 U140)
POST           /api/settings/assumptions/:key/confirm ← บัญชียืนยันแล้ว (reason บังคับ · insert-only)
GET            /api/settings/document-numbering          (มติ PO U102 — เลขที่เอกสารทุกชนิด · view_master_data)
PATCH          /api/settings/document-numbering/:docType (manage_invoice_numbering + reason · แทน /api/settings/tax-invoice-numbering)
GET/PATCH      /api/settings/organization           (มติ PO U99 — ข้อมูลองค์กร · ดู = view_master_data · แก้ = manage_invoice_numbering + reason)
POST/DELETE    /api/settings/organization/logo      (มติ PO U99 — ผูก path จาก upload-url target organization_logo / ปลดโลโก้ · reason บังคับ)
POST/DELETE    /api/settings/organization/signature (มติ PO U122 — รูปลายเซ็นผู้มีอำนาจ · target organization_signature / ปลดรูป · reason บังคับ · Superadmin)
GET/POST/PATCH /api/settings/cost-centers
GET            /api/settings/document-templates
GET/PATCH      /api/settings/tax-document-templates (มติ PO U122 — เทมเพลตเอกสาร 3 ชนิด: ข้อความท้าย + เปิด/ปิดพิมพ์รูปลายเซ็น · ดู = view_master_data · แก้ = manage_tax_profiles + reason)
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
GET    /api/payees/candidates                           (v3.5 — ผู้ใช้ที่ยังไม่มี Payee Profile สำหรับฟอร์มสร้าง · `18` §6.1)
GET    /api/payees/wht-condition-policy                 (มติ PO U105 — ค่าตั้ง "อนุญาตเงื่อนไข (2)/(3)" ที่มีผลวันนี้ สำหรับฟอร์มผู้รับ · `manage_payee_profile` manage)
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
PATCH  /api/claims/:id/reject-permanent                (v3.12 มติ PO U117 — ปฏิเสธถาวรใบเบิกค่าที่พัก · เหตุผลบังคับ)
GET    /api/substitute-receipts/:id                    (v3.12 มติ PO U117 — บรรทัดของใบ สำหรับออกใบใหม่แทน)
GET    /api/advances
POST   /api/advances
PATCH  /api/advances/:id/approve
PATCH  /api/advances/:id/reject
PATCH  /api/advances/:id/settle
PATCH  /api/advances/:id/return-method                 (v3.8 มติ PO U30 — เปลี่ยนวิธีคืนยอด · การเงิน)
PATCH  /api/advances/:id/clear-review                  (v3.21 staging E-012 — การเงินตรวจการเคลียร์แล้ว · `note?`)
PATCH  /api/advances/:id/reopen-clear                  (v3.21 staging E-012 — การเงินตีกลับการเคลียร์ · `reason` บังคับ · `cleared → approved`)
POST   /api/advances/:id/returns                       (v3.8 มติ PO U30 — บันทึกรับคืนแยก · การเงิน)
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
GET    /api/payout-batches/:id/summary-pdf              (v3.5 — Payout Batch Summary · `28` §6.1)
GET    /api/payout-batches/:id/voucher-pdf              (v3.5 — Payment Voucher ภายใน · `28` §6.1)
GET    /api/payout-batches/:id/payslip-pdf              (v3.5 — Compensation Statement / Payslip · `28` §6.1)
PATCH  /api/payout-batches/:id/complete
POST   /api/payout-batches/:id/cancel                (v3.10 — ยกเลิกรอบก่อนโอนจริง · มติ PO U67 · `17` §9.1)
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
GET    /api/adjustments/field-days     ← วันลงพื้นที่ในงวดปิดที่รอเบิกย้อนหลัง (มติ PO U50 · ไฟล์ 41 §6.6)
POST   /api/adjustments/field-days/backdated ← สร้างรายการเบิกย้อนหลังลงงวดที่เปิดอยู่ (U50 · idempotent)
GET    /api/adjustments/fuel-expenses  ← ค่าน้ำมันตามระยะทางที่คำนวณได้หลังงวดปิด รอเบิกย้อนหลัง (มติ PO U135 · ไฟล์ 41 §6.6)
POST   /api/adjustments/fuel-expenses/backdated ← สร้างรายการค่าน้ำมันย้อนหลังลงงวดที่เปิดอยู่ ({ jobId, reason } · U135 · idempotent)
POST   /api/adjustments
PATCH  /api/adjustments/:id/approve
PATCH  /api/adjustments/:id/reject
```

### 6.9 Dashboard & Reports (ไฟล์ 14, 21)

```
GET    /api/finance/dashboard-kpi
GET    /api/finance/closed-periods                      (v3.20 — งวดที่สร้างเอกสารใหม่ไม่ได้ · หน้าสร้างรอบวางบิล/รอบจ่าย · P11)
GET    /api/finance/exceptions
GET    /api/finance/revenue-pending                     (v3.23 — เคสปิดงานแล้วที่รายได้ยังไม่เกิด + เหตุผลตามเกต 19 §6.1 · E-008)
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
POST   /api/accounting/expenses/cost-center/bulk         (v3.24 — map หลายรายการ เหตุผลเดียว all-or-nothing · E-065)
```

### 6.12 Accounting: WHT (ไฟล์ 33)

```
GET    /api/accounting/wht-certificates            ?periodId&status&filingForm&payoutBatchId
PATCH  /api/accounting/wht-certificates/:id/cancel
GET    /api/accounting/wht-filing-summary
PATCH  /api/accounting/wht-filing-summary/:id/mark-filed
PATCH  /api/accounting/wht-filing-summary/:id/mark-supplementary-filed   ← มติ PO 07/10/2569 U127 (reason บังคับ)
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
GET    /api/bank-reconciliation/match-candidates
GET    /api/bank-reconciliation/match-proposals      # มติ PO U137 — คู่ที่ระบบเสนอ (จับคู่ทางกลับ) · ยืนยันด้วย PATCH .../match + fromProposal: true
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

### 6.17 ตัวอย่างเอกสารทั้งหมด (ไฟล์ 28 §6.5 — มติ PO U104)

```
GET    /api/accounting/document-samples
GET    /api/accounting/document-samples/:docType/pdf
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
