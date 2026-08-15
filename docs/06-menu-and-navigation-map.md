# 06-menu-and-navigation-map.md

# 06 — Menu and Navigation Map
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Foundation / Platform Build Spec
> Applies To: All implementation sprints
> เอกสารอ้างอิง: `00-project-overview.md`, `07-roles-permissions.md`, `09-teams.md`, `38-case-submission.md`, `40-case-assignment-routing.md`, `41-field-tracker-mobile.md`, `13-accounting-finance-settings.md`, `96-reports.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — Menu Map, Role Group Visibility Matrix |
| v1.1 | 29/06/2569 | Role naming: "ผู้จัดการพื้นที่" → "เจ้าหน้าที่อนุมัติเคส (Case Approver)" ทั่วทั้งโปรเจกต์ |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ (header block, Decisions/Open Items แยกชัดเจน) — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |
| v2.2 | 15/08/2569 | **มติ PO ตอนรีวิว Phase 5 (D17) — เปิด "การตั้งค่า" ให้การเงิน/บัญชีแบบบางส่วน**: §7.2 เดิมให้เมนูนี้เฉพาะ Superadmin/บริหาร แต่ `90` §12 (`view_audit_log`) และ `91` §12 (`manage_jobs` ระดับ view) ให้ **บัญชี + การเงิน** ดูบันทึกการใช้งาน/งานเบื้องหลังได้ ⇒ route guard ของหน้า (`requireMenuPage()`) เด้งสอง role นี้กลับแดชบอร์ด ทำให้ capability ที่ให้ไว้ใช้ไม่ได้เลยผ่าน UI · **แก้เป็น**: เมนู "การตั้งค่า" = ✅ (บางส่วน) สำหรับการเงิน/บัญชี — เห็นเฉพาะแท็บ **บันทึกการใช้งาน** + **งานเบื้องหลัง** ซึ่งอ่านอย่างเดียวทั้งคู่ · แท็บที่ตั้งค่าจริง (สิทธิ์/ผู้ใช้/แผนค่าตอบแทน/เทมเพลตค่าบริการ/ทีม/บริษัทไฟแนนซ์/…) ยังเป็นของ Superadmin+บริหารเหมือนเดิม · `/settings` เปลี่ยนเส้นทางไป "แท็บแรกที่ผู้ใช้เห็น" แทนแท็บตายตัว · **ไม่กระทบ security** — ทุก endpoint ยังบังคับ `requirePermission()` (DEC-002) เมนูเป็นชั้น UX เท่านั้น |
| v2.1 | 04/07/2569 | **Mockup Audit Batch**: (1) เพิ่ม reference mockup ใหม่ 3 ไฟล์ใน §8 — `dashboard.html` (DRAFT), `case-management.html`, `notifications.html` (2) ระบุจำนวนรายงาน 17 ให้ตรงไฟล์ 96 |

ขอบเขตเอกสารนี้: แผนผังเมนูทั้งหมดของระบบ — Top Nav, Sub Menu, Role Group × Menu Visibility Matrix, Top Nav Permission Matrix — ต้องตรงกับ UI mockup และ README เสมอ

**ไม่รวมอยู่ในไฟล์นี้**: รายละเอียด Permission Matrix แบบเต็ม (ดู `07-roles-permissions.md`, `25-finance-permission-matrix.md`), รายละเอียด workflow ภายในแต่ละเมนู (ดูไฟล์ 38, 40, 41 ตามลำดับ)

---

## 1. Summary

แผนผังเมนูทั้งหมดที่ต้องตรงกับ UI ล่าสุดและ README

## 2. Purpose

แผนผังเมนูทั้งหมดที่ต้องตรงกับ UI ล่าสุดและ README

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
| เจ้าหน้าที่อนุมัติเคส (Case Approver) | พิจารณารับ/ไม่รับเคส (ไฟล์ 38), อนุมัติ recycle, ตีกลับหลักฐานปิดงาน (`reject_evidence`) | Global — ทุกเคสในระบบ (Role Group: system) |
| ผู้จัดการทีมติดตามทรัพย์ (Manager) | กำกับทีม มอบหมายงาน (ไฟล์ 40), อนุมัติขั้นต้นของค่าตอบแทน (ไฟล์ 16) | หลายทีม (Role Group: inhouse/outsource) |
| หัวหน้า (Supervisor) | กำกับทีมเดียว ตรวจงาน | ทีมเดียว (Role Group: inhouse/outsource) |
| ธุรการ / Admin | บันทึกข้อมูลและแนบเอกสารตามสิทธิ์ | Assigned scope |
| บริษัทไฟแนนซ์ (Company User) | ยื่นเคสและติดตามสถานะที่ได้รับอนุญาต | Company scope — 3 ระดับ: ผู้จัดการ/หัวหน้า/แอดมิน (ดูไฟล์ 10) |
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
| Top Menu | เมนูหลัก | dashboard, cases, finance, accounting, warehouse, reports, settings |
| Sub Menu | tab/subtab | financeSubTab, accountingSubTab, settingsTab |
| Route | URL path | path, permission |

### 7.1 เมนู "งานติดตามทรัพย์" (Asset Recovery Workflow) — Concrete Menu Map

ตาม Role Group ที่กำหนดในไฟล์ 07 (`system` / `inhouse` / `outsource` / `finance_company`) เมนูภายใต้ "งานติดตามทรัพย์" แสดงผลต่างกันตาม Role Group ของผู้ใช้ ไม่ใช่เมนูเดียวที่ทุกคนเห็นเหมือนกัน:

```
📁 งานติดตามทรัพย์
   ├── รับเคส              → ไฟล์ 38 — เห็นเฉพาะ Role Group: system (role "เจ้าหน้าที่อนุมัติเคส")
   ├── มอบหมายงาน          → ไฟล์ 40 — เห็นทั้ง 3 Role Group: system, inhouse, outsource (role "ผู้จัดการ"/"หัวหน้า" ของแต่ละกลุ่ม inhouse/outsource และ "เจ้าหน้าที่อนุมัติเคส" ของ system — ดู §7.1.1 สำหรับรายละเอียด)
   └── ติดตามภาคสนาม       → ไฟล์ 41 — เห็นเฉพาะ Role Group: inhouse, outsource (role พนักงานติดตามทรัพย์ / Field Agent) — ออกแบบเป็น mobile-first — รวม QC Outcome และผลการติดตามครบสมบูรณ์แล้ว (ไฟล์ 42/43 ถูก merge เข้าไฟล์ 41 ทั้งหมดแล้ว ไม่มีเมนูแยก)
