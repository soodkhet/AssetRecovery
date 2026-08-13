# 93-roadmap-open-items.md

# 93 — Roadmap & Open Items (Consolidated Index)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Foundation / Platform Build Spec
> Applies To: All implementation sprints
> เอกสารอ้างอิง: `README.md`, `DECISIONS-NEEDED.md`, `QUESTIONS-FOR-ACCOUNTANT.md`, ทุกไฟล์ §17/§18 (Open Items ต่อไฟล์)

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — โครง Open Item entity |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + เพิ่ม **§7.1 Consolidated Open Items Index** รวมทุกรายการค้างจากทั้งชุดเอกสาร (README, DECISIONS-NEEDED.md, Open Items ที่พบระหว่าง reformat Batch 1) — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |
| v3 | 04/07/2569 | **เพิ่มรายการจาก Batch 6 (Consistency Sync — ตรวจไขว้ทั้งชุด 04/07/2569)** ใน §7.1: หมวด 🔵 ใหม่ 2 กลุ่ม — (ก) รายการที่**แก้เอกสารแล้ว รอ Product Owner ยืนยัน** (จำนวน role 14→15, ชื่อ endpoint ใหม่ 2 ตัว) (ข) รายการที่**ต้องตัดสินใจก่อนแก้ schema/logic** (ตาราง Settings ที่ขาด, bank_accounts, notifications, WHT cert cancellation, expenses approval tracking, Revenue edge case, DB constraints) — รายละเอียดตัวเลือก A/B อยู่ที่ `DECISIONS-NEEDED-BATCH6.md` |
| v3.1 | 04/07/2569 | **ปิดรายการ Batch 6 ครบทุกข้อ** — Product Owner ตอบ D1–D10 แล้ว (DEC-006) — เปลี่ยนตาราง §7.1 หมวด Batch 6 จาก "รอตัดสินใจ" เป็นสรุปผลพร้อมไฟล์ที่อัปเดต |
| v3.2 | 04/07/2569 | **เพิ่มผล Mockup Audit** (§7.1) — ปิดจุด mockup ขาด/ขัดสเปก 7 รายการ + mockup ใหม่ 3 ไฟล์ + Open Item ใหม่ 3 รายการ (spec แดชบอร์ดหลัก/จัดการเคส + PO ตรวจ mockup) |

ขอบเขตเอกสารนี้: รวบรวมสิ่งที่ยังรอออกแบบ ตัดสินใจ หรือทำใน phase ต่อไป — **เป็น index กลางที่รวม Open Item จากทุกไฟล์มาไว้ที่เดียว** เพื่อให้ Product Owner เห็นภาพรวมโดยไม่ต้องไล่เปิดทุกไฟล์

**ไม่รวมอยู่ในไฟล์นี้**: รายละเอียดคำถามเชิงบัญชี/ภาษีแบบเต็ม (ดู `QUESTIONS-FOR-ACCOUNTANT.md`), รายละเอียดการตัดสินใจที่ปิดแล้ว (ดู `94-decision-log.md`)

---

## 1. Summary

รวบรวมสิ่งที่ยังรอออกแบบ ตัดสินใจ หรือทำ phase ต่อไป

## 2. Purpose

รวบรวมสิ่งที่ยังรอออกแบบ ตัดสินใจ หรือทำ phase ต่อไป

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
| Open Item | รายการค้าง | id, title, owner, status, due |
| Roadmap Phase | phase | name, scope, status |
| Decision Link | อ้าง decision | decision_id |

### 7.1 Consolidated Open Items Index (รวมทุกไฟล์ — อัปเดต 03/07/2569)

#### 🔴 รอนักบัญชี (ดู `QUESTIONS-FOR-ACCOUNTANT.md` เต็ม)

