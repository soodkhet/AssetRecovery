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
| v2.1 | 06/10/2569 | **มติ PO 06/10/2569 (U108)**: §8 เพิ่มกล่องคำอธิบายในหน้าจอ (คืออะไร · ผลของตัวเลือก · ตัวอย่างตัวเลขคำนวณสดด้วยสูตรจริง · ใครแก้ได้/มีผลเมื่อไร — รูปแบบกลางตาม `13` §7.1) ให้ค่าตั้ง: โมเดลค่าบริการ — ค่าบริการก่อน VAT ของเคสสำเร็จ/ไม่สำเร็จจากค่าที่กรอก · ไม่เปลี่ยน business logic |
| v2.2 | 07/10/2569 | **มติ PO U125 + U126**: (U125) ตัดสวิตช์ `charge_per_tracking_round` ออก — **คิดค่าบริการทุกรอบติดตามอิสระเสมอ** (ไฟแนนซ์ส่งเคสกลับมารอบใหม่ = งานใหม่ ไม่เกี่ยวกับรอบเก่า ตรงมติ A3/B3 ตัวเลือก a) — §6.4 ใหม่ · (U126) ตัดฐาน `asset_value` (มูลค่าเครื่อง) ออก เหลือ `basis = debt_amount` (มูลค่าหนี้คงเหลือ) อย่างเดียว — เปิดใหม่ได้ภายหลังถ้ามีกระบวนการประเมินราคาเครื่องที่ชัดเจน — §6.1/§7.1/§17/§18 |
| v2.3 | 07/10/2569 | **มติ PO U165**: แทนสวิตช์ `charge_on_fail` ด้วย **`fail_fee_satang`** (ยอดค่าบริการกรณีไม่สำเร็จ — กรอกบาทแยก, NULL = ไม่เก็บ) ใช้ได้**ทุกโมเดล** รวม `SUCCESS_FEE` · ส่วน "กรณีสำเร็จ" คงตามโมเดลเดิม · ตัวอย่าง สำเร็จ 1,500 / ไม่สำเร็จ 300 · ข้อมูลเดิม `charge_on_fail = true` แปลงเป็น `fail_fee = base` (ผลเท่าเดิมทุกบาท) · snapshot ลงเคสตอน approved ตามเดิม — §6.1–6.3, §6.5 ใหม่, §7.1, §8, §16, §17 |

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

คิดค่าบริการเป็น **% ของฐานคำนวณ** เมื่อเคส `closed_success` — เคส `closed_fail` ได้ยอดกรณีไม่สำเร็จ (§6.5) ถ้าตั้งไว้ มิฉะนั้นไม่มีรายได้

- `rate`: เปอร์เซ็นต์ (เช่น 10%)
- `basis`: ฐานคำนวณ — **"มูลค่าหนี้คงเหลือ"** (debt amount ของเคส) แบบเดียว (มติ PO U126 — เดิมมี "มูลค่าเครื่อง" ด้วย แต่ตัดออกเพราะในทางปฏิบัติประเมินราคาเครื่องเองให้จบไม่ได้)

### 6.2 Model: `FLAT`

คิดค่าบริการ **เหมาคงที่ต่อเคส** เมื่อเคสสำเร็จ ไม่ขึ้นกับมูลค่าหนี้/ทรัพย์ — กรณีไม่สำเร็จใช้ยอดแยก (§6.5)

- `base`: จำนวนเงินคงที่เมื่อสำเร็จ (เช่น 1,500 บาท/เคส)

### 6.3 Model: `HYBRID`

ผสมทั้งสองแบบ — มีค่าเปิดเคสคงที่ (`base`) **บวก** เปอร์เซ็นต์จากฐานคำนวณ (`rate` × `basis`) เมื่อเคสสำเร็จ

- `base` + `rate` × `basis`: ทั้งสองส่วนเป็นของ "กรณีสำเร็จ"
- ยอดรวมถ้าสำเร็จ = `base + (rate% × basis)` / ถ้าไม่สำเร็จ = `fail_fee` (§6.5) หรือ `0` เมื่อไม่ตั้ง

### 6.4 รอบการติดตาม (tracking round) — คิดทุกรอบอิสระเสมอ (มติ PO U125)

เคสที่บริษัทไฟแนนซ์ส่งกลับมาติดตามใหม่ (recycle — `38` §6.6) **คิดค่าบริการรอบนั้นแยกอิสระเสมอ** ไม่มีสวิตช์ให้ตั้งค่า:
- รอบแรกจบงานแล้วคิดค่าบริการรอบแรกไปแล้ว — รอบใหม่เริ่มใหม่ ไม่เกี่ยวกับรอบเก่า
- snapshot ค่าบริการใหม่ที่จุดอนุมัติรีไซเคิลของรอบนั้น · รายได้เกิดใบใหม่ต่อ (เคส, `tracking_round`) — **ไม่หักกลบ/ไม่แก้ใบของรอบก่อน**

