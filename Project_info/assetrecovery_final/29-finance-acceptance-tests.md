# 29-finance-acceptance-tests.md

# 29 — Finance Acceptance Tests (End-to-End Scenarios)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Finance Reference — เอกสารอ้างอิงเชิงเทคนิค ไม่มีหน้าจอ UI ของตัวเอง
> เอกสารอ้างอิง: Unit test รายไฟล์ดูที่ §16 ของแต่ละไฟล์ต้นทาง (10-21, 30-37)

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — 5 E2E scenario + Integration Test Checklist |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** (scenario ทั้งหมดยังสอดคล้องกับการแก้ไข Batch 3 เพราะไม่ได้อ้างอิง state ที่เปลี่ยน เช่น Advance) |

ขอบเขตเอกสารนี้: รวม Test Scenario ระดับ end-to-end ที่ทดสอบ flow ข้ามหลายโมดูล ซึ่งการทดสอบแยกรายไฟล์ (unit test ในแต่ละไฟล์) ไม่ครอบคลุมถึง

**ไม่รวมอยู่ในไฟล์นี้**: Unit test รายไฟล์ (ดู §16 ของแต่ละไฟล์ต้นทาง)

---

## 1. Summary

รวม Test Scenario ระดับ end-to-end ที่ทดสอบ flow ข้ามหลายโมดูล ซึ่งการทดสอบแยกรายไฟล์ (unit test ในแต่ละไฟล์) ไม่ครอบคลุมถึง

## 2. Purpose

ยืนยันว่าทั้ง pipeline การเงิน/บัญชี (ตั้งแต่เคสปิดงานจนถึงปิดงวดส่งสำนักงานบัญชี) ทำงานถูกต้องสอดคล้องกันทุกจุดเชื่อมต่อ

## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้)

เอกสารนี้เป็น technical reference ล้วน — ไม่มี Scope/Actor ของตัวเอง

## 6. End-to-End Test Scenarios

### 6.1 Scenario: เคสปิดงานสำเร็จ → รายได้ → วางบิล → รับเงิน → บันทึกบัญชี (Happy Path ฝั่งรายรับ)

```
1. เคส (ไฟล์ 38) closed_success ด้วย Service Fee Template โหมด SUCCESS_FEE
   → ตรวจสอบ: Revenue (ไฟล์ 19) ถูกสร้างอัตโนมัติ ด้วยยอดถูกต้องตามสูตร (ไฟล์ 22 §6.5)
2. ถึงรอบตัดบิล → สร้าง Billing Batch รวม Revenue นั้น
   → ตรวจสอบ: VAT คำนวณถูกต้องตามอัตรา ณ revenue_date (ไฟล์ 22 §6.8)
3. ส่ง Billing Batch (status: sent) → sync เป็น Sales Record (ไฟล์ 31)
   → ตรวจสอบ: ออกใบกำกับภาษีได้ พร้อมเลขที่ต่อเนื่อง
4. Import Bank Statement ที่มียอดตรงกับ Billing Batch (ไฟล์ 35)
   → ตรวจสอบ: Auto-match สำเร็จ → สร้าง Cash Receipt (ไฟล์ 31) → Billing Batch received_amount อัปเดต → status เปลี่ยนเป็น paid
```

### 6.2 Scenario: เคสปิดงานไม่สำเร็จ → ค่าตอบแทน → อนุมัติ → จ่ายเงิน → บันทึกบัญชี (Happy Path ฝั่งรายจ่าย)

```
1. เคส (ไฟล์ 38/41) closed_fail → สร้างค่าน้ำมัน/เบี้ยเลี้ยง (ไฟล์ 41 §6.6) อัตโนมัติ
2. ผ่าน Approval Matrix (ไฟล์ 16) ครบทุกขั้น → status: approved
3. รวมเข้า Payout Batch (ไฟล์ 17) แยกฝั่ง inhouse/outsource ถูกต้อง
   → ตรวจสอบ: payee ที่ unverified ถูกกันออกจาก batch
4. สร้างไฟล์โอนเงิน → ตรวจสอบ idempotency_key ป้องกันสร้างซ้ำ
5. Payout Batch completed → sync เป็น Expense Record (ไฟล์ 32) + WHT Certificate (ไฟล์ 33)
   → ตรวจสอบ: WHT คำนวณถูกต้องตาม Tax Profile ของ payee (ไฟล์ 22 §6.9)
```

### 6.3 Scenario: QC Outcome ตีกลับ → ไม่กระทบ Revenue เพราะยังไม่เกิด (เชื่อมไฟล์ 41 §10.1, ไฟล์ 19 §6.1)

