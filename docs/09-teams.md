# 09-teams.md

# 09 — Teams
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Settings Module
> เอกสารอ้างอิง: `07-roles-permissions.md`, `08-users.md`, `11-compensation.md`, `02-database-schema-design.md` §5 (teams, team_managers table), `40-case-assignment-routing.md`, `06-menu-and-navigation-map.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — Team CRUD, Manager/Supervisor scope |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + ชี้แจงว่า `manager_ids` (§7.1) implement จริงผ่าน table `team_managers` (N:N join table) ตาม `02-database-schema-design.md` ไม่ใช่ array column ตรงๆ บน `teams` — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |

ขอบเขตเอกสารนี้: จัดการทีม Inhouse/Outsource — ผู้จัดการ (many-to-many ผ่าน `team_managers`), หัวหน้าทีม (1:1), สมาชิก, พื้นที่จังหวัดที่รับผิดชอบ, และการผูก Compensation Plan

**ไม่รวมอยู่ในไฟล์นี้**: รายละเอียดแผนค่าตอบแทน (ดู `11-compensation.md`), การมอบหมายเคสจริง (ดู `40-case-assignment-routing.md`)

---

## 1. Summary

จัดการทีม Inhouse/Outsource ผู้จัดการ สมาชิก พื้นที่จังหวัด และ template ค่าตอบแทน

## 2. Purpose

จัดการทีม Inhouse/Outsource ผู้จัดการ สมาชิก พื้นที่จังหวัด และ template ค่าตอบแทน

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
| บัญชี | ตรวจข้อมูลบัญชี ส่งออก pack กระทบยอด WHT | Accounting scope |
| การเงิน | ควบคุม claim payout payee billing receipt | Finance scope |
| ผู้จัดการทีมติดตามทรัพย์ (Manager) | กำกับทีม ตรวจงาน อนุมัติขั้นต้นค่าตอบแทน | หลายทีม (Role Group: inhouse/outsource เท่านั้น) |
| ธุรการ / Admin | บันทึกข้อมูลและแนบเอกสารตามสิทธิ์ | Assigned scope |
| บริษัทไฟแนนซ์ | ยื่นเคสและติดตามสถานะที่ได้รับอนุญาต | Company scope |
| เจ้าหน้าที่ติดตามทรัพย์ | รับงาน อัปเดตผล แนบหลักฐาน | Assigned case scope |

## 6. Core Concepts

| Concept | Meaning | Implementation Notes |
|---|---|---|
| Consistency | ใช้มาตรฐานเดียวกันทุก module | ลดงานแก้ภายหลัง |
| Reusability | component/rule ใช้ซ้ำ | Cursor ทำซ้ำได้ |
| Traceability | ทุก action ต้อง trace | audit/report |

## 7. Data Entities / Required Objects

| Entity / Object | Purpose | Required Key Fields |
|---|---|---|
| Team | ทีม | name, side, compensation_plan_id, manager_ids (ผ่าน `team_managers`), supervisor_id, provinces, status |
| Team Member | สมาชิก | user_id, team_id, role |
| Service Area | พื้นที่ | region, province |

> **หมายเหตุ**: `Team.compensation_plan_id` คือการอ้างอิงไปยัง **แผนค่าตอบแทน (Compensation Plan)** (ไฟล์ 11) — ทุกทีมต้องผูกแผนนี้ไว้เสมอตอนสร้างทีม (เหมือนที่ Finance Company ต้องผูก Service Fee Template ตามไฟล์ 10 §9) เพื่อให้ไฟล์ 38 §7.4 ดึงค่าใช้จ่ายของทีมมาแสดงประกอบการพิจารณารับเคสได้ทุกทีมโดยไม่มีกรณี "ทีมไม่มีแผนค่าตอบแทนผูกไว้"
>
> **UI (settings.html)**: ตารางทีมแสดงคอลัมน์ "แผนค่าตอบแทน" — แสดงชื่อแผนและ badge inhouse/outsource ของทีมนั้น · ฟอร์มสร้าง/แก้ไขทีมมี dropdown เลือกแผนค่าตอบแทน (แสดงแผนทั้งหมดจาก store.compTemplates)

### 7.1 Manager vs Supervisor Scope

- `manager_ids` (แนวคิดระดับ API/UI — **implement จริงผ่าน table `team_managers`** ซึ่งเป็น N:N join table ตาม `02-database-schema-design.md` §5, ไม่ใช่ array column บน `teams` โดยตรง): ผู้จัดการของทีม — **ผู้จัดการ 1 คนดูแลได้มากกว่า 1 ทีม** (many-to-many ผ่าน join table นี้)
- `supervisor_id` (single value, nullable, FK ตรงบน `teams`): หัวหน้าทีมติดตามทรัพย์ (Supervisor) ของทีม — **หัวหน้าทีมติดตามทรัพย์ 1 คนสังกัดได้แค่ทีมเดียวเท่านั้น** ต่างจากผู้จัดการที่ดูแลได้หลายทีม — ฟิลด์นี้เป็นค่าเดี่ยว ไม่ใช่ array
- หัวหน้าทีมติดตามทรัพย์อยู่ใต้ผู้จัดการทีมติดตามทรัพย์ในลำดับชั้นของ Role Group **inhouse/outsource เท่านั้น** — Role Group `system` ไม่มีโครงสร้าง manager_ids/supervisor_id แบบนี้ เพราะมีแค่ role "เจ้าหน้าที่อนุมัติเคส" (Case Approver) ตัวเดียวที่เป็น Global ไม่ผูกทีม ไม่มีลำดับชั้นผู้จัดการ/หัวหน้าแบบทีม (ดูไฟล์ 07 §5.1) — ดูรายละเอียดสิทธิ์ของ inhouse/outsource ที่เกี่ยวข้องในไฟล์ 40 §7.2/§11/§13 และ matrix การมองเห็นเมนูในไฟล์ 06 §7.1

## 8. UI / UX Rules

- Filter inhouse/outsource
- แสดง template, manager, member count, provinces
- จังหวัดตาม PROVINCE_DATA

## 9. Workflow / Lifecycle

- Create team → assign manager/member → assign provinces/template → active

## 10. Security / Control Rules

- ทีมที่มีงาน active ห้าม deactivate โดยไม่ reassign
- template ต้อง snapshot เมื่อใช้กับงาน

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
| Manage teams | Superadmin, ผู้จัดการทีมติดตามทรัพย์ (เฉพาะทีมตนเอง) | scope ตาม `team_managers` |
| View teams | การเงิน, บัญชี | read for reporting |

## 13. Audit Log Requirements

- ทุก mutation ต้องบันทึก `actor_id`, `role`, `action`, `target_type`, `target_id`, `before`, `after`, `reason`, `created_at`
- ข้อมูลที่กระทบเงิน สิทธิ์ ธนาคาร ภาษี หรือการ lock period ต้องบันทึก reason เสมอ
- Audit log ห้ามแก้ไขย้อนหลัง
- รายการ export/import/background job ต้อง trace กลับไปผู้สั่งงานได้

## 14. API / Integration Draft

| Method | Endpoint | Purpose | Notes |
|---|---|---|---|
| GET | /api/teams | list พร้อม filter (side, status) | ตาม permission |
| POST | /api/teams | สร้างทีมใหม่ | ต้องผูก compensation_plan_id เสมอ |
| PATCH | /api/teams/:id | แก้ไขข้อมูลทีม | audit required |
| POST | /api/teams/:id/managers | เพิ่ม manager (insert `team_managers`) | audit required |
| DELETE | /api/teams/:id/managers/:userId | ถอด manager ออกจากทีม | audit required |

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
| Manager หลายทีม | ผูก manager คนเดียวกับ 2 ทีม | สำเร็จ — ตรวจสอบว่า `team_managers` มี 2 records |
| Supervisor สองทีม | พยายามตั้ง supervisor_id ของ user ที่เป็น supervisor ทีมอื่นอยู่แล้ว | ควรเตือนหรือ reject ตามนโยบาย (ดู Open Items) |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **`manager_ids` implement ผ่าน `team_managers` join table (N:N)** ไม่ใช่ array column บน `teams` — ยืนยันตาม schema จริง (§7.1)
- **ผู้จัดการทีมติดตามทรัพย์ 1 คนดูแลได้หลายทีม** แต่ **หัวหน้าทีมติดตามทรัพย์ 1 คนสังกัดได้แค่ทีมเดียว** — ความไม่สมมาตรนี้ตั้งใจ สะท้อนจากโครงสร้างองค์กรจริง (§7.1)
- **ทุกทีมต้องผูก Compensation Plan เสมอตอนสร้าง** ไม่มีทีมไหนไม่มีแผนค่าตอบแทน (§7)
- **Role Group `system` ไม่มีโครงสร้าง manager/supervisor แบบทีม** เพราะ "เจ้าหน้าที่อนุมัติเคส" เป็น Global role เดี่ยว (§7.1)
- **ทีมที่มีงาน active ห้าม deactivate โดยไม่ reassign ก่อน** (§10)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- [ ] **นโยบายเมื่อพยายามตั้ง user เดียวเป็น supervisor ของมากกว่า 1 ทีม** — schema อนุญาตทางเทคนิค (ไม่มี unique constraint บังคับ) แต่ business rule ยังไม่ชัดว่าควร reject หรือแค่เตือน (พบระหว่างเขียน test case ข้อ 16)
- [ ] ยืนยันรายละเอียดเมื่อเริ่ม sprint เฉพาะ module (Open Item เดิม)

---

*เอกสารนี้เป็นไฟล์ที่ 3 ในหมวด Settings Module (07–13) ต่อจาก `08-users.md` และก่อน `10-finance-companies.md`*