### 6.5 กรณีไม่สำเร็จ — ยอดแยก ทุกโมเดล (มติ PO U165)

แทนสวิตช์ `charge_on_fail` เดิม: เทมเพลตทุกโมเดลมีตัวเลือก (ไม่บังคับ) **"เรียกเก็บกรณีไม่สำเร็จ"** + ยอดเงินบาท (`fail_fee`)
- เคส `closed_fail` ที่หลักฐานครบ + ผ่านอนุมัติ ⇒ รายได้ = `fail_fee` (ไม่ใช้ base/rate เลย) · ไม่ตั้ง (NULL) ⇒ ไม่มีรายได้
- ตัวอย่าง: FLAT สำเร็จ 1,500 / ไม่สำเร็จ 300 · SUCCESS_FEE 5% / ไม่สำเร็จ 200
- กรณีไม่สำเร็จไม่ผ่านคลัง (`19` §6.1) · snapshot ลงเคสตอน approved (`cases.service_fee_fail_fee_satang`)
- ข้อมูลก่อนมติ: `charge_on_fail = true` (FLAT/HYBRID) ⇒ `fail_fee = base` · นอกนั้น ⇒ NULL — ผลรายได้เท่าเดิมทุกบาท

## 7. Data Entities / Required Objects

### 7.1 Service Fee Template

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| name | string | yes | ชื่อเทมเพลต (เช่น "Standard Success Fee 10%") |
| model | enum | yes | `SUCCESS_FEE` / `FLAT` / `HYBRID` |
| base | decimal | conditional | จำนวนเงินคงที่ — บังคับถ้า model เป็น `FLAT`/`HYBRID`, ต้องเป็น 0 ถ้า `SUCCESS_FEE` |
| fail_fee | integer satang \| null | no | มติ U165 — ยอดค่าบริการกรณี `closed_fail` ทุกโมเดล · NULL = ไม่เรียกเก็บกรณีไม่สำเร็จ · ถ้าระบุต้อง > 0 (DB CHECK ≥ 0) · API key `failFeeSatang` บังคับส่ง (null ได้) — request เก่าที่ส่ง `chargeOnFail` แทน = 400 |
| rate | decimal | conditional | เปอร์เซ็นต์ — บังคับถ้า model เป็น `SUCCESS_FEE`/`HYBRID`, ต้องเป็น 0 ถ้า `FLAT` |
| basis | enum \| null | conditional | `debt_amount` (มูลค่าหนี้คงเหลือ) ค่าเดียว — บังคับถ้ามี `rate` > 0 · ว่างเมื่อ `FLAT` (มติ PO U126 ตัด `asset_value` ออก) |
| active | boolean | yes | เทมเพลตที่ถูกผูกกับบริษัทอยู่ต้อง active เสมอ — ปิดใช้งานได้เฉพาะเทมเพลตที่ไม่มีบริษัทผูกอยู่ |
| created_at, updated_at | timestamptz | yes | — |

## 8. UI / UX Rules

- **คำอธิบายในหน้าจอ (มติ PO U108)**: ค่าตั้งที่กระทบเงินในฟอร์มนี้มีกล่องคำอธิบายพับได้ (`<SettingHelp>`) — โมเดลค่าบริการ — ค่าบริการก่อน VAT ของเคสสำเร็จ/ไม่สำเร็จจากค่าที่กรอก · ตัวอย่างอัปเดตสดตามค่าที่กรอก (`13` §7.1)
อ้างอิงจาก `settings.html` (`renderServiceFeeContent`):

