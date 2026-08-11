# 34-accounting-document-checklist-exceptions.md

# 34 — Document Checklist & Exceptions (รายการตรวจสอบเอกสารและข้อยกเว้น)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — แก้ไข Exception status structure)
> Document Level: Accounting Module
> เอกสารอ้างอิง: `14-finance-dashboard.md`, `30-accounting-handover-monthly-close.md`, `37-accounting-pack-export-history.md`, `02-database-schema-design.md` §9 (exceptions table), `23-finance-state-machines.md` §6.12

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Exception (info/warning/critical), Authorized Exception เป็น entity แยก, state `open→in_progress→resolved` |
| v2 | 03/07/2569 | **แก้ไขสำคัญ**: (1) ตัดสถานะ `in_progress` ออก — ไม่มีจริงใน enum `exception_status` ของ schema (2) **ยุบ "Authorized Exception Record" เข้าเป็น field ในตาราง `exceptions` เอง** (`authorized_by`/`authorized_at`/`authorize_note`) ไม่ใช่ entity แยกอีกต่อไป ตรงกับ schema จริง (3) **authorize แล้ว status เปลี่ยนเป็น `authorized` ทันที** (ไม่ใช่ยัง `open` แบบเดิม) — ยืนยันกับ Product Owner แล้ว พร้อมเพิ่มมาตรการกันปัญหา "หายเงียบ": `authorized` ต้องแสดงแยกจาก `resolved` เสมอในทุกรายงาน และ**ไม่สืบทอดข้ามรอบบัญชีใหม่** — ปิด flag ที่ตั้งไว้ใน `23-finance-state-machines.md` §6.12 |
| v2.1 | 04/07/2569 | **เติม §14**: `PATCH /api/exceptions/:id` (แก้ไขรายละเอียด level/title/description/module ขณะยัง `open`) — endpoint นี้อยู่ในไฟล์ 27 §6.13 มาตลอดและสอดคล้องกับ §8 (ฟอร์มสร้าง/แก้ไข) + §12 (สิทธิ์ "สร้าง/แก้ไข/resolve") แต่ตกหล่นจากตาราง API ของไฟล์นี้ — sync สองทางกับไฟล์ 27 v3 แล้ว (ฝั่ง 27 เติม `/resolve` ที่ขาด) |

ขอบเขตเอกสารนี้: รวมรายการ "ปัญหา/ข้อมูลไม่ครบ" ทั้งระบบเป็นจุดเดียว (Exception) ให้บัญชีไล่แก้ก่อนปิดงวด — เป็นฐานที่ไฟล์ 14 (Dashboard) และ 30 (Monthly Close) ใช้เช็คว่าพร้อม Export Accounting Pack หรือยัง

**ไม่รวมอยู่ในไฟล์นี้**: การแก้ไขปัญหาต้นทาง (ทำที่โมดูลนั้นโดยตรง), การ Export Pack เอง (ดู `37-accounting-pack-export-history.md`)

---

## 1. Summary

รวมรายการ "ปัญหา/ข้อมูลไม่ครบ" ทั้งระบบเป็นจุดเดียว (Exception) ให้บัญชีไล่แก้ก่อนปิดงวด — เป็นฐานที่ไฟล์ 14 (Dashboard) และ 30 (Monthly Close) ใช้เช็คว่าพร้อม Export Accounting Pack หรือยัง

## 2. Purpose

ป้องกันการส่งมอบบัญชีที่มีข้อมูลไม่ครบ/ผิดพลาดให้สำนักงานบัญชี โดยรวบรวมปัญหาทุกประเภทมาไว้จุดเดียวแทนการไล่ดูทีละโมดูล

## 3. In Scope

- Exception record: ระดับความสำคัญ, โมดูลที่เกี่ยว, รายละเอียด, ผู้รับผิดชอบ, สถานะ
- กฎ "ห้าม Export ถ้ามี Critical เปิดอยู่ (`open`)" เว้นแต่ Executive authorize (status → `authorized`)

