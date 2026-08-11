# 03-non-functional-requirements.md

# 03 — Non-Functional Requirements
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Foundation / Platform Build Spec
> Applies To: All implementation sprints
> เอกสารอ้างอิง: `00-project-overview.md`, `01-architecture.md`, `02-database-schema-design.md`, `94-decision-log.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — Quality standards + Datetime Standard (§6.5) |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ (header block, Decisions/Open Items แยกชัดเจน) — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเพิ่มตัวเลข Performance/Backup ที่ไม่เคยตกลงกันไว้** (ดูข้อ 18 Open Items) |
| v3 | 03/07/2569 | Product Owner ยืนยัน **RPO/RTO = 24 ชม./24 ชม.** หลังเทียบต้นทุน Supabase PITR add-on จริง ($100/เดือน) เทียบกับ daily backup ที่มากับ Pro plan — เลือกใช้ daily backup (ไม่มีค่าใช้จ่ายเพิ่ม) ย้ายจาก Open Item เป็น Decision (§17) |

ขอบเขตเอกสารนี้: ข้อกำหนดคุณภาพระบบระดับ Foundation — Performance, Security, Backup, Reliability, Observability, Data Retention และ **Datetime Standard (§6.5) ที่บังคับใช้ทุก module ในระบบ**

**ไม่รวมอยู่ในไฟล์นี้**: Business flow เฉพาะหน้าจอในกลุ่ม A, Workflow ติดตามทรัพย์ final (ดูไฟล์ 38, 40, 41), ตัวเลข SLA ที่ยังไม่ตกลง (ดู Open Items ข้อ 18)

---

## 1. Summary

ข้อกำหนดคุณภาพระบบ เช่น Performance, Security, Backup, Reliability, Observability และ Data Retention

## 2. Purpose

ข้อกำหนดคุณภาพระบบ เช่น Performance, Security, Backup, Reliability, Observability และ Data Retention

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

### 6.5 Datetime Standard (ใช้ทั้งระบบ — บังคับทุก module)

> กฎนี้มีผลบังคับทุกโมดูล ทุกภาษา ทุก environment — ห้ามยกเว้นโดยไม่มีการตัดสินใจอย่างเป็นทางการ (ดู `94-decision-log.md`)

#### Timezone

- **Storage (Database):** เก็บ timestamp ทุกตัวเป็น **UTC** เสมอ (PostgreSQL `TIMESTAMPTZ`)
- **Display (UI/Export):** แปลงเป็น **Asia/Bangkok (UTC+7)** ก่อนแสดงผลทุกครั้ง ห้าม display UTC โดยตรง
- **API Response:** ส่งออกเป็น ISO 8601 UTC (`2025-06-02T07:30:00Z`) แล้วให้ Frontend แปลงเป็น BKK

#### Calendar

- **UI ทุกหน้า:** ใช้ **พุทธศักราช (พ.ศ.)** เท่านั้น — ปี ค.ศ. + 543
- **Database / API:** ใช้ ค.ศ. (Gregorian) เพื่อ compatibility กับ library/standard สากล
- **ห้ามแสดง ค.ศ. ในหน้าจอ** ยกเว้น `<input type="date">` ที่ browser บังคับใช้ ISO format

#### Display Format

| ประเภท | Format | ตัวอย่าง |
|---|---|---|
| วันที่อย่างเดียว | `DD/MM/YYYY` | `02/07/2569` |
| วันที่และเวลา | `DD/MM/YYYY HH:mm` | `02/07/2569 14:30` |
| HTML input[type=date] | `YYYY-MM-DD` (ISO — บังคับโดย browser) | `2026-07-02` |
| Separator | `/` เสมอ | ห้ามใช้ `-` หรือ `.` ใน display |

#### Implementation Reference (HTML Mockups)

```javascript
// utility functions มาตรฐาน — ใช้ในทุกไฟล์ HTML
const TZ = 'Asia/Bangkok';
function toBKK(d = new Date()) {
  return new Date(d.toLocaleString('en-US', { timeZone: TZ }));
}
function fmtDate(d = new Date()) {
  const b = toBKK(d instanceof Date ? d : new Date(d));
  return `${String(b.getDate()).padStart(2,'0')}/${String(b.getMonth()+1).padStart(2,'0')}/${b.getFullYear()+543}`;
}
function fmtDateTime(d = new Date()) {
  const b = toBKK(d instanceof Date ? d : new Date(d));
  return `${String(b.getDate()).padStart(2,'0')}/${String(b.getMonth()+1).padStart(2,'0')}/${b.getFullYear()+543} ${String(b.getHours()).padStart(2,'0')}:${String(b.getMinutes()).padStart(2,'0')}`;
}
```

#### Validation Rules

| Code | Condition | Behavior |
|---|---|---|
| `INVALID_TIMEZONE` | timestamp ไม่มี timezone info | reject — บังคับระบุ timezone |
| `DISPLAY_CE_YEAR` | UI แสดงปี ค.ศ. (2025/2026) | ถือว่า bug — ต้องแปลงเป็น พ.ศ. |
| `WRONG_FORMAT` | format ไม่ตรง DD/MM/YYYY | inline error ใน form validation |

## 7. Data Entities / Required Objects

| Entity / Object | Purpose | Required Key Fields |
|---|---|---|
| Performance Budget | มาตรฐานความเร็ว | page_load, api_response, export_job |
| Backup Policy | สำรองข้อมูล | rpo, rto, retention |
| Monitoring | ติดตามระบบ | logs, metrics, alerts |

> **หมายเหตุ**: entity นี้ระบุ "field ที่ต้องมี" เท่านั้น — ยังไม่มีตัวเลข Performance Budget จริง (เช่น page_load เป้าหมายกี่วินาที) เพราะยังไม่ได้ตัดสินใจร่วมกัน (ดู Open Items ข้อ 18) ส่วน RPO/RTO ตัดสินใจแล้ว = 24 ชม./24 ชม. (ดู §17 Decisions)

## 8. UI / UX Rules

- ทุกหน้าโหลดเร็ว
- Export ใหญ่ใช้ background job
- แสดง error ที่คนเข้าใจได้
- ระบบต้องรองรับ retry

## 9. Workflow / Lifecycle

- ทุก request ต้อง validate
- job fail ต้อง retry
- backup/restore ต้องทดสอบเป็นรอบ

## 10. Security / Control Rules

- Sensitive data ต้องจำกัดสิทธิ์
- Export ต้องมี audit
- ไฟล์หลักฐานต้องไม่หาย
- ระบบต้องรองรับข้อมูลโตขึ้น

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
| View system health | Superadmin/บริหาร | read |
| Manage retention/backup | Superadmin | admin only |

## 13. Audit Log Requirements

- ทุก mutation ต้องบันทึก `actor_id`, `role`, `action`, `target_type`, `target_id`, `before`, `after`, `reason`, `created_at`
- ข้อมูลที่กระทบเงิน สิทธิ์ ธนาคาร ภาษี หรือการ lock period ต้องบันทึก reason เสมอ
- Audit log ห้ามแก้ไขย้อนหลัง
- รายการ export/import/background job ต้อง trace กลับไปผู้สั่งงานได้

## 14. API / Integration Draft

| Method | Endpoint / Event | Purpose | Notes |
|---|---|---|---|
| GET | /api/system/health | list/detail | ตาม permission |
| POST | /api/system/settings | create/update | audit required |
| EVENT | system.settings.updated | module updated | notification/audit |

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

- **Datetime Standard (§6.5) เป็นกฎบังคับทั้งระบบ ไม่มีข้อยกเว้น**: Storage = UTC เสมอ, Display = Asia/Bangkok + พ.ศ. เสมอ, API = ISO 8601 UTC — ไฟล์ทุกไฟล์ที่เกี่ยวกับวันที่ต้องอ้างอิงข้อนี้ (README §Datetime Standard ก็ดึงมาจากที่นี่)
- **ห้ามแสดงปี ค.ศ. ในหน้าจอเด็ดขาด** ยกเว้น `<input type="date">` ที่ browser บังคับ ISO format (ข้อ 6.5)
- **Permission check ต้องสอดคล้องกับ `01-architecture.md` §6.1** — UI hide/disable ไม่ใช่ security จริง ต้อง reject ที่ API เสมอ (ข้อ 11, 12)
- **Audit log fields มาตรฐานเดียวกันทั้งระบบ**: actor_id, role, action, target_type, target_id, before, after, reason, created_at (ข้อ 13) — ใช้ร่วมกับ `90-platform-audit-notification-reporting.md`
- **RPO/RTO = 24 ชั่วโมง / 24 ชั่วโมง** — ยืนยันกับ Product Owner 03/07/2569 หลังเทียบต้นทุนจริง: ใช้ daily automated backup ที่มากับ Supabase Pro plan อยู่แล้ว (**ไม่ต้องเปิด PITR add-on ที่ราคา $100/เดือน**) — ถ้าต้องการ RPO ต่ำกว่านี้ในอนาคตต้องเปิด PITR เพิ่มและมีค่าใช้จ่ายเพิ่ม

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- [ ] **ตัวเลข Performance Budget จริง** — page_load เป้าหมายกี่วินาที, api_response กี่ ms, export_job ใหญ่สุดกี่นาทีถึงจะยอมรับได้ — ยังไม่เคยตกลงกัน **ไม่ได้ใส่ตัวเลขเดามาให้เพราะไม่มีระบุในเอกสารต้นฉบับ** ต้องยืนยันกับ Product Owner ก่อน implement
- [ ] **Data Retention period ที่ไม่ใช่ audit log** — เอกสารนี้ยังไม่ระบุว่าข้อมูล operation ทั่วไป (เช่น case ที่ปิดแล้ว) เก็บนานเท่าไหร่ ต่างจาก audit log ที่มี retention policy ชัดแล้วใน `90-platform-audit-notification-reporting.md`
- [ ] ยืนยันรายละเอียดเมื่อเริ่ม sprint เฉพาะ module (Open Item เดิม)

---

*เอกสารนี้เป็นไฟล์ที่ 4 ในหมวด Foundation & Platform ต่อจาก `02-database-schema-design.md` และก่อน `04-ui-ux-design-system.md`*
