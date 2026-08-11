# 21-profitability-report.md

# 21 — Profitability Report (รายงานกำไรและต้นทุน)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Finance Core Module
> เอกสารอ้างอิง: `19-revenue-billing-receivable.md`, `11-compensation.md`, `16-compensation-approval.md`, `38-case-submission.md` §6.5 (projected_revenue_amount — คนละอันกับรายงานนี้)
> หมายเหตุ: memory ของ Product Owner ระบุว่า "ประมาณการรายได้ในไฟล์ 38 คำนวณบนฐาน 100% สำเร็จเสมอ ไม่มี % ความสำเร็จมาคูณลด" — ไฟล์นี้คือรายงาน**ผลจริงหลังเกิดขึ้นแล้ว** (actual) ต่างจากไฟล์ 38 ที่เป็นประมาณการ (projection) ก่อนเริ่มงาน ไม่ใช่ฟีเจอร์เดียวกัน

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Gross Profit actual vs projection distinction |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |

ขอบเขตเอกสารนี้: รายงานกำไรขั้นต้น (Gross Profit) แยกตามมิติต่างๆ (บริษัทไฟแนนซ์, ทีม) เปรียบเทียบรายได้กับต้นทุนตรงที่**เกิดขึ้นจริงแล้ว** (actual ไม่ใช่ projection)

**ไม่รวมอยู่ในไฟล์นี้**: ต้นทุนทางอ้อม (overhead, ค่าเช่าสำนักงาน ฯลฯ) — รายงานนี้ดูแค่ต้นทุนตรง (Direct Cost) เท่านั้น ไม่ใช่ P&L เต็มรูปขององค์กร, ประมาณการรายได้ก่อนเริ่มงาน (ดู `38-case-submission.md` §6.5 — เป็น projection คนละอันกับรายงานนี้)

---

## 1. Summary

รายงานกำไรขั้นต้น (Gross Profit) แยกตามมิติต่างๆ (บริษัทไฟแนนซ์, ทีม) เปรียบเทียบรายได้กับต้นทุนตรงที่เกิดขึ้นจริง

## 2. Purpose

ให้ผู้บริหารเห็นว่าแต่ละบริษัทคู่ค้า/ทีมงาน "คุ้มทุน" แค่ไหน — ใช้ตัดสินใจเชิงธุรกิจ (เช่น เจรจาสัญญาใหม่ กับบริษัทที่ margin ต่ำ หรือปรับ workload ของทีมที่ cost สูง)

## 3. In Scope

- คำนวณ Revenue, Direct Cost, Gross Profit, Margin % แยกตามมิติ (บริษัท/ทีม)
- Drill-down ดูรายละเอียดต้นทุนเชิงลึกต่อมิติ

## 4. Out of Scope

- ต้นทุนทางอ้อม (overhead, ค่าเช่าสำนักงาน ฯลฯ) — รายงานนี้ดูแค่ **ต้นทุนตรง** (Direct Cost) ที่ผูกกับเคส/ทีมได้ชัดเจนเท่านั้น ไม่ใช่ P&L เต็มรูปขององค์กร
- ประมาณการรายได้ก่อนเริ่มงาน (อยู่ไฟล์ 38 — เป็น projection คนละอันกับรายงานนี้ที่เป็น actual)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| การเงิน, ผู้บริหาร (Executive) | ดูรายงาน, เจาะลึกข้อมูล | Read-only (เป็น analytical report ไม่มีการแก้ไขข้อมูล) |

## 6. Core Concepts

### 6.1 สูตรคำนวณ (Actual — ผลจริงที่เกิดขึ้นแล้ว)

- **Revenue** = ผลรวม Revenue Record ที่เกิดจริงแล้ว (ไฟล์ 19) ของมิตินั้นในรอบเวลาที่เลือก
- **Direct Cost** = ผลรวมค่าตอบแทน (ไฟล์ 11/16 — fuel, allowance, commission) ของมิตินั้นในรอบเวลาเดียวกัน — **เฉพาะต้นทุนที่ผูกกับเคส/ทีมโดยตรง** ไม่รวมค่าใช้จ่ายทั่วไปขององค์กร
- **Gross Profit** = `Revenue - Direct Cost`
- **Margin %** = `Gross Profit / Revenue × 100`

