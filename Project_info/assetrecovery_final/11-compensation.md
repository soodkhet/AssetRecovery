# 11-compensation.md

# 11 — Compensation (แผนค่าตอบแทน)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Settings Module
> เอกสารอ้างอิง: `09-teams.md`, `02-database-schema-design.md` §5 (compensation_plans table), `15-claims-and-advances.md`, `16-compensation-approval.md`, `22-finance-calculation-spec.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — Fuel Rule 2 modes (PER_KM/DAILY_FLAT), No-Success Compensation |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |

ขอบเขตเอกสารนี้: ตั้งค่า template ค่าตอบแทนที่จ่ายให้เจ้าหน้าที่ติดตามทรัพย์ — ค่าน้ำมัน เบี้ยเลี้ยง ค่าคอมมิชชั่น เบี้ยเสี่ยง ค่าที่พัก และ WHT — ผูกกับทีม (1 ทีม : 1 แผน)

**ไม่รวมอยู่ในไฟล์นี้**: การอนุมัติรายการค่าตอบแทนรายเคสจริง (ดู `16-compensation-approval.md`), Claim/Advance workflow (ดู `15-claims-and-advances.md`), สูตรคำนวณละเอียด (ดู `22-finance-calculation-spec.md`)

---

## 1. Summary

ตั้งค่า template ค่าตอบแทน เช่น ค่าน้ำมัน เบี้ยเลี้ยง ค่าคอม โรงแรม ใบเสร็จ และ WHT

## 2. Purpose

ตั้งค่า template ค่าตอบแทน เช่น ค่าน้ำมัน เบี้ยเลี้ยง ค่าคอม โรงแรม ใบเสร็จ และ WHT

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
| Compensation Plan (แผนค่าตอบแทน) | template | name, type, wht_rate, fuel, allowance, commission, no_success_fee, hotel, status |
| Rule | สูตร | fuel, allowance, commission, no_success_fee, hotel, receipt |
| Fuel Rule | สูตรค่าน้ำมัน — แยกย่อยจาก Rule ปกติเพราะมี 2 โหมดให้เลือกตั้งค่าต่อ template | mode, rate_per_km, max_per_case, daily_flat_rate |
| Template Version | version | version, effective_from |

### 7.1 Fuel Rule — 2 โหมด (ไม่ใช่สูตรเดียวแบบ Rule อื่น)

ตอนตั้งค่า template ต้องเลือก **1 ใน 2 โหมด** ต่อทีม (ไม่ใช่ตั้งทั้งสองพร้อมกัน):

| Mode | ฟิลด์ที่ต้องตั้งค่า | คำอธิบาย |
|---|---|---|
| `PER_KM` | `rate_per_km` (บาท/กม.), `max_per_case` (เพดานเบิกสูงสุดต่อเคส) | คิดตามระยะทางจริงที่ใช้ในการลงพื้นที่เคสนั้น คูณ rate_per_km แต่เบิกได้ไม่เกิน max_per_case ต่อเคส แม้ระยะทางจริงจะคิดได้สูงกว่า |
| `DAILY_FLAT` | `daily_flat_rate` (บาท/วัน) | เหมาจ่ายคงที่ต่อวัน ไม่จำกัดระยะทางที่วิ่งจริง ไม่มีการคำนวณตามระยะทาง |

**เพดานของทั้งสองโหมดเป็นค่าคนละตัวกัน** — `max_per_case` (ของ PER_KM) ไม่ใช่ตัวเลขเดียวกับ `daily_flat_rate` (ของ DAILY_FLAT) ต้องตั้งค่าแยกกันชัดเจน และ UI ต้องซ่อนฟิลด์ของโหมดที่ไม่ได้เลือก (เช่น เลือก DAILY_FLAT แล้วไม่ต้องโชว์ rate_per_km/max_per_case)

### 7.2 No-Success Compensation (เบี้ยเสี่ยง/ค่าออกพื้นที่)

แยกออกจาก `commission` อย่างชัดเจน เป็น Rule คนละตัว:

| Field | Type | Description |
|---|---|---|
| `commission` | amount (บาท/เคส) | จ่ายเมื่อเคส**สำเร็จ** — ตายตัวต่อเคส ไม่ขึ้นกับมูลหนี้/มูลค่าสินค้า |
| `no_success_fee` | amount (บาท/เคส) | **เบี้ยเสี่ยง/ค่าออกพื้นที่** — จ่ายเมื่อเคส**ไม่สำเร็จ** (เพื่อชดเชยเวลาที่พนักงานลงพื้นที่ไปแล้วแต่ไม่ได้ผล) — ตายตัวต่อเคส ไม่ขึ้นกับมูลหนี้/มูลค่าสินค้าเช่นกัน — สูตรนี้ exclusive กับ `commission` (เคสหนึ่งจะได้แค่อย่างใดอย่างหนึ่งตาม outcome ไม่ได้รับทั้งสองพร้อมกัน) |

## 8. UI / UX Rules

- Form template
- แสดง rules ชัดเจน
- แยก inhouse/outsource
- ฟอร์มค่าน้ำมัน (Fuel Rule) ต้องมี toggle เลือกโหมด `PER_KM` หรือ `DAILY_FLAT` — สลับโหมดแล้วซ่อน/แสดงฟิลด์ที่เกี่ยวข้องเท่านั้น (ไม่แสดงฟิลด์ของอีกโหมดทิ้งไว้ให้สับสน)
- แสดง `commission` และ `no_success_fee` เป็น 2 ช่องแยกกันชัดเจนในฟอร์ม พร้อม label บอกเงื่อนไขกำกับ ("จ่ายเมื่อสำเร็จ" / "จ่ายเมื่อไม่สำเร็จ") เพื่อไม่ให้สับสนว่าเป็นสูตรเดียวกัน

## 9. Workflow / Lifecycle

- Create template → assign to team → case outcome creates compensation using snapshot
- `commission` กับ `no_success_fee` เป็น mutually exclusive ตาม outcome ของเคส (ไฟล์ 41) — เคสหนึ่งจะ trigger ได้แค่อย่างเดียวตามผลสำเร็จ/ไม่สำเร็จ ไม่จ่ายทั้งสองพร้อมกัน

## 10. Security / Control Rules

- Template ที่ถูกใช้แล้วต้อง version
- ค่าตัวเลขต้อง configurable
- receipt required ส่งผลต่อ claim validation
- `allowance` (เบี้ยเลี้ยง บาท/วัน) และ `hotel` (ค่าที่พัก บาท/คืน) เป็นอัตราเต็มต่อหน่วย (วัน/คืน) — แสดงและเก็บเป็นค่าเต็มเสมอ ไม่มีการหารเฉลี่ยต่อเคสหรือสมมติฐานจำนวนเคสต่อวันใดๆ ในระดับ template/foundation นี้
- `fuel` แบบ `PER_KM` ต้องคำนวณจากระยะทางจริงที่เกิดขึ้น (ได้ค่าหลังลงพื้นที่จริงเท่านั้น) — ก่อนหน้านั้น (เช่น ตอนรับเคส) ไม่มีทางคำนวณค่าจริงได้ ให้แสดงแค่อัตรา/เพดานที่ตั้งไว้เป็นข้อมูลอ้างอิง ไม่ใช่ตัวเลขที่คำนวณสำเร็จแล้ว

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
| Manage compensation | Superadmin/บริหาร/การเงิน | full |
| View compensation | บัญชี, ผู้จัดการทีมติดตามทรัพย์ | read |

## 13. Audit Log Requirements

- ทุก mutation ต้องบันทึก `actor_id`, `role`, `action`, `target_type`, `target_id`, `before`, `after`, `reason`, `created_at`
- ข้อมูลที่กระทบเงิน สิทธิ์ ธนาคาร ภาษี หรือการ lock period ต้องบันทึก reason เสมอ
- Audit log ห้ามแก้ไขย้อนหลัง
- รายการ export/import/background job ต้อง trace กลับไปผู้สั่งงานได้

## 14. API / Integration Draft

| Method | Endpoint | Purpose | Notes |
|---|---|---|---|
| GET | /api/compensation-plans | list พร้อม filter (side, status) | ตาม permission |
| POST | /api/compensation-plans | สร้าง plan ใหม่ | ต้องเลือก fuel_mode 1 ใน 2 |
| PATCH | /api/compensation-plans/:id | แก้ไข plan | สร้าง version ใหม่ ไม่ overwrite ของเดิม (ตาม §10) |
| GET | /api/compensation-plans/:id/versions | ดูประวัติ version | — |

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
| Fuel mode toggle | เลือก DAILY_FLAT แล้วสลับกลับ PER_KM | ฟิลด์ที่ไม่เกี่ยวข้องต้องซ่อน/แสดงถูกต้องตามโหมด |
| commission/no_success_fee exclusive | เคสปิด closed_success | ต้องได้ commission เท่านั้น ไม่ได้ no_success_fee ด้วย |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Fuel Rule มี 2 โหมด เลือกได้ทีละ 1 ต่อทีม**: `PER_KM` (ตามระยะทางจริง + เพดาน) หรือ `DAILY_FLAT` (เหมาจ่ายรายวัน) — ไม่ตั้งพร้อมกันทั้งสอง (§7.1)
- **`commission` และ `no_success_fee` เป็นคนละ Rule ที่ mutually exclusive ตาม outcome ของเคส** — จ่ายอย่างใดอย่างหนึ่งเท่านั้น ไม่จ่ายพร้อมกัน (§7.2, §9)
- **`allowance`/`hotel` เป็นอัตราเต็มต่อหน่วยเสมอ** ไม่มีการหารเฉลี่ย (§10)
- **`fuel` แบบ PER_KM คำนวณได้แค่หลังลงพื้นที่จริงเท่านั้น** — ก่อนหน้านั้นแสดงแค่อัตรา/เพดานอ้างอิง (§10)
- **Template ที่ถูกใช้แล้วต้อง version ไม่ overwrite** (§10, §14)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- [ ] ยืนยันรายละเอียดเมื่อเริ่ม sprint เฉพาะ module (Open Item เดิม)

---

*เอกสารนี้เป็นไฟล์ที่ 5 ในหมวด Settings Module (07–13) ต่อจาก `10-finance-companies.md` และก่อน `12-service-fee.md`*