> **อัปเดต 03/07/2569**: 3 ใน 4 ข้อด้านล่างมี**เมนูตั้งค่ารองรับอยู่แล้ว**ใน `13-accounting-finance-settings.md` (§6.5, §6.8, §6.12) — Superadmin ตั้งค่าเองได้ทุกเมื่อโดยไม่ต้องแก้โค้ด **จึงไม่บล็อกการ implement** สิ่งที่รอนักบัญชีจริงๆ คือ "ค่าเริ่มต้นที่จะกรอกตอน onboarding" ไม่ใช่ตัวฟีเจอร์

| รายการ | กระทบไฟล์ | Priority |
|---|---|---|
| รูปแบบเลขที่ใบกำกับภาษี (INV-XXXX vs INV-2569-XXXX) | `02` §14, `13` §6.12, `31` §8 | 🟡 **มีเมนูตั้งค่าแล้ว** (`13` §6.12) — รอแค่ค่าเริ่มต้นก่อนออก invoice แรก ไม่บล็อก build |
| VAT 7% ต่ออายุหรือกลับ 10% ตั้งแต่ 1 ต.ค. 2569 | `19`, `02` (vat_rate_history) | 🟡 **มีเมนูตั้งค่าแล้ว** (`13` §6.5 — effective-dated versioning) — เพิ่มอัตราใหม่ตอนประกาศจริงได้เลย ไม่บล็อก build |
| Bank File encoding (TIS-620 vs UTF-8) | `02` §14, `13` §6.8, `17`, `28` | 🟡 **มีเมนูตั้งค่าแล้ว** (`13` §6.8 — ตั้ง encoding ต่อธนาคาร + บังคับ `test_status=passed` ก่อนใช้จริง) — เหลือแค่งาน **ทดสอบจริงกับธนาคาร** ไม่ใช่งาน spec/build |
| e-Tax Invoice / e-WHT integration กรมสรรพากร | `02` §14, `33` | 🟢 เฟส 2 — ยังไม่มีสเปก integration เลย (ต่างจาก 3 ข้อบน) |

#### 🟡 รอ Product Owner (ดู `DECISIONS-NEEDED.md` เต็ม)

| รายการ | กระทบไฟล์ | Priority |
|---|---|---|
| ชื่อ Product final | `00` §18 | 🟡 ก่อน deploy |
| ~~Client Portal **Phase** (บริษัทไฟแนนซ์ login เอง) — deploy Phase ไหน (scope+spec+mockup พร้อมแล้ว ดู `97-client-portal.md`)~~ | `97` §22 | ✅ **ตัดสินใจแล้ว 04/07/2569** — deploy เป็นส่วนหนึ่งของ Phase 1 (implement เป็น Phase 7 ใน `implementation-todo.md` ตามลำดับ dependency) |
| ~~Notification channel (Email/LINE/SMS/Push) + event ไหนต้องแจ้ง~~ | `90` §6.3, §17 | ✅ **ตัดสินใจแล้ว 03/07/2569** — เฟส 1 = Push/In-app เท่านั้น, event = ทุก status change สำคัญของเคส/การเงิน |
| SMS/Email Gateway provider | `90` §6.3, §18 | 🟢 ไม่บล็อกเฟส 1 (เฟส 1 ใช้ Push/In-app เท่านั้น) — PO จะแจ้งตอน implement เฟส 2 |
| PDPA policy (Privacy Policy/Consent management) | `90` §6.2, §18 | 🟡 มี Draft scope แล้ว รอทนายความ/PO อนุมัติ DPA+Privacy Policy จริง |
| ~~Session timeout ที่แน่นอน~~ | `05` §17 | ✅ **ตัดสินใจแล้ว 03/07/2569** — 24 ชั่วโมง |
| ~~MFA เปิดใช้เฟส 1 หรือไม่~~ | `05` §17 | ✅ **ตัดสินใจแล้ว 03/07/2569** — ไม่เปิดในเฟส 1 |
| ~~Audit Log Retention period~~ | `90` §17 | ✅ **ตัดสินใจแล้ว 03/07/2569** — 5 ปี (อ้างอิง พ.ร.บ.การบัญชี พ.ศ. 2543) |
| ~~RPO/RTO (Backup Policy)~~ | `03` §17 | ✅ **ตัดสินใจแล้ว 03/07/2569** — 24 ชม./24 ชม. (ใช้ daily backup Supabase Pro plan ไม่เปิด PITR add-on) |
| Google Maps API key + budget limit | `91` §18 | 🟡 ก่อนเปิดใช้ PER_KM fuel จริง |
| Production infrastructure sizing | `01` §18 | 🟢 กำหนดตอนใกล้ deploy |

