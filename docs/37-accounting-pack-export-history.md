# 37-accounting-pack-export-history.md

# 37 — Accounting Pack Export History (ประวัติส่งมอบบัญชี)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — แก้ไข Export Record status enum)
> Document Level: Accounting Module
> เอกสารอ้างอิง: `30-accounting-handover-monthly-close.md`, `34-accounting-document-checklist-exceptions.md`, `20-adjustment.md`, `36-accountant-questions.md`, `02-database-schema-design.md` §9 (export_records table), `23-finance-state-machines.md` §6.16

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Export Record, versioning, รายชื่อไฟล์มาตรฐาน 01-08 |
| v2 | 03/07/2569 | **แก้ไข §7.1 (Export Record status)**: เดิมมี 4 สถานะ `not_exported`/`draft`/`exported`/`accepted` — ตรวจสอบ workflow §9 แล้วพบว่า `not_exported`/`draft` เป็น state ที่ไม่เคยใช้จริง (record สร้างพร้อม status=exported ทันที) และคำว่า "exported" ไม่ตรงกับ schema ที่ใช้ `generated`/`sent`/`accepted` (3 states) — แก้เป็น 3 states ตรงกับ schema พร้อม**เพิ่มขั้น "mark ว่าส่งแล้ว" (`sent`)** ที่ขาดหายไป เพื่อแยกความต่างระหว่าง "สร้างไฟล์เสร็จ" กับ "ส่งให้สำนักงานบัญชีจริงแล้ว" (ปัจจุบันส่งนอกระบบ ต้องมีจุดให้บัญชี mark เอง) — ปิด flag ที่ตั้งไว้ใน `23-finance-state-machines.md` §6.16 |
| v2.2 | 05/10/2569 | **มติ PO 05/10/2569 (U15) — แจ้งสำนักงานบัญชีว่ามีคอลัมน์ใหม่**: `05_WHT_Data.csv` เพิ่มคอลัมน์ `filing_form` **ต่อท้ายสุด** (ค่ารหัสตรง enum `wht_filing_form`: `PND1` = ภ.ง.ด.1 เงินได้ 40(2) / `PND3` = ภ.ง.ด.3 / `PND53` = ภ.ง.ด.53 — มาจาก `wht_certificates.filing_form`) · คอลัมน์เดิม 8 ตัวไม่เปลี่ยนชื่อ/ลำดับ · ใบ 40(2) อัตรา 0% (U16) อยู่ในไฟล์เป็นแถว `wht_baht = 0.00` · template `reference/samples/05_WHT_Data.csv` แก้ตามแล้ว |
| v2.3 | 05/10/2569 | **มติ PO 05/10/2569 (U21) — แจ้งสำนักงานบัญชี: เพิ่มไฟล์ที่ 9**: รายชื่อไฟล์มาตรฐาน 8 → **9 ไฟล์** — `09_Credit_Notes.csv` (CSV UTF-8 + BOM แบบไฟล์อื่น) = ใบลดหนี้ (`CN`) + ใบเพิ่มหนี้ (`DN` — U19) ที่**ลงวันที่ในรอบ** รวมใบที่ยกเลิก · คอลัมน์ `document_type, number, issue_date, tax_invoice_ref, company, amount_before_vat_baht, vat_baht, total_baht, reason, status, adjustment_ref` (วันที่ พ.ศ. `DD/MM/YYYY` · ยอดเป็นบวกเสมอ ทิศทางดูจาก `document_type` · `status` = `active`/`cancelled` · `adjustment_ref` = เลขที่ใน `07_Adjustment_Log.csv` ของงวดเป้าหมายของ Adjustment, ไม่ผูก = `-`) · **ไฟล์ 01–08 ไม่เปลี่ยน** · หน้าปก/SHA-256 ของชุดครอบคลุม 01–09 · `file_count` = 9 · template `reference/samples/09_Credit_Notes.csv` |
| v2.4 | 05/10/2569 | **มติ PO 05/10/2569 (U31 · BUG-129)**: `08_Document_Checklist.xlsx` — exception ที่ผู้บริหาร**อนุญาตให้ปิดงวด** (`authorized`) แสดง `doc_status` = **"อนุญาตปิดงวด — ยังรอเอกสาร"** (ไม่นับว่า "ครบถ้วน") พร้อมระดับ + หัวข้อเอกสารที่รอ (+ เหตุผลที่อนุญาต) และสรุปนับแยกบรรทัด · มีผลกับ export ใหม่เท่านั้น — version เดิมไม่ถูกสร้างใหม่/ทับ · (U33) `05_WHT_Data.csv` `filing_form = PND1` ครอบเงินได้ 40(1) ด้วย |
| v2.5 | 05/10/2569 | **มติ PO 05/10/2569 (U30 · BUG-109) — แจ้งสำนักงานบัญชีว่ามีคอลัมน์ใหม่**: `04_Payments.csv` เพิ่ม `advance_offset_baht` + `transfer_baht` **ต่อท้ายสุด** (คอลัมน์เดิมไม่ย้าย) — รอบจ่ายที่หักคืนเงินทดรอง: เงินโอนจริง = `transfer_baht` · ส่วนหักคือการรับชำระลูกหนี้เงินทดรอง (`reference/samples/04_Payments.csv` อัปเดตแล้ว) |
| v2.6 | 05/10/2569 | **มติ PO 05/10/2569 (U40/U41) — แจ้งสำนักงานบัญชี: เพิ่มไฟล์ที่ 10–11**: `10_Customer_WHT.csv` = ภาษีที่ลูกค้าหักเรา + สถานะหนังสือ 50 ทวิ (แถว = รับเงินในงวด + ยังรอหนังสือที่ยกมา) คอลัมน์ `received_date, company, company_tax_id, billing_ref, tax_invoice_ref, withheld_baht, cert_no, cert_date, cert_wht_baht, status` (`pending`/`received`) · `11_Suspense_Receipts.csv` = เงินรับรอตรวจสอบ (แถว = เกิดในงวด + ยังค้าง + จับคู่/คืนเงินในงวด) คอลัมน์ `bank_txn_date, bank_ref, amount_baht, suspended_date, suspense_reason, status, resolved_ref, resolved_date, refund_reason` · `06_Bank_Reconciliation.csv` `status` เป็น enum เต็ม **6 ค่า** (+`suspense`/`suspense_refunded`) · **ไฟล์ 01–09 ไม่เปลี่ยนคอลัมน์** · หน้าปก/SHA-256 ครอบคลุม 01–11 · `file_count` = 11 · template `reference/samples/10_Customer_WHT.csv` + `11_Suspense_Receipts.csv` |
| v2.7 | 05/10/2569 | **มติ PO 05/10/2569 (U57 · O41/BUG-123 · U68) — แจ้งสำนักงานบัญชี: เพิ่มไฟล์ที่ 12–13**: `12_Tax_Invoices.csv` = ใบกำกับภาษีขายที่**ลงวันที่ในรอบ** + ใบของรอบก่อนที่**ถูกยกเลิกในรอบนี้** (ยอดก่อน VAT/VAT/รวมจาก snapshot รายการขาย · `vat_rate_pct` = `vat_rate_pct_used` ของรายได้ · `status` = `active`/`cancelled` + วันที่/เหตุผลยกเลิก · `replaced_by` = ใบที่ออกแทน) **+ สำเนา PDF ทุกใบในโฟลเดอร์ `tax_invoices/` ของ zip** (renderer เดียวกับพิมพ์รายใบ · เพดาน 200 ใบ/60 วินาทีต่อชุด — ใบที่เกินยังอยู่ใน CSV ครบ `pdf_file` = `-` + รายชื่อใน `tax_invoices/NOT_ATTACHED.txt`) · `13_Advance_Returns.csv` = รับคืนเงินทดรอง (ตาราง `advance_returns`) ทั้งหักกลบในรอบจ่าย (`payout_offset` — วันที่/เลขรอบเดียวกับ `04_Payments.csv`) และรับคืนแยก (`cash`/`bank_transfer` + ชื่อไฟล์หลักฐาน) · กลับรายการ = `status` `reversed` + วันที่/เหตุผล · **ยืนยันความหมาย `04_Payments.csv`**: `amount_baht` = สุทธิหลังภาษี · `transfer_baht` = เงินออกจริง (ส่วนต่าง = `advance_offset_baht` ซึ่งตรงกับแถว `payout_offset` ในไฟล์ 13) · ไฟล์ 01–11 ไม่เปลี่ยน (`reference/samples/12_…`, `13_…` เพิ่มแล้ว) |
| v2.8 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U67 — ยกเลิกรอบจ่าย)**: `04_Payments.csv`/`03_Expenses.csv` มาจากบัญชีค่าใช้จ่ายที่เกิดเฉพาะรอบ `completed` ⇒ รอบที่ยกเลิก (`cancelled` — ก่อนโอนจริงเท่านั้น) ไม่ปรากฏใน Export Pack โดยโครงสร้าง ไม่ต้องกรองเพิ่ม · รายการที่กลับไปรอจ่ายจะปรากฏครั้งเดียวกับรอบใหม่ที่จ่ายจริง |
| v2.9 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U77 · ม.86/4) — แจ้งสำนักงานบัญชีว่ามีคอลัมน์ใหม่**: `12_Tax_Invoices.csv` เพิ่ม `company_branch` **ต่อท้ายสุด** (คอลัมน์เดิมไม่ย้าย) = สำนักงานใหญ่/สาขาของผู้ซื้อตาม **snapshot บนใบกำกับตอนออก** — ค่าเป็นข้อความ "สำนักงานใหญ่" หรือ "สาขาที่ 00001" (ไม่ใช่รหัสล้วน — เปิดใน Excel แล้วเลข 0 นำหน้าไม่หาย) · ใบที่ออกก่อนมีช่องนี้ = "สำนักงานใหญ่" · แก้ `reference/samples/12_Tax_Invoices.csv` คู่กัน |
| v2.10 | 06/10/2569 | **มติ PO 06/10/2569 (UAT U79/U82) — แจ้งสำนักงานบัญชีว่ามีคอลัมน์ใหม่ (ต่อท้ายสุด · คอลัมน์เดิมไม่ย้าย)**: (U79) คอลัมน์อ้างอิงรอบวางบิล**คงรูปแบบเดิม** (`06` `matched_ref` = บริษัท + รอบเดือน · `07` `target_ref` = รอบเดือน · `10` `billing_ref` = รอบเดือน · `11` `resolved_ref` = บริษัท + รอบเดือน · `12` `billing_ref` = รอบเดือน) และเพิ่มคอลัมน์ **`billing_batch_number`** (เลขรอบวางบิล `BL-<พ.ศ.>-NNN` · ไม่ผูกรอบวางบิล = `-`) ต่อท้ายไฟล์ 06/07/10/11/12 · (U82) `09_Credit_Notes.csv` เพิ่ม **`company_branch`** = สำนักงานใหญ่/สาขาผู้ซื้อตามใบกำกับเดิม (ข้อความแบบไฟล์ 12 — มติ U84) · template `reference/samples/06,07,09,10,11,12` แก้ตามแล้ว |
| v2.11 | 06/10/2569 | **มติ PO 06/10/2569 (UAT U87) — แจ้งสำนักงานบัญชี: เพิ่มไฟล์ที่ 14** `14_Unbilled_Revenue.csv` = **รายได้ค้างรับ** — รายได้ที่ `revenue_date` อยู่ในงวด (หรือก่อนงวด) และ **ณ เวลาสร้างชุด** ยังไม่อยู่ในรอบวางบิลที่ส่งลูกค้าแล้ว (ยังไม่ผูกรอบ หรืออยู่ในรอบร่าง) · คอลัมน์ `case_ref, company, company_tax_id, delivered_date` (= `revenue_date` วันยืนยันล็อตส่งมอบ) `, fee_model` (enum ดิบ `SUCCESS_FEE`/`FLAT`/`HYBRID`) `, amount_before_vat_baht, vat_baht, total_baht, vat_rate_pct` (snapshot) `, billing_batch_number` (เลขรอบร่าง ถ้ามี · ไม่ผูกรอบ = `-`) · ใช้บันทึก Dr ลูกหนี้-รายได้ค้างรับ / Cr รายได้ค่าบริการ ตามเกณฑ์คงค้าง — **VAT ในไฟล์นี้ยังไม่ใช่ภาษีขายของงวด** (ภาษีขายเกิดเมื่อออกใบกำกับ ซึ่งอยู่ใน `12_Tax_Invoices.csv` ของงวดที่ออก) · Export ซ้ำในภายหลังอาจได้รายการน้อยลง (วางบิลไปแล้ว) — ไฟล์ของเวอร์ชันเดิมไม่ถูกทับ · ชุดเป็น 14 ไฟล์ (`file_count` = 14) · หน้า Export แสดงเวอร์ชันล่าสุดจริงของรอบ (BUG-160) · ไฟล์ 01–13 ไม่เปลี่ยน (`reference/samples/14_Unbilled_Revenue.csv` เพิ่มแล้ว) |
| v2.1 | 04/07/2569 | **กำหนดรูปแบบข้อมูลใน template (DEC-006/D10)**: `05_WHT_Data.csv` — `payee_tax_id` เป็นตัวเลข 13 หลักล้วนไม่มีขีดคั่น (ตรง validation `INVALID_TAX_ID_FORMAT`) / `06_Bank_Reconciliation.csv` — column `status` ใช้ค่า enum เต็ม 4 ค่า (`auto_matched`/`manual_matched`/`unmatched`/`unmatched_resolved`) ให้สำนักงานบัญชีเห็นที่มาการจับคู่ ไม่ simplify — template CSV ตัวอย่างแก้ให้ตรงแล้ว |

