# 96-reports.md

# 96 — Reports (รายงานภาพรวมระบบ)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — โครงสร้างตามมาตรฐานเอกสารชุดใหม่)
> Document Level: Platform / Cross-Module Reporting — Build Spec / Implementation-ready
> เอกสารอ้างอิง: `14-finance-dashboard.md`, `19-revenue-billing-receivable.md`, `21-profitability-report.md`, `17-payroll-and-payout.md`, `15-claims-and-advances.md`, `38-case-submission.md` – `41-field-tracker-mobile.md`, `44-asset-custody-handover.md`
> Supersedes: —

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | 02/07/2569 | ออกแบบเสร็จสมบูรณ์ — รายงานครบ 4 หมวด (F/O/A/E) |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ (header/Changelog + แยก Decisions/Open Items ชัดเจน) — **เนื้อหา business logic เดิมคงไว้ครบ 100% ไม่มีการเปลี่ยนแปลง** |
| v2.2 | 15/08/2569 | **มติ PO 15/08/2569 ตอบ `[[NEEDS_DECISION]]` ตอนเริ่ม Phase 6.3 (D18)** — แก้ที่มาของ `slaAlertHours` ใน §6-O2/§6-O4: เดิมเขียนว่า "ดึงจาก slaAlertHours ใน Finance Settings (ไฟล์ 03)" ซึ่ง**ไฟล์ 03 ไม่เคยนิยามค่านี้** (§18 ระบุเองว่าตัวเลข SLA ยังไม่ตกลง) และ `02` ไม่มีคอลัมน์รองรับ ⇒ ค่าจริงอยู่ที่ `assignment_policy_settings.sla_alert_hours` (ไฟล์ `02` v4.4) ตั้งค่าที่ไฟล์ `13` §6.14 ค่าเริ่มต้น 72 ชั่วโมง (3 วัน) · เพิ่มหมายเหตุจุดเริ่มนับ (`cases.created_at`) และขอบเขตของ O1/O4 ให้ implement ได้โดยไม่ต้องเดา — **ไม่มีการเปลี่ยนสูตร/คอลัมน์ของรายงาน** |
| v2.1 | 04/07/2569 | **แก้ชื่อตารางใน data source ของ A1**: `wht_filing_period_summaries` → `wht_filing_summaries` ให้ตรงกับชื่อตารางจริงใน `02-database-schema-design.md` §9 (schema เป็น source of truth) — ไม่กระทบเนื้อหารายงาน |

ขอบเขตเอกสารนี้: โมดูลรายงานรวมศูนย์สำหรับดูภาพรวมธุรกิจ แยกเป็น 4 หมวด (การเงิน / งานติดตาม / บัญชี / Executive Dashboard) ทุกรายงานเป็น read-only ไม่มี state machine ของตัวเอง คำนวณจากข้อมูลที่มีในระบบแล้วเท่านั้น

**ไม่รวมอยู่ในไฟล์นี้**: การสร้าง/แก้ไขข้อมูลต้นทาง (ทำที่โมดูลต้นทางของแต่ละรายงานเท่านั้น), Custom Report Builder (ไม่มีในเฟสนี้)

---

## 1. Summary
โมดูลรายงานรวมศูนย์สำหรับดูภาพรวมธุรกิจ แยกเป็น 4 หมวด: การเงิน / งานติดตาม / บัญชี / Executive Dashboard
ทุกรายงานเป็น **read-only** — ไม่มี state machine ของตัวเอง คำนวณจากข้อมูลที่มีในระบบแล้ว

## 2. Purpose
ให้แต่ละ stakeholder เห็นข้อมูลที่ตัดสินใจได้เลย โดยไม่ต้องไล่ดูทีละโมดูล

## 3. In Scope
- หมวด F: รายงานการเงิน (Finance Reports)
- หมวด O: รายงานงานติดตามทรัพย์ (Operational Reports)
- หมวด A: รายงานบัญชี (Accounting Reports)
- หมวด E: Executive Dashboard

## 4. Out of Scope
- GL / P&L เต็มรูป (ไม่ใช่ระบบบัญชีเต็มรูป)
- Tax Filing (อยู่นอกระบบ)
- Real-time ทุก millisecond — ใช้ cache รายวัน + ปุ่ม refresh