- แสดงเป็น **table** คอลัมน์: ชื่อเทมเพลต, รูปแบบ (model — badge ตัวพิมพ์ใหญ่), ค่าบริการตั้งต้น (Base — แสดง "-" ถ้าไม่มี), ค่าความสำเร็จ (rate% + basis — แสดง "-" ถ้าไม่มี), ปุ่มแก้ไข
- ฟอร์มสร้าง/แก้ไข: เลือก model ก่อน (radio/select) → แสดงฟิลด์ที่เกี่ยวข้องตาม model ที่เลือกเท่านั้น (ซ่อนฟิลด์ที่ไม่ใช้เพื่อกัน confusion — เช่นเลือก FLAT ไม่ต้องเห็นช่อง rate/basis) — ส่วน "กรณีสำเร็จ" แสดงช่องตามโมเดล · ทุกโมเดลมีช่องติ๊ก "เรียกเก็บกรณีไม่สำเร็จ" → ติ๊กแล้วแสดงช่องยอดเงิน (บาท) ผูกกับ `fail_fee` (มติ U165)

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
| SUCCESS_FEE เคสไม่สำเร็จ (ไม่ตั้ง fail_fee) | ปิดงาน closed_fail บริษัทที่ผูก SUCCESS_FEE | ไม่มีรายการรายได้เกิดขึ้น |
| SUCCESS_FEE เคสไม่สำเร็จ + fail_fee (U165) | ปิดงาน closed_fail บริษัทที่ผูก SUCCESS_FEE (fail_fee = 200) | รายได้ = 200 บาท |
| FLAT สำเร็จ 1,500 / ไม่สำเร็จ 300 (U165) | ปิดงาน closed_success และ closed_fail บริษัทที่ผูก FLAT (base 1,500, fail_fee 300) | รายได้ 1,500 / 300 บาท |
| FLAT เคสไม่สำเร็จ ไม่ตั้ง fail_fee | ปิดงาน closed_fail บริษัทที่ผูก FLAT (fail_fee = NULL) | ไม่มีรายการรายได้เกิดขึ้น |
| Migration ข้อมูลเดิม (U165) | เทมเพลต/เคสเดิม charge_on_fail = true | fail_fee = base · รายได้เท่าเดิมทุกบาท |
| request เก่า (U165) | POST/PATCH ส่ง `chargeOnFail` ไม่มี `failFeeSatang` | 400 validation |
| HYBRID เคสสำเร็จ | ปิดงาน closed_success บริษัทที่ผูก HYBRID | รายได้ = base + (rate% × basis) |
| รีไซเคิลรอบ 2 (U125) | เคสรอบ 1 เกิดรายได้แล้ว → ไฟแนนซ์ส่งกลับ → รอบ 2 ปิด closed_success | รายได้ใบใหม่ของรอบ 2 แยกจากรอบ 1 · ใบรอบ 1 ไม่ถูกแก้/หักกลบ |
| ฐาน asset_value (U126) | สร้าง/แก้เทมเพลตด้วย `basis = asset_value` | 400 validation (รับเฉพาะ `debt_amount`) |
| ปิดเทมเพลตที่ผูกอยู่ | ลองปิด active เทมเพลตที่มีบริษัทผูก | reject TEMPLATE_IN_USE |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **3 Model ค่าบริการ** (กรณีสำเร็จ): `SUCCESS_FEE` (%), `FLAT` (เหมาคงที่), `HYBRID` (ผสมทั้งสอง) — ยืนยันแล้วทั้งหมด (§6)
- ~~`charge_on_fail` ตั้งค่าได้ต่อเทมเพลต~~ → **มติ PO U165**: ยอดกรณีไม่สำเร็จ `fail_fee` กรอกแยกได้ทุกโมเดล (§6.5)
- ~~`basis` เลือกได้ทั้ง 2 แบบต่อสัญญา~~ → **มติ PO U126**: ฐานคำนวณมีแบบเดียวคือ "มูลค่าหนี้คงเหลือ" (§6.1, §7.1)
- **มติ PO U125**: ไม่มีสวิตช์ `charge_per_tracking_round` — คิดค่าบริการทุกรอบติดตามอิสระเสมอ (§6.4)
- **ห้ามปิดใช้งานเทมเพลตที่มีบริษัทผูกอยู่** ต้องย้ายบริษัทไปผูกเทมเพลตอื่นก่อนเสมอ (§10)
- **Snapshot timing สอดคล้องกับไฟล์ 10 ที่แก้ไขแล้ว**: เคส approved ใช้ snapshot ไม่กระทบเมื่อแก้เทมเพลต, เคสที่ยังไม่ approved เห็นค่าประมาณการเปลี่ยนตามเทมเพลตล่าสุด (§9)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ยืนยันแล้วทั้งหมด: ยอดกรณีไม่สำเร็จตั้งแยกได้ทุกโมเดล (U165), ฐานคำนวณ (`basis`) = "มูลค่าหนี้คงเหลือ" อย่างเดียว (U126) · ทุกรอบติดตามคิดค่าบริการอิสระ (U125) — ไม่มี Open Item ค้างเพิ่มเติม

---

*เอกสารนี้เป็นไฟล์ที่ 6 ในหมวด Settings Module (07–13) ต่อจาก `11-compensation.md` และก่อน `13-accounting-finance-settings.md`*