## 4. Out of Scope

- การแก้ไขปัญหาต้นทาง (ทำที่โมดูลนั้นโดยตรง — ไฟล์นี้แค่ track ว่ามีปัญหาและสถานะแก้ไข)
- การ Export Pack เอง (ไฟล์ 37)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| บัญชี (Accounting) | สร้าง/ติดตาม/ปิด Exception | Full |
| บริหาร (Executive) | Authorize Exception (ยกเว้นให้ Export ได้ทั้งที่มี Critical เปิด) | เฉพาะกรณีจำเป็นจริง |

## 6. Core Concepts

### 6.1 Severity Levels

| Level | ความหมาย | ผลกระทบ |
|---|---|---|
| `info` | ข้อมูลทั่วไป ไม่ใช่ปัญหา | ไม่บล็อกอะไร |
| `warning` | ควรแก้ไข แต่ไม่ใช่ blocker | ไม่บล็อก Export แต่แสดงเตือนตลอด |
| `critical` | ต้องแก้ไขก่อน | **บล็อก Export Accounting Pack** (ไฟล์ 37) จนกว่า status จะเป็น `resolved` หรือ `authorized` |

### 6.2 Status: 3 สถานะ (แก้ไขแล้ว — ดู Changelog v2)

| Status | ความหมาย | บล็อก Export ไหม |
|---|---|---|
| `open` | ยังไม่ได้จัดการ | บล็อก (ถ้า critical) |
| `authorized` | Executive อนุมัติให้ข้ามได้สำหรับรอบนี้ — **ยังไม่ใช่แก้จริง** เก็บ `authorized_by`/`authorized_at`/`authorize_note` ไว้ในแถวเดียวกัน | ไม่บล็อก (สำหรับรอบบัญชีปัจจุบันเท่านั้น) |
| `resolved` | แก้ไขปัญหาต้นทางจริงแล้ว | ไม่บล็อก |

> **ไม่มีสถานะ `in_progress`** — ตัดออกจาก v1 เพราะไม่มีจริงใน schema เมื่อกำลังแก้ไขให้ยัง `open` ต่อไปจนกว่าจะ `resolved` จริง (บัญชีสามารถบันทึกความคืบหน้าใน detail/comment ได้โดยไม่ต้องเปลี่ยน status)

### 6.3 Authorized Exception — ยุบเข้าเป็น field เดียวกับ Exception แล้ว (แก้ไขแล้ว)

**ไม่ใช่ entity แยกอีกต่อไป** — เดิม v1 ออกแบบเป็น "Authorized Exception Record" ต่างหาก แต่ schema จริงเก็บเป็น field ในแถว `exceptions` เอง (`authorized_by`, `authorized_at`, `authorize_note`) — 1 exception authorize ได้ครั้งเดียวต่อ 1 record

**มาตรการป้องกัน "หายเงียบ"** (สำคัญ — ยืนยันกับ Product Owner แล้ว):

- `authorized` ต้องแสดง**แยกหมวดชัดเจนจาก `resolved` เสมอ**ในทุกที่ที่แสดงผล (Dashboard ไฟล์ 14, รายงาน) — เช่น "ผ่านแบบมีข้อยกเว้น N รายการ" ไม่ปนกับ "แก้ไขแล้ว N รายการ"
- **ไม่สืบทอดสถานะข้ามรอบบัญชีใหม่** — ถ้าปัญหาเดิมยังไม่ถูกแก้จริง (แค่ authorized ของเดือนก่อน) รอบบัญชีเดือนถัดไปที่ตรวจพบปัญหาเดิมซ้ำต้องสร้าง Exception **ใหม่** (record ใหม่) ไม่ใช้ authorized เดิมข้ามเดือน
- `authorized` ปลดบล็อก Export ได้เฉพาะ**รอบบัญชี (accounting_period) เดียวกับที่ authorize ไว้เท่านั้น**

