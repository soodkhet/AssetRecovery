# 12-service-fee.md

# 12 — Service Fee (กติกาค่าบริการที่เรียกเก็บบริษัทไฟแนนซ์)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Settings Module
> เอกสารอ้างอิง: `10-finance-companies.md` §9.2, `02-database-schema-design.md` §5 (service_fee_templates table), `19-revenue-billing-receivable.md`, `31-accounting-sales-and-receipts.md`, `22-finance-calculation-spec.md`
> **หมายเหตุสำคัญ**: 🔶 ดูหมายเหตุเรื่องการตรวจทานโดยนักบัญชีในไฟล์ 10 — ใช้กับไฟล์นี้เช่นกัน (Drafted from UI Reference ยังไม่ผ่านการสัมภาษณ์ Product Owner โดยตรงในทุกรายละเอียด)

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — 3 model (SUCCESS_FEE/FLAT/HYBRID), charge_on_fail, basis เลือกได้ 2 แบบ |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |

ขอบเขตเอกสารนี้: ตั้งค่าเทมเพลตค่าบริการ (Service Fee) ที่ AssetRecovery เรียกเก็บจากบริษัทไฟแนนซ์ — เป็นฐานคำนวณ "รายได้" (Revenue) ของบริษัท ตรงข้ามกับไฟล์ 11 (Compensation) ที่เป็น "ค่าใช้จ่าย" จ่ายออกให้ทีมงาน

**ไม่รวมอยู่ในไฟล์นี้**: การสร้างรายการรายได้จริง/วางบิล (ดู `19-revenue-billing-receivable.md`, `31-accounting-sales-and-receipts.md`), VAT บนใบกำกับภาษี (ดู `19-revenue-billing-receivable.md` §6), Compensation จ่ายออกให้ทีมงาน (ดู `11-compensation.md` — คนละเรื่อง อย่าสับสน)

---

## 1. Summary

ตั้งค่าเทมเพลตค่าบริการ (Service Fee) ที่ AssetRecovery เรียกเก็บจากบริษัทไฟแนนซ์ — เป็นฐานคำนวณ "รายได้" (Revenue) ของบริษัท ตรงข้ามกับไฟล์ 11 (Compensation) ที่เป็น "ค่าใช้จ่าย" จ่ายออกให้ทีมงาน

## 2. Purpose

กำหนดสูตรคำนวณรายได้ต่อเคสที่ปิดงานสำเร็จ เพื่อให้ไฟล์ 19/31 (Revenue/Billing) ดึงมาคำนวณยอดวางบิลอัตโนมัติ

## 3. In Scope

- เทมเพลตค่าบริการ 3 รูปแบบ: `SUCCESS_FEE`, `FLAT`, `HYBRID`
- การคำนวณยอดรายได้ต่อเคสตามรูปแบบที่เลือก
- การผูกเทมเพลตเข้ากับบริษัทไฟแนนซ์ (ไฟล์ 10)

## 4. Out of Scope

- การสร้างรายการรายได้จริง/วางบิล (ไฟล์ 19/31)
- VAT บนใบกำกับภาษี (ไฟล์ 19 §6)
- Compensation จ่ายออกให้ทีมงาน (ไฟล์ 11 — คนละเรื่อง อย่าสับสน)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| Superadmin only | สร้าง/แก้ไขเทมเพลตค่าบริการ | Global |
| การเงิน (Finance) | ดูเทมเพลตเพื่ออ้างอิงตอนตรวจสอบรายได้ | Read-only |

## 6. Core Concepts

### 6.1 Model: `SUCCESS_FEE`

คิดค่าบริการเป็น **% ของฐานคำนวณ** เฉพาะเคสที่ `closed_success` เท่านั้น — เคส `closed_fail` ไม่มีรายได้จากโมเดลนี้ (ตรงกับชื่อ "ค่าความสำเร็จ")

- `rate`: เปอร์เซ็นต์ (เช่น 10%)
- `basis`: ฐานคำนวณ — เลือกได้ทั้ง 2 แบบต่อสัญญา: **"มูลค่าหนี้คงเหลือ"** (debt amount ของเคส) หรือ **"มูลค่าเครื่อง"** (asset value ของเคส) ขึ้นกับที่ตกลงกับบริษัทไฟแนนซ์แต่ละราย (ยืนยันแล้ว — ดู §7.1)

### 6.2 Model: `FLAT`

คิดค่าบริการ **เหมาคงที่ต่อเคส** ไม่ขึ้นกับมูลค่าหนี้/ทรัพย์ — **ตั้งค่าได้ว่าจะเรียกเก็บเมื่อเคสไม่สำเร็จด้วยหรือไม่** ผ่านฟิลด์ `charge_on_fail` (ดู §7.1) ไม่ fix ตายตัว เพราะแต่ละสัญญากับบริษัทไฟแนนซ์อาจตกลงกันต่างกัน

