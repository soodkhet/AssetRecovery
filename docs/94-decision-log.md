# 94-decision-log.md

# 94 — Decision Log
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — แก้ลำดับเลขข้อ + เพิ่ม DEC-005)
> Document Level: Foundation / Platform Build Spec
> Applies To: All implementation sprints
> เอกสารอ้างอิง: `01-architecture.md`, `02-database-schema-design.md`, `04-ui-ux-design-system.md`, `README.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — DEC-001 ถึง DEC-004 |
| v1.1 | 02/07/2569 | ปิด DEC-001 (Tech Stack), DEC-002 (Permission Architecture), DEC-003 (File Storage), DEC-004 (Polymorphic Relation) |
| v2 | 03/07/2569 | **แก้ลำดับเลขข้อที่สลับกันในต้นฉบับ** (เดิม "§18 Decision Records" อยู่ก่อน "§17 Open Items" ซึ่งผิดลำดับ) — จัดใหม่ให้ Decision Records เป็น §17 ตามมาตรฐานไฟล์อื่นในชุดนี้ + **เพิ่ม DEC-005 (UI Datetime Calendar Standard = พ.ศ.)** ที่ยืนยันกับ Product Owner ระหว่าง reformat ไฟล์ `04-ui-ux-design-system.md` — **เนื้อหา DEC-001~004 เดิมคงไว้ครบทุกตัวอักษร ไม่มีการแก้ไข** |
| v3 | 04/07/2569 | **เพิ่ม DEC-006 (Batch 6 Consistency Sync — คำตอบ D1–D10 ครบชุด)** — Product Owner ตอบผ่าน `DECISIONS-NEEDED-BATCH6.md` เมื่อ 04/07/2569 |
| v3.1 | 05/07/2569 | **เพิ่ม DEC-007 (Mockup Audit 04/07/2569), DEC-008 (Service Fee Template แสดงเป็นการ์ด), DEC-009 (Functional Permission 3 ระดับ)** — เก็บตกการตัดสินใจ 2 รอบหลังที่ยังไม่ได้ลงบันทึก · DEC-009 มี doc sync ค้าง (schema `role_capabilities.access_level` + ไฟล์ 13 §6.10 + ไฟล์ 25) ⏳ รอ Product Owner สั่งเดิน |
| v3.2 | 05/07/2569 | **ปิด doc sync ของ DEC-009** — Product Owner สั่งเดิน: `02` v3.6 / `13` v3.1 / `25` v2.2 เสร็จครบ อัปเดตช่อง Impact ของ DEC-009 เป็น ✅ |

ขอบเขตเอกสารนี้: บันทึกการตัดสินใจสำคัญของโปรเจกต์ทั้งหมด (scope, architecture, accounting boundary, workflow policy) — เป็น **single source of truth ของทุก DEC** ที่ไฟล์อื่นอ้างอิงกลับมา

**ไม่รวมอยู่ในไฟล์นี้**: Open Item ที่ยังไม่ได้ตัดสินใจ (ดู `93-roadmap-open-items.md` ซึ่งเป็น index กลางของ Open Item ทั้งหมด), คำถามที่รอนักบัญชี (ดู `QUESTIONS-FOR-ACCOUNTANT.md`)

---

## 1. Summary

บันทึกการตัดสินใจสำคัญ เช่น scope, architecture, accounting boundary, workflow policy

## 2. Purpose

บันทึกการตัดสินใจสำคัญ เช่น scope, architecture, accounting boundary, workflow policy

## 3. In Scope

- Foundation spec
- ใช้รองรับกลุ่ม A และอนาคต
- กำหนดมาตรฐาน implementation

## 4. Out of Scope

- business flow เฉพาะหน้าจอในกลุ่ม A
- workflow ติดตามทรัพย์ final

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| Superadmin | กำหนดค่าและเข้าถึงทุกส่วน | Global |
| บริหาร / Executive | อนุมัติ policy, exception, lock/unlock, scope decision | Organization |
| บัญชี (Accounting) | ตรวจข้อมูลบัญชี ส่งออก pack กระทบยอด WHT | Accounting scope |
| การเงิน (Finance) | ควบคุม claim payout payee billing receipt | Finance scope |
| เจ้าหน้าที่อนุมัติเคส (Case Approver) | พิจารณารับ/ไม่รับเคส, อนุมัติ recycle, ตีกลับหลักฐาน | Global — ทุกเคส (Role Group: system) |
| ผู้จัดการทีมติดตามทรัพย์ (Manager) | กำกับทีม ตรวจงาน อนุมัติขั้นต้นค่าตอบแทน | หลายทีม (Role Group: inhouse/outsource) |
| หัวหน้า (Supervisor) | กำกับทีมเดียว | ทีมเดียว (Role Group: inhouse/outsource) |
| ธุรการ / Admin | บันทึกข้อมูลและแนบเอกสารตามสิทธิ์ | Assigned scope |
| บริษัทไฟแนนซ์ (Company User) | ยื่นเคสและติดตามสถานะที่ได้รับอนุญาต | Company scope — 3 ระดับ (ผู้จัดการ/หัวหน้า/แอดมิน) |
| พนักงานติดตามทรัพย์ (Field Agent) | รับงาน อัปเดตผล แนบหลักฐาน | Assigned case scope (Role Group: inhouse/outsource) |

## 6. Core Concepts

| Concept | Meaning | Implementation Notes |
|---|---|---|
| Consistency | ใช้มาตรฐานเดียวกันทุก module | ลดงานแก้ภายหลัง |
| Reusability | component/rule ใช้ซ้ำ | Cursor ทำซ้ำได้ |
| Traceability | ทุก action ต้อง trace | audit/report |

## 7. Data Entities / Required Objects

| Entity / Object | Purpose | Required Key Fields |
|---|---|---|
| Decision | การตัดสินใจ | id, title, context, decision, reason, impact, approved_by |
| Decision Status | สถานะ | proposed, approved, reversed |

## 8. UI / UX Rules

- Decision list
- Detail with impact
- Link to files/modules

## 9. Workflow / Lifecycle

- Propose decision → review → approve → update related docs

## 10. Security / Control Rules

- Decision approved ห้ามแก้ทับ ต้อง revision/reversal
- ทุก scope change ต้องมี decision

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| REQUIRED_MISSING | ข้อมูลบังคับไม่ครบ | inline error |
| DUPLICATE_RECORD | ข้อมูลซ้ำ | reject พร้อมอธิบาย |
| PERMISSION_DENIED | ไม่มีสิทธิ์ | UI hide/disable และ API 403 |
| INVALID_STATUS | สถานะไม่ถูก | reject transition |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| Create decision | Owner/บริหาร | full |
| Approve decision | บริหาร/Superadmin | required |
| View decision | All internal roles | read |

## 13. Audit Log Requirements

- ทุก mutation ต้องบันทึก `actor_id`, `role`, `action`, `target_type`, `target_id`, `before`, `after`, `reason`, `created_at`
- ข้อมูลที่กระทบเงิน สิทธิ์ ธนาคาร ภาษี หรือการ lock period ต้องบันทึก reason เสมอ
- Audit log ห้ามแก้ไขย้อนหลัง
- รายการ export/import/background job ต้อง trace กลับไปผู้สั่งงานได้

## 14. API / Integration Draft

| Method | Endpoint / Event | Purpose | Notes |
|---|---|---|---|
| GET | /api/decisions | list/detail | ตาม permission |
| POST | /api/decisions | สร้าง decision ใหม่ | ต้องผ่านการอนุมัติจาก Owner/บริหาร |
| EVENT | decision.approved | decision ถูกอนุมัติ | notification/audit |

## 15. Acceptance Criteria

- Cursor สามารถใช้ไฟล์นี้เป็น rule กลางก่อน implement module ใด ๆ
- ทุก module ในกลุ่ม A ต้องอ้างอิง foundation เหล่านี้
- UI, permission, audit, validation ต้องสอดคล้องกันทั้งระบบ
- ไม่มี requirement ที่ทำให้ระบบกลายเป็น ERP/GL/Tax filing เต็มรูปแบบ

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| Permission | role ไม่มีสิทธิ์ | ไม่เห็นปุ่มและ API reject |
| Audit | แก้ข้อมูลสำคัญ | มี audit before/after |
| Validation | ข้อมูลไม่ครบ | แสดง error ชัดเจน |
| Decision immutability | ลองแก้ decision ที่ approved แล้วตรงๆ | ต้อง reject — ต้องสร้าง revision/reversal ใหม่แทน |

---

## 17. Decision Records (Source of Truth ทุก DEC ของโปรเจกต์)

### DEC-001 — Tech Stack (02/07/2569)

| Field | Value |
|---|---|
| Decision | Next.js App Router + TypeScript + Prisma + PostgreSQL (via Supabase) + Vercel |
| Approved by | Product Owner (Boonphone) |
| Reason | Full-stack, native กับ Vercel, Prisma type-safe เหมาะ schema ซับซ้อน, Supabase managed PostgreSQL ลด ops overhead |
| Impact | ไฟล์ 01 §6.0 อัปเดตแล้ว — ทุก module implement ตาม stack นี้ |
| Reversible | ยาก — migration cost สูง |

### DEC-002 — Permission Architecture (02/07/2569)

| Field | Value |
|---|---|
| Decision | Backend middleware (API layer) — ไม่ใช้ Supabase RLS เป็นหลัก |
| Approved by | Product Owner (Boonphone) |
| Reason | 10+ roles, หลาย scope (company/team/case) — RLS SQL ซับซ้อน debug ยาก, middleware test ง่ายและ maintainable กว่า |
| Impact | ไฟล์ 01 §6.1 อัปเดตแล้ว — Supabase ยังใช้สำหรับ Auth + Storage เท่านั้น |
| Reversible | ยาก — ต้องเขียน RLS policy ใหม่ทั้งหมด |

### DEC-003 — File Storage (02/07/2569)

| Field | Value |
|---|---|
| Decision | Supabase Storage |
| Approved by | Product Owner (Boonphone) |
| Reason | Native กับ Supabase stack ที่เลือก, signed URL, access policy ต่อ bucket, ลด vendor count |
| Impact | รูปถ่ายหลักฐาน, ใบกำกับภาษี PDF, ใบส่งมอบ, เอกสาร WHT — ทั้งหมดเก็บที่ Supabase Storage |
| Reversible | ปานกลาง — migrate ไฟล์ได้แต่ต้องอัปเดต URL ทั้งหมด |

### DEC-004 — Polymorphic Relation Pattern (02/07/2569)

| Field | Value |
|---|---|
| Decision | Separate FK columns (claim_id, revenue_id, adjustment_id) + DB CHECK constraint exactly one non-null |
| Approved by | Product Owner (Boonphone) |
| Reason | ได้ FK constraint จริงจาก DB ป้องกัน orphan record, Prisma type-safe กว่า discriminator, query ง่ายกว่า WHERE claim_id = ? |
| Impact | ไฟล์ 26 §6.3 + Open Item ปิดแล้ว |
| Reversible | ปานกลาง — migration ได้แต่ต้องแก้ query ทั้งหมด |

### DEC-005 — UI Datetime Calendar Standard (03/07/2569)

| Field | Value |
|---|---|
| Decision | ทุกหน้าจอ UI ต้องแสดงผลวันที่เป็น **พุทธศักราช (พ.ศ.)** เท่านั้น — ห้ามแสดง ค.ศ. ยกเว้น `<input type="date">` ที่ browser บังคับ ISO format |
| Approved by | Product Owner (Boonphone) |
| Reason | พบ conflict ระหว่าง `03-non-functional-requirements.md` §6.5 (ระบุ พ.ศ.) กับ `04-ui-ux-design-system.md` §8 เวอร์ชันเดิม (ระบุ ค.ศ.) — Product Owner ยืนยันว่า พ.ศ. คือมาตรฐานที่ถูกต้อง เพื่อความสอดคล้องกับผู้ใช้งานในบริบทไทย |
| Impact | ไฟล์ 04 §8 แก้ไขแล้ว, README.md Datetime Standard section ใช้ พ.ศ. อยู่แล้ว (ไม่ต้องแก้) — **ต้องตรวจ mockup HTML ทั้ง 8 ไฟล์ว่ามี ค.ศ. หลงเหลือหรือไม่** (ดู Open Item ใน `93-roadmap-open-items.md` §7.1) |
| Reversible | ง่าย — เป็นแค่ display layer format ไม่กระทบ database (ซึ่งเก็บ ค.ศ./UTC เสมอตามมาตรฐานเดิม) |

### DEC-006 — Batch 6 Consistency Sync: คำตอบ D1–D10 ครบชุด (04/07/2569)

| Field | Value |
|---|---|
| Decision | **D1=B**: ตาราง Settings ตามไฟล์ 13 เข้า schema ครบ โดยแยกค่านโยบายการเงินเป็น `finance_policy_settings` (1 record/org) ออกจาก `approval_matrices` — **D2=A**: `bank_accounts` เติม `usage`/`statement_format`/`payment_file_format`/`auto_match_tolerance_days` + deprecate `is_payout_account` — **D3=A**: ตาราง `notifications` แบบ minimal สำหรับ In-app เฟส 1 — **D4=A**: WHT Certificate ใช้ status model (`active`/`cancelled` + `cancel_reason` + `replaces_certificate_id`, `delivery_format` เป็น enum) — **D5=A**: `expenses` เพิ่ม `executive_approved_by/at` + `approval_step_current/total` + `approval_history` + `approval_matrix_id` (ชื่อ field ตามไฟล์ 16 §7) — **D6=A**: Warehouse gate ใช้กับเคส `closed_success` ทุกกรณี **รวมเคสที่ไม่มี expense** — **D7**: DB constraints — partial unique `advances(payee_id)` ขณะ approved/overdue + CHECK `bank_tx_status_fk_shape` (UNIQUE `idempotency_key` มีอยู่เดิมแล้ว) — **D8**: ยืนยันจำนวน Seed Role = **15** — **D9**: ยืนยันชื่อ endpoint `POST /api/field/cases/:id/resubmit-close`, `POST /api/field/expenses/:id/resubmit` — **D10=A/A**: Export Pack — bank status ใช้ enum เต็ม 4 ค่า, tax_id 13 หลักล้วนไม่มีขีดคั่น |
| Approved by | Product Owner (Boonphone) — ตอบผ่านชุดตัวเลือก `DECISIONS-NEEDED-BATCH6.md` 04/07/2569 |
| Reason | ปิดช่องว่าง schema/เอกสารที่พบจากการตรวจไขว้ทั้งชุด (Batch 6) ก่อนเริ่ม implement Phase 1.3 — โดยเฉพาะกลุ่ม Settings ที่ validation/test case หลายตัวอ้างถึงแต่ไม่มีตารางรองรับ |
| Impact | `02` v3.5 (51 tables — เพิ่ม 6 ตาราง + column/constraint ใหม่), `13` v3, `16` v2.1, `19` v2.2, `24` v3.1, `27` v3.1, `33` v3, `37` v2.1, `90` v4, `93` v3.1, `README`, template CSV `05`/`06` แก้ตัวอย่างให้ตรง |
| Reversible | ปานกลาง — ก่อนมี production data ยัง migrate ง่าย (ยังไม่เริ่ม Phase 0) หลัง go-live ยากขึ้นตามปริมาณข้อมูล |

### DEC-007 — Mockup Audit: ผลตรวจ HTML Mockup ทั้งชุด (04/07/2569)

| Field | Value |
|---|---|
| Decision | (1) แก้เอกสาร "13 รายงาน" → **"17 รายงาน"** (README / `90` v4.1 / `implementation-todo`) — นับจริงจากไฟล์ 96: F5+O5+A4+E3 (2) **สร้าง mockup ใหม่ 3 ไฟล์**: `dashboard.html` (🔶 DRAFT — ยังไม่มี spec .md), `case-management.html` (รายการเคส/พิจารณารับเคส/Recycle Review), `notifications.html` (3) **แก้ mockup เดิมโดยตรง**: `finance.html` (role 19→15 + `pending_finance_approval` ครบวงจร), `accounting.html` (Bank Recon enum 4 ค่า + ปิดรายการโดยไม่จับคู่ + ยกเลิก WHT Certificate), `settings.html` (เพิ่ม tab เทมเพลตเอกสารภาษี §6.13) |
| Approved by | Product Owner (Boonphone) — ตอบผ่านชุดตัวเลือก 04/07/2569 |
| Reason | ตรวจไขว้ mockup 12 ไฟล์เทียบสเปกพบหน้าจอขาด 4 หน้า + ฟีเจอร์ Batch 5/6 ยังไม่สะท้อนใน UI + mock data ขัดสเปก |
| Impact | mockup 6 ไฟล์, `06` v2.1 (mockup mapping), `93` v3.2, README, `90` v4.1, `implementation-todo` — Open Item ใหม่: เขียน spec .md ของแดชบอร์ดหลัก + หน้าจัดการเคส หลัง PO อนุมัติ mockup (ดู `93` §7.1) |
| Reversible | ง่าย — เป็น mockup/เอกสาร ยังไม่มีโค้ดจริง |

### DEC-008 — Service Fee Template แสดงผลแบบการ์ด (05/07/2569)

| Field | Value |
|---|---|
| Decision | หน้า ตั้งค่า → เทมเพลตค่าบริการ เปลี่ยนจาก**ตาราง**เป็น**การ์ด** (pattern เดียวกับแผนค่าตอบแทน) — การ์ดแสดงสูตรเรียกเก็บครบ 2 กรณีตามไฟล์ 12 §6.1-6.3: เคสสำเร็จ / เคสไม่สำเร็จ (ผูก `charge_on_fail`) |
| Approved by | Product Owner (Boonphone) — สั่งตรงพร้อม screenshot 05/07/2569 |
| Reason | คอลัมน์เยอะ ตารางแสดงผลข้อมูลไม่พอ |
| Impact | `settings.html` เท่านั้น (mockup = source of truth ด้าน UI) — ไม่กระทบ schema/API |
| Reversible | ง่าย — display layer อย่างเดียว |

### DEC-009 — Functional Permission Matrix ใช้ระดับสิทธิ์ 3 ระดับ (05/07/2569)

| Field | Value |
|---|---|
| Decision | (1) รายการสิทธิ์ในหน้า "สิทธิ์บัญชี/การเงิน" ต้องครบตาม **ไฟล์ 25 เป๊ะ** — เพิ่ม 9 รายการที่ขาด (กลุ่ม Adjustment 3, Authorized Exception, จัดการ Exception, สร้างไฟล์โอนเงิน, เงินทดรอง Field Agent, map Cost Center, ตอบ Accountant Question, Tax Invoice Numbering, ดู Dashboard/Profitability) + แยกข้อซ้ำซ้อน (ปลดล็อกรอบ ≠ อนุมัติเกินเพดาน) → รวม **37 รายการ 4 กลุ่ม** (2) ระดับสิทธิ์เป็น **3 ระดับ**: ไม่มีสิทธิ์ / 👁️ ดูอย่างเดียว (view) / ✅ ทำได้ (manage) — UI เป็น dropdown ต่อ role ตรง semantic ✅/👁️ ของไฟล์ 25 (3) Superadmin มีสิทธิ์ทุกรายการโดยนิยาม ไม่แสดงในตาราง · รายการ "✅ only" 7 ตัวล็อกเป็น 🔒 แก้ไม่ได้ |
| Approved by | Product Owner (Boonphone) — ตอบผ่านชุดตัวเลือก 05/07/2569 |
| Reason | Audit พบ mockup มีสิทธิ์ให้ติ๊กแค่ 20/29 รายการของไฟล์ 25 และ checkbox เปิด/ปิดค่าเดียวแสดงมิติ "ดูอย่างเดียว" ไม่ได้ |
| Impact | `settings.html` (ทำแล้ว) — **✅ doc sync ครบแล้ว 05/07/2569**: `02` v3.6 (`capability_access_level` enum + `role_capabilities.access_level`), ไฟล์ `13` v3.1 (§6.10 โมเดลระดับ), ไฟล์ `25` v2.2 (§16.1 mapping ✅→manage / 👁️→view) |
| Reversible | UI ง่าย · โมเดล storage ปานกลาง (ก่อน Phase 0 ยังแก้ฟรี) |

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- [ ] ยืนยันรายละเอียดเมื่อเริ่ม sprint เฉพาะ module (Open Item เดิม)
- [ ] DEC ใหม่ที่อาจเกิดขึ้นระหว่าง Batch 2-8 ของการ reformat เอกสารชุดนี้ — ต้องกลับมาเพิ่มที่นี่ทุกครั้ง (ดูหลักการเดียวกับ `93-roadmap-open-items.md`)

---

*เอกสารนี้เป็นไฟล์ที่ 5 ในหมวด Platform (90–95) ต่อจาก `93-roadmap-open-items.md` และก่อน `95-diagrams.md` (ไฟล์สุดท้ายของ Batch 1)*