ขอบเขตเอกสารนี้: สร้างและติดตามประวัติการ Export "Accounting Pack" — ชุดไฟล์ข้อมูลที่ส่งมอบให้สำนักงานบัญชีภายนอกทุกรอบเดือน

**ไม่รวมอยู่ในไฟล์นี้**: การปิดงวดบัญชีเอง (ดู `30-accounting-handover-monthly-close.md` — Export เป็นแค่ส่วนหนึ่งของ flow ปิดงวด), เนื้อหารายละเอียดในแต่ละไฟล์ (อ้างอิงไฟล์ต้นทางของแต่ละโมดูล)

---

## 1. Summary

สร้างและติดตามประวัติการ Export "Accounting Pack" — ชุดไฟล์ข้อมูลที่ส่งมอบให้สำนักงานบัญชีภายนอกทุกรอบเดือน

## 2. Purpose

เป็นขั้นสุดท้ายของ Monthly Close (ไฟล์ 30) — รวบรวมข้อมูลทุกโมดูลเป็นไฟล์มาตรฐานพร้อมส่งมอบ และเก็บประวัติว่าส่งไปกี่ครั้ง เวอร์ชันไหน เมื่อไหร่

## 3. In Scope

- Export Accounting Pack (.zip) ตามรายชื่อไฟล์มาตรฐาน (ดู §6.1)
- ประวัติการ Export แต่ละรอบ (versioning — รอบเดียวอาจ export หลายครั้งถ้าต้องแก้ไข)
- เช็คเงื่อนไข Critical Exception ก่อนอนุญาต Export (เชื่อมไฟล์ 34)