## 5. Actors & Responsibilities
| Actor | รายงานที่เข้าถึงได้ | Scope |
|-------|-------------------|-------|
| Executive | ทั้งหมด | Organization |
| การเงิน (Finance) | F1-F5, E1 | Organization |
| บัญชี (Accounting) | A1-A4, E1 | Organization |
| ผู้จัดการทีม (Manager) | O1-O5 ของทีมตัวเอง | Team scope |
| Superadmin | ทั้งหมด | Global |

---

## 6. รายงานทั้งหมด

### หมวด F — รายงานการเงิน

#### F1 — กำไรขั้นต้น (Gross Profit Report)
> มีสเปคแล้วในไฟล์ 21 — ย้ายมาอยู่ในเมนูรายงานด้วย (ยังอยู่ใน Finance tab ด้วย)

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | Revenue (ไฟล์ 19) + Expense (ไฟล์ 15-17) |
| มิติ | แยกตามบริษัทไฟแนนซ์ / ทีม |
| ช่วงเวลา | เดือน / ไตรมาส / ปี |
| KPI | Revenue, Direct Cost, Gross Profit, Margin % |
| Drill-down | คลิกดูรายละเอียดรายเคสในมิตินั้น |

---

#### F2 — สรุปรายได้ (Revenue Summary)

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | Revenue records + BillingBatch (ไฟล์ 19) |
| มิติ | รายเดือน / รายไตรมาส / รายบริษัท |
| KPI | ยอดรายได้รวม, จำนวนเคส, Revenue per case เฉลี่ย |
| Chart | Bar chart เปรียบเทียบรายเดือน |
| ตาราง | รายบริษัทไฟแนนซ์: รายได้รวม, จำนวนเคส, เคส success/fail, % success |

**Columns:**
```
บริษัทไฟแนนซ์ | รายได้รวม | เคสทั้งหมด | สำเร็จ | ไม่สำเร็จ | Revenue/เคส | เปลี่ยนแปลง MoM
```

---

#### F3 — อายุหนี้ลูกค้า (AR Aging Report)

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | BillingBatch ที่ status != paid (ไฟล์ 19) |
| Aging Buckets | ตามที่ตั้งใน Finance Settings §6.1 (default: 0-30 / 31-60 / 61-90 / 90+ วัน) |
| นับจาก | due_date ของ BillingBatch |

**Columns:**
```
บริษัทไฟแนนซ์ | ยอดรวมค้าง | 0-30 วัน | 31-60 วัน | 61-90 วัน | 90+ วัน | วันครบกำหนดล่าสุด
```

**Business Rule:**
- ยอดที่เกิน 60 วัน highlight สีเหลือง
- ยอดที่เกิน 90 วัน highlight สีแดง
- แสดงยอดรวมทั้งหมดที่ค้างชำระด้านบนเป็น KPI card

---

#### F4 — สรุปค่าตอบแทน (Compensation Summary)

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | PayoutBatch + PayoutBatchItem (ไฟล์ 17) + Expense (ไฟล์ 15-16) |
| มิติ | รายทีม / รายพนักงาน / รายเดือน |
| KPI | ค่าตอบแทนรวม, WHT รวม, Net จ่ายจริง |

**ตาราง — รายทีม:**
```
ทีม | ประเภท | จำนวนคน | Gross รวม | WHT รวม | Net รวม | จำนวนเคสที่ปิด
```

**ตาราง — รายพนักงาน (drill-down):**
```
ชื่อพนักงาน | จำนวนเคส | Commission | ค่าน้ำมัน | เบี้ยเลี้ยง | รวม Gross | WHT | Net
```

---

#### F5 — เงินทดรองค้างเคลียร์ (Advance Overdue Report)

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | Advance ที่ status = approved และ due_clear_date < today (ไฟล์ 15) |
| KPI | จำนวน Advance ค้าง, ยอดรวม |

**Columns:**
```
พนักงาน | ทีม | วันที่อนุมัติ | กำหนดเคลียร์ | ยอด | เกินกำหนด (วัน) | สถานะ
```

**Business Rule:**
- เกินกำหนด highlight สีแดง
- ระบบบล็อก Advance ใหม่ถ้ายังมีค้างอยู่ (ตามไฟล์ 15)

---

### หมวด O — รายงานงานติดตามทรัพย์