- `base`: จำนวนเงินคงที่ (เช่น 3,000 บาท/เคส)
- `charge_on_fail`: `true` = เรียกเก็บเสมอไม่ว่าผลจะเป็นอย่างไร (ค่าบริการ "เปิดเคส") / `false` = เรียกเก็บเฉพาะเคสที่ `closed_success` เท่านั้น (เหมือน SUCCESS_FEE แต่เป็นยอดคงที่)

### 6.3 Model: `HYBRID`

ผสมทั้งสองแบบ — มีค่าเปิดเคสคงที่ (`base`) **บวก** เปอร์เซ็นต์จากฐานคำนวณ (`rate` × `basis`) เมื่อเคสสำเร็จ

- `base`: ส่วนคงที่ — ใช้ `charge_on_fail` แบบเดียวกับ §6.2 ตัดสินว่าจ่ายเสมอหรือเฉพาะเคสสำเร็จ
- `rate` × `basis`: จ่ายเพิ่มเฉพาะเคสที่ `closed_success` เท่านั้น (ส่วนนี้ผูกกับความสำเร็จเสมอ ไม่มีตัวเลือก)
- ยอดรวมถ้าสำเร็จ = `base + (rate% × basis)` / ถ้าไม่สำเร็จ = `base` (ถ้า `charge_on_fail = true`) หรือ `0` (ถ้า `charge_on_fail = false`)

## 7. Data Entities / Required Objects

### 7.1 Service Fee Template

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| name | string | yes | ชื่อเทมเพลต (เช่น "Standard Success Fee 10%") |
| model | enum | yes | `SUCCESS_FEE` / `FLAT` / `HYBRID` |
| base | decimal | conditional | จำนวนเงินคงที่ — บังคับถ้า model เป็น `FLAT`/`HYBRID`, ต้องเป็น 0 ถ้า `SUCCESS_FEE` |
| charge_on_fail | boolean | conditional | บังคับถ้า model เป็น `FLAT`/`HYBRID` — `true` = เรียกเก็บ `base` แม้เคส `closed_fail`, `false` = เรียกเก็บเฉพาะเคสสำเร็จ ไม่เกี่ยวกับ `SUCCESS_FEE` (ไม่มีค่า base จึงไม่ใช้ฟิลด์นี้) |
| rate | decimal | conditional | เปอร์เซ็นต์ — บังคับถ้า model เป็น `SUCCESS_FEE`/`HYBRID`, ต้องเป็น 0 ถ้า `FLAT` |
| basis | enum \| null | conditional | `debt_amount` (มูลค่าหนี้คงเหลือ) / `asset_value` (มูลค่าเครื่อง) — บังคับถ้ามี `rate` > 0 — **เลือกได้ทั้ง 2 แบบต่อสัญญา** ขึ้นกับที่ตกลงกับบริษัทไฟแนนซ์แต่ละราย ไม่ fix ตายตัวเป็นค่าเดียว |
| active | boolean | yes | เทมเพลตที่ถูกผูกกับบริษัทอยู่ต้อง active เสมอ — ปิดใช้งานได้เฉพาะเทมเพลตที่ไม่มีบริษัทผูกอยู่ |
| created_at, updated_at | timestamptz | yes | — |

## 8. UI / UX Rules

อ้างอิงจาก `settings.html` (`renderServiceFeeContent`):

- แสดงเป็น **table** คอลัมน์: ชื่อเทมเพลต, รูปแบบ (model — badge ตัวพิมพ์ใหญ่), ค่าบริการตั้งต้น (Base — แสดง "-" ถ้าไม่มี), ค่าความสำเร็จ (rate% + basis — แสดง "-" ถ้าไม่มี), ปุ่มแก้ไข
- ฟอร์มสร้าง/แก้ไข: เลือก model ก่อน (radio/select) → แสดงฟิลด์ที่เกี่ยวข้องตาม model ที่เลือกเท่านั้น (ซ่อนฟิลด์ที่ไม่ใช้เพื่อกัน confusion — เช่นเลือก FLAT ไม่ต้องเห็นช่อง rate/basis) — เมื่อเลือก `FLAT`/`HYBRID` แสดง toggle "เรียกเก็บค่าเปิดเคสแม้ไม่สำเร็จ" ผูกกับฟิลด์ `charge_on_fail`

## 9. Workflow / Lifecycle

`สร้างเทมเพลต → เลือก model → กรอกค่าตามเงื่อนไข §7.1 → ผูกกับบริษัทไฟแนนซ์ (ไฟล์ 10)`

แก้ไขเทมเพลตที่กำลังถูกผูกใช้งานอยู่ → ตาม `10-finance-companies.md` §9.2 (แก้ไขแล้ว) เคสที่ `approved` ไปแล้วใช้ snapshot ไม่กระทบ แต่เคสที่ยังไม่ approved (`draft`/`pending_review`) จะเห็น `projected_revenue_amount` เปลี่ยนตามเทมเพลตใหม่ทันที

## 10. Security / Control Rules

