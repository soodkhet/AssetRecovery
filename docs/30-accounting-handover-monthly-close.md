# 30-accounting-handover-monthly-close.md

# 30 — Accounting Handover & Monthly Close (ปิดงวดบัญชีรายเดือน)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Accounting Module
> เอกสารอ้างอิง: `13-accounting-finance-settings.md` §6.11 (Period Lock Policy), `02-database-schema-design.md` §9 (accounting_periods table), `34-accounting-document-checklist-exceptions.md`, `35-bank-reconciliation.md`, `37-accounting-pack-export-history.md`, `20-adjustment.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Accounting Period state machine, Readiness Check 3 เงื่อนไข |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — ตรวจสอบ enum `accounting_period_status` เทียบกับ `02-database-schema-design.md` แล้ว **ตรงกันทุกตัว ไม่พบ conflict** (ปิด flag ที่ตั้งไว้ใน `23-finance-state-machines.md` §6.13) — **เนื้อหา business logic เดิมคงไว้ครบ** |
| v2.1 | 04/07/2569 | **เติม error code เงื่อนไขที่ 3 ของ Readiness Check**: §6.2 กำหนด 3 เงื่อนไข แต่ §11 เดิมมี error code แค่ 2 ตัว — เติม `NOT_READY_BILLING_REVENUE_MISMATCH` (ยอดบิลไม่ตรงกับรายได้) พร้อม test case §16 — sync กับไฟล์ 24 v3 แล้ว — หมายเหตุเพิ่มเติม: `critical_count`/`warning_count` ใน §7.1 เป็น **derived field** (นับ real-time จากตาราง `exceptions` ผ่าน index `idx_exceptions_period`) ไม่ใช่ column จริงในตาราง `accounting_periods` — ระบุให้ชัดกัน dev สร้าง column ซ้ำซ้อน |
| v2.2 | 05/10/2569 | **มติ PO 05/10/2569 (U51/O25)**: ห้าม "ส่งสำนักงานบัญชี" และ "ล็อกงวด" ก่อนงวดนั้นสิ้นเดือน — งวดเดือน M ทำได้ตั้งแต่ **00:00 น. วันที่ 1 ของเดือนถัดไป เวลาไทย** (งวด ต.ค. 2569 → 01/11/2569 00:00 น.) · เติม §6.2a + Readiness ข้อ "งวดสิ้นเดือนแล้ว" · §8 ปุ่มส่ง/ล็อก disable พร้อมข้อความ "ส่ง/ล็อกได้ตั้งแต่ DD/MM/YYYY" · §11/§16 `PERIOD_NOT_ENDED` (sync `24` v4.26) · ไม่มี dev override วันที่ (เทสต์ฉีดเวลาที่ service เท่านั้น) |
| v2.3 | 05/10/2569 | **มติ PO 05/10/2569 (U40/U41)**: §6.2 Readiness เพิ่ม**คำเตือน (ไม่บล็อก)** — เงินรับรอตรวจสอบคงค้าง (ไฟล์ 35 §6.5) และหนังสือ 50 ทวิ จากลูกค้าที่ยังไม่ได้รับ (ไฟล์ 31 §6.6) ที่เกิดก่อนสิ้นงวด · `suspense` ไม่นับเป็นค้างจับคู่ของเงื่อนไขกระทบยอด 100% |
| v2.4 | 05/10/2569 | **มติ PO 05/10/2569 (U65)**: เพิ่มทางลัด **dev เท่านั้น** ส่ง/ล็อกงวดด้วยวันที่จำลอง (`POST /api/dev/accounting-periods/{id}/send|lock` + `asOf` — รายละเอียด `91` §14.2) เพื่อทดสอบ UAT ก่อนสิ้นเดือน · production = 404 · สิทธิ์เดียวกับ route จริง · audit ติด `[จำลองวันที่ DD/MM/YYYY]` · route จริงยังไม่รับเวลาจากผู้เรียก (ยกเลิกถ้อยคำ "ไม่มี dev override วันที่" ของ v2.2 เฉพาะทางลัดนี้) |
| v2.5 | 06/10/2569 | **มติ PO 06/10/2569 (UAT U87) + BUG-160**: §6.2 แยกเงื่อนไข "ยอดบิลตรงกับรายได้" เป็นสองกรณี — (ก) ยอดรอบวางบิลของงวดไม่ตรงกับผลรวมรายได้ที่อยู่ในรอบนั้นจริง ⇒ **ยังบล็อก** `NOT_READY_BILLING_REVENUE_MISMATCH` (ข) รายได้ที่ `revenue_date` อยู่ในงวด (หรือยกมา) แต่**ยังไม่วางบิล** (ไม่ผูกรอบ/อยู่ในรอบร่าง) ⇒ **เตือน ไม่บล็อก** "มีรายได้ค้างรับยังไม่วางบิล N รายการ ฿x — ส่งให้สำนักงานบัญชีบันทึกรายได้ค้างรับ" (เดิมบล็อก — รายได้ทางบัญชีรับรู้ตามเกณฑ์คงค้างในเดือนส่งมอบ ภาษีขายเกิดเมื่อออกใบกำกับ) · รายละเอียดส่งใน `14_Unbilled_Revenue.csv` (`37` v2.11) · BUG-160: เพิ่มคำเตือน (ไม่บล็อก) รอบวางบิลร่างที่ยังไม่ส่งลูกค้า (มีรายได้ของงวดนี้หรือก่อน) · §16 ปรับ test case |
| v2.6 | 06/10/2569 | **มติ PO 06/10/2569 U95 #6**: §6.2 Readiness เพิ่ม**คำเตือน (ไม่บล็อก)** "รับเงินแล้วแต่ยังไม่ออกใบเสร็จรับเงิน/ใบกำกับภาษี N รายการ ฿x" — เงินรับ (รับก่อนสิ้นงวด รวมยกมา) ที่ยังไม่มีใบ active และรอบไม่ได้ออกใบกำกับแบบเดิมไว้ · ภาษีขายเกิดในเดือนที่รับเงิน (`31` §6.2.1) |
| v2.7 | 06/10/2569 | มติ PO 06/10/2569 **U112** — Readiness เพิ่มข้อ "รอบจ่ายของงวดจ่ายสำเร็จหรือยกเลิกครบ" (blocker) · `send` และ `lock` (รวมทางลัด dev วันจำลอง) ตรวจรอบจ่ายของงวด (ผูกด้วย `payout_batches.created_at` เวลาไทย) ที่ยังไม่ `completed`/`cancelled` ⇒ `PERIOD_HAS_OPEN_PAYOUTS` + หน้าตรวจความพร้อมแสดงรายชื่อรอบที่ต้องจ่าย/ยกเลิกก่อน |
| v2.8 | 11/10/2569 | **staging E-058 (มติ PO 10/10/2569)** — §6.2 Readiness เพิ่ม**คำเตือน (ไม่บล็อก)** บัญชีค่าใช้จ่ายของงวดที่ยังไม่ map ศูนย์ต้นทุน (จำนวน + ยอด) · หน้าต่างสร้างชุดเอกสารบัญชีแสดงคำเตือนเดียวกัน (`AccountingPeriodDto.unmappedCostCenterCount`) |
| v2.9 | 11/10/2569 | **staging E-069 (มติ PO 10/10/2569)** — §14 เพิ่ม `POST /api/accounting/periods/:id/readiness` บันทึกทุกครั้งที่ตรวจ (`last_readiness_checked_at` + `last_readiness_passed_count`/`last_readiness_total_count` · audit) · แถวรอบบัญชีแสดง "ตรวจล่าสุด … · ผ่าน N/M" |

ขอบเขตเอกสารนี้: จัดการ "รอบบัญชี" (Accounting Period) แต่ละเดือน — ติดตามสถานะตั้งแต่เก็บข้อมูล จนถึงส่งมอบและล็อกรอบ ครอบคลุม flow ของทั้งกลุ่ม Accounting (31-37) — เป็น**จุดควบคุมกลาง**ที่ Period Lock Policy บังคับใช้

**ไม่รวมอยู่ในไฟล์นี้**: รายละเอียด Exception เอง (ดู `34-accounting-document-checklist-exceptions.md`), รายละเอียดการ Export (ดู `37-accounting-pack-export-history.md`), Adjustment (ดู `20-adjustment.md` — ใช้เมื่อรอบ locked แล้วต้องแก้ไข)

---

## 1. Summary

จัดการ "รอบบัญชี" (Accounting Period) แต่ละเดือน — ติดตามสถานะตั้งแต่เก็บข้อมูล จนถึงส่งมอบและล็อกรอบ ครอบคลุม flow ของทั้งกลุ่ม Accounting (31-37)

## 2. Purpose

เป็นจุดควบคุมกลางว่าแต่ละเดือน "พร้อมปิดงวดหรือยัง" — เชื่อมกับ Period Lock Policy (ไฟล์ 13 §6.11) ที่กำหนดว่าแก้ไขอะไรได้/ไม่ได้ในแต่ละสถานะ

## 3. In Scope

- Accounting Period entity และ state machine (`collecting` → `sent_to_accountant` → `locked`)
- ภาพรวมความพร้อมของแต่ละรอบ (จำนวน Critical/Warning Exception)
- เชื่อมต่อกับไฟล์ 34 (Exception), 37 (Export)

## 4. Out of Scope

- รายละเอียด Exception เอง (ไฟล์ 34)
- รายละเอียดการ Export (ไฟล์ 37)
- Adjustment (ไฟล์ 20 — ใช้เมื่อรอบ locked แล้วต้องแก้ไข)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| บัญชี (Accounting) | ดูแลรอบบัญชี, ตรวจสอบความพร้อม, Export | Full |
| บริหาร (Executive) | อนุมัติปลดล็อกรอบที่ `locked` | เฉพาะกรณีจำเป็น |

## 6. Core Concepts

### 6.1 Accounting Period State Machine

ใช้ state เดียวกับที่กำหนดไว้แล้วในไฟล์ 13 §6.11:

- `collecting` — กำลังเก็บข้อมูล แก้ไขเคสเดิมได้อิสระ
- `sent_to_accountant` — ส่งมอบให้สำนักงานบัญชีแล้ว (ผ่านไฟล์ 37) — แก้ไขได้จำกัด
- `locked` — ปิดงวดสมบูรณ์ — ห้ามแก้ source record โดยตรงเด็ดขาด ต้องใช้ Adjustment เท่านั้น

### 6.2 ความพร้อมก่อนปิดงวด (Readiness Check)

ก่อนเปลี่ยนสถานะจาก `collecting` → `sent_to_accountant` ระบบเช็คอัตโนมัติ (สอดคล้องกับ "ตรวจสอบความพร้อม" ใน UI):

- ยอดบิลตรงกับรายได้ (Billing Batch กับ Revenue ไฟล์ 19 sync กันครบ) — **เฉพาะยอดรอบวางบิลของงวดที่ไม่ตรงกับผลรวมรายได้ที่อยู่ในรอบนั้นจริง** (มติ PO U87 · v2.5)
- Bank Reconcile จับคู่ครบ 100% (ไม่มี `unmatched` transaction ค้างในรอบนั้น — ไฟล์ 35)
- ไม่มี Critical Exception เปิดอยู่ (ไฟล์ 34) — ถ้ามี Warning ผ่านได้แต่ต้องแสดงเตือน
- **เตือนอย่างเดียว ไม่บล็อก (มติ PO 05/10/2569 U40/U41)**: เงินรับรอตรวจสอบคงค้าง (`suspense` — ไม่นับเป็นรายการค้างจับคู่) และหนังสือ 50 ทวิ จากลูกค้าที่ยังรอ — นับรายการที่เกิดก่อนสิ้นงวด (รวมยกมาจากงวดก่อน)
- **เตือนอย่างเดียว ไม่บล็อก (มติ PO 06/10/2569 U87)**: รายได้ค้างรับ = รายได้ที่ `revenue_date` ก่อนสิ้นงวด (งวดนี้หรือยกมา) และยังไม่อยู่ในรอบวางบิลที่ส่งลูกค้าแล้ว (ไม่ผูกรอบ / อยู่ในรอบร่าง / รอบถูกลบ) — ข้อความ "มีรายได้ค้างรับยังไม่วางบิล N รายการ ฿x — ส่งให้สำนักงานบัญชีบันทึกรายได้ค้างรับ" · แสดงยอดแยกตามบริษัทใน Modal · รายละเอียดรายเคสอยู่ใน `14_Unbilled_Revenue.csv` (`37` §6.1) — นิยามเดียวกันทั้งคำเตือนและไฟล์
- **เตือนอย่างเดียว ไม่บล็อก (มติ PO 06/10/2569 U95)**: เงินรับที่รับก่อนสิ้นงวด (รวมยกมา) แต่**ยังไม่ออกใบเสร็จรับเงิน/ใบกำกับภาษี** (ไม่มีใบ active และรอบไม่ได้ออกใบกำกับแบบเดิมไว้) — "รับเงินแล้วแต่ยังไม่ออกใบเสร็จรับเงิน/ใบกำกับภาษี N รายการ ฿x" (ยอด = เงินโอน + ภาษีที่ลูกค้าหัก) · ออกได้ที่แท็บเงินรับ
- **เตือนอย่างเดียว ไม่บล็อก (BUG-160)**: รอบวางบิลร่าง (`draft`) ที่ยังไม่ส่งลูกค้าและมีรายได้ของงวดนี้หรือก่อน — บอกจำนวนรอบ เลขรอบ (ไม่เกิน 5 เลข) และยอดรวม

### 6.2a ส่ง/ล็อกได้เมื่องวดสิ้นเดือนแล้วเท่านั้น (มติ PO U51)

- `send` (`collecting → sent_to_accountant`) และ `lock` (`sent_to_accountant → locked`) ของงวดเดือน M ทำได้ตั้งแต่ **00:00 น. วันที่ 1 ของเดือน M+1 ตามเวลาไทย** (Asia/Bangkok) — ตรวจที่ API ด้วยเวลา server (เก็บ/เทียบเป็น UTC: งวด ต.ค. 2569 = `2026-10-31T17:00:00Z`)
- ก่อนเวลานั้น → reject `PERIOD_NOT_ENDED` พร้อมวันที่ที่ทำได้ (พ.ศ.) · Readiness Check แสดงข้อ "งวดสิ้นเดือนแล้ว" เป็นข้อแรก (ไม่ผ่าน = ยังไม่พร้อม)
- ใช้กับ `lock` ด้วยแม้รอบจะถูกส่งไปแล้ว (รอบที่ถูกส่งก่อนมีมตินี้ต้องรอสิ้นเดือนจึงล็อกได้) · `unlock` ไม่ถูกจำกัด
- UI: ปุ่ม "ส่งสำนักงานบัญชี"/"ล็อกงวด" แสดงแต่ disable พร้อมข้อความ "ส่ง/ล็อกได้ตั้งแต่ DD/MM/YYYY"
- ทดสอบก่อนสิ้นเดือน (dev/UAT เท่านั้น — มติ PO U65): ทางลัด `POST /api/dev/accounting-periods/{id}/send|lock` รับ `asOf` จำลองวันนี้ให้ยามข้อนี้ · production ตอบ 404 · audit ติด `[จำลองวันที่ DD/MM/YYYY]` (`91` §14.2)

## 7. Data Entities / Required Objects

### 7.1 Accounting Period

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| month | string | yes | เช่น "มิถุนายน 2569" |
| status | enum | yes | `collecting` / `sent_to_accountant` / `locked` |
| critical_count, warning_count | integer | yes | นับจาก Exception ของรอบนั้น (ไฟล์ 34) — **derived field คำนวณ real-time จากตาราง `exceptions`** ไม่ใช่ column จริงใน `accounting_periods` (schema ไฟล์ 02 มี index `idx_exceptions_period(period_id, level, status)` รองรับอยู่แล้ว) |
| exported_at | timestamptz \| null | — | วันที่ Export ล่าสุด (อ้างอิงไฟล์ 37) |
| locked_at | timestamptz \| null | — | — |
| locked_by | uuid \| null | — | — |

## 8. UI / UX Rules

อ้างอิงจาก `accounting.html`:

- Table: เดือน, สถานะ (badge), จำนวน Critical (แดง) + Warning (ส้ม), วันที่ Export ล่าสุด, ปุ่ม "ตรวจความพร้อม" + ปุ่ม "Export Pack"
- Modal "ตรวจความพร้อม" (accounting-checklist): checklist แสดงสถานะแต่ละเงื่อนไข (ตาม §6.2) พร้อม icon ติ๊กเขียว/เตือนเหลือง
- ปุ่ม "ส่งสำนักงานบัญชี"/"ล็อกงวด" ของงวดที่ยังไม่สิ้นเดือน: แสดงแต่ disable + ข้อความ "ส่ง/ล็อกได้ตั้งแต่ DD/MM/YYYY" (พ.ศ. — §6.2a มติ PO U51)

## 9. Workflow / Lifecycle

`เดือนใหม่เริ่มต้น → status: collecting (ข้อมูลทยอยเข้าจากทุกโมดูลตามปกติ) → ถึงปลายเดือน → บัญชีกด "ตรวจความพร้อม" → ผ่านเงื่อนไข §6.2 (warning ผ่านได้ critical ห้าม) → Export Pack (ไฟล์ 37) → status: sent_to_accountant → สำนักงานบัญชีตรวจสอบ/ถามคำถาม (ไฟล์ 36) ถ้ามี → แก้ไขจนเรียบร้อย → บัญชี/Executive ยืนยันปิดงวด → status: locked`

`ปลดล็อกรอบ locked` (กรณีจำเป็นต้องแก้ไขเพิ่มเติมจริงๆ) `→ ต้อง Executive อนุมัติ + บันทึก audit log ชัดเจน (ตามไฟล์ 13 §6.11) → กลับไป sent_to_accountant ชั่วคราว → แก้ไขผ่าน Adjustment → ล็อกใหม่`

## 10. Security / Control Rules

- เปลี่ยนสถานะ `collecting → sent_to_accountant` ต้องผ่าน Readiness Check เสมอ ห้าม force ข้าม
- ปลดล็อกรอบ `locked` ต้อง Executive เท่านั้น (ตามไฟล์ 13 §6.11)

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| NOT_READY_CRITICAL_OPEN | พยายามเปลี่ยนเป็น sent_to_accountant ขณะมี critical เปิดอยู่ | reject พร้อมรายชื่อ critical (เชื่อมไฟล์ 34) |
| NOT_READY_RECONCILE_INCOMPLETE | Bank Reconcile ยังไม่ครบ 100% | reject พร้อมจำนวนรายการ unmatched ที่เหลือ |
| NOT_READY_BILLING_REVENUE_MISMATCH | ยอด Billing Batch ยังไม่ sync ตรงกับ Revenue ของรอบนั้น (เงื่อนไขที่ 3 ตาม §6.2) | reject พร้อมรายการที่ไม่ตรง |
| UNLOCK_REQUIRES_EXECUTIVE | พยายามปลดล็อกรอบ locked โดยไม่ใช่ Executive | reject |
| PERIOD_NOT_ENDED | ส่ง/ล็อกงวดก่อน 00:00 น. วันที่ 1 ของเดือนถัดไป (เวลาไทย — §6.2a) | reject พร้อมวันที่ที่ทำได้ |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| จัดการรอบบัญชี (collecting → sent) | บัญชี | full |
| ปลดล็อกรอบ locked | Executive only | — |
| ดูภาพรวมทั้งหมด | การเงิน, ผู้บริหาร | read-only |

## 13. Audit Log Requirements

- การเปลี่ยนสถานะทุกครั้งต้อง audit
- การปลดล็อกรอบ locked ต้องบันทึกแยกชัดเจนพร้อมเหตุผล

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/accounting/periods | list |
| GET | /api/accounting/periods/:id/readiness | เช็คความพร้อม (real-time) |
| POST | /api/accounting/periods/:id/readiness | เช็คความพร้อม (real-time) **และบันทึก** เวลา + ผล (ผ่าน N/M) + audit ลงรอบบัญชี — หน้าต่างตรวจความพร้อมใช้ตัวนี้ · รอบ `locked` คืนผลโดยไม่บันทึก (staging E-069) |
| PATCH | /api/accounting/periods/:id/send | เปลี่ยนเป็น sent_to_accountant (เช็ค readiness ก่อน) |
| PATCH | /api/accounting/periods/:id/lock | ล็อกรอบ |
| PATCH | /api/accounting/periods/:id/unlock | ปลดล็อก (Executive only) |

## 15. Acceptance Criteria

- Readiness Check ทำงานถูกต้องครบทั้ง 3 เงื่อนไข (§6.2)
- State machine ทำงานถูกต้องตาม Period Lock Policy ของไฟล์ 13
- ปลดล็อกรอบ locked ทำได้เฉพาะ Executive พร้อม audit

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| ปิดงวดมี Critical ค้าง | พยายาม send ขณะมี critical exception เปิด | reject NOT_READY_CRITICAL_OPEN |
| Bank Reconcile ไม่ครบ | พยายาม send ขณะมี unmatched transaction | reject NOT_READY_RECONCILE_INCOMPLETE |
| ยอดบิลไม่ตรงรายได้ | พยายาม send ขณะยอดรอบวางบิลของงวดไม่ตรงกับผลรวมรายได้ที่อยู่ในรอบ | reject NOT_READY_BILLING_REVENUE_MISMATCH |
| ปลดล็อกโดยไม่ใช่ Executive | บัญชี (ไม่ใช่ Executive) พยายามปลดล็อกรอบ locked | reject UNLOCK_REQUIRES_EXECUTIVE |
| ส่ง/ล็อกก่อนสิ้นเดือน | send/lock งวด ส.ค. ณ 31/08 23:59 น. (ไทย) แล้วอีกครั้ง ณ 01/09 00:00 น. | ครั้งแรก reject PERIOD_NOT_ENDED · ครั้งที่สองผ่าน |

| รายได้ค้างรับยังไม่วางบิล (U87) | มีรายได้ของงวด (และยกมา) ที่ยังไม่ผูกรอบ/อยู่ในรอบร่าง แล้วกดตรวจความพร้อม + send | ผ่าน (ไม่บล็อก) + คำเตือนรายได้ค้างรับ N รายการ ฿x · ยอดรอบที่ไม่ตรงจริงยังบล็อก |
| รอบวางบิลร่างค้าง (BUG-160) | มีรอบ `draft` ที่ถือรายได้ของงวด แล้วตรวจความพร้อม | ผ่าน + คำเตือนรอบร่างค้างพร้อมเลขรอบและยอด |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Accounting Period เป็น "state แม่" ที่ควบคุม Period Lock Policy ทั้งระบบ** — ตรงกับที่บันทึกไว้ใน `23-finance-state-machines.md` §6.13 (ยืนยันไม่มี conflict กับ schema)
- **Readiness Check ต้องผ่านครบ 3 เงื่อนไข**: Billing=Revenue sync, Bank Reconcile 100%, ไม่มี Critical Exception — Warning ผ่านได้ (§6.2)
- **ปลดล็อกรอบ locked ต้อง Executive เท่านั้น พร้อม audit แยกชัดเจน** (§10, §12, §13)
- **ปลดล็อกแล้วกลับไป `sent_to_accountant` ชั่วคราว ไม่ใช่กลับ `collecting`** — แก้ไขผ่าน Adjustment แล้วล็อกใหม่ (§9)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — โครงสร้าง state machine อ้างอิงจาก Period Lock Policy (ไฟล์ 13) ที่ชัดเจนแล้ว และตรวจสอบกับ schema แล้วไม่พบ conflict

---

*เอกสารนี้เป็นไฟล์แรกในหมวด Accounting Module (30–37) ต่อด้วย `31-accounting-sales-and-receipts.md`*