#### O1 — อัตราความสำเร็จ (Success Rate Report)

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | Case outcomes (ไฟล์ 38-41) |
| มิติ | รายทีม / รายบริษัทไฟแนนซ์ / รายเดือน |
| KPI | Total cases, Success rate %, Fail rate % |
| ขอบเขต | เคสที่ **รับเข้าระบบ (`created_at`) ในช่วงที่เลือก** — "เคสทั้งหมด" จึงรวมเคสที่ยังไม่ปิด ส่วน Success rate ตัดเคส open ออกจากตัวหารตาม §13 |

**ตาราง:**
```
ทีม/บริษัท | เคสทั้งหมด | สำเร็จ | ไม่สำเร็จ | Success Rate | เปลี่ยนแปลง MoM
```

**Chart:** Stacked bar chart — success vs fail รายเดือน

---

#### O2 — ประสิทธิภาพทีม / SLA (Team Performance Report)

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | Case created_at → closed_at, CheckIn (ไฟล์ 38-41) |
| KPI | เวลาเฉลี่ยปิดงาน (TAT), % เคสที่ปิดภายใน SLA |
| SLA threshold | `assignment_policy_settings.sla_alert_hours` (ไฟล์ 02) — ตั้งค่าที่ไฟล์ 13 §6.14 · default 72 ชม. (มติ PO 15/08/2569 · D18) |
| ขอบเขต | เคสที่ **ปิดในช่วงที่เลือก** เท่านั้น (เคสที่ยังไม่ปิดไม่มี TAT — ดู O4) |

**ตาราง:**
```
ทีม | เคสทั้งหมด | TAT เฉลี่ย (วัน) | เร็วสุด | ช้าสุด | ภายใน SLA | เกิน SLA
```

---

#### O3 — ปริมาณงานรายพนักงาน (Workload Report)

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | CaseAssignment (ไฟล์ 40) |
| KPI | เคสที่ได้รับมอบหมาย / ปิดแล้ว / ค้างอยู่ |

**ตาราง:**
```
พนักงาน | ทีม | เคสรับทั้งหมด | ปิดสำเร็จ | ปิดไม่สำเร็จ | ค้างอยู่ | Success Rate
```

---

#### O4 — เคสค้างเกิน SLA (SLA Breach Report)

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | Case ที่ open อยู่และ created_at + slaAlertHours < now (ไฟล์ 38 · เกณฑ์จากไฟล์ 13 §6.14) |
| KPI | จำนวนเคสเกิน SLA, ยอดรวมค่าบริการที่ค้าง |
| นิยาม "open" | `pending_review` / `need_info` / `approved` / `active` / `pending_recycle_review` — `draft` (ยังไม่ส่ง) และ `rejected` ไม่นับ · ครบเกณฑ์พอดี **ยังไม่ถือว่าเกิน** |

**Columns:**
```
Case Ref | บริษัทไฟแนนซ์ | พนักงาน | ทีม | วันที่รับ | เกิน SLA (วัน) | ประมาณการรายได้
```

---

#### O5 — สรุปคลังสินค้า (Warehouse Summary)

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | Asset status + HandoverLot (ไฟล์ 44) |
| KPI | เครื่องรอรับเข้า, ในคลัง, รอส่งมอบ, ส่งมอบแล้ว (เดือนนี้) |

**ตาราง:**
```
บริษัทไฟแนนซ์ | รอรับเข้า | ในคลัง | รอส่งมอบ | ส่งมอบแล้ว (เดือนนี้)
```

---

### หมวด A — รายงานบัญชี

#### A1 — สรุป WHT รายเดือน (WHT Summary)
> มีข้อมูลในไฟล์ 33 แล้ว — สร้างรายงานรวมหลายเดือน

**Columns:**
```
รอบเดือน | ภ.ง.ด.3 | ภ.ง.ด.53 | รวม WHT | กำหนดยื่น | สถานะ
```

---

#### A2 — สรุปใบกำกับภาษี (Tax Invoice Summary)

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | TaxInvoice (ไฟล์ 31) |
| มิติ | รายเดือน / รายบริษัท |

**Columns:**
```
รอบเดือน | จำนวนใบ | ยอดรวมก่อน VAT | VAT รวม | ยอดรวมสุทธิ | ยกเลิก (ใบ)
```

---

#### A3 — สถานะ Export Accounting Pack (Export History)
> มีในไฟล์ 37 แล้ว — เพิ่ม summary รายปีในหน้ารายงาน

**Columns:**
```
รอบบัญชี | Version | ส่งเมื่อ | ส่งโดย | สถานะ | จำนวนไฟล์ | เอกสารแนบ
```

