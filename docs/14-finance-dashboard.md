# 14-finance-dashboard.md

# 14 — Finance Dashboard (ภาพรวมการเงิน)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Finance Module
> เอกสารอ้างอิง: `15-claims-and-advances.md`, `16-compensation-approval.md`, `17-payroll-and-payout.md`, `19-revenue-billing-receivable.md`, `21-profitability-report.md`, `34-accounting-document-checklist-exceptions.md`

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — KPI 4 ตัว + Exception aggregation |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |

ขอบเขตเอกสารนี้: หน้าแรกของโมดูลการเงิน — สรุป KPI สำคัญ 4 ตัว และรายการ Exception ที่ต้องจัดการเร่งด่วน เป็น read-only aggregation view

**ไม่รวมอยู่ในไฟล์นี้**: รายละเอียดเชิงลึกของแต่ละ KPI (ดูไฟล์ที่เกี่ยวข้องโดยตรง: 15-21), การจัดการ Exception จริง (ทำที่ `34-accounting-document-checklist-exceptions.md` หรือโมดูลต้นทาง — หน้านี้แค่แสดงสรุปและลิงก์ไปดู)

---

## 1. Summary

หน้าแรกของโมดูลการเงิน — สรุป KPI สำคัญและรายการ Exception ที่ต้องจัดการเร่งด่วน

## 2. Purpose

ให้การเงินเห็นภาพรวมสถานะเงินสดและปัญหาที่ค้างอยู่ได้ในหน้าเดียว ไม่ต้องไปไล่ดูทีละโมดูล

## 3. In Scope

- KPI: เงินรออนุมัติ, เงินรอจ่าย, เงินค้างรับ (AR), กำไรขั้นต้นเดือนนี้
- รายการ Exception (Alerts) ที่ต้องจัดการ — รวมจากทุกโมดูล (claims ผิดปกติ, ข้อมูลไม่ครบ, ฯลฯ)

## 4. Out of Scope

- รายละเอียดเชิงลึกของแต่ละ KPI (ดูไฟล์ที่เกี่ยวข้องโดยตรง: 15-21)
- การจัดการ Exception จริง (ทำที่ไฟล์ 34 หรือโมดูลต้นทาง — หน้านี้แค่แสดงสรุปและลิงก์ไปดู)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| การเงิน (Finance) | ดูภาพรวม, คลิกเข้าไปจัดการ Exception | Full |
| ผู้บริหาร (Executive) | ดูภาพรวมเพื่อตัดสินใจระดับองค์กร | Read-only |

## 6. Core Concepts

### 6.1 KPI Cards

| KPI | คำนวณจาก |
|---|---|
| เงินรออนุมัติ | ผลรวม Claim ที่ `status != approved/rejected` (ไฟล์ 15/16) |
| เงินรอจ่าย | ผลรวม `net_amount` ของ Payout Batch ที่ยังไม่ `completed` (ไฟล์ 17) |
| เงินค้างรับ (AR Aging) | ผลรวม `total_amount - received_amount` ของ Billing Batch ที่ยังไม่ `paid` (ไฟล์ 19) |
| กำไรขั้นต้นเดือนนี้ | Revenue เดือนนี้ - ต้นทุนตรงเดือนนี้ (ดูไฟล์ 21 สำหรับสูตรเต็ม) |

### 6.2 Exception Severity Levels

ใช้ pattern เดียวกันทั้งระบบ (ดูไฟล์ 34 สำหรับรายละเอียดเต็ม):

- `info` — ข้อมูลทั่วไป ไม่บล็อกอะไร
- `warning` — ควรแก้ไข แต่ไม่บล็อกการทำงาน
- `critical` — ต้องแก้ไขก่อน — บล็อกการ Export Accounting Pack (ไฟล์ 30) ถ้ายังเปิดอยู่

## 7. Data Entities / Required Objects

หน้านี้เป็น **read-only aggregation view** ไม่มี entity ของตัวเอง — ดึงข้อมูลจากไฟล์ 15/16/17/19/21/34 ทั้งหมด

## 8. UI / UX Rules

อ้างอิงจาก `finance.html`:

- Grid 4 KPI card บนสุด (สีต่างกันตามความหมาย: amber=รออนุมัติ, blue=รอจ่าย, red=ค้างรับ, emerald=กำไร)
- ตาราง "Alerts ที่ต้องจัดการ (Exceptions)" ด้านล่าง: ระดับ (badge สี), รายการ, ผู้รับผิดชอบ, ปุ่ม "ดูรายละเอียด" (ลิงก์ไปยังไฟล์ต้นทางของ exception นั้น)

## 9. Workflow / Lifecycle

ไม่มี state machine ของตัวเอง — เป็นมุมมองสรุปอย่างเดียว

## 10. Security / Control Rules

- ไม่มีการแก้ไขข้อมูลในหน้านี้โดยตรง — ทุก action ลิงก์ไปยังไฟล์ต้นทาง

## 11. Validation & Error Handling

ไม่มี (read-only view)

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| ดู Dashboard | การเงิน, บัญชี, ผู้บริหาร | read-only ทั้งหมด |

## 13. Audit Log Requirements

ไม่มี (ไม่มีการเขียนข้อมูล)

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/finance/dashboard-kpi | ดึง KPI ทั้ง 4 ตัว |
| GET | /api/finance/exceptions | ดึงรายการ exception ทั้งระบบ (aggregate จากไฟล์ 34) |

## 15. Acceptance Criteria

- KPI คำนวณถูกต้องตรงกับข้อมูลจริงในไฟล์ต้นทาง
- คลิก Exception แล้วไปถึงหน้าที่เกี่ยวข้องได้จริง

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| KPI ตรงกับข้อมูลจริง | เปรียบเทียบ "เงินรออนุมัติ" กับผลรวมจริงในไฟล์ 15 | ตัวเลขตรงกัน |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **หน้านี้เป็น read-only aggregation view เท่านั้น** ไม่มี entity/business logic ของตัวเอง — ดึงข้อมูลจากไฟล์ 15/16/17/19/21/34 ทั้งหมด (§7, §10)
- **Exception Severity 3 ระดับใช้ pattern เดียวกันทั้งระบบ**: info/warning/critical — critical บล็อก Export Accounting Pack (§6.2)
- **ทุก action ในหน้านี้ลิงก์ไปยังไฟล์ต้นทางเท่านั้น** ไม่มีการแก้ไขข้อมูลตรงที่หน้านี้ (§10)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item — เป็นหน้ารวมข้อมูลที่อ้างอิงไฟล์อื่นทั้งหมด ไม่มี business logic ของตัวเอง

---

*เอกสารนี้เป็นไฟล์แรกในหมวด Finance Core (14–21) ต่อด้วย `15-claims-and-advances.md`*