#### 🔵 พบระหว่างทำ Batch 1 (รอ Product Owner ยืนยัน — ใหม่)

| รายการ | กระทบไฟล์ | Priority |
|---|---|---|
| ~~ตรวจ mockup HTML ทั้ง 8+ ไฟล์ว่ามี ค.ศ. หลงเหลือจากก่อนแก้ conflict หรือไม่~~ | `04` §18 | ✅ **ปิดแล้ว 03/07/2569** — ตรวจครบ 10 ไฟล์ mockup + 2 ไฟล์ client portal พบบัคจริงเฉพาะ `settings.html` (6 จุด: billing/accounting period + export history table) แก้เป็น พ.ศ. ครบแล้ว — case_ref รูปแบบ "SF-2026-XXXXX" ในไฟล์อื่นไม่ใช่บัค เพราะเป็น external ID ดิบจากไฟแนนซ์ตามสเปค 38 §6.1/§11 (ไม่ใช่วันที่ที่ระบบแสดงเอง) |
| ~~Body background color ไม่ตรงกันระหว่าง mockup (`#f8fafc` vs `#f1f5f9`)~~ | `04` §18 | ✅ **ปิดแล้ว 03/07/2569** — พบต้นตอที่ `reports.html` เท่านั้น (ใช้ `#f1f5f9` ขณะที่อีก 9+ ไฟล์ใช้ `#f8fafc`) แก้ให้ตรงมาตรฐานแล้ว |
| Index profiling เต็มรูปแบบสำหรับ dashboard query ที่ join หลาย table | `02` §15, `92` §18 | 🟢 |
| Data Retention period สำหรับข้อมูล operation ทั่วไป (ไม่ใช่ audit log) | `03` §18 | 🟡 |

#### 🔵 พบระหว่าง Batch 6 — Consistency Sync 04/07/2569 → ✅ **ตัดสินใจครบทุกรายการแล้ว (04/07/2569 — DEC-006 ใน `94-decision-log.md`)**

| รายการ | ผลการตัดสินใจ | ไฟล์ที่อัปเดตแล้ว |
|---|---|---|
| จำนวน Seed Role 14 → 15 (D8) | ✅ ยืนยัน **15** | `02` §12, `05`, `07`, `25`, `README`, `implementation-todo` |
| ชื่อ endpoint `resubmit-close` / `resubmit` (D9) | ✅ ยืนยันตามที่เติม | `41` §17.1, `45` §6.3 |
| ตาราง Settings ที่ขาด (D1) | ✅ **Option B** — เพิ่ม 5 ตาราง + แยก `finance_policy_settings` 1 record/org + numbering บน `organizations` + `functional_group` บน `capabilities` | `02` v3.5, `13` v3 |
| `bank_accounts` ไม่ตรงไฟล์ 13 §6.3 (D2) | ✅ **Option A** — เติม 4 column + deprecate `is_payout_account` | `02` v3.5, `13` v3 |
| ตาราง `notifications` (D3) | ✅ **Option A** — minimal + endpoint `read-all` | `02` v3.5, `90` v4 |
| WHT Certificate cancellation (D4) | ✅ **Option A** — status model + `replaces_certificate_id` + delivery_format enum | `02` v3.5, `33` v3, `24` v3.1, `27` v3.1 |
| `expenses` multi-step approval (D5) | ✅ **Option A** — `executive_approved_by/at` + `approval_step_current/total` + `approval_history` (ชื่อตามไฟล์ 16 §7) | `02` v3.5, `16` v2.1 |
| Revenue edge case ไม่มี expense (D6) | ✅ **Option A** — Warehouse gate ใช้เสมอ | `19` v2.2 |
| DB constraints เสริม (D7) | ✅ ครบ — advances partial unique + bank CHECK (UNIQUE idempotency มีอยู่เดิม) | `02` v3.5 |
| Export Pack format (D10) | ✅ **A/A** — enum เต็ม 4 ค่า + tax_id 13 หลักล้วน | `13` v3, `37` v2.1, template CSV `05`/`06` |