## 7. Data Entities / Required Objects

### 7.1 Exception (รวม Authorized fields เข้ามาแล้ว — ดู Changelog v2)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| level | enum | yes | `info` / `warning` / `critical` |
| module | string | yes | `billing` / `payout` / `bank` ฯลฯ (source_module — ขยายได้ตามโมดูลที่เกี่ยวข้องจริง) |
| title, description | string | yes | หัวข้อ + รายละเอียดปัญหา |
| source_ref | string \| null | — | อ้างอิงรายการต้นทาง (free text ไม่ใช่ FK เพราะอาจไม่ผูก record เฉพาะเจาะจง) |
| status | enum | yes | **`open` / `authorized` / `resolved`** (ตัด `in_progress` ออกแล้ว — ดู §6.2) |
| accounting_period_id | uuid | yes | รอบบัญชีที่เกี่ยวข้อง |
| resolved_by, resolved_at, resolution_note | uuid, timestamptz, text \| null | — | กรอกเมื่อ status = resolved |
| authorized_by, authorized_at, authorize_note | uuid, timestamptz, text \| null | — | กรอกเมื่อ status = authorized — **Executive เท่านั้น + reason บังคับ** |

## 8. UI / UX Rules

อ้างอิงจาก `accounting.html`:

- Table: ระดับ (badge สี), Module, รายละเอียด, Owner, สถานะ (3 badge: open=แดง/authorized=ม่วง/resolved=เขียว), ปุ่ม "แก้ไข"
- Banner เตือนด้านล่าง: "ถ้ามี Critical เปิดอยู่ (open) ระบบจะไม่อนุญาตให้ Export Accounting Pack ยกเว้น Executive authorize"
- ฟอร์มสร้าง/แก้ไข Exception: เลือกระดับ (dropdown: ข้อมูลทั่วไป=info/คำเตือน=warning/วิกฤต=critical), รายละเอียด, Module, สถานะ
- Dashboard/รายงานต้องแสดง `authorized` แยกหมวดจาก `resolved` เสมอ (ดู §6.3)

## 9. Workflow / Lifecycle

`เกิด Exception (จากระบบอัตโนมัติตรวจพบ หรือบัญชีสร้างมือ) → open → resolved (แก้ไขปัญหาต้นทางจริงแล้ว)`

`พยายาม Export Pack ขณะมี critical ที่ open → ระบบบล็อก → ถ้าจำเป็นจริง Executive authorize (กรอกเหตุผลบังคับ) → status: authorized → Export ผ่านได้เฉพาะรอบบัญชีนั้น → รอบบัญชีถัดไปถ้าปัญหายังไม่แก้จริง ต้องตรวจพบเป็น Exception ใหม่อีกครั้ง (ไม่สืบทอด authorized เดิม)`

## 10. Security / Control Rules

- Authorize Exception (`status → authorized`) ต้อง Executive เท่านั้น พร้อมเหตุผลบังคับ (`authorize_note`)
- ปิด Exception (`resolved`) ควรมีหลักฐาน/คำอธิบายว่าแก้ไขอย่างไร (`resolution_note`)
- `authorized` ปลดบล็อกเฉพาะรอบบัญชีเดียวกับที่ authorize เท่านั้น ห้ามใช้ข้ามรอบ

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| EXPORT_BLOCKED_CRITICAL | พยายาม Export Pack ขณะมี critical ที่ `open` อยู่ในรอบนั้น | reject พร้อมรายชื่อ critical ที่ต้องแก้ |
| AUTHORIZED_EXCEPTION_REASON_REQUIRED | Authorize Exception โดยไม่กรอก `authorize_note` | reject |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| สร้าง/แก้ไข/resolve Exception | บัญชี | full |
| Authorize Exception | Executive only | — |
| ดูทั้งหมด | การเงิน | read-only |