> **สำคัญ — ต่างจากไฟล์ 38**: รายงานนี้คำนวณจากเคสที่ "เกิดผลจริงแล้ว" (ปิดงานแล้ว มี Revenue/Cost จริง) ไม่ใช่คำนวณบนฐาน 100% สำเร็จแบบประมาณการในไฟล์ 38 — เคสที่ `closed_fail` และไม่มี SUCCESS_FEE เกิดขึ้น จะมี Direct Cost (ค่าน้ำมัน/เบี้ยเลี้ยงที่จ่ายไปแล้ว) แต่ไม่มี Revenue เลย ทำให้ลด Margin ของมิตินั้นลงจริง — เป็นภาพที่ตรงความจริงตามที่รายงานกำไรควรเป็น

### 6.2 มิติการวิเคราะห์ (Analysis Dimension)

ตาม UI: แบ่งตาม **บริษัทไฟแนนซ์** และ **ทีม** — เลือกได้ว่าจะดูมิติไหน

## 7. Data Entities / Required Objects

หน้านี้เป็น **read-only analytical view** ดึงข้อมูลจากไฟล์ 19 (Revenue) และไฟล์ 11/16 (Cost) มาคำนวณ ไม่มี entity ของตัวเอง

## 8. UI / UX Rules

อ้างอิงจาก `finance.html` (`profit` tab):

- KPI cards บนสุด: Revenue, Direct Cost, Gross Profit (พร้อม Margin % เป็น sub-text)
- Table แยกตามมิติ: ชื่อมิติ (บริษัท/ทีม), Revenue, Cost, Gross Profit (เด่นสีเขียว), Margin %, ปุ่ม "เจาะลึก" (drill-down)
- เลือกช่วงเวลา (เดือน/ไตรมาส/ปี) ได้

## 9. Workflow / Lifecycle

ไม่มี state machine — เป็นรายงานสรุปจากข้อมูลที่มีอยู่แล้ว คำนวณ real-time หรือ cache แล้ว refresh ตามรอบ (ดู Open Items)

## 10. Security / Control Rules

- read-only ทั้งหมด ไม่มีความเสี่ยงด้านการแก้ไขข้อมูล

## 11. Validation & Error Handling

ไม่มี (read-only view)

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| ดูรายงาน | การเงิน, ผู้บริหาร | read-only |

## 13. Audit Log Requirements

ไม่มี (ไม่มีการเขียนข้อมูล)

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/reports/profitability | ดึงรายงานตามมิติ/ช่วงเวลาที่เลือก |
| GET | /api/reports/profitability/:dimension_id/drilldown | รายละเอียดเจาะลึก |

## 15. Acceptance Criteria

- สูตรคำนวณ Revenue/Cost/Margin ถูกต้องตรงกับข้อมูลจริง
- Drill-down แสดงรายละเอียดที่สอดคล้องกับยอดสรุป

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| เคสไม่สำเร็จลด margin จริง | มีเคส closed_fail ที่มี Direct Cost แต่ไม่มี Revenue (SUCCESS_FEE model) | Margin ของมิตินั้นลดลงจริงในรายงาน ไม่ถูกตัดออกหรือมองข้าม |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **รายงานนี้คือ Actual ไม่ใช่ Projection** — คนละแนวคิดกับ `projected_revenue_amount` ในไฟล์ 38 ที่คำนวณบนฐาน 100% สำเร็จเสมอ (§6.1, หมายเหตุ header)
- **เคส closed_fail ที่ไม่มี Revenue แต่มี Direct Cost ต้องลด Margin จริงในรายงาน** ไม่ถูกกรองออกหรือมองข้าม — สะท้อนความเป็นจริงทางธุรกิจ (§6.1, test case)
- **Direct Cost เท่านั้น ไม่รวม overhead** — รายงานนี้ไม่ใช่ P&L เต็มรูปขององค์กร (§4)
- **Caching strategy**: refresh รายวัน (เที่ยงคืน) เป็นค่าเริ่มต้น พร้อมปุ่ม "รีเฟรชตอนนี้" สำหรับ real-time — ปรับได้อิสระตอน implement โดยไม่กระทบ business logic (§9, §18)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — ใช้แนวทาง cache รายวัน (refresh ทุกเที่ยงคืน) เป็นค่าเริ่มต้นเพื่อประสิทธิภาพ พร้อมปุ่ม "รีเฟรชตอนนี้" ให้กดคำนวณ real-time ได้เมื่อต้องการดูข้อมูลล่าสุดทันที — รายละเอียด caching strategy ปรับได้อิสระตอน implement จริงโดยไม่กระทบ business logic

---

*เอกสารนี้เป็นไฟล์สุดท้ายในหมวด Finance Core (14–21)*
