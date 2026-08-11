# 04-ui-ux-design-system.md

# 04 — UI/UX Design System
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — แก้ไข Datetime conflict)
> Document Level: Foundation / Platform Build Spec
> Applies To: All implementation sprints
> เอกสารอ้างอิง: `00-project-overview.md`, `03-non-functional-requirements.md` §6.5, `06-menu-and-navigation-map.md`, `94-decision-log.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — Design system: สี ปุ่ม ตาราง Modal Badge |
| v2 | 03/07/2569 | **แก้ไข Conflict**: ข้อ 8 เดิมระบุมาตรฐานวันที่เป็น "ค.ศ. เสมอ ห้ามใช้ พ.ศ." ซึ่ง**ขัดแย้งโดยตรง**กับ `03-non-functional-requirements.md` §6.5 และ README ที่กำหนดว่า UI ต้องใช้ **พ.ศ. เท่านั้น** — ยืนยันกับ Product Owner แล้วว่า **พ.ศ. คือมาตรฐานที่ถูกต้อง** จึงแก้ข้อ 8 ให้ตรงกัน (ดู §17 Decisions) — Reformat header ตามมาตรฐานเอกสารชุดใหม่ด้วยในคราวเดียวกัน |
| v3 | 03/07/2569 | เพิ่ม **§8.1 Design Token Reference** — สกัด font, status badge color map, component class จริงจาก mockup HTML (`finance.html` เป็นหลัก ตรวจสอบข้าม `accounting.html`/`warehouse.html`/`settings.html` แล้ว) พบและบันทึกความไม่สอดคล้องเล็กน้อยเรื่อง body background color (ดู Open Items ข้อ 18) |

ขอบเขตเอกสารนี้: มาตรฐาน UI/UX ที่ต้องใช้ทุกหน้าจอให้ตรงกับ HTML Mockup — สี ปุ่ม ตาราง Modal Badge และ Interaction

**ไม่รวมอยู่ในไฟล์นี้**: Datetime Standard เต็มรูปแบบ (storage/API/utility function — ดู `03-non-functional-requirements.md` §6.5 ซึ่งเป็น source of truth), เมนู/navigation จริง (ดู `06-menu-and-navigation-map.md`)

---

## 1. Summary

มาตรฐาน UI/UX ที่ต้องใช้ทุกหน้าจอให้ตรงกับ HTML เช่น สี ปุ่ม ตาราง Modal Badge และ Interaction

## 2. Purpose

มาตรฐาน UI/UX ที่ต้องใช้ทุกหน้าจอให้ตรงกับ HTML เช่น สี ปุ่ม ตาราง Modal Badge และ Interaction

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
| Component | UI building block | Button, Table, Modal, Badge, Form |
| Status Badge | แสดงสถานะ | color_map, status_text |
| Layout | โครงหน้า | top_nav, tabs, content_card |

## 8. UI / UX Rules

- ใช้ slate/emerald theme ตาม HTML
- Status badge: green=success, amber=pending, red=critical, blue=sent/ready
- Table header bg-slate-50
- Modal centered with backdrop
- ปุ่ม action ใช้ขนาดเล็กใน row
- **มาตรฐานวันที่/เวลา (บังคับใช้ทุกหน้าจอ ทุกโมดูล — แก้ไขให้ตรงกับ `03-non-functional-requirements.md` §6.5)**: แสดงผลด้วย format `DD/MM/YYYY HH:mm` **ปฏิทินพุทธศักราช (พ.ศ. = ค.ศ. + 543)** เสมอ เช่น `23/06/2569 09:14` — ห้ามผสม format อื่น (เช่น ค.ศ., MM/DD/YYYY แบบสหรัฐ, หรือ ISO 8601 ดิบ) ในหน้าจอที่ผู้ใช้เห็น ยกเว้น `<input type="date">` ที่ browser บังคับใช้ ISO format (ค.ศ.) ตามข้อจำกัดของ HTML มาตรฐาน
  - ทุกจุดที่มีการ "ส่งงาน/รับงาน/มอบหมาย/รับเคส/เปลี่ยนสถานะ" ต้องบันทึกและแสดงวันเวลาของ action นั้นกำกับไว้เสมอ ไม่ใช่แค่ใน audit log ที่ต้องเปิดดูแยก แต่ควรเห็นได้จากหน้าจอหลัก (list/table) ด้วย เพื่อให้ผู้ใช้ตรวจสอบความคืบหน้าได้ทันทีโดยไม่ต้องเปิด modal เพิ่ม
  - ข้อมูลใน database เก็บเป็น UTC timestamptz ตามมาตรฐานเดิม (`02-database-schema-design.md` §2.3) — การแปลงเป็น `DD/MM/YYYY HH:mm` พ.ศ. ทำที่ชั้น UI ตาม timezone ของผู้ใช้/องค์กร (Asia/Bangkok) ด้วย utility function มาตรฐานใน `03-non-functional-requirements.md` §6.5

### 8.1 Design Token Reference (สกัดจริงจาก Mockup HTML — ไม่ใช่ค่าที่กำหนดขึ้นใหม่)

> ตารางนี้เป็น **reference สำหรับ dev อ่านเร็ว** ไม่ใช่ source of truth — ถ้า mockup HTML เปลี่ยน ต้องอัปเดตตารางนี้ตาม ไม่ใช่กลับกัน (ตามหลักการ README ว่า `.html` คือ source of truth ด้าน UI)

#### Font

| รายการ | ค่าจริง |
|---|---|
| Font หลัก (ภาษาอังกฤษ/ตัวเลข) | `Inter` (weight 400/500/600/700, บางหน้า 800) |
| Font ภาษาไทย | `Noto Sans Thai` (weight 400/500/600/700) |
| Fallback | `sans-serif` |
| Font สำหรับเลขอ้างอิง/รหัส (case ref, tax id, เลขบัญชี) | `font-mono` (ใช้ class Tailwind ปกติ ไม่ใช่ font แยก) |
| Google Fonts import | `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap` |
| CSS ที่ body | `font-family: 'Inter', 'Noto Sans Thai', sans-serif;` |

> ⚠️ พบว่า `background-color` ที่ body ไม่ตรงกันทุกไฟล์: `finance.html`/`warehouse.html` ใช้ `#f8fafc` (slate-50) แต่ `accounting.html`/`settings.html` ใช้ `#f1f5f9` (slate-100) — เป็นความไม่สอดคล้องเล็กน้อยที่ยังไม่แก้ (ดู Open Items ข้อ 18)