## 4. Out of Scope

- การปิดงวดบัญชีเอง (ไฟล์ 30 — Export เป็นแค่ส่วนหนึ่งของ flow ปิดงวด)
- เนื้อหารายละเอียดในแต่ละไฟล์ (อ้างอิงไฟล์ต้นทางของแต่ละโมดูล)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| บัญชี (Accounting) | สร้าง/ดาวน์โหลด Export Pack, mark ว่าส่งแล้ว/ตอบรับแล้ว | Full |

## 6. Core Concepts

### 6.1 รายชื่อไฟล์มาตรฐานใน Accounting Pack (เรียงเลขต่อเนื่อง พร้อม Adjustment Log)

| ไฟล์ | Format | เนื้อหา | มาจากไฟล์ |
|---|---|---|---|
| 01_Revenue.csv | CSV UTF-8 | รายการรายได้ | 19 |
| 02_Cash_Receipts.csv | CSV UTF-8 | รายการเงินรับ | 31 |
| 03_Expenses.csv | CSV UTF-8 | รายการค่าใช้จ่าย | 32 |
| 04_Payments.csv | CSV UTF-8 | รายการจ่ายเงินจริง — `amount_baht` = สุทธิหลังภาษี · **ต่อท้าย** `advance_offset_baht` (หักคืนเงินทดรองหลังภาษี) + `transfer_baht` (= amount − หัก = เงินที่โอนจริง) (มติ PO 05/10/2569 U30) | 17 |
| 05_WHT_Data.csv | CSV UTF-8 | ข้อมูลหัก ณ ที่จ่าย — `payee_tax_id` เป็นตัวเลข 13 หลักล้วน (DEC-006/D10) · คอลัมน์สุดท้าย `filing_form` = `PND1`/`PND3`/`PND53` (มติ PO 05/10/2569 U15) | 33 |
| 06_Bank_Reconciliation.csv | CSV UTF-8 | ผลกระทบยอดธนาคาร — `status` ใช้ enum เต็ม (DEC-006/D10 · 6 ค่าตั้งแต่มติ PO U41) · ต่อท้าย `billing_batch_number` (มติ PO U79) | 35 |
| 07_Adjustment_Log.csv | CSV UTF-8 | รายการปรับปรุงยอดทั้งหมดของรอบนั้น — target_type, target_id, adjustment_type, amount, reason, approved_by · ต่อท้าย `billing_batch_number` (มติ PO U79) | 20 |
| 08_Document_Checklist.xlsx | XLSX | สถานะ Exception/เอกสารไม่ครบ — `doc_status` 4 ค่า: ครบถ้วน (`resolved`) / อนุญาตปิดงวด — ยังรอเอกสาร (`authorized` · มติ PO U31) / ขาดเอกสาร (critical ที่ `open`) / รอตรวจสอบ (`open` อื่น) · สรุปนับแยกครบ 4 กลุ่ม | 34 |
| 09_Credit_Notes.csv | CSV UTF-8 | ใบลดหนี้ (`CN`) / ใบเพิ่มหนี้ (`DN`) ที่ลงวันที่ในรอบ รวมใบที่ยกเลิก — document_type, number, issue_date, tax_invoice_ref, company, amount_before_vat_baht, vat_baht, total_baht, reason, status, adjustment_ref, company_branch (U82 — สาขาผู้ซื้อตามใบกำกับเดิม) (มติ PO 05/10/2569 U21) | 31 |
| 10_Customer_WHT.csv | CSV UTF-8 | ภาษีที่ลูกค้าหักเรา ณ ที่จ่าย + สถานะหนังสือ 50 ทวิ — received_date, company, company_tax_id, billing_ref, tax_invoice_ref, withheld_baht, cert_no, cert_date, cert_wht_baht, status, billing_batch_number (U79) (มติ PO 05/10/2569 U40) | 31 |
| 11_Suspense_Receipts.csv | CSV UTF-8 | เงินรับรอตรวจสอบ (ไม่ทราบที่มา — ไม่ใช่รายได้) — bank_txn_date, bank_ref, amount_baht, suspended_date, suspense_reason, status, resolved_ref, resolved_date, refund_reason, billing_batch_number (U79) (มติ PO 05/10/2569 U41) | 35 |
| 12_Tax_Invoices.csv | CSV UTF-8 | ใบกำกับภาษีขายที่ลงวันที่ในรอบ + ใบของรอบก่อนที่ยกเลิกในรอบนี้ — invoice_number, invoice_date, company, company_tax_id, amount_before_vat_baht, vat_baht, total_baht, vat_rate_pct, billing_ref, status (`active`/`cancelled`), cancelled_date, cancel_reason, replaced_by, pdf_file, company_branch (U77 — สำนักงานใหญ่/สาขาผู้ซื้อตาม snapshot บนใบ), billing_batch_number (U79) · **+ สำเนา PDF ในโฟลเดอร์ `tax_invoices/`** (เพดาน 200 ใบ/60 วินาที — ใบที่เกินอยู่ใน `tax_invoices/NOT_ATTACHED.txt`) (มติ PO 05/10/2569 U57) | 31 |
| 13_Advance_Returns.csv | CSV UTF-8 | รับคืนเงินทดรอง — return_date, advance_ref, payee, amount_baht, channel (`payout_offset`/`cash`/`bank_transfer`), payout_batch_ref (เฉพาะหักกลบ), evidence_file (เฉพาะรับแยก), status (`active`/`reversed`), reversed_date, reversal_reason (มติ PO 05/10/2569 U68) | 15 |
| 14_Unbilled_Revenue.csv | CSV UTF-8 | รายได้ค้างรับ (ส่งมอบแล้ว ยังไม่วางบิล ณ เวลาสร้างชุด · `revenue_date` ในงวดหรือก่อน) — case_ref, company, company_tax_id, delivered_date, fee_model, amount_before_vat_baht, vat_baht, total_baht, vat_rate_pct, billing_batch_number (รอบร่าง) (มติ PO 06/10/2569 U87) | 19 |

