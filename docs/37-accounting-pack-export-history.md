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
| 04_Payments.csv | CSV UTF-8 | รายการจ่ายเงินจริง | 17 |
| 05_WHT_Data.csv | CSV UTF-8 | ข้อมูลหัก ณ ที่จ่าย — `payee_tax_id` เป็นตัวเลข 13 หลักล้วน (DEC-006/D10) | 33 |
| 06_Bank_Reconciliation.csv | CSV UTF-8 | ผลกระทบยอดธนาคาร — `status` ใช้ enum เต็ม 4 ค่า (DEC-006/D10) | 35 |
| 07_Adjustment_Log.csv | CSV UTF-8 | รายการปรับปรุงยอดทั้งหมดของรอบนั้น — target_type, target_id, adjustment_type, amount, reason, approved_by | 20 |
| 08_Document_Checklist.xlsx | XLSX | สถานะ Exception/เอกสารไม่ครบ | 34 |

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
