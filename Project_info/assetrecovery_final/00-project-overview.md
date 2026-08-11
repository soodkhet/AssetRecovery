# 00-project-overview.md

# 00 — Project Overview
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Foundation / Platform Build Spec
> Applies To: All implementation sprints
> เอกสารอ้างอิง: `01-architecture.md`, `03-non-functional-requirements.md`, `06-menu-and-navigation-map.md`, `94-decision-log.md`, `README.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — Foundation spec: scope, actors, core concepts, boundary |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ (header block, Decisions/Open Items แยกส่วนชัดเจน) — **เนื้อหาเดิมคงไว้ครบทุกข้อ ไม่มีการเปลี่ยน business logic** |

ขอบเขตเอกสารนี้: ภาพรวมโครงการ ขอบเขตธุรกิจ Actors/Roles ระดับสูง Core Concepts และ Hybrid Accounting Boundary — ใช้เป็น rule กลางที่ทุก module ต้องอ้างอิงก่อน implement

**ไม่รวมอยู่ในไฟล์นี้**: รายละเอียด tech stack และ permission architecture (ดู `01-architecture.md`), รายละเอียด role/permission matrix เต็มรูปแบบ (ดู `07-roles-permissions.md`, `25-finance-permission-matrix.md`), เมนู/navigation จริง (ดู `06-menu-and-navigation-map.md`)

---

## 1. Summary

ภาพรวมโครงการ Asset Recovery Operations Platform สำหรับบริหารงานติดตามทรัพย์ เชื่อมการเงินเชิงปฏิบัติการ และส่งข้อมูลให้สำนักงานบัญชี

## 2. Purpose

ให้ทีมพัฒนาเข้าใจขอบเขตธุรกิจ บทบาทผู้ใช้ โมดูลหลัก และ Hybrid Accounting Boundary ก่อนเริ่มสร้างระบบ

## 3. In Scope

- Business scope
- User groups
- High-level modules
- Hybrid Accounting Boundary
- Operational finance and accounting handover
- Definition of ready vs baseline modules

## 4. Out of Scope

- ERP เต็มรูปแบบ
- GL accounting
- Tax filing
- Inventory/POS
- Workflow field operation final detail

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
| Asset Recovery Operations Platform | ระบบปฏิบัติการสำหรับติดตามทรัพย์ | ใช้แทนคำว่า Full ERP |
| Finance Operation | งานรับ-จ่าย ค่าตอบแทน วางบิล ลูกหนี้ | อยู่เมนูการเงิน |
| Accounting Handover | เตรียมข้อมูลส่งสำนักงานบัญชี | อยู่เมนูบัญชี |
| Hybrid Accounting | ระบบเตรียมข้อมูล แต่สำนักงานบัญชีลงบัญชีจริง | ห้ามทำให้ระบบกลายเป็น GL |
| Baseline Workflow (อัปเดต) | เดิมหมายถึงกลุ่ม 38–43 ที่รอออกแบบ — **ตอนนี้ออกแบบเสร็จสมบูรณ์แล้วทั้งหมด** (38, 40, 41 — รวม QC Outcome จากไฟล์ 42/43 ที่ merge ครบแล้ว) ไม่ใช่ baseline อีกต่อไป | กลุ่ม 38, 40, 41 (42/43 merge เข้า 41) |

## 7. Data Entities / Required Objects

| Entity / Object | Purpose | Required Key Fields |
|---|---|---|
| Organization | เจ้าของระบบ (AssetRecovery) | name, tax_id, address, phone, email, logo_url, vat_registered, settings |
| Finance Company | คู่ค้าไฟแนนซ์ | tax_id, contacts, service_fee_template |
| Case | เคสติดตามทรัพย์ | case_ref, company, status, outcome |
| Finance Transaction | รายการเงิน | source_ref, gross, wht, net, status |
| Accounting Period | รอบส่งบัญชี | period, status, exceptions, export_version |

> **UI**: หน้า "ข้อมูลองค์กร" ใน Settings (แท็บแรก) — แสดงชื่อบริษัท เลขประจำตัวผู้เสียภาษี ที่อยู่จดทะเบียน เบอร์โทร อีเมล โลโก้ · Prefix เลขที่ใบกำกับภาษีตั้งค่าที่ Finance Settings (`13-accounting-finance-settings.md` §6.12) · สิทธิ์แก้ไข: Superadmin เท่านั้น

## 8. UI / UX Rules

- ใช้ชื่อเมนูตรงกับ README
- Top nav: แดชบอร์ด / จัดการเคส / การเงิน / บัญชี / การตั้งค่า
- ห้ามใช้ wording ที่ทำให้ scope เป็น ERP เต็มรูปแบบ
- ทุกหน้าแสดงสถานะ module ถ้ายังเป็น baseline

## 9. Workflow / Lifecycle

- ตั้งค่า foundation → ตั้งค่า master → รับเคส → ปิดผล → สร้างรายการเงิน → ส่งบัญชี
- Finance/Accounting (ไฟล์ 10-37) สเปคเสร็จสมบูรณ์แล้ว พร้อม implement
- Workflow 38, 40, 41 (รวม QC Outcome) สเปคเสร็จสมบูรณ์แล้ว พร้อม implement — ไม่ใช่ baseline ที่รอ redesign อีกต่อไป

## 10. Security / Control Rules

- ทุกรายการเงินต้อง trace กลับ source
- ข้อมูลภาษีเป็นข้อมูลเตรียมส่ง ไม่ใช่การยื่นจริง
- เอกสารภาษี final ให้สำนักงานบัญชี/โปรแกรมบัญชีออก

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| SCOPE_ERP_CREEP | Requirement ใช้คำว่า ERP/GL/tax filing | ต้องปรับเป็น Operations/Handover |
| SOURCE_REF_MISSING | รายการเงินไม่มี source | reject หรือ exception |
| BOUNDARY_VIOLATION | สั่งให้ระบบยื่นภาษีจริง | ย้ายเป็น out of scope |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| Approve scope | Superadmin, บริหาร | decision log required |
| View overview | All internal roles | read-only |
| Change boundary | Superadmin, บริหาร | must update decision log |

## 13. Audit Log Requirements

- ทุก mutation ต้องบันทึก `actor_id`, `role`, `action`, `target_type`, `target_id`, `before`, `after`, `reason`, `created_at`
- ข้อมูลที่กระทบเงิน สิทธิ์ ธนาคาร ภาษี หรือการ lock period ต้องบันทึก reason เสมอ
- Audit log ห้ามแก้ไขย้อนหลัง
- รายการ export/import/background job ต้อง trace กลับไปผู้สั่งงานได้

## 14. API / Integration Draft

| Method | Endpoint / Event | Purpose | Notes |
|---|---|---|---|
| GET | /api/meta/modules | รายการ module/status | ใช้ render menu/status |
| EVENT | scope.decision.created | บันทึก decision สำคัญ | ส่งไป decision log |

## 15. Acceptance Criteria

- Cursor สามารถใช้ไฟล์นี้เป็น rule กลางก่อน implement module ใด ๆ
- ทุก module ในกลุ่ม A ต้องอ้างอิง foundation เหล่านี้
- UI, permission, audit, validation ต้องสอดคล้องกันทั้งระบบ
- ไม่มี requirement ที่ทำให้ระบบกลายเป็น ERP/GL/Tax filing เต็มรูปแบบ

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| Boundary test | ให้ Cursor สรุปสิ่งที่ระบบทำ | ต้องไม่รวม GL/tax filing |
| Module status | เปิด README | เห็นว่า 38, 40, 41 (รวม 42/43) เสร็จสมบูรณ์แล้ว ไม่ใช่ baseline |
| Trace concept | สร้าง finance item จาก case | ต้องมี source_ref |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Hybrid Accounting Boundary คือหลักการหลักของทั้งระบบ**: ระบบเตรียมข้อมูล (claim/payout/billing/AR/WHT) แต่**ไม่ลงบัญชี GL เอง ไม่ยื่นภาษีจริงเอง** — สำนักงานบัญชีทำส่วนนั้นนอกระบบ (ข้อ 4, 10)
- **Baseline Workflow เดิม (38–43) ออกแบบเสร็จสมบูรณ์แล้วทั้งหมด** ไม่ใช่ baseline ที่รอ redesign อีกต่อไป — ไฟล์ 42 (Check-in/Evidence) และ 43 (QC Outcome) ถูก merge เข้าไฟล์ 41 แล้ว (ข้อ 6, 9)
- **Finance/Accounting (ไฟล์ 10–37) สเปคเสร็จสมบูรณ์ พร้อม implement** ไม่ใช่ draft อีกต่อไป (ข้อ 9)
- **ทุกรายการเงินต้อง trace กลับ source เสมอ** (`source_ref`) — ห้าม orphan finance record (ข้อ 10, 11)
- **Scope ห้าม creep เป็น ERP เต็มรูปแบบ** — ทุก requirement ใหม่ที่ใช้คำว่า "GL", "ยื่นภาษีจริง", "inventory/POS เต็มรูปแบบ" ต้องถูกปรับคำหรือย้ายออกจาก scope (ข้อ 4, 11)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- [ ] ยืนยันชื่อ product final
- [ ] ยืนยัน phase ของ Client Portal (Phase 1 หรือ Phase 2?) — เชื่อมโยงกับไฟล์ Client Portal ที่วางแผนเพิ่มในภายหลัง (ดู `93-roadmap-open-items.md`)

---

*เอกสารนี้เป็นไฟล์แรกในหมวด Foundation & Platform ต่อด้วย `01-architecture.md`*