---

#### A4 — Exception Summary รายงวด

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | Exception (ไฟล์ 34) ทุกรอบบัญชี |

**Columns:**
```
รอบบัญชี | Critical | Warning | Info | แก้ไขแล้ว | ยังเปิดอยู่
```

---

### หมวด E — Executive Dashboard

#### E1 — KPI ภาพรวม (Executive Summary)

**KPI Cards (แถวบน):**
```
รายได้รวม YTD | Gross Profit YTD | Margin % | เคสทั้งหมด | Success Rate | AR ค้างรับ
```

**Charts:**
- Revenue trend รายเดือน (12 เดือนย้อนหลัง) — Line chart
- Success rate trend รายเดือน — Line chart
- Top 5 บริษัทไฟแนนซ์ตามรายได้ — Bar chart

---

#### E2 — Scorecard รายบริษัทไฟแนนซ์

**ตาราง:**
```
บริษัท | เคสทั้งหมด | Success Rate | Revenue | Gross Profit | Margin % | AR ค้าง | เทรนด์ (↑↓)
```

---

#### E3 — Scorecard รายทีม

**ตาราง:**
```
ทีม | ประเภท | พนักงาน | เคสทั้งหมด | Success Rate | TAT เฉลี่ย | ต้นทุน | กำไรขั้นต้น
```

---

## 7. Data Sources (ดึงข้อมูลจากไหน)

| รายงาน | Tables หลัก | Join กับ |
|--------|------------|---------|
| F1 | revenues, payout_batch_items | cases, finance_companies, teams |
| F2 | revenues, billing_batches | finance_companies |
| F3 | billing_batches | finance_companies |
| F4 | payout_batches, payout_batch_items | payee_profiles, teams, users |
| F5 | advances | payee_profiles, users, teams |
| O1 | cases | finance_companies, teams, case_assignments |
| O2 | cases, check_ins | case_assignments, users, teams |
| O3 | case_assignments | users, teams, cases |
| O4 | cases | case_assignments, users, teams |
| O5 | assets, handover_lots | finance_companies |
| A1 | wht_filing_summaries | wht_certificates |
| A2 | tax_invoices | billing_batches, finance_companies |
| A3 | export_records | accounting_periods |
| A4 | exceptions | accounting_periods |
| E1-E3 | aggregate จากทุก table ข้างต้น | — |

---

## 8. Caching Strategy

| รายงาน | Refresh Policy |
|--------|---------------|
| F1, F2, F3, E1-E3 | Cache รายวัน (refresh เที่ยงคืน) + ปุ่ม "รีเฟรชตอนนี้" |
| F4, F5 | Real-time (ข้อมูลน้อย query เร็ว) |
| O1-O5 | Cache รายชั่วโมง |
| A1-A4 | Real-time (ดึงจากข้อมูลที่บันทึกแล้ว ไม่ต้องคำนวณมาก) |

---

## 9. API Endpoints

```
GET /api/reports/finance/gross-profit        ?period=&dimension=company|team
GET /api/reports/finance/revenue-summary     ?period=&groupBy=month|quarter|company
GET /api/reports/finance/ar-aging            ?asOf=
GET /api/reports/finance/compensation        ?period=&groupBy=team|employee
GET /api/reports/finance/advance-overdue

GET /api/reports/operations/success-rate     ?period=&dimension=team|company
GET /api/reports/operations/team-performance ?period=&teamId=
GET /api/reports/operations/workload         ?period=&teamId=
GET /api/reports/operations/sla-breach
GET /api/reports/operations/warehouse-summary ?period=

GET /api/reports/accounting/wht-summary      ?year=
GET /api/reports/accounting/tax-invoice      ?period=
GET /api/reports/accounting/export-history   ?year=
GET /api/reports/accounting/exception-summary

GET /api/reports/executive/kpi-summary       ?period=
GET /api/reports/executive/company-scorecard ?period=
GET /api/reports/executive/team-scorecard    ?period=
```

---

## 10. Permission Matrix

| รายงาน | Finance | Accounting | Manager (ทีมตัวเอง) | Executive | Superadmin |
|--------|---------|-----------|---------------------|-----------|-----------|
| F1-F5 | ✅ | ❌ | ❌ | ✅ | ✅ |
| O1-O5 | ❌ | ❌ | ✅ (scope) | ✅ | ✅ |
| A1-A4 | ❌ | ✅ | ❌ | ✅ | ✅ |
| E1-E3 | ❌ | ❌ | ❌ | ✅ | ✅ |

