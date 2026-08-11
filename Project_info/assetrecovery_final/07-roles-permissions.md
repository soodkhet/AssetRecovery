# 07-roles-permissions.md

# 07 — Roles and Permissions (Master Role List)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Settings Module
> เอกสารอ้างอิง: ไฟล์ 38, 40, 41 (Field Operations), ไฟล์ 10-37 (Finance/Accounting — สรุปไว้แล้วที่ไฟล์ 25), `06-menu-and-navigation-map.md`, `09-teams.md`, `08-users.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Rewritten จาก Foundation Spec เปล่า — เขียนใหม่เป็น single source of truth ของ Role/Permission ทั้งระบบ (14 roles, 4 role groups) |
| v2 | 03/07/2569 | Reformat header ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |
| v2.1 | 03/07/2569 | **แก้ไข §8**: ยืนยันกับ Product Owner ว่าโครงสร้าง tab หน้า "บทบาทและสิทธิ์"/"ผู้ใช้งาน" คือ **3 tab หลัก** (แอดมิน / เจ้าหน้าที่ติดตามทรัพย์ / บริษัทไฟแนนซ์) โดย tab "เจ้าหน้าที่ติดตามทรัพย์" แบ่งย่อยเป็น Inhouse/Outsource ภายใน — ไม่ใช่ 4 tab แยกเรียบเท่ากันตามที่เขียนไว้ผิดใน v2 |
| v2.2 | 04/07/2569 | **แก้จำนวน role "14" → "15" ทั้งไฟล์**: นับจริงจาก §5 ได้ 15 role records (system 6 + inhouse 3 + outsource 3 + finance_company 3 — role ชื่อซ้ำคนละกลุ่มเป็น record แยกจริงตาม Core Concepts §6) ตรงกับ seed data จริงใน `02-database-schema-design.md` §12 ซึ่ง insert 15 records — ตัวเลข 14 เดิมเป็นการนับผิด (🔶 รอ Product Owner ยืนยันตัวเลขสุดท้าย) + แก้คำอธิบายการแบ่งกลุ่มจาก "3 Role Group" เป็น "**4 Role Group ใน 3 กลุ่มหลัก**" ให้ตรงกับ Core Concepts §6 ที่ระบุ 4 กลุ่มมาตลอด — **ไม่มีการเพิ่ม/ลด/เปลี่ยนชื่อ role ใดๆ** |
| v2.3 | 04/07/2569 | ✅ Product Owner **ยืนยันจำนวน 15** แล้ว (DEC-006/D8) — ปิด 🔶 ที่ตั้งไว้ใน v2.2 |

ขอบเขตเอกสารนี้: รายชื่อ Role ทั้งหมด 15 ตัวของระบบ แบ่ง 4 Role Group ใน 3 กลุ่มหลัก (System, ทีมติดตามทรัพย์ Inhouse/Outsource, Finance Company) พร้อม Permission Matrix สรุปรวมที่ทุกโมดูลต้องอ้างอิง — เป็นไฟล์ที่ไฟล์อื่นทั้งหมด (06, 09, 38, 40, 41, 10-37) อ้างถึงเมื่อพูดถึง role

**ไม่รวมอยู่ในไฟล์นี้**: รายละเอียด Permission เชิงลึกของแต่ละโมดูล (ดู `25-finance-permission-matrix.md` สำหรับ Finance/Accounting, §8 ของไฟล์ 38/40/41 สำหรับ Field Ops), Workflow การสร้าง/มอบหมาย user จริง (ดู `08-users.md`)

---

## 1. Summary

กำหนด Role ทั้งหมด 15 บทบาทของระบบ AssetRecovery แบ่งเป็น 4 Role Group ใน 3 กลุ่มหลัก (System, ทีมติดตามทรัพย์ Inhouse/Outsource, Finance Company) พร้อม Permission Matrix สรุปรวมที่ทุกโมดูลต้องอ้างอิง — เป็นไฟล์ที่ไฟล์อื่นทั้งหมด (06, 09, 38, 40, 41, 10-37) อ้างถึงเมื่อพูดถึง role

## 2. Purpose

เป็น single source of truth ของ Role/Permission — กันไม่ให้แต่ละไฟล์ตั้งชื่อ role/สิทธิ์ไม่ตรงกัน

## 3. In Scope

- รายชื่อ Role ทั้งหมด 15 ตัว พร้อมคำอธิบาย/scope
- Role Group ทั้ง 3 กลุ่ม (system, inhouse/outsource, finance_company)
- Permission Matrix สรุประดับ capability (รายละเอียดเชิงลึกของแต่ละโมดูลอยู่ที่ไฟล์ต้นทาง — ไฟล์นี้คือสรุปภาพรวม)

## 4. Out of Scope

- รายละเอียด Permission เชิงลึกของแต่ละโมดูล (ดูไฟล์ต้นทาง: 25 สำหรับ Finance/Accounting, §8 ของไฟล์ 38/40/41 สำหรับ Field Ops)
- Workflow การสร้าง/มอบหมาย user จริง (ไฟล์ 08)

## 5. Actors & Responsibilities — Role ทั้งหมด 15 ตัว แบ่งตาม Role Group (system 6 + inhouse 3 + outsource 3 + finance_company 3)

### 5.1 กลุ่ม System (ดูแลภาพรวมทั้งระบบ — ไม่ผูกทีม)

| Role | Responsibility | Scope | อ้างอิงไฟล์ |
|---|---|---|---|
| Superadmin | กำหนดค่าและเข้าถึงทุกส่วนของระบบ รวมภาษี/VAT/Permission Matrix | Global | 13, ทุกไฟล์ |
| เจ้าหน้าที่อนุมัติเคส (Case Approver) | พิจารณารับ/ไม่รับเคส (ไฟล์ 38), ยืนยัน/เปลี่ยนทีมที่ระบบเสนอ, อนุมัติคำขอ recycle, ตีกลับหลักฐานปิดงาน (`reject_evidence`) | Global — ทุกเคสในระบบ ไม่ผูกพื้นที่/ทีม | 38 §5, 41 §10.1 |
| บริหาร (Executive) | อนุมัติ policy, exception, lock/unlock รอบบัญชี, Adjustment ของรอบ locked, รายการเกินเพดาน | Organization | 13, 16, 20, 30, 34 |
| การเงิน (Finance) | ควบคุม Claim, Advance, Payout, Payee, Billing | Finance scope | 15-19 |
| บัญชี (Accounting) | ตรวจข้อมูลบัญชี, ส่งออก Accounting Pack, กระทบยอดธนาคาร, WHT | Accounting scope | 31-37 |
| ธุรการ (Admin) | บันทึกข้อมูลและแนบเอกสารตามสิทธิ์ที่ได้รับมอบหมาย | Assigned scope | 38 |

### 5.2 กลุ่ม Inhouse / Outsource (ทีมติดตามทรัพย์ — แยก role ต่อ Role Group)

| Role | Responsibility | Scope | อ้างอิงไฟล์ |
|---|---|---|---|
| ผู้จัดการทีมติดตามทรัพย์ (Manager) | กำกับทีม มอบหมาย/เปลี่ยนผู้รับผิดชอบเคส, อนุมัติขั้นต้นของค่าตอบแทนทีม | หลายทีม (ผ่าน `manager_ids` array) | 09 §7.1, 40, 16 |
| หัวหน้าทีมติดตามทรัพย์ (Supervisor) | กำกับทีมเดียว ตรวจงาน, เห็นเมนูมอบหมายงานเสมอ (read scope) | ทีมเดียว (ผ่าน `supervisor_id` เดี่ยว) | 09 §7.1, 40 §7.2 |
| พนักงานติดตามทรัพย์ (Field Agent) | รับงาน, จัดวันที่, ลงพื้นที่, ปิดงาน, เบิกค่าใช้จ่าย | เฉพาะเคสตนเอง | 41 |

> **กลุ่มนี้มี 2 Role Group แยกกัน** (`inhouse` และ `outsource`) — Role ทั้ง 3 ตัวข้างต้นมีอยู่ในทั้งสอง Role Group แยกกันคนละชุด (เช่น "ผู้จัดการทีมติดตามทรัพย์ (inhouse)" กับ "ผู้จัดการทีมติดตามทรัพย์ (outsource)" เป็นคนละ assignment กัน แม้ชื่อ role เหมือนกัน)

### 5.3 กลุ่ม Finance Company (ภายนอก — ผูกกับบริษัทไฟแนนซ์โดยตรง ไม่มี sub-team)

| Role | Responsibility | Scope | อ้างอิงไฟล์ |
|---|---|---|---|
| ผู้จัดการ (Company Manager) | เห็นข้อมูลทั้งหมดของบริษัทตัวเอง (ทุกเคส, ทุกยอดวางบิล, ทุก user ของบริษัท) | Company scope — เต็มรูป | 10, 19 |
| หัวหน้า (Company Supervisor) | เห็นเฉพาะส่วนที่ผู้จัดการของบริษัทมอบหมาย/จำกัดให้ | Company scope — ตามที่มอบหมาย | 10, 19 |
| แอดมิน (Company Admin) | เห็นเฉพาะงานที่ได้รับมอบหมายโดยตรง — สิทธิ์แคบสุดในกลุ่มนี้ | Company scope — แคบสุด | 10, 19 |

> **หมายเหตุสำคัญ — กันสับสนกับ role อื่นที่ชื่อซ้ำ**: "ผู้จัดการ"/"หัวหน้า"/"แอดมิน" ของกลุ่มนี้เป็น role คนละชุดกับกลุ่ม Inhouse/Outsource และ System แม้ชื่อจะคล้ายกัน เพราะอยู่คนละ Role Group (`finance_company`) — Company User **ไม่มี sub-team ภายในบริษัท** ผูกตรงกับบริษัทเดียว (1 บริษัท : หลาย user) ต่างกันแค่ "ระดับสิทธิ์เข้าถึงข้อมูล" ไม่ใช่ scope ตามพื้นที่/ทีมเหมือนกลุ่มอื่น

## 6. Core Concepts

| Concept | Meaning | Implementation Notes |
|---|---|---|
| Role Group | กลุ่ม role ที่กำหนด default permission ชุดเดียวกัน — มี 4 กลุ่ม: `system`, `inhouse`, `outsource`, `finance_company` | User 1 คนสังกัด Role Group เดียว |
| Role ชื่อซ้ำคนละกลุ่ม | "ผู้จัดการ"/"หัวหน้า" ปรากฏได้ในหลาย Role Group แต่เป็น role record แยกกันจริง ไม่ใช่ role เดียวที่ scope ต่างกัน | ห้าม implement เป็น role เดียวที่เช็ค Role Group แทน — ต้องสร้างเป็น role แยกจริงในฐานข้อมูล เพื่อให้ permission ผูกกับ role_id ได้ตรง |
| Global vs Team vs Company Scope | "เจ้าหน้าที่อนุมัติเคส" และ Superadmin เป็น Global เท่านั้นที่ไม่ผูก team_id/company_id — role อื่นทั้งหมดผูก scope ชัดเจน | — |

## 7. Data Entities / Required Objects

### 7.1 Role

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| name | string | yes | ชื่อ role ตาม §5 (เช่น "เจ้าหน้าที่อนุมัติเคส") |
| role_group | enum | yes | `system` / `inhouse` / `outsource` / `finance_company` |
| seed | boolean | yes | `true` = role พื้นฐานของระบบ ลบไม่ได้ (ทั้ง 15 role ใน §5 เป็น seed ทั้งหมด) |
| editable | boolean | yes | ปรับ permission ของ role นี้ได้หรือไม่ — seed role ส่วนใหญ่ editable = false (permission fix ตามสเปค) ยกเว้นกรณีที่ Superadmin ต้องการ custom เพิ่ม |

### 7.2 Permission

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| capability | string | yes | ชื่อความสามารถ (เช่น "reject_evidence", "approve_claim") |
| role_ids | array of uuid | yes | role ที่มีสิทธิ์นี้ |

### 7.3 Role Group

| Role Group | รายชื่อ Role |
|---|---|
| system | Superadmin, เจ้าหน้าที่อนุมัติเคส, บริหาร, การเงิน, บัญชี, ธุรการ |
| inhouse | ผู้จัดการทีมติดตามทรัพย์, หัวหน้าทีมติดตามทรัพย์, พนักงานติดตามทรัพย์ |
| outsource | ผู้จัดการทีมติดตามทรัพย์, หัวหน้าทีมติดตามทรัพย์, พนักงานติดตามทรัพย์ |
| finance_company | ผู้จัดการ, หัวหน้า, แอดมิน |

## 8. UI / UX Rules

- Tabs ในหน้า "ตั้งค่าทั่วไป > บทบาทและสิทธิ์": **3 tab หลัก — แอดมิน (System) / เจ้าหน้าที่ติดตามทรัพย์ / บริษัทไฟแนนซ์ (Finance Company)** — โดย tab "เจ้าหน้าที่ติดตามทรัพย์" **แบ่งย่อยภายในเป็น Inhouse/Outsource** อีกชั้น (ไม่ใช่ tab แยกเรียบระดับเดียวกัน 4 tab เพราะ inhouse/outsource เป็น sub-grouping ของกลุ่มเดียวกัน — ยืนยันกับ Product Owner แล้วเมื่อ 03/07/2569 ดู §17 Decisions) — ภายใน sub-grouping ต้องแยกให้ชัดว่าคนละ assignment แม้ role name เหมือนกัน (ดู §5.2)
- แต่ละ role แสดง: ชื่อ, Role Group, จำนวน user ที่มี role นี้ (`userCount`), badge "Seed" ถ้าเป็น seed role, ปุ่มแก้ไข permission (disabled ถ้า `editable = false`)
- Permission Matrix แสดงเป็น capability list จริงตาม action ในแต่ละโมดูล (ไม่ใช่ checkbox ทั่วไป 4 หมวดแบบเดิม) — กลุ่ม capability หลัก: Field Operations (38/40/41), Finance (15-19), Accounting (31-37), Settings (13)

## 9. Workflow / Lifecycle

`สร้าง role → assign permissions (เฉพาะ role ที่ editable=true) → assign user เข้า role → action ตรวจสิทธิ์จาก role_id`

Seed role (15 ตัวใน §5) ไม่ต้องสร้างใหม่ — มีอยู่แล้วเป็นค่าเริ่มต้นของระบบ ห้ามลบ

## 10. Security / Control Rules

- 1 user ต้องมี role อย่างน้อย 1 ตัวเสมอ
- Seed role (ทั้ง 15 ตัว) ลบไม่ได้ — แก้ชื่อไม่ได้ด้วย (กระทบทุกไฟล์ที่อ้างอิงชื่อ role)
- เปลี่ยน Permission ของ role ที่กระทบเงิน/ภาษี/สิทธิ์สำคัญต้อง audit เสมอ
- Superadmin ต้องคงสิทธิ์ manage permission เสมอ — ห้ามมีสถานะที่ไม่มี Superadmin คนใดเข้าถึงได้เลย

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| REQUIRED_MISSING | ข้อมูลบังคับไม่ครบ | inline error |
| SEED_ROLE_DELETE | พยายามลบ seed role | reject |
| SEED_ROLE_RENAME | พยายามเปลี่ยนชื่อ seed role | reject |
| PERMISSION_DENIED | ไม่มีสิทธิ์ทำ action | UI hide/disable และ API 403 |
| LAST_SUPERADMIN_REMOVAL | พยายามถอด Superadmin คนสุดท้ายออกจาก role นี้ | reject — ต้องมี Superadmin อย่างน้อย 1 คนเสมอ |

## 12. Permission Requirements (สรุปภาพรวม — รายละเอียดเชิงลึกดูไฟล์ต้นทาง)

| Capability | Allowed Roles | Notes |
|---|---|---|
| Manage roles/permissions | Superadmin | full |
| View roles | บริหาร, การเงิน, บัญชี | read-only |
| Assign role ให้ user | Superadmin, ธุรการ (ตามสิทธิ์ที่ได้รับมอบหมาย) | ตาม scope |
| รับ/ไม่รับเคส, reject_evidence | เจ้าหน้าที่อนุมัติเคส | ดูไฟล์ 38, 41 §10.1 |
| มอบหมาย/reassign เคส | ผู้จัดการทีมติดตามทรัพย์, หัวหน้าทีมติดตามทรัพย์ (ตาม Settings) | ดูไฟล์ 40 §7.2 |
| reject_expense / approve_expense | การเงิน (+ ผู้จัดการทีม ขั้นต้น) | ดูไฟล์ 16, 41 §10.1 |
| จัดการ Finance/Accounting modules | การเงิน, บัญชี, Executive (เฉพาะจุดเสี่ยงสูง) | ดูไฟล์ 25 สำหรับ matrix เต็ม |

## 13. Audit Log Requirements

- ทุก mutation บันทึก `actor_id`, `role`, `action`, `target_type`, `target_id`, `before`, `after`, `reason`, `created_at`
- การเปลี่ยน Permission ของ role ต้อง audit เสมอ พร้อมเหตุผล
- Audit log ห้ามแก้ไขย้อนหลัง

## 14. API / Integration Draft

| Method | Endpoint | Purpose | Notes |
|---|---|---|---|
| GET | /api/roles | list ทั้ง 15 role พร้อม role_group | — |
| GET | /api/roles/:id/permissions | ดู permission ของ role นั้น | — |
| PATCH | /api/roles/:id/permissions | แก้ permission (เฉพาะ editable=true) | audit required |
| GET | /api/permissions | list capability ทั้งหมดในระบบ | — |

## 15. Acceptance Criteria

- Role ทั้ง 15 ตัวตรงกับ §5 ครบถ้วน ไม่มีชื่อซ้ำข้าม Role Group ที่ทำให้สับสน (เจ้าหน้าที่อนุมัติเคส ≠ ผู้จัดการทีมติดตามทรัพย์)
- Seed role ลบ/เปลี่ยนชื่อไม่ได้จริง
- ต้องมี Superadmin อย่างน้อย 1 คนในระบบเสมอ
- Permission Matrix ใน UI ตรงกับ capability จริงของแต่ละโมดูล ไม่ใช่ placeholder ทั่วไป

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| ลบ seed role | พยายามลบ "เจ้าหน้าที่อนุมัติเคส" | reject SEED_ROLE_DELETE |
| เปลี่ยนชื่อ seed role | พยายามเปลี่ยนชื่อ "ผู้จัดการทีมติดตามทรัพย์" | reject SEED_ROLE_RENAME |
| ถอด Superadmin คนสุดท้าย | มี Superadmin 1 คน พยายามถอด role ออก | reject LAST_SUPERADMIN_REMOVAL |
| Permission ไม่มีสิทธิ์ | User role "พนักงานติดตามทรัพย์" พยายามเข้าหน้า "รับเคส" (ไฟล์ 38) | ไม่เห็นเมนู + API reject 403 |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Role ทั้งหมด 15 ตัว แบ่ง 4 Role Group** (`system`=6, `inhouse`=3, `outsource`=3, `finance_company`=3 — รวม 15) — เป็น seed data ตั้งแต่ deploy ลบ/เปลี่ยนชื่อไม่ได้ (§5, §10)
- **Role ชื่อซ้ำข้าม Role Group ต้องเป็น record แยกกันจริงในฐานข้อมูล** ห้าม implement เป็น role เดียวเช็ค Role Group แทน (§6) — เพื่อให้ permission ผูกกับ `role_id` ได้ตรง
- **"เจ้าหน้าที่อนุมัติเคส" และ Superadmin เท่านั้นที่เป็น Global scope** ไม่ผูก team_id/company_id — role อื่นทั้งหมดผูก scope ชัดเจน (§6)
- **ต้องมี Superadmin อย่างน้อย 1 คนในระบบเสมอ** — ป้องกัน lockout (§10, §11 LAST_SUPERADMIN_REMOVAL)
- **โครงสร้าง Tab หน้าจัดการ Role/User: 3 tab หลัก** (แอดมิน / เจ้าหน้าที่ติดตามทรัพย์ / บริษัทไฟแนนซ์) **โดย tab "เจ้าหน้าที่ติดตามทรัพย์" แบ่งย่อยเป็น Inhouse/Outsource ภายใน** — ยืนยันกับ Product Owner แล้ว (03/07/2569) แก้จากที่เขียนผิดไว้ก่อนหน้าว่าเป็น 4 tab แยกเรียบ (§8)
- **Finance Company role (ผู้จัดการ/หัวหน้า/แอดมิน) ไม่มี sub-team ภายในบริษัท** ต่างจาก Inhouse/Outsource — แยกกันด้วยระดับสิทธิ์เข้าถึงข้อมูล ไม่ใช่ scope ตามพื้นที่ (§5.3)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — เขียนใหม่ทั้งหมดให้สอดคล้องกับ Role ที่ยืนยันแล้วในทุกไฟล์ (06, 09, 38, 40, 41, 25)

---

*เอกสารนี้เป็นไฟล์แรกในหมวด Settings Module (07–13) ต่อด้วย `08-users.md`*