- ห้ามปิดใช้งาน (`active = false`) เทมเพลตที่มีบริษัทไฟแนนซ์ผูกอยู่ ณ ขณะนั้น — ต้องเปลี่ยนบริษัทไปผูกเทมเพลตอื่นก่อน
- แก้ไขค่า `base`/`rate`/`basis` ต้อง audit log พร้อมเหตุผล (กระทบรายได้บริษัท)

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| REQUIRED_MISSING | ฟิลด์บังคับตาม model ไม่ครบ (ดู §7.1) | inline error |
| INVALID_RATE_RANGE | `rate` ไม่อยู่ระหว่าง 0-100 | reject |
| TEMPLATE_IN_USE | พยายามปิดใช้งานเทมเพลตที่มีบริษัทผูกอยู่ | reject พร้อมรายชื่อบริษัทที่ผูกอยู่ |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| สร้าง/แก้ไขเทมเพลต | Superadmin only | full |
| ดูเทมเพลตทั้งหมด | การเงิน, บัญชี | read-only |

## 13. Audit Log Requirements

- ทุกการแก้ไข `base`/`rate`/`basis`/`model` ต้องมี `reason` บังคับ พร้อม `before`/`after`

## 14. API / Integration Draft

| Method | Endpoint | Purpose | Notes |
|---|---|---|---|
| GET | /api/service-fee-templates | list | — |
| POST | /api/service-fee-templates | create | audit required |
| PATCH | /api/service-fee-templates/:id | update | audit required, reject ถ้า TEMPLATE_IN_USE และพยายามปิดใช้งาน |

## 15. Acceptance Criteria

- สร้างเทมเพลตทั้ง 3 model ได้ถูกต้องตามเงื่อนไขฟิลด์บังคับ
- คำนวณยอดรายได้ตามสูตรแต่ละ model ถูกต้อง (ดู §6 และไฟล์ 22 สำหรับสูตรเชิงคำนวณเต็ม)
- ปิดใช้งานเทมเพลตที่ผูกบริษัทอยู่ไม่ได้

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| SUCCESS_FEE เคสไม่สำเร็จ | ปิดงาน closed_fail บริษัทที่ผูก SUCCESS_FEE | ไม่มีรายการรายได้เกิดขึ้น |
| FLAT เคสไม่สำเร็จ + charge_on_fail=true | ปิดงาน closed_fail บริษัทที่ผูก FLAT (charge_on_fail=true) | มีรายการรายได้ = base |
| FLAT เคสไม่สำเร็จ + charge_on_fail=false | ปิดงาน closed_fail บริษัทที่ผูก FLAT (charge_on_fail=false) | ไม่มีรายการรายได้เกิดขึ้น |
| HYBRID เคสสำเร็จ | ปิดงาน closed_success บริษัทที่ผูก HYBRID | รายได้ = base + (rate% × basis) |
| ปิดเทมเพลตที่ผูกอยู่ | ลองปิด active เทมเพลตที่มีบริษัทผูก | reject TEMPLATE_IN_USE |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **3 Model ค่าบริการ**: `SUCCESS_FEE` (% เฉพาะสำเร็จ), `FLAT` (เหมาคงที่ + charge_on_fail เลือกได้), `HYBRID` (ผสมทั้งสอง) — ยืนยันแล้วทั้งหมด (§6)
- **`charge_on_fail` ตั้งค่าได้ต่อเทมเพลต ไม่ fix ตายตัว** — แต่ละสัญญากับบริษัทไฟแนนซ์อาจตกลงต่างกัน (§6.2, §6.3)
- **`basis` เลือกได้ทั้ง 2 แบบต่อสัญญา** (มูลค่าหนี้คงเหลือ หรือ มูลค่าเครื่อง) ไม่ fix ตายตัวเป็นค่าเดียวทั้งระบบ (§6.1, §7.1)
- **ห้ามปิดใช้งานเทมเพลตที่มีบริษัทผูกอยู่** ต้องย้ายบริษัทไปผูกเทมเพลตอื่นก่อนเสมอ (§10)
- **Snapshot timing สอดคล้องกับไฟล์ 10 ที่แก้ไขแล้ว**: เคส approved ใช้ snapshot ไม่กระทบเมื่อแก้เทมเพลต, เคสที่ยังไม่ approved เห็นค่าประมาณการเปลี่ยนตามเทมเพลตล่าสุด (§9)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ยืนยันแล้วทั้งหมด: FLAT/HYBRID ใช้ `charge_on_fail` ตั้งค่าได้ต่อเทมเพลต ไม่ fix ตายตัว, ฐานคำนวณ (`basis`) เลือกได้ทั้ง "มูลค่าหนี้คงเหลือ" และ "มูลค่าเครื่อง" ขึ้นกับสัญญาแต่ละบริษัท — ไม่มี Open Item ค้างเพิ่มเติม

---

*เอกสารนี้เป็นไฟล์ที่ 6 ในหมวด Settings Module (07–13) ต่อจาก `11-compensation.md` และก่อน `13-accounting-finance-settings.md`*