## 13. Audit Log Requirements

- Authorize Exception ต้อง audit เด่นชัด (เป็นการข้ามกฎความปลอดภัยที่ตั้งใจไว้)
- Resolve Exception ต้อง audit พร้อม resolution_note

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/exceptions | list (filter: level, module, status, accounting_period_id) |
| POST | /api/exceptions | สร้าง |
| PATCH | /api/exceptions/:id | แก้ไขรายละเอียด (level/title/description/module) — ทำได้เฉพาะขณะ status = `open` |
| PATCH | /api/exceptions/:id/resolve | resolve พร้อม resolution_note |
| POST | /api/exceptions/:id/authorize | authorize พร้อม authorize_note (Executive only) |

## 15. Acceptance Criteria

- Export Pack ถูกบล็อกจริงเมื่อมี critical ที่ `open` อยู่ในรอบนั้น
- Authorize แล้ว status เปลี่ยนเป็น `authorized` ทันที ไม่บล็อก Export รอบนั้นอีก
- รอบบัญชีถัดไปตรวจพบปัญหาเดิมซ้ำ (ถ้ายังไม่แก้จริง) ต้องสร้าง Exception ใหม่ ไม่ใช้ authorized เดิม
- Dashboard/รายงานแสดง `authorized` แยกจาก `resolved` เสมอ

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| Export ถูกบล็อก | พยายาม Export Pack ขณะมี critical status=open | reject EXPORT_BLOCKED_CRITICAL |
| Authorize สำเร็จ | Executive authorize exception พร้อมเหตุผล แล้ว Export อีกครั้ง | Export สำเร็จ — status เปลี่ยนเป็น authorized |
| Authorize ไม่กรอกเหตุผล | Executive พยายาม authorize โดยไม่กรอก authorize_note | reject AUTHORIZED_EXCEPTION_REASON_REQUIRED |
| ไม่สืบทอดข้ามรอบ | รอบบัญชีถัดไป ปัญหาเดิม (ที่เคย authorized) ยังไม่ถูกแก้จริง | ระบบตรวจพบเป็น Exception ใหม่ (record ใหม่) ของรอบใหม่ ไม่ดึง authorized เดิมมาข้าม |
| Dashboard แยกหมวด | มี exception ทั้ง authorized และ resolved ในรอบเดียวกัน | แสดงแยก 2 หมวดชัดเจน ไม่ปนกัน |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Exception มี 3 สถานะเท่านั้น**: `open`/`authorized`/`resolved` — ตัด `in_progress` ที่ไม่มีจริงใน schema (§6.2)
- **Authorized Exception ไม่ใช่ entity แยก** — เป็น field ฝังในตาราง `exceptions` เอง (§6.3, §7.1) — sync กับ schema จริงแล้ว
- **Authorize แล้ว status เปลี่ยนเป็น `authorized` ทันที** (ไม่ใช่ยัง `open`) — ยืนยันกับ Product Owner แล้ว (03/07/2569) พร้อมมาตรการป้องกันหายเงียบ 3 ข้อ (§6.3)
- **`authorized` ปลดบล็อกเฉพาะรอบบัญชีเดียวกันเท่านั้น ไม่สืบทอดข้ามเดือน** (§9, §10, §15)
- **`authorized` ต้องแสดงแยกจาก `resolved` เสมอในทุกรายงาน/Dashboard** ป้องกันไม่ให้ปัญหาที่ยังไม่แก้จริงถูกนับปนกับที่แก้แล้ว (§6.3, §8)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — โครงสร้าง Exception/Authorized sync กับ schema เรียบร้อยแล้วในรอบนี้

---

*เอกสารนี้เป็นไฟล์ที่ 5 ในหมวด Accounting Module (30–37) ต่อจาก `33-accounting-wht-data.md` และก่อน `35-bank-reconciliation.md`*