#### 🔵 Mockup Audit 04/07/2569 (รอบสอง — ตรวจ HTML mockup ทั้ง 12 ไฟล์เทียบสเปก)

**✅ ทำแล้ว (Product Owner อนุมัติผ่านชุดตัวเลือก 04/07/2569)**

| รายการ | ผล |
|---|---|
| เอกสารเขียน "13 รายงาน" แต่ไฟล์ 96 มีจริง **17** (5+5+4+3) | ✅ แก้ README / `90` v4.1 / `implementation-todo` แล้ว (mockup `reports.html` ถูกต้องอยู่แล้ว) |
| `finance.html` mock role 19 ตัวโครงสร้างผิด | ✅ แก้เหลือ **15** ตาม `07` §5 (เพิ่มเจ้าหน้าที่อนุมัติเคส, ตัด system ผู้จัดการ/หัวหน้า/แอดมิน, ทีมติดตามใช้ชื่อ role จริง) |
| `finance.html` ไม่มีสถานะ `pending_finance_approval` | ✅ เพิ่มครบ: mock data / badge / label / filter chip / เงื่อนไขปุ่มอนุมัติ / KPI นับรวม 2 ขั้น |
| `accounting.html` Bank Recon ยังเป็น 2 สถานะเดิม | ✅ อัปเป็น enum 4 ค่า (`auto_matched`/`manual_matched`/`unmatched`/`unmatched_resolved`) + ปุ่ม "ปิดรายการโดยไม่จับคู่" + modal บังคับเหตุผล (ไฟล์ 35 v2) |
| `accounting.html` ไม่มี UI ยกเลิก WHT Certificate | ✅ เพิ่มคอลัมน์สถานะ + ปุ่มยกเลิก + modal บังคับ cancel_reason + ตัวอย่างใบ cancelled/replaces + Filing Summary ไม่นับใบยกเลิก (`33` v3, DEC-006/D4) |
| `settings.html` ขาด sub-tab §6.13 เทมเพลตเอกสารภาษี | ✅ เพิ่ม tab "เทมเพลตเอกสารภาษี" (โลโก้/ลายเซ็น/A4-A5/ภาษา/footer + ข้อจำกัดฟิลด์กฎหมายไฟล์ 28) |
| ไม่มี mockup: แดชบอร์ดหลัก / จัดการเคส+Recycle Review / Notification | ✅ สร้างใหม่ 3 ไฟล์: `dashboard.html` (🔶 DRAFT) / `case-management.html` / `notifications.html` — อ้างใน `06` §8 แล้ว |

**🔶 Open Item ใหม่จากรอบนี้**

