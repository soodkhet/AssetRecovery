# 92-platform-data-model.md

# 92 — Platform Data Model (High-level Overview)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Foundation / Platform Build Spec
> Applies To: All implementation sprints
> เอกสารอ้างอิง: `02-database-schema-design.md` (Full Schema), `95-diagrams.md` §2 (ER Diagram เต็มรูปแบบ), `26-finance-data-model.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — Entity overview ระดับสูง |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ — เพิ่ม Relationship Summary + Snapshot Pattern table (สกัดจากข้อมูลจริงใน `02-database-schema-design.md`) ทำให้ไฟล์นี้เป็น **index กลาง** อย่างสมบูรณ์ — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |

ขอบเขตเอกสารนี้: ภาพรวมความสัมพันธ์ข้อมูลระดับสูง**ก่อน**ลง Database Schema รายตาราง — ใช้เป็น index กลางสำหรับทีม Dev อ่านเร็วก่อนเปิด schema เต็ม

**ไม่รวมอยู่ในไฟล์นี้ (สำคัญ — ป้องกัน desync)**: **field เต็มของแต่ละ entity ไม่ duplicate ที่นี่** อยู่ใน `02-database-schema-design.md` เท่านั้น, **ER Diagram แบบ Mermaid เต็มรูปแบบ** อยู่ใน `95-diagrams.md` §2 เท่านั้น — ไฟล์นี้เป็นแค่ index/summary

---

## 1. Summary

ภาพรวมความสัมพันธ์ข้อมูลระดับสูงก่อนลง Database Schema รายตาราง

## 2. Purpose

ภาพรวมความสัมพันธ์ข้อมูลระดับสูงก่อนลง Database Schema รายตาราง

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

### 6.1 Relationship Summary (ภาพรวมความสัมพันธ์หลัก)

```
organizations 1───* finance_companies
finance_companies 1───* cases
finance_companies 1───1 (active) service_fee_templates
teams 1───* users (inhouse/outsource)
teams 1───1 compensation_plans
cases *───1 finance_companies
cases 1───* case_assignments
case_assignments *───1 teams / users (agent)
case_assignments 1───* check_ins
cases 1───(closed_success)──> assets → handover_lots
cases 1───(close)──> expenses (compensation ฝั่งเจ้าหน้าที่)
cases 1───(close)──> revenues (รายได้ฝั่งไฟแนนซ์)
expenses *───1 payout_batch_items *───1 payout_batches
revenues *───1 billing_batches
handover_lots (confirmed) ──trigger──> unlock expenses + create revenues (1 transaction)
billing_batches ──> sales_records ──> tax_invoices
payout_batch_items ──> expense_records ──> wht_certificates
```

หลักการสำคัญ: **Case close (`closed_success`) คือจุดเริ่มต้นที่นำไปสู่ generate `expenses` (compensation) และรอ HandoverLot confirmed ก่อนถึงจะ unlock + generate `revenues`** (ดู `44-asset-custody-handover.md` §11) — ไม่ใช่ event เดียวกันเป๊ะเหมือน v1.md เดิม (ที่ generate พร้อมกันตอน close) เพราะระบบเรามี **Warehouse gate** คั่นกลางระหว่าง case close กับ revenue เกิด — เป็นความแตกต่างสำคัญของ AssetRecovery เทียบกับระบบติดตามทรัพย์ทั่วไป

> ดู ER Diagram แบบ Mermaid เต็มรูปแบบ (ทุก entity ทุก FK) ที่ `95-diagrams.md` §2

## 7. Data Entities / Required Objects

| Entity / Object | Purpose | Required Key Fields | อยู่ในไฟล์ |
|---|---|---|---|
| User/Role | Identity | users, roles, permissions | `07-roles-permissions.md`, `08-users.md` |
| Master | ตั้งค่า | teams, companies, templates | `09-teams.md`, `10-finance-companies.md`, `11-compensation.md`, `12-service-fee.md` |
| Case | งานติดตาม | cases, assignments, outcomes | `38-case-submission.md`, `40-case-assignment-routing.md`, `41-field-tracker-mobile.md` |
| Warehouse | คลังสินค้า | assets, handover_lots | `44-asset-custody-handover.md` |
| Finance | การเงิน | claims, payouts, revenues, billings | ไฟล์ 15-21 |
| Accounting | ส่งบัญชี | periods, exports, exceptions | ไฟล์ 30-37 |
| Platform | ระบบกลาง | audit_logs, jobs, files | `90-platform-audit-notification-reporting.md`, `91-platform-api-integration-jobs.md` |

### 7.1 Snapshot Pattern (ใช้ร่วมกันทุก entity ทางการเงิน)

**หลักการ**: **Snapshot เมื่อเกิด — ห้ามใช้ live template/rule คำนวณย้อนหลัง** ถ้า template เปลี่ยนในอนาคต (เช่น แก้อัตราค่าน้ำมัน) ข้อมูลที่คำนวณไปแล้วในอดีตต้อง**ไม่เปลี่ยนตามไปด้วย** — หลักการพื้นฐานที่สุดของระบบการเงินทั้งหมด (ตาม `03-non-functional-requirements.md` §10)

| Table | Snapshot field สำคัญ |
|---|---|
| `expenses` | `comp_plan_id`, `comp_plan_version` (snapshot ของ compensation plan ณ เวลาเกิด) |
| `revenues` | `fee_model_snapshot`, `vat_rate_pct_used` (snapshot ของ service fee model + VAT rate ณ เวลาเกิด) |
| `payout_batch_items` | `tax_profile_id`, `wht_pct_snapshot` (snapshot ของ WHT rate ณ เวลาสร้าง batch) |
| `cases` (ตอน approved) | `service_fee_template_id`, `service_fee_model_snapshot`, `service_fee_rate_pct` ฯลฯ (snapshot ตอนอนุมัติเคส ไม่ใช่ตอนสร้าง) |

## 8. UI / UX Rules

- ใช้ diagram/summary table
- ไม่ใช่ final schema
- อ้างอิง 02 เมื่อทำ DB จริง

## 9. Workflow / Lifecycle

- Master data → Case → Finance → Accounting → Platform logs

## 10. Security / Control Rules

- ทุก entity สำคัญต้องมี source/ref
- Relationship ต้อง trace ได้
- ห้ามใช้ data model แทน schema final

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
| View model | All internal roles | read |
| Update model | Owner/Developer | decision log |

## 13. Audit Log Requirements

- ทุก mutation ต้องบันทึก `actor_id`, `role`, `action`, `target_type`, `target_id`, `before`, `after`, `reason`, `created_at`
- ข้อมูลที่กระทบเงิน สิทธิ์ ธนาคาร ภาษี หรือการ lock period ต้องบันทึก reason เสมอ
- Audit log ห้ามแก้ไขย้อนหลัง
- รายการ export/import/background job ต้อง trace กลับไปผู้สั่งงานได้

## 14. API / Integration Draft

> ไฟล์นี้เป็น data model overview ไม่มี API เฉพาะของตัวเอง — API จริงอยู่ในไฟล์ endpoint ของแต่ละ module (`27-finance-api-contracts.md`, `45-case-warehouse-api-contracts.md`)

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
| Snapshot integrity | แก้ compensation_plan หลังมี expense อ้างอิงแล้ว | expense เดิมต้องไม่เปลี่ยนค่าตาม plan ใหม่ |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **เอกสารนี้เป็น index รวม ไม่ duplicate field detail** — field เต็มอยู่ที่ `02-database-schema-design.md` เท่านั้น, ER Diagram เต็มอยู่ที่ `95-diagrams.md` §2 เท่านั้น (ป้องกันข้อมูลสองชุดที่อาจ desync กัน)
- **Warehouse เป็น gate คั่นกลางระหว่าง Case close กับ Revenue เกิด** — ต่างจากรูปแบบทั่วไปที่ generate compensation+revenue พร้อมกันตอน case close (§6.1) — เป็นจุดออกแบบเฉพาะของ AssetRecovery
- **Snapshot pattern ใช้กับทุก entity ทางการเงินโดยไม่มีข้อยกเว้น** (§7.1) — `expenses`, `revenues`, `payout_batch_items`, `cases` (service fee ตอน approved)
- **HandoverLot confirmed คือ trigger point เดียวที่ unlock expense + generate revenue พร้อมกันใน 1 transaction** (ตาม `44-asset-custody-handover.md` §11)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- [ ] Index strategy ที่แน่นอนสำหรับ query pattern ที่ใช้บ่อยที่สุด — ตรงกับ Open Item เดียวกันใน `02-database-schema-design.md` §15
- [ ] ยืนยันรายละเอียดเมื่อเริ่ม sprint เฉพาะ module (Open Item เดิม)

---

*เอกสารนี้เป็นไฟล์ที่ 3 ในหมวด Platform (90–95) ต่อจาก `91-platform-api-integration-jobs.md` และก่อน `93-roadmap-open-items.md`*