> **แก้ไขแล้ว**: เดิม UI ต้นแบบ (`accounting.html`) มีช่องว่างเลข 07 หายไป — เติม **Adjustment Log** เข้าไปแทน เพราะสำนักงานบัญชีจำเป็นต้องเห็นรายการปรับปรุงยอดทั้งหมดที่เกิดในรอบบัญชีนั้น — เรียงเลขต่อเนื่อง 01-08 ครบไม่มีช่องว่างแล้ว

### 6.2 Version Control

รอบบัญชีเดียวอาจ Export ได้หลายครั้ง (เช่น ส่งไปแล้วพบปัญหา ต้องแก้แล้วส่งใหม่) — เก็บเป็น `v1`, `v1.1`, `v1.2` ... ทุกเวอร์ชันเก็บไว้ ไม่เขียนทับ (audit trail ว่าเคยส่งอะไรไปบ้าง)

## 7. Data Entities / Required Objects

### 7.1 Export Record (แก้ไข status แล้ว — ดู Changelog v2)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| accounting_period | string | yes | — |
| version | string | yes | เช่น "v1.0", "v1.2" |
| file_count | integer | yes | จำนวนไฟล์หลัก (CSV/XLSX) |
| attachment_count | integer | yes | จำนวนเอกสารแนบ (ใบเสร็จ/หลักฐานที่แนบไปด้วย) |
| exported_by | uuid | yes | — |
| exported_at | timestamptz | yes | — |
| sent_at | timestamptz \| null | — | วันที่บัญชี mark ว่าส่งให้สำนักงานบัญชีแล้ว (เพิ่มใหม่ — ดู §9) |
| status | enum | yes | **`generated` (สร้างไฟล์เสร็จ) / `sent` (ส่งให้สำนักงานบัญชีแล้ว) / `accepted` (สำนักงานบัญชีตอบรับแล้ว)** — แก้จาก 4 สถานะเดิม (`not_exported`/`draft`/`exported`/`accepted`) ให้ตรงกับ enum `export_record_status` ใน `02-database-schema-design.md` |