```
1. เคส closed_success → expense (fuel/allowance/commission) เริ่มสร้างขึ้น แต่ยังอยู่ที่ pending_warehouse_confirm/pending_approval
   → ตรวจสอบ: Revenue ยังไม่เกิด ณ จุดนี้ (รอ expense ผ่านขั้นอนุมัติก่อน — ดูไฟล์ 19 §6.1)
2. เจ้าหน้าที่อนุมัติเคสใช้ reject_evidence (ไฟล์ 41) → เคสกลับเป็น needs_revision ก่อนที่ expense จะ approved
   → ตรวจสอบ: ไม่มี Revenue ที่ต้องจัดการย้อนหลังเลย เพราะยังไม่เคยถูกสร้างขึ้น
3. field agent แก้ไขหลักฐาน + resubmit → กลับเป็น closed_success (outcome ล็อกไว้ ไม่เปลี่ยน)
   → ตรวจสอบ: รายการเบิกรอบเดิม mark เป็น superseded, สร้างรายการใหม่แทน (ไฟล์ 41 §10.1)
4. รายการเบิกรอบใหม่ผ่านขั้นอนุมัติจนถึง approved
   → ตรวจสอบ: Revenue เกิดขึ้นตอนนี้เป็นครั้งแรก (ไม่มีรายการซ้ำซ้อนจากรอบที่ถูกตีกลับไปก่อนหน้า)
```

### 6.4 Scenario: รอบบัญชี locked → ต้องแก้ไขย้อนหลังผ่าน Adjustment

```
1. Accounting Period ของเดือนนั้นเป็น locked (ไฟล์ 30)
2. พบว่า Revenue เดือนนั้นผิด (เช่น คำนวณ VAT ผิดอัตรา)
   → ตรวจสอบ: แก้ไข Revenue ตรงไม่ได้ (reject PERIOD_LOCKED_DIRECT_EDIT)
3. สร้าง Adjustment (ไฟล์ 20) อ้างอิง Revenue นั้น
   → ตรวจสอบ: ต้องผ่าน Executive อนุมัติเท่านั้น (เพราะ period_status_at_target = locked)
4. Adjustment approved → ยอดสุทธิแสดงถูกต้องในรายงาน (Revenue เดิม + Adjustment) โดยไม่แก้ไข Revenue ต้นฉบับ
```

### 6.5 Scenario: ปิดงวดบัญชีสมบูรณ์ (Full Monthly Close Cycle)

```
1. ตลอดเดือน: Revenue/Expense เกิดขึ้นตามปกติ (ไฟล์ 19, 41) — Accounting Period: collecting
2. สิ้นเดือน: บัญชีกด "ตรวจความพร้อม" (ไฟล์ 30)
   → ถ้ามี Critical Exception (ไฟล์ 34) เปิดอยู่ → reject ไม่ให้ผ่าน
   → ถ้า Bank Reconcile ไม่ครบ 100% (ไฟล์ 35) → reject
3. แก้ไข Exception จนหมด Critical → ตรวจความพร้อมผ่าน
4. Export Accounting Pack (ไฟล์ 37) → สร้างไฟล์ 01-06 + 08 ครบ
5. ส่งสำนักงานบัญชี → status: sent_to_accountant
6. สำนักงานบัญชีถามคำถามกลับ (ไฟล์ 36) → บัญชีตอบ/แก้ไข
7. Executive ยืนยันปิดงวด → status: locked
```

## 7. Integration Test Checklist (ครอบคลุมจุดเชื่อมต่อสำคัญทั้งหมด)

| จุดเชื่อมต่อ | ไฟล์ที่เกี่ยวข้อง | ทดสอบอะไร |
|---|---|---|
| Case → Revenue | 38, 19 | Service Fee Template snapshot ถูกต้อง |
| Case → Expense | 41, 11 | สูตรคำนวณ fuel/allowance/commission ถูกต้อง |
| Expense → Compensation Approval | 41, 16 | `expense.status` enum sync กันถูกต้อง ไม่มี state แปลกปลอม |
| Expense → Payout | 16, 17 | รวมเฉพาะรายการ approved, payee verified เท่านั้น |
| Payout → Accounting | 17, 32, 33 | sync เฉพาะ completed, WHT คำนวณถูกต้อง |
| Billing → Accounting | 19, 31 | Tax Invoice เลขที่ต่อเนื่อง |
| Bank Statement → Cash Receipt / Payout Complete | 35, 31, 17 | Auto/manual match ถูกต้อง |
| ทุกรายการ → Period Lock | 13, 20, 30 | locked แล้วแก้ตรงไม่ได้ ต้องผ่าน Adjustment |
| ทุกรายการ → Export | 34, 37 | Critical exception บล็อก export ได้จริง |

## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้)

ดูรายละเอียดเชิง business ของแต่ละ scenario ที่ไฟล์ต้นทาง

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Revenue timing (รอ expense approved) แก้ปัญหา QC Outcome กระทบ Revenue ได้โดยอัตโนมัติ** ไม่ต้องจัดการ edge case ย้อนหลัง (§6.3)
- **5 E2E Scenario ครอบคลุมทั้ง pipeline**: รายรับ, รายจ่าย, QC ตีกลับ, Period Lock, Monthly Close เต็มรอบ
- **Integration Test Checklist มี 9 จุดเชื่อมต่อสำคัญ** ที่ unit test รายไฟล์ไม่ครอบคลุม (§7)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ⚠️ **ควรเพิ่ม scenario ทดสอบ Advance 5-สถานะใหม่** (pending_approval/approved/overdue/cleared/rejected) เป็น E2E test แยก เพราะยังไม่มี scenario ครอบคลุม flow นี้โดยเฉพาะ — พบระหว่าง sync กับ Batch 3

---

*เอกสารนี้เป็นไฟล์สุดท้ายในหมวด Finance Reference (22–29)*