#### Status Badge Color Map (สกัดจากฟังก์ชัน `statusBadge()` จริงใน mockup)

| กลุ่มความหมาย | Class | สถานะที่ใช้ (ตัวอย่าง) |
|---|---|---|
| สำเร็จ/อนุมัติ/ปิดงาน (เขียว) | `bg-emerald-100 text-emerald-800` | completed, locked, matched, verified, paid, closed, approved, active, accepted |
| ส่งแล้ว/รอดำเนินการขั้นถัดไป (น้ำเงิน) | `bg-blue-100 text-blue-800` | sent, ready_for_billing, billed, file_generated, exported |
| ชำระบางส่วน/ตอบแล้ว (ฟ้าอมเขียว) | `bg-cyan-100 text-cyan-800` | partially_paid, answered |
| รออนุมัติ/กำลังรวบรวม (เหลือง) | `bg-amber-100 text-amber-800` | checking, collecting, pending, pending_approval |
| เคลียร์แล้ว/รอคลังยืนยัน (ม่วง) | `bg-purple-100 text-purple-800` | cleared, pending_warehouse_confirm |
| ร่าง/ยังไม่ export (เทา) | `bg-slate-100 text-slate-700` | draft, in_progress, not_exported |
| ปัญหา/ปฏิเสธ/ระงับ (แดง) | `bg-red-100 text-red-800` | critical, open, unmatched, suspended, deactivated, rejected, unverified |
| ต้องแก้ไข/คำเตือน (ส้ม) | `bg-orange-100 text-orange-800` | needs_revision, warning |
| ถูกแทนที่ (เทาเข้ม) | `bg-slate-200 text-slate-500` | superseded |
| ข้อมูลทั่วไป (ฟ้าอ่อน) | `bg-blue-50 text-blue-600` | info |

> หมายเหตุ: mapping นี้**ละเอียดกว่า**คำอธิบายเดิมในข้อ 8 ("green=success, amber=pending, red=critical, blue=sent/ready") ซึ่งเป็นแค่หลักการกว้างๆ — ตารางนี้คือค่าที่ implement จริงในโค้ด ให้ยึดตารางนี้เป็นหลักตอนเขียน component จริง

#### Component Class Reference

| Component | Class จริง |
|---|---|
| Card/Panel | `bg-white rounded-xl border border-slate-200 shadow-sm p-6` |
| Table container | `border border-slate-200 rounded-lg overflow-hidden bg-white` |
| Table header row | `bg-slate-50 text-xs text-slate-600 border-b border-slate-200` |
| Table row hover | `hover:bg-slate-50` |
| Table cell (ตัวเลข/เงิน) | `px-4 py-3 text-right whitespace-nowrap` |
| Table divider | `divide-y divide-slate-100` |
| Input field | `w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus-ring` |
| Label ฟอร์ม | `block text-xs font-bold text-slate-700 mb-1` |
| ปุ่ม Primary (ดำ) | `bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-800 focus-ring` |
| ปุ่ม Success/ยืนยัน (เขียว) | `bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors` |
| ปุ่ม Info action (น้ำเงิน) | `text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100` |



- Page → Header → Tabs/Filters → Table/KPI → Modal → Toast
- ทุกหน้าต้องมี loading/empty/error state

## 10. Security / Control Rules

- ห้ามใช้สีสุ่มนอกระบบ
- คำบนปุ่มต้องตรงกับ action
- Modal destructive ต้อง confirm

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
| Use UI components | All dev | must follow |
| Approve design change | Owner/บริหาร | decision log |