## 8. UI / UX Rules

อ้างอิงจาก `accounting.html`:

- Table ประวัติ: รอบบัญชี, Version, ไฟล์ (จำนวน), เอกสารแนบ (จำนวน), ส่งโดย, วันที่, สถานะ (3 badge: generated=เทา/sent=ฟ้า/accepted=เขียว)
- Modal "Export Pack": banner เตือนสีเหลืองเรื่อง Critical Exception ต้องแก้ก่อน + รายชื่อไฟล์ที่จะอยู่ในชุด (grid 2 คอลัมน์ ตาม §6.1) + ปุ่ม "ดาวน์โหลดไฟล์ (.zip)"
- ปุ่ม "mark ว่าส่งแล้ว" แสดงเมื่อ status = generated (เพิ่มใหม่)
- ข้อความอธิบาย Export Format ด้านล่างหน้า: "ระบบสร้างไฟล์ CSV/XLSX ตามรูปแบบที่กำหนด"

## 9. Workflow / Lifecycle

`รอบบัญชีอยู่ใน collecting → ถึงเวลาปิดงวด (ไฟล์ 30) → เช็ค Critical Exception (ไฟล์ 34) ผ่านแล้ว → กด Export Pack → สร้างไฟล์ + บันทึก Export Record (status: generated) → บัญชีส่งให้สำนักงานบัญชี (นอกระบบ) → บัญชีกด "mark ว่าส่งแล้ว" (status: sent) → สำนักงานบัญชีตอบรับ → บัญชี mark status = accepted`