| รายการ | เหตุผล | Priority |
|---|---|---|
| **เขียน spec .md ของ "แดชบอร์ดหลัก"** — Top nav ไฟล์ 06 §8 มีเมนูนี้แต่ไม่เคยมี spec (มีแต่ Finance Dashboard ไฟล์ 14) — `dashboard.html` เป็น DRAFT proposal ประกอบจากสเปกที่มีอยู่ | รอ Product Owner ดู mockup แล้วยืนยัน/ปรับ ก่อนเขียนเป็น spec ทางการ | 🟡 ก่อน implement Phase 1.4 (Dashboard Shell) |
| **เขียน spec .md ของหน้า "จัดการเคส" (list/review)** — flow อนุมัติ/need_info/recycle มีในไฟล์ 38 แล้ว แต่ layout หน้า list ยังไม่มีเอกสาร UI — `case-management.html` เป็นข้อเสนอ | รวมเข้าไฟล์ 38 (เพิ่ม §8 UI) หรือแยกไฟล์ใหม่ — รอ PO เลือก | 🟡 ก่อน implement Phase 2 |
| Product Owner ตรวจ mockup ใหม่/ที่แก้ทั้ง 6 ไฟล์ เปิดในเบราว์เซอร์แล้วยืนยัน | mockup = source of truth ด้าน UI ต้องผ่านตาก่อนใช้ implement | 🟡 ก่อนเริ่ม Phase 1.4 |

#### 🟢 เฟส 2 (ออกแบบแล้ว ยังไม่ implement)

| รายการ | กระทบไฟล์ |
|---|---|
| GPS Map routing อัตโนมัติ | `41` Open Item |
| Offline Support | `41` Open Item |
| Desktop Document Upload | `41` Open Item |
| Auto Notification ไปบริษัทไฟแนนซ์ | `44` Open Items |
| e-Signature + iApp.co.th facial verification (ถ้าจะทำ) | ยังไม่มีไฟล์ — รอตัดสินใจ scope |

## 8. UI / UX Rules

- Table open items
- Filter owner/status/phase
- Link decision log

## 9. Workflow / Lifecycle

- Create item → assign owner → update status → close with decision/result

## 10. Security / Control Rules

- Open item ต้องมี owner
- Item ที่กระทบ scope ต้อง link decision
- Overdue ต้อง notify

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
| Manage roadmap | Owner/บริหาร | full |
| View roadmap | All internal roles | read |

## 13. Audit Log Requirements

- ทุก mutation ต้องบันทึก `actor_id`, `role`, `action`, `target_type`, `target_id`, `before`, `after`, `reason`, `created_at`
- ข้อมูลที่กระทบเงิน สิทธิ์ ธนาคาร ภาษี หรือการ lock period ต้องบันทึก reason เสมอ
- Audit log ห้ามแก้ไขย้อนหลัง
- รายการ export/import/background job ต้อง trace กลับไปผู้สั่งงานได้

## 14. API / Integration Draft

| Method | Endpoint / Event | Purpose | Notes |
|---|---|---|---|
| GET | /api/roadmap/open-items | list พร้อม filter (owner/status/priority) | ตาม permission |
| POST | /api/roadmap/open-items | สร้างรายการใหม่ | audit required |
| PATCH | /api/roadmap/open-items/{id}/close | ปิดรายการ พร้อม link decision | ต้องอ้าง decision_id ถ้ากระทบ scope |
| EVENT | roadmap.item.overdue | รายการเกินกำหนด | notify owner |

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

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **ไฟล์นี้เป็น Consolidated Index ของ Open Item ทั้งหมดในระบบ** — รายการค้างใหม่ที่เพิ่มในไฟล์ใดก็ตามต้อง sync กลับมาที่นี่ด้วยเสมอ ป้องกันหลุดหาย
- **Priority 4 ระดับ**: 🔴 (บล็อกการ implement/deploy) / 🟡 (ต้องตัดสินใจก่อน go-live) / 🟢 (เฟส 2 ยังไม่กระทบ Phase 1) / 🔵 (พบใหม่ระหว่าง reformat รอยืนยัน)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

ดู §7.1 Consolidated Open Items Index ด้านบน — เป็นรายการเดียวกัน จัดกลุ่มตาม priority ครบแล้ว ไม่ duplicate ซ้ำที่นี่

---

*เอกสารนี้เป็นไฟล์ที่ 4 ในหมวด Platform (90–95) ต่อจาก `92-platform-data-model.md` และก่อน `94-decision-log.md`*