## 13. Audit Log Requirements

- ทุก mutation ต้องบันทึก `actor_id`, `role`, `action`, `target_type`, `target_id`, `before`, `after`, `reason`, `created_at`
- ข้อมูลที่กระทบเงิน สิทธิ์ ธนาคาร ภาษี หรือการ lock period ต้องบันทึก reason เสมอ
- Audit log ห้ามแก้ไขย้อนหลัง
- รายการ export/import/background job ต้อง trace กลับไปผู้สั่งงานได้

## 14. API / Integration Draft

| Method | Endpoint / Event | Purpose | Notes |
|---|---|---|---|
| GET | /api/system/ui-config | list/detail | ตาม permission |
| POST | /api/system/ui-config | create/update | audit required |
| EVENT | ui-config.updated | module updated | notification/audit |

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
| **Datetime display** (ใหม่) | เปิดหน้าจอใดก็ได้ที่มีวันที่ | ต้องแสดงเป็น พ.ศ. เสมอ (เช่น 2569) ห้ามเห็นปีแบบ ค.ศ. (เช่น 2026) ยกเว้นใน `<input type="date">` |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **🔧 แก้ไข Conflict ระหว่างเอกสาร (03/07/2569)**: ข้อ 8 เดิมของไฟล์นี้ระบุ "ค.ศ. เสมอ ห้ามใช้ พ.ศ." ซึ่งขัดกับ `03-non-functional-requirements.md` §6.5 ที่ระบุ "พ.ศ. เท่านั้น ห้ามแสดง ค.ศ." — **Product Owner ยืนยันแล้วว่า พ.ศ. คือมาตรฐานที่ถูกต้อง** ทุกไฟล์ในชุดเอกสารต้องใช้ พ.ศ. เป็นมาตรฐานเดียวกันทั้งหมด ไม่มีข้อยกเว้น
- **Component/Badge/Modal ต้องยึด HTML Mockup เป็น reference หลัก** — ห้ามออกแบบ UI ใหม่นอกเหนือจาก pattern ที่เห็นใน mockup โดยไม่ปรับ mockup คู่กัน (สอดคล้องกับหลักการใน `01-architecture.md`)
- **Datetime แสดงผลต้องมาพร้อม action ที่หน้าจอหลักเสมอ** ไม่ใช่ซ่อนไว้แค่ใน audit log — ผู้ใช้ต้องเห็นความคืบหน้าได้ทันทีจาก list/table (ข้อ 8)
- **Font มาตรฐานทั้งระบบ**: Inter (อังกฤษ/ตัวเลข) + Noto Sans Thai (ไทย), fallback sans-serif — ใช้ `font-mono` เฉพาะเลขอ้างอิง/รหัส/เลขบัญชี (ข้อ 8.1)
- **Status Badge Color Map มีมาตรฐานตายตัว 10 กลุ่มความหมาย** (เขียว/น้ำเงิน/ฟ้าอมเขียว/เหลือง/ม่วง/เทา/แดง/ส้ม/เทาเข้ม/ฟ้าอ่อน) ตามที่ implement จริงในโค้ด — ต้องยึดตารางในข้อ 8.1 เป็นหลัก ไม่ใช่คำอธิบายกว้างๆ เดิม
- **Permission check ต้องสอดคล้องกับ `01-architecture.md` §6.1** — UI hide/disable ไม่ใช่ security จริง (ข้อ 11, 12)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- [ ] **ตรวจ mockup HTML ทั้ง 8 ไฟล์ที่มีอยู่แล้วว่ามีจุดไหนแสดง ค.ศ. หลงเหลืออยู่หรือไม่** (เช่น `finance.html`, `accounting.html`, `warehouse.html` ฯลฯ) — เพราะไฟล์นี้เพิ่งแก้จาก ค.ศ. เป็น พ.ศ. เป็นไปได้ว่า mockup บางไฟล์อาจ implement ตามข้อ 8 เวอร์ชันเก่าไปแล้ว ต้องไล่ตรวจและแก้ให้ตรงกัน (**รอทำหลังจบ Batch 1 ตามที่ตกลงกัน**)
- [ ] **Body background color ไม่ตรงกันระหว่าง mockup**: `finance.html`/`warehouse.html` ใช้ `#f8fafc` แต่ `accounting.html`/`settings.html` ใช้ `#f1f5f9` — ต้องตัดสินใจว่าจะรวมเป็นค่าเดียว หรือปล่อยไว้ตามเดิม (พบระหว่างทำ §8.1 Design Token Reference)
- [ ] ยืนยันรายละเอียดเมื่อเริ่ม sprint เฉพาะ module (Open Item เดิม)

---

*เอกสารนี้เป็นไฟล์ที่ 5 ในหมวด Foundation & Platform ต่อจาก `03-non-functional-requirements.md` และก่อน `05-auth-and-access-control.md`*
