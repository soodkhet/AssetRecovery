# 08-users.md

# 08 — Users
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted + เนื้อหาจริง)
> Document Level: Settings Module
> เอกสารอ้างอิง: `07-roles-permissions.md`, `02-database-schema-design.md` §4 (users table), `09-teams.md`, `10-finance-companies.md`, `05-auth-and-access-control.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — Foundation spec เปล่า |
| v2 | 03/07/2569 | Reformat + เติมเนื้อหาจริงจาก `02-database-schema-design.md` (users table fields) และยืนยัน tab structure กับ Product Owner (3 tab หลัก, tab เจ้าหน้าที่ติดตามทรัพย์แบ่งย่อย Inhouse/Outsource ภายใน — ตรงกับ `07-roles-permissions.md` §17) |
| v2.1 | 03/10/2569 | **DEC-010** — เพิ่ม `username` (บังคับ · ใช้ login) · `email` ไม่บังคับ · สร้างผู้ใช้ = ผู้ดูแลตั้งรหัสผ่านเริ่มต้นให้ (ไม่ส่งอีเมลเชิญ) · ตั้งรหัสผ่านใหม่ให้ผู้ใช้ได้ (`POST /api/users/:id/password`) เฉพาะผู้ที่เพิ่มผู้ใช้ได้ · ผู้ใช้ต้องเปลี่ยนรหัสเองครั้งแรก (`must_change_password`) |
| v2.2 | 07/10/2569 | **มติ PO U131** — ฟอร์มเพิ่ม/แก้ผู้ใช้กลุ่มเจ้าหน้าที่ติดตามทรัพย์ (Inhouse/Outsource) มีส่วน **"ข้อมูลรับเงิน"** (ฟิลด์ชุดเดียวกับ Payee `18` §7.1) → บันทึกพร้อมผู้ใช้ใน transaction เดียว สร้าง/อัปเดต Payee ผูก `user_id` · ชื่อผู้รับ = `users.full_name` จุดเดียว · ติ๊ก "ยืนยันข้อมูลรับเงิน" ได้ในฟอร์มเดียว (สิทธิ์ `manage:manage_payee_profile` + audit เดิมของ Payee · U106) · ส่วนนี้มีเหตุผลของตัวเอง (หมวดธนาคาร) · **มติ PO U138** — `/api/users/:id` (+ sub-route) ผู้ใช้นอก scope หรือกลุ่มที่มองไม่เห็น ตอบ 404 `USER_NOT_FOUND` เหมือนไม่มีจริง |

ขอบเขตเอกสารนี้: จัดการผู้ใช้งานระบบทั้งหมด — CRUD, การผูก role/team/company, lifecycle (active/suspended/deleted), และการเชื่อมกับ Supabase Auth

**ไม่รวมอยู่ในไฟล์นี้**: รายชื่อ Role และ Permission Matrix (ดู `07-roles-permissions.md`), กลไก Login/Session (ดู `05-auth-and-access-control.md`), การจัดการทีม (ดู `09-teams.md`)

---

## 1. Summary

จัดการผู้ใช้งานระบบ แอดมิน เจ้าหน้าที่ติดตามทรัพย์ และผู้ใช้บริษัทไฟแนนซ์

## 2. Purpose

จัดการผู้ใช้งานระบบ แอดมิน เจ้าหน้าที่ติดตามทรัพย์ และผู้ใช้บริษัทไฟแนนซ์

## 3. In Scope

- CRUD ผู้ใช้งานทุก Role Group
- ผูก role_id, team_id (inhouse/outsource), company_id (finance_company)
- Lifecycle: active → suspended → deactivated (deleted)
- เชื่อมกับ Supabase Auth (supabase_uid)

## 4. Out of Scope

- รายละเอียด Role/Permission (ไฟล์ 07)
- กลไก Login/Session (ไฟล์ 05)
- การจัดการทีม/บริษัท (ไฟล์ 09, 10)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| Superadmin | สร้าง/แก้ไข/ระงับ/ลบ user ทุกคน | Global |
| บริหาร / Executive | อนุมัติ policy, exception, lock/unlock, scope decision | Organization |
| บัญชี | ตรวจข้อมูลบัญชี ส่งออก pack กระทบยอด WHT | Accounting scope |
| การเงิน | ควบคุม claim payout payee billing receipt | Finance scope |
| ผู้จัดการทีมติดตามทรัพย์ (Manager) | สร้าง/แก้ไข user ในทีมที่ตนดูแล (ถ้าได้รับมอบหมายสิทธิ์) | หลายทีม (Role Group: inhouse/outsource เท่านั้น) |
| ธุรการ / Admin | บันทึกข้อมูลและแนบเอกสารตามสิทธิ์ | Assigned scope |
| บริษัทไฟแนนซ์ | ยื่นเคสและติดตามสถานะที่ได้รับอนุญาต | Company scope |
| เจ้าหน้าที่ติดตามทรัพย์ | รับงาน อัปเดตผล แนบหลักฐาน | Assigned case scope |

## 6. Core Concepts

| Concept | Meaning | Implementation Notes |
|---|---|---|
| Consistency | ใช้มาตรฐานเดียวกันทุก module | ลดงานแก้ภายหลัง |
| Reusability | component/rule ใช้ซ้ำ | Cursor ทำซ้ำได้ |
| Traceability | ทุก action ต้อง trace | audit/report |
| User ↔ Supabase Auth | User record ผูกกับ `supabase_uid` เสมอ — ไม่เก็บ password ในระบบเราเอง (ผู้ดูแลตั้งรหัสผ่านผ่าน Supabase Admin API — DEC-010) | Supabase Auth จัดการ authentication ทั้งหมด (ตาม `05-auth-and-access-control.md`) |

## 7. Data Entities / Required Objects

### 7.1 User (ตรงกับ table `users` ใน `02-database-schema-design.md` §4)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| role_id | uuid | yes | FK → roles (ดูไฟล์ 07) |
| supabase_uid | uuid | yes (หลัง activate) | FK → Supabase Auth |
| username | string | yes | unique ต่อ organization (ตัวพิมพ์เล็ก a-z 0-9 . _ - ยาว 3–50) · ใช้ login (DEC-010) |
| email | string | no | unique ต่อ organization ถ้ากรอก · ใช้ login ได้ (DEC-010) |
| must_change_password | boolean | yes | ผู้ดูแลตั้ง/รีเซ็ตรหัสให้ → ผู้ใช้ต้องเปลี่ยนเองก่อนใช้งาน (DEC-010) |
| full_name | string | yes | — |
| phone | string | no | — |
| employee_code | string | no | รหัสพนักงาน (optional) |
| team_id | uuid | conditional | บังคับถ้า role_group = inhouse/outsource |
| company_id | uuid | conditional | บังคับถ้า role_group = finance_company |
| status | enum | yes | `active` / `suspended` / `deleted` |
| last_login_at | timestamptz | no | — |

### 7.2 User Status Lifecycle

| Status | Meaning | เปลี่ยนกลับได้ไหม |
|---|---|---|
| active | login ได้ปกติ | — |
| suspended | ถูกระงับชั่วคราว — login ไม่ได้ แต่ประวัติยังอยู่ครบ | เปิดใช้งานกลับได้ (reactivate) |
| deleted | soft delete (`deleted_at` ไม่ null) | ไม่ reactivate ผ่าน UI ปกติ — ต้อง Superadmin เข้าไปจัดการ database โดยตรงถ้าจำเป็นจริงๆ |

## 8. UI / UX Rules

- **Sub tabs: 3 tab หลัก — แอดมิน (System) / เจ้าหน้าที่ติดตามทรัพย์ / บริษัทไฟแนนซ์** — tab "เจ้าหน้าที่ติดตามทรัพย์" แบ่งย่อยภายในเป็น **Inhouse / Outsource** (เช่น toggle หรือ filter chip ภายใน tab เดียวกัน ไม่ใช่ tab แยกระดับบนสุด) — ยืนยันกับ Product Owner แล้ว (03/07/2569) สอดคล้องกับ `07-roles-permissions.md` §17
- Search name/username/phone/email
- Filter status/role
- Role select เปลี่ยนตาม group ที่เลือก (เลือก tab "เจ้าหน้าที่ติดตามทรัพย์" + Inhouse → role select แสดงเฉพาะ 3 role ของ inhouse)

- **ส่วน "ข้อมูลรับเงิน" (มติ PO U131)**: แสดงในฟอร์มเพิ่ม/แก้ผู้ใช้เมื่อกลุ่มเป็น Inhouse/Outsource **และ**ผู้ใช้งานถือ `manage:manage_payee_profile` (ผู้ไม่มีสิทธิ์ = ไม่เห็นส่วนนี้ · API ปฏิเสธ `PERMISSION_DENIED`) — ฟิลด์ชุดเดียวกับหน้า "ผู้รับเงิน" (ประเภท · คำนำหน้า · เลข 13 หลัก · ที่อยู่ 5 ช่อง · สาขา · ธนาคาร/ชื่อบัญชี/เลขบัญชี · เงื่อนไขการหัก · อัตรา 40(1)/40(2) รายคน · Tax Profile override ไม่บังคับ) · ไม่มีช่องชื่อ (ใช้ชื่อ-นามสกุลของผู้ใช้) · ช่อง "ยืนยันข้อมูลรับเงิน" + เหตุผล (บังคับเมื่อแก้ส่วนนี้หรือติ๊กยืนยัน) · ป้ายสถานะ ยืนยันแล้ว / รอยืนยัน / ข้อมูลรับเงินไม่ครบ · ไม่แตะส่วนนี้ = ไม่สร้าง/แก้ Payee · หน้า "ผู้รับเงิน" เดิมยังใช้ได้ (ฟิลด์ชุดเดียวกัน)

## 9. Workflow / Lifecycle

- Create user → assign group/role + ตั้งรหัสผ่านเริ่มต้น → user login ได้ทันที → ถูกบังคับเปลี่ยนรหัสเองครั้งแรก (DEC-010)
- ผู้ดูแลตั้งรหัสผ่านใหม่ให้ (ลืมรหัส) → user ต้องเปลี่ยนรหัสเองตอน login ครั้งถัดไป
- Deactivate user → preserve history

## 10. Security / Control Rules

- User ที่มี transaction history ห้าม delete — ใช้ suspend แทนเสมอ (soft delete เท่านั้น)
- Deactivate ไม่ลบ audit
- Username/email/phone duplicate ต้องตรวจ (unique ต่อ organization)
- ตั้งรหัสผ่านให้ผู้ใช้ได้เฉพาะผู้มี `manage:manage_users` ภายใน scope ตัวเอง · ระบบไม่บันทึกรหัสผ่านลง audit (DEC-010)
- **บัญชีกลุ่มแอดมิน (System) จัดการได้เฉพาะ Superadmin** — สร้าง/แก้ไข/ย้ายเข้ากลุ่ม/ตั้งรหัส/ระงับ/ลบ · ไม่ใช่ Superadmin เปลี่ยน role ของตัวเองไม่ได้ (DEC-010 — กันยกสิทธิ์ตัวเอง)
- User inactive (suspended/deleted) ห้าม login — บังคับใช้ที่ `05-auth-and-access-control.md` §10

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| REQUIRED_MISSING | ข้อมูลบังคับไม่ครบ | inline error |
| DUPLICATE_RECORD | email/phone ซ้ำในองค์กรเดียวกัน | reject พร้อมอธิบาย |
| DUPLICATE_USERNAME | username ซ้ำในองค์กรเดียวกัน | reject พร้อมอธิบาย |
| AUTH_ACCOUNT_SYNC_FAILED | Supabase Auth ปฏิเสธ/ไม่ตอบตอนสร้างบัญชีหรือตั้งรหัสผ่าน | reject (502) — ไม่บันทึกผู้ใช้ |
| PERMISSION_DENIED | ไม่มีสิทธิ์ | UI hide/disable และ API 403 |
| USER_NOT_FOUND | ผู้ใช้ไม่มีจริง **หรือ**อยู่นอก scope/กลุ่มที่มองไม่เห็น (U138) | 404 เหมือนกันทุกกรณี — ไม่ leak ว่ามี record |
| INVALID_STATUS | สถานะไม่ถูก | reject transition |
| USER_HAS_HISTORY | พยายาม delete user ที่มี transaction history | reject — ต้อง suspend แทน |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| Create user | Superadmin/Admin | ตาม group |
| Deactivate user | Superadmin/Admin | ต้องระบุ reason |
| View users | ผู้จัดการทีมติดตามทรัพย์, Superadmin | scope ตามทีม/global |

## 13. Audit Log Requirements

- ทุก mutation ต้องบันทึก `actor_id`, `role`, `action`, `target_type`, `target_id`, `before`, `after`, `reason`, `created_at`
- การเปลี่ยน status (suspend/deactivate) ต้องบันทึก reason เสมอ
- Audit log ห้ามแก้ไขย้อนหลัง
- รายการ export/import/background job ต้อง trace กลับไปผู้สั่งงานได้

## 14. API / Integration Draft

| Method | Endpoint | Purpose | Notes |
|---|---|---|---|
| GET | /api/users | list พร้อม filter (role_group, team_id, company_id, status) | ตาม permission scope |
| POST | /api/users | สร้าง user ใหม่ | ต้องมี role_id + team_id/company_id ตาม role_group |
| PATCH | /api/users/:id | แก้ไขข้อมูล | audit required · ไม่มีช่อง reason — ระบบสรุปฟิลด์ที่เปลี่ยนเป็นเหตุผล (DEC-010) |
| POST/PATCH | /api/users · /api/users/:id + `payment` | ส่วน "ข้อมูลรับเงิน" (มติ PO U131) | ไม่บังคับ · `{ fields, verify, reason }` — ต้องถือ `manage:manage_payee_profile` · สร้าง/อัปเดต/ยืนยัน Payee ใน transaction เดียวกับผู้ใช้ (ไม่ครบแต่ติ๊กยืนยัน = `REQUIRED_MISSING` rollback ทั้งหมด) · กลุ่มบริษัทไฟแนนซ์ = `PERMISSION_DENIED` |
| PATCH | /api/users/:id/suspend | ระงับการใช้งาน | ต้องระบุ reason |
| PATCH | /api/users/:id/reactivate | เปิดใช้งานกลับ | Superadmin/Admin เท่านั้น |
| POST | /api/users/:id/password | ผู้ดูแลตั้งรหัสผ่านใหม่ให้ผู้ใช้ | `manage:manage_users` · ไม่มีช่อง reason (ระบบเติมเหตุผลมาตรฐานลง audit) · ผู้ใช้ต้องเปลี่ยนเองครั้งถัดไป (DEC-010) |

## 15. Acceptance Criteria

- User ทุกคนผูก role_id ที่ถูกต้องตาม Role Group เสมอ (ตรงกับไฟล์ 07)
- Sub tab UI ตรงกับมติ 3-tab nested structure
- Suspend/Delete แยกกันชัดเจน ไม่ปนกัน

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| Permission | role ไม่มีสิทธิ์ | ไม่เห็นปุ่มและ API reject |
| Audit | แก้ข้อมูลสำคัญ | มี audit before/after |
| Validation | ข้อมูลไม่ครบ | แสดง error ชัดเจน |
| Delete user ที่มีประวัติ | พยายามลบ user ที่เคยมี expense/case | reject USER_HAS_HISTORY แนะนำ suspend แทน |
| Email ซ้ำ | สร้าง user ด้วย email ที่มีอยู่แล้วในองค์กรเดียวกัน | reject DUPLICATE_RECORD |
| Username ซ้ำ | สร้าง user ด้วย username ที่มีอยู่แล้วในองค์กรเดียวกัน | reject DUPLICATE_USERNAME |
| จัดการบัญชีกลุ่ม System | ผู้ดูแลที่ไม่ใช่ Superadmin สร้าง/แก้/ตั้งรหัส/ระงับ/ลบ ผู้ใช้กลุ่ม System หรือมอบ role กลุ่ม System | สร้าง/ย้ายเข้ากลุ่ม = 403 PERMISSION_DENIED · ดู/แก้/ตั้งรหัส/ระงับ/ลบ**รายคน**ของบัญชีกลุ่ม System ที่ผู้ดูแลมองไม่เห็น = 404 `USER_NOT_FOUND` (มติ PO U138 — ไม่ leak) · UI ซ่อนปุ่มและไม่แสดงกลุ่ม System ในฟอร์ม |
| เปลี่ยน role ตัวเอง | ผู้ดูแลที่ไม่ใช่ Superadmin แก้ role ของตัวเอง | 403 PERMISSION_DENIED |
| บังคับเปลี่ยนรหัส | ผู้ดูแลตั้งรหัสให้ → user login | redirect `/auth/change-password` · API อื่นตอบ PASSWORD_CHANGE_REQUIRED จนกว่าจะเปลี่ยน |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Sub tab หน้าจัดการผู้ใช้งาน: 3 tab หลัก** (แอดมิน / เจ้าหน้าที่ติดตามทรัพย์ / บริษัทไฟแนนซ์) โดย tab "เจ้าหน้าที่ติดตามทรัพย์" แบ่งย่อย Inhouse/Outsource ภายใน — ยืนยันกับ Product Owner แล้ว (03/07/2569) ตรงกับ `07-roles-permissions.md` §17
- **User ผูก Supabase Auth ผ่าน `supabase_uid`** ไม่เก็บ password เอง (§6, §7.1)
- **DEC-010 (03/10/2569)**: login ด้วยอีเมลหรือ username · username บังคับ / email ไม่บังคับ · ผู้ดูแลตั้งรหัสผ่านให้ตอนสร้างและรีเซ็ตได้ (แทน flow เชิญทางอีเมลของ D1) · บังคับผู้ใช้เปลี่ยนรหัสเองครั้งแรก
- **ห้าม hard-delete user ที่มี transaction history เด็ดขาด** — ใช้ suspend เสมอ (§10, §11)
- **Field บังคับ conditional ตาม role_group**: `team_id` บังคับถ้า inhouse/outsource, `company_id` บังคับถ้า finance_company (§7.1)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- [ ] ยืนยันรายละเอียดเมื่อเริ่ม sprint เฉพาะ module (Open Item เดิม)

---

*เอกสารนี้เป็นไฟล์ที่ 2 ในหมวด Settings Module (07–13) ต่อจาก `07-roles-permissions.md` และก่อน `09-teams.md`*