---

## 11. UI / UX Rules

- ทุกรายงานมี **Date Range Picker** (preset: เดือนนี้, เดือนที่แล้ว, ไตรมาสนี้, ปีนี้ + custom)
- ทุกรายงานมีปุ่ม **Export Excel** และ **Export PDF**
- ตารางทุกตัวมี **pagination** หรือ **virtual scroll** ถ้า row > 100
- KPI cards มี **เปรียบเทียบกับเดือนก่อน** (MoM %) แสดงเป็น ↑↓ badge
- Loading state ใช้ skeleton placeholder
- ข้อมูลว่างแสดง empty state พร้อมคำแนะนำ

---

## 12. Validation & Error Handling

| Code | Condition | Behavior |
|------|-----------|----------|
| `REPORT_NO_DATA` | ไม่มีข้อมูลในช่วงที่เลือก | แสดง empty state บอกให้เลือก range ใหม่ |
| `REPORT_DATE_INVALID` | date range ผิดรูปแบบ | inline error |
| `REPORT_PERMISSION_DENIED` | role ไม่มีสิทธิ์ดูรายงานนั้น | 403 + UI redirect |
| `REPORT_CACHE_STALE` | cache เกิน 24 ชั่วโมง | แสดงวันที่ refresh ล่าสุด + ปุ่ม refresh |

---

## 13. Acceptance Criteria

- F1: ตัวเลข Revenue/Cost/Profit ตรงกับข้อมูลในไฟล์ 19 และ 17 เสมอ
- F3: AR Aging bucket ตรงกับ due_date จริงของ BillingBatch
- F5: Advance ที่เกินกำหนดแสดงครบ ไม่หาย ไม่ซ้ำ
- O1: Success rate คำนวณจาก closed_success / (closed_success + closed_fail) เท่านั้น ไม่รวม open cases
- O2: TAT = (closed_at - created_at) เป็น calendar days รวมวันหยุด
- E1: KPI ทุกตัว refresh ไม่เกิน 24 ชั่วโมง พร้อมแสดงวันเวลา refresh ล่าสุด
- Export: ทุกรายงาน export ได้ถูกต้องตรงกับ UI

---

## 14. Test Cases

| Test Case | Expected |
|-----------|---------|
| F3: BillingBatch due 30 วันที่แล้ว | แสดงในช่อง "31-60 วัน" ถูกต้อง |
| F5: Advance due วันนี้ | ยังไม่ขึ้น overdue (นับตั้งแต่วันถัดไป) |
| O1: เคส open ไม่ถูกนับ success/fail | success rate คำนวณจาก closed เท่านั้น |
| O2: TAT ข้ามเดือน | นับ calendar days ถูกต้อง |
| Permission: Manager ดู O1 | เห็นเฉพาะทีมตัวเอง ไม่เห็นทีมอื่น |
| Permission: Finance ดู E1 | ได้รับ 403 |
| Export F2 Excel | ไฟล์มีข้อมูลตรงกับ UI ทุก row |

---

## 15. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **ทุกรายงานเป็น read-only ไม่มี state machine ของตัวเอง** — คำนวณจากข้อมูลที่มีในระบบแล้วเท่านั้น ไม่สร้าง/แก้ไขข้อมูลต้นทาง (§1)
- **Refresh Policy แยกตามความหนักของ query**: F1/F2/F3/E1-E3 cache รายวัน (refresh เที่ยงคืน + ปุ่มรีเฟรชตอนนี้), F4/F5 real-time (ข้อมูลน้อย), O1-O5 cache รายชั่วโมง, A1-A4 real-time (§8)
- **Chart library: Recharts** (อยู่ใน tech stack Next.js อยู่แล้ว) — **Export Excel: SheetJS (xlsx)** — **Export PDF: @react-pdf/renderer หรือ Puppeteer server-side** (§15 เดิม)
- **Permission scope ตาม role**: Manager เห็นเฉพาะทีมตัวเอง, Finance ไม่เข้าถึงรายงาน Executive ได้ (§10)

## 16. สิ่งที่ยังต้องตัดสินใจ (Open Items)
- ไม่มี Open Item — ข้อมูลทุกตัวมีอยู่แล้วในระบบ พร้อม implement