```

#### 7.1.1 Role Group × Menu Visibility Matrix

| Role Group | Role | เห็น "รับเคส" (38) | เห็น "มอบหมายงาน" (40) | เห็น "ติดตามภาคสนาม" (41) |
|---|---|---|---|---|
| system | เจ้าหน้าที่อนุมัติเคส (Case Approver) | ✅ (ทุกเคสในระบบ) | ❌ | ❌ |
| inhouse | ผู้จัดการทีมติดตามทรัพย์ (Manager) | ❌ | ✅ (เฉพาะทีมที่ตนดูแล) | ❌ |
| inhouse | หัวหน้า (Supervisor) | ❌ | ✅ (เฉพาะทีมเดียวที่ตนสังกัด — read scope เสมอ, การมอบหมาย/reassign ขึ้นกับ Settings §7.2) | ❌ |
| inhouse | พนักงานติดตามทรัพย์ (Field Agent) | ❌ | ❌ | ✅ (เฉพาะเคสตนเอง) |
| outsource | ผู้จัดการทีมติดตามทรัพย์ (Manager) | ❌ | ✅ (เฉพาะทีมที่ตนดูแล) | ❌ |
| outsource | หัวหน้า (Supervisor) | ❌ | ✅ (เฉพาะทีมเดียวที่ตนสังกัด — read scope เสมอ, การมอบหมาย/reassign ขึ้นกับ Settings §7.2) | ❌ |
| outsource | พนักงานติดตามทรัพย์ (Field Agent) | ❌ | ❌ | ✅ (เฉพาะเคสตนเอง) |

**หลักการสำคัญ**:

- **"เจ้าหน้าที่อนุมัติเคส" (Case Approver)** เป็น **system role เดี่ยว ไม่ซ้ำกับ role ใดใน inhouse/outsource** — ดูแลทุกเคสในระบบแบบ Global ไม่ผูกกับทีม/พื้นที่ (ดูไฟล์ 38 §5)
- **"ผู้จัดการทีมติดตามทรัพย์ (Manager)" และ "หัวหน้า (Supervisor)"** เป็น role ของ inhouse/outsource เท่านั้น — คนละ role กับ "เจ้าหน้าที่อนุมัติเคส" ของ system แม้จะมีหน้าที่ "จัดการ"/"กำกับดูแล" คล้ายกันก็ตาม (ดูรายละเอียดการแยก role ในไฟล์ 07 §7.1)
- **ลำดับชั้นภายในแต่ละ Role Group (inhouse/outsource)**: ผู้จัดการทีมติดตามทรัพย์ (สูงสุด) → หัวหน้า (รองลงมา) → พนักงานติดตามทรัพย์ (ปฏิบัติงาน) — "หัวหน้า" ไม่ใช่ชั้นเหนือผู้จัดการ
- **ขอบเขตการดูแลของหัวหน้าแคบกว่าผู้จัดการ**: ผู้จัดการดูแลได้หลายทีม (`Team.manager_ids` เป็น array) แต่หัวหน้าสังกัดได้ทีมเดียวเท่านั้น (`Team.supervisor_id` เป็นค่าเดี่ยว) — ดูรายละเอียดในไฟล์ 09 §7.1
- **หัวหน้าเห็นเมนู "มอบหมายงาน" ได้เสมอ (read scope)** แต่ความสามารถในการมอบหมาย/เปลี่ยนผู้รับผิดชอบขึ้นกับค่า config ใน Settings ต่อ Role Group — default = เปิด (ทำได้) ดูรายละเอียดในไฟล์ 40 §7.2 และ §11

## 8. UI / UX Rules

- Top nav: แดชบอร์ด / จัดการเคส / การเงิน / บัญชี / คลังสินค้า / รายงาน / การตั้งค่า
- Finance tabs 9 รายการ (ดูไฟล์ 14-21)
- Accounting tabs 9 รายการ (ดูไฟล์ 30-37)
- คลังสินค้า (Warehouse) — 4 tabs: รับเข้าคลัง / ในคลัง / รอส่งมอบ / ส่งมอบแล้ว (ดูไฟล์ 44, Mockup: `warehouse.html`)
- รายงาน (Reports) — 4 หมวด: F (การเงิน) / O (งานติดตาม) / A (บัญชี) / E (Executive Dashboard) — รวม 17 รายงาน (ดูไฟล์ 96, Mockup: `reports.html`)
- แดชบอร์ดหลัก (Top nav "แดชบอร์ด") — Mockup: `dashboard.html` 🔶 **DRAFT** — ประกอบจากสเปกที่มีอยู่ (คิวงานต่อ role/KPI 96 E1/แจ้งเตือน 90 §6.3) **ยังไม่มีไฟล์ spec .md** รอ Product Owner อนุมัติ mockup แล้วเขียน spec ตาม (ดู `93` §7.1)
- จัดการเคส (Case Management) — Mockup: `case-management.html` (รายการเคส / คิวพิจารณารับเคส / Recycle Review — สเปกไฟล์ 38 §6.4-6.6, enum `case_status`) + `38-case-submission-mockup.html` (ฟอร์มรับเคส)
- การแจ้งเตือน In-app — Mockup: `notifications.html` (กระดิ่ง+dropdown บน header ทุกหน้า + หน้ารายการเต็ม — ไฟล์ 90 §6.3/§14, ตาราง `notifications` schema 02 v3.5, DEC-006/D3)
- Settings แบ่ง 2 หมวดหลัก: **ตั้งค่าทั่วไป** (roles, teams, companies, users, compensation, servicefee, system, auditlog) และ **ตั้งค่าบัญชี/การเงิน** 13 sub-tabs (ดูไฟล์ 13 §6.1-6.13)

### 7.2 สิทธิ์เข้าถึงเมนูหลัก (Top Nav Visibility Matrix)

| เมนู | Superadmin | บริหาร | การเงิน | บัญชี | Case Approver | Manager / Supervisor | Field Agent | Company User |
|---|---|---|---|---|---|---|---|---|
| แดชบอร์ด | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| จัดการเคส | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| การเงิน | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| บัญชี | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| คลังสินค้า | ✅ | ✅ | ✅ (read) | ✅ (read) | ❌ | ✅ (read) | ❌ | ✅ (read, company scope) |
| รายงาน | ✅ | ✅ | ✅ (F1-F5) | ✅ (A1-A4) | ❌ | ✅ (O1-O5 ทีมตัวเอง) | ❌ | ❌ |
| การตั้งค่า | ✅ | ✅ | 🔸 | 🔸 | ❌ | ❌ | ❌ | ❌ |

> 🔸 **การเงิน/บัญชี = เห็นบางส่วน** (v2.2 — มติ PO 15/08/2569 ข้อ D17): เห็นเฉพาะแท็บ **บันทึกการใช้งาน (Audit Log)** และ **งานเบื้องหลัง (Job Log)** ตามสิทธิ์ที่ `90` §12 / `91` §12 ให้ไว้ (`view_audit_log` / `manage_jobs` ระดับ view) — ทั้งสองแท็บอ่านอย่างเดียว · แท็บที่ตั้งค่าจริงทุกตัวยังเป็นของ Superadmin + บริหารเท่านั้น · `/settings` พาไปแท็บแรกที่ผู้ใช้คนนั้นเห็น
>
> ⚠️ "ธุรการ" ไม่มีคอลัมน์ในตารางนี้ (ยึด mockup `app-shell.html`: แดชบอร์ด + จัดการเคส) — `05` §12 ให้ `manage_users` ไว้แต่ยังไม่เปิดทางเข้าหน้า `settings.users` ให้ role นี้

## 9. Workflow / Lifecycle

- Route guard → render menu → select tab → render content
- ชื่อเมนูในเอกสารกับ UI ต้องตรงกัน

## 10. Security / Control Rules

- เปลี่ยนชื่อเมนูต้อง update README และ spec
- เมนู baseline ต้องติดป้าย baseline

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
| View menu | ตาม role | scope |
| Manage nav config | Superadmin | if dynamic |

## 13. Audit Log Requirements

- ทุก mutation ต้องบันทึก `actor_id`, `role`, `action`, `target_type`, `target_id`, `before`, `after`, `reason`, `created_at`
- ข้อมูลที่กระทบเงิน สิทธิ์ ธนาคาร ภาษี หรือการ lock period ต้องบันทึก reason เสมอ
- Audit log ห้ามแก้ไขย้อนหลัง
- รายการ export/import/background job ต้อง trace กลับไปผู้สั่งงานได้

## 14. API / Integration Draft

| Method | Endpoint / Event | Purpose | Notes |
|---|---|---|---|
| GET | /api/meta/menu | รายการเมนูตาม role ปัจจุบัน | ใช้ render top nav/sidebar |
| POST | /api/meta/nav-config | update nav config (ถ้าเปิด dynamic) | audit required, Superadmin เท่านั้น |
| EVENT | menu.config.updated | เมนู config เปลี่ยน | notification/audit |

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
| Role Group menu isolation | login เป็น Case Approver | ต้องไม่เห็นเมนู "ติดตามภาคสนาม" (41) เลย |
| Supervisor read scope | login เป็นหัวหน้า | เห็น "มอบหมายงาน" แต่ scope เฉพาะทีมเดียวที่ตนสังกัด |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **เมนูภายใต้ "งานติดตามทรัพย์" แยกตาม Role Group ไม่ใช่เมนูเดียวที่ทุกคนเห็นเหมือนกัน** — ดู Role Group × Menu Visibility Matrix (§7.1.1) เป็น source of truth
- **"เจ้าหน้าที่อนุมัติเคส" คือ system role เดี่ยว ไม่ซ้ำกับ Manager/Supervisor ของ inhouse/outsource** แม้หน้าที่จะดูคล้ายกัน
- **Role naming ("ผู้จัดการพื้นที่" → "เจ้าหน้าที่อนุมัติเคส") อัปเดตทั่วทั้งโปรเจกต์แล้ว** (29/06/2569) — ป้องกันความสับสนกับ "ผู้จัดการทีมติดตามทรัพย์" ของ inhouse/outsource
- **หัวหน้าเห็นเมนู "มอบหมายงาน" เสมอ (read scope)** ความสามารถมอบหมายจริงควบคุมผ่าน Settings ต่อ Role Group (default เปิด) — ไม่ใช่ hard-coded
- **หัวหน้ายังไม่มีสิทธิ์เข้าเมนู "รับเคส" (38)** ในรอบนี้ — เมนูนั้นเป็นของ "เจ้าหน้าที่อนุมัติเคส" เท่านั้น
- **ไฟล์ 42/43 (Check-in/Evidence, QC Outcome) merge เข้าไฟล์ 41 ครบสมบูรณ์แล้ว** — ไม่มีเมนูแยกสำหรับ "ผลการติดตาม" อีกต่อไป
- **เปลี่ยนชื่อเมนูต้อง update README และ spec พร้อมกันเสมอ** (ข้อ 10) — ป้องกัน desync ระหว่างเอกสารกับ mockup

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- [ ] ยืนยันรายละเอียดเมื่อเริ่ม sprint เฉพาะ module (Open Item เดิม)
- [ ] Dynamic nav config (Superadmin ปรับเมนูเองได้ไหม) — ยังเป็นแค่ draft ใน §14 ยังไม่ยืนยันว่าจะทำ

---

*เอกสารนี้เป็นไฟล์สุดท้ายในกลุ่ม Foundation หลัก (00–06) ต่อด้วยกลุ่ม Platform (90–95)*