`ถ้าสำนักงานบัญชีพบปัญหา → ส่งคำถามกลับ (ไฟล์ 36) → บัญชีแก้ไข (ผ่าน Adjustment ถ้ารอบ locked แล้ว) → Export ใหม่เป็น version ถัดไป (v1.1)`

## 10. Security / Control Rules

- ห้าม Export ถ้ามี Critical Exception (`status = open`) เปิดอยู่และไม่มี `authorized` (ตามไฟล์ 34)
- Export Record เก่าห้ามลบ — เก็บ audit trail ทุกเวอร์ชัน

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| EXPORT_BLOCKED_CRITICAL | มี Critical Exception ที่ `open` อยู่ | reject (อ้างอิงไฟล์ 34) |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| Export Pack | บัญชี | full |
| ดูประวัติ | การเงิน, ผู้บริหาร | read-only |

## 13. Audit Log Requirements

- ทุกครั้งที่ Export ต้องบันทึก audit พร้อม version, ผู้ส่ง, รายชื่อไฟล์ที่อยู่ในชุด
- Mark sent/accepted ต้องบันทึก audit

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/accounting/export-history | list |
| POST | /api/accounting/export-pack | สร้าง Export ใหม่ (เช็ค Critical ก่อน) → status: generated |
| PATCH | /api/accounting/export-history/:id/mark-sent | mark ว่าส่งให้สำนักงานบัญชีแล้ว → status: sent |
| PATCH | /api/accounting/export-history/:id/accept | mark ว่าสำนักงานบัญชีตอบรับแล้ว → status: accepted |

## 15. Acceptance Criteria

- Export Pack สร้างไฟล์ครบตามรายชื่อใน §6.1
- บล็อก Export เมื่อมี Critical Exception ที่ open จริง
- Versioning ทำงานถูกต้องเมื่อ Export ซ้ำในรอบเดียวกัน
- 3 สถานะ (generated/sent/accepted) ทำงานถูกต้องตามลำดับ

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| Export มี Critical | พยายาม Export ขณะมี critical open | reject EXPORT_BLOCKED_CRITICAL |
| Export ซ้ำสร้าง version ใหม่ | Export รอบเดียวกันครั้งที่ 2 | version เพิ่มเป็น v1.1 ไม่ทับของเดิม |
| Mark sent | Export Record สถานะ generated กด "mark ว่าส่งแล้ว" | status เปลี่ยนเป็น sent, sent_at บันทึกเวลา |
| Checklist แยก authorized (U31) | Executive authorize exception critical แล้ว Export | แถวนั้นใน 08 = "อนุญาตปิดงวด — ยังรอเอกสาร" (ไม่ใช่ "ครบถ้วน") พร้อมหัวข้อ · สรุปนับแยก · export version เดิมไม่เปลี่ยน |
| ชุดมีไฟล์ 09 (U21) | บันทึกใบลดหนี้ + ใบเพิ่มหนี้ในรอบ แล้ว Export | zip มี `09_Credit_Notes.csv` หัวคอลัมน์ตรง template · แถว `CN`/`DN` ครบ · file_count = 9 |
| ชุดมีไฟล์ 10–11 (U40/U41) | มีรายการรอ 50 ทวิ + เงินรับรอตรวจสอบในรอบ แล้ว Export | zip มี `10_Customer_WHT.csv` / `11_Suspense_Receipts.csv` หัวคอลัมน์ตรง template · แถวครบ · file_count = 11 |
| ชุดมีไฟล์ 14 (U87) | มีรายได้ของงวดยังไม่ผูกรอบ + รายได้ในรอบร่าง + รายได้ในรอบที่ส่งแล้ว + รายได้งวดถัดไป แล้ว Export | `14_Unbilled_Revenue.csv` มีเฉพาะรายการที่ยังไม่วางบิลถึงสิ้นงวด (รอบร่างมีเลขรอบ) · ไม่รวมรอบที่ส่งแล้ว/งวดถัดไป/รายได้ที่ถูกลบ |
| ชุดมีไฟล์ 12–13 (U57/U68) | ออกใบกำกับ + ยกเลิก/ออกใบแทนในรอบ · หักคืนเงินทดรองในรอบจ่าย + รับคืนเงินสด + กลับรายการ แล้ว Export | zip มี `12_Tax_Invoices.csv` (ใบปกติ/ยกเลิก + `replaced_by`) + PDF ทุกใบใน `tax_invoices/` · `13_Advance_Returns.csv` แถวหักกลบ/รับแยก/`reversed` · Export ซ้ำได้ v1.1 ไฟล์เดิมไม่ถูกทับ |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Export Record มี 3 สถานะ**: `generated`/`sent`/`accepted` — ตัด `not_exported`/`draft` ที่ไม่เคยใช้จริง sync กับ schema แล้ว (§7.1)
- **เพิ่มขั้น "mark ว่าส่งแล้ว" แยกจาก "สร้างไฟล์เสร็จ"** เพื่อ trace ได้ว่าไฟล์พร้อมกับส่งจริงแล้วคนละเวลากันหรือไม่ (§9)
- **รายชื่อไฟล์ 01-08 ครบไม่มีช่องว่าง** รวม Adjustment Log เป็นไฟล์ 07 (§6.1)
- **Export Record เก่าห้ามลบเด็ดขาด** เก็บทุก version เป็น audit trail (§10)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — รายชื่อไฟล์ Export Pack เรียงเลขต่อเนื่องครบ 01-08 แล้ว และ status enum sync กับ schema เรียบร้อยแล้วในรอบนี้

---

*เอกสารนี้เป็นไฟล์สุดท้ายในหมวด Accounting Module (30–37)*
