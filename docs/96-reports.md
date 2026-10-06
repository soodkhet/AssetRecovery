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
| v2.3 | 03/10/2569 | **Success Rate ทุกรายงาน (O1/O3/E1–E3/F1)** ตามมติ PO 03/10/2569 (UAT Q20 · BUG-060): นิยามเดียว = ปิดสำเร็จ ÷ เคสที่ปิดแล้ว · ยังไม่มีเคสปิด = "N/A" (รวม MoM — เทียบไม่ได้ ไม่ใช่ ↓ 100%) — O3 เดิมหารด้วยเคสที่รับทั้งหมดตาม `40` §6.2 เดิม ปรับให้ตรงกันแล้ว |
| v2.4 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U9)** — กลไกแคชของ §8 ย้ายจากหน่วยความจำของ process ไปเก็บใน Postgres (ตาราง `report_cache_entries` — `02` v4.16) เพราะบน Vercel หลาย instance การล้างแคช (เช่นหลังอนุมัติ Adjustment — BUG-128) มีผลแค่ instance เดียว · **นโยบายความสดเดิมทุกประการ** (รายวันหมดเที่ยงคืนไทย / รายชั่วโมง / real-time ไม่แคช · ปุ่มรีเฟรช cooldown 5 นาที — ตอนนี้นับร่วมทุก instance) · คีย์ผูก `organization_id` + ขอบเขตทีม/บริษัทของผู้เรียกเหมือนเดิม |
| v2.6 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U44 · รีวิว C1)**: §6-F2 เพิ่ม**บรรทัดกระทบยอดกับใบกำกับภาษี** ใต้ตาราง (จอ/PDF/Excel ชุดเดียวกัน) — ยอดตามใบกำกับ − ใบลดหนี้ + ใบเพิ่มหนี้ ∓ Adjustment ที่รอใบลดหนี้/ใบเพิ่มหนี้ (+ รายได้ที่ยังไม่ออกใบ) = ยอดรายงาน · ไม่ลงแสดงผลต่าง · เฉพาะผู้ดูระดับองค์กร |
| v2.7 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U55 · O30)**: §6-F2 % สำเร็จ = สำเร็จ ÷ (สำเร็จ + ไม่สำเร็จ) โดย**นับเคส `closed_fail` ที่ปิดในช่วงรายงาน** (จัดกลุ่มตามวันที่ปิดเคส เวลาไทย / บริษัทของเคส) — เดิมนับเฉพาะเคสที่มีรายได้ ⇒ เคสไม่สำเร็จ (ไม่มีรายได้) หลุดตัวหาร CO2 ขึ้น 100% แทน 50% · "เคสทั้งหมด"/"Revenue/เคส" ยังคิดจากเคสที่มีรายได้ · ตัวหาร 0 = "N/A" · พอร์ทัล (`97` §6.5) ใช้นิยามเดียวกัน (เคสของบริษัทตัวเอง) · **(U56 · O31/O32)** §5 แก้ให้ตรง §10: การเงิน/บัญชีเปิด E1 ไม่ได้ (403) + เพิ่มแถวหัวหน้าทีม (เห็นหมวด O เฉพาะทีมที่ตนสังกัด/เป็นหัวหน้า) |
| v2.8 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U69)**: §6-F2 นับ **Adjustment ระดับรอบวางบิล** (ผูกรอบ ไม่ผูกรายได้) ด้วย — กระจายลงรายได้ทุกใบในรอบตามสัดส่วนยอดก่อน VAT ของเคส (largest remainder วิธีเดียวกับกราฟรายได้พอร์ทัล U14 · เรียงตาม id ให้ผลคงที่) แล้วนับเฉพาะส่วนของรายได้ในช่วงรายงาน · บรรทัดกระทบยอด U44 ใช้ส่วนแบ่งชุดเดียวกัน ⇒ ลงตัวในกรณีนี้ (ไม่ใช่สาเหตุของผลต่างอีกต่อไป) · pure module `lib/reports/finance/batch-adjustments.ts` |
| v2.9 | 06/10/2569 | **มติ PO 06/10/2569 (U96 #18)** — §6-F5 เปลี่ยนจาก "เงินทดรองค้างเคลียร์" เป็น **"อายุเงินทดรองคงค้าง"** (แทนตัวเดิม · path/สิทธิ์/โหมดแคชเดิม): ต่อใบ = วันจ่าย, ยอดจ่าย, ใช้แล้ว, คืนแล้ว, **คงค้าง** (= ยอดคืนค้าง `22` §6.14 — รวมใบที่เคลียร์แล้วแต่ยังรับคืนไม่ครบ), อายุ (วันนับจากวันจ่าย — รอบจ่ายแรกที่โอนแล้ว · ยังไม่จ่ายนับจากวันอนุมัติ) + ช่วงอายุ **0–30 / 31–60 / 61–90 / 90+ วัน**, สถานะเกินกำหนดเคลียร์ · มุมมอง `?groupBy=advance\|payee` (รายใบ / รายพนักงาน แยกยอดตามช่วงอายุ) · KPI: จำนวน/ยอดคงค้าง/คงค้างเกินกำหนด/คงค้าง 90+ วัน · ส่งออก Excel/PDF ตามกลไกกลาง · §7 · §13 · §14 ปรับตาม |
| v2.10 | 06/10/2569 | **มติ PO 06/10/2569 (U109)** — §6-F4 เพิ่มคอลัมน์ **"ภาษีที่บริษัทออกให้"** แยกจาก "ค่าตอบแทน" (รายทีม/รายพนักงาน + แถวรวม + KPI) · ค่าตอบแทน/ช่องย่อย/ค่าใช้จ่ายตามใบเสร็จ = เงินได้จริง (ไม่รวมภาษีที่ออกให้) · ช่อง WHT = **ที่หักจากผู้รับ** · Gross = ค่าตอบแทน + ภาษีที่บริษัทออกให้ + ค่าใช้จ่ายตามใบเสร็จ · Net = Gross − ภาษีที่บริษัทออกให้ − WHT · แยกจาก snapshot `payout_batch_items.wht_condition` (ไม่คิดภาษีใหม่) · Export Excel/PDF ตามกลไกกลาง |
| v2.11 | 06/10/2569 | **มติ PO 06/10/2569 (U115)** — แดชบอร์ดหลักของผู้บริหาร: การ์ด "AR ค้างรับ" (E1) ตัวเลขใหญ่คงเดิม + บรรทัดย่อย **"เกิน 60 วัน ฿x"** = KPI `over60` ของ F3 (ช่วงอายุตามค่าตั้งการเงิน — ไม่มีสูตรใหม่) · แสดงเฉพาะผู้ที่เห็นทั้ง E และ F (บริหาร/Superadmin) · API ของ F3 ตรวจสิทธิ์ซ้ำ · กล่อง "เคสตามสถานะ" ของการเงิน/บัญชีคงเดิม (U116) |
| v2.5 | 05/10/2569 | **มติ PO 05/10/2569 (U53/C4)** — F4 แยกคอลัมน์ "ค่าใช้จ่ายตามใบเสร็จ" (ค่าที่พัก/คำขอเบิกตามใบเสร็จ/ส่วนเกินเงินทดรอง = ชนิดรายการที่ค่าตั้งของรอบจ่ายไม่รวมในฐานภาษีหัก ณ ที่จ่าย — ตัวจำแนกเดียวกับ U3 อ่านจาก snapshot ของรอบ · รอบก่อนมีค่าตั้ง = ทุกชนิดเป็นค่าตอบแทนตามเดิม) ออกจากค่าตอบแทน ทั้งตารางรายทีม/รายพนักงานและ KPI · Gross/WHT/Net รวมเท่าเดิม · Export (Excel/PDF) ใช้ข้อมูลชุดเดียวกัน |
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
| การเงิน (Finance) | F1-F5 (เปิด E1–E3 ไม่ได้ — 403 ตาม §10/§14) | Organization |
| บัญชี (Accounting) | A1-A4 (เปิด E1–E3 ไม่ได้ — 403 ตาม §10) | Organization |
| ผู้จัดการทีม (Manager) | O1-O5 ของทีมตัวเอง (ทีมใน `team_managers`) | Team scope |
| หัวหน้าทีม (Supervisor) | O1-O5 ของทีมตัวเอง (ทีมที่ตนเป็นหัวหน้า `teams.supervisor_id` + ทีมที่สังกัด) — สิทธิ์มาจาก capability `assign_case` ระดับ manage ชุดเดียวกับผู้จัดการ (มติ PO 05/10/2569 U56) | Team scope |
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
| Adjustment ระดับรอบวางบิล (มติ PO 05/10/2569 U69) | นับด้วย — กระจายลงรายได้ทุกใบของรอบตามสัดส่วนยอดก่อน VAT ของเคส (largest remainder ผลรวมเท่ายอด Adjustment พอดี) · รายงานแต่ละช่วงนับเฉพาะส่วนของรายได้ที่อยู่ในช่วง (รอบคร่อมเดือนแบ่งตามเดือนของรายได้) |
| % success (มติ PO 05/10/2569 U55) | สำเร็จ ÷ (สำเร็จ + ไม่สำเร็จ) — "ไม่สำเร็จ" = เคส `closed_fail` ที่**ปิดในช่วงรายงาน** (ไม่มีรายได้ จึงดึงจาก `cases.closed_at` แยก จัดกลุ่มตามวันที่ปิด เวลาไทย / บริษัทของเคส) · เคสที่ยังไม่ปิดไม่เข้าตัวหาร · ตัวหาร 0 = "N/A" ห้ามหารศูนย์ · "เคสทั้งหมด" และ "Revenue/เคส" คิดจาก**เคสที่มีรายได้**เท่านั้น (เช่น CO2 รายได้ 1 เคสสำเร็จ + 1 เคส closed_fail ⇒ เคสทั้งหมด 1 · Revenue/เคส = รายได้ ÷ 1 · % สำเร็จ 50%) |

**Columns:**
```
บริษัทไฟแนนซ์ | รายได้รวม | เคสทั้งหมด | สำเร็จ | ไม่สำเร็จ | Revenue/เคส | เปลี่ยนแปลง MoM
```

**บรรทัดกระทบยอดกับใบกำกับภาษี (มติ PO 05/10/2569 U44 — รีวิว C1):** รายงานใช้ยอดก่อน VAT **หลัง Adjustment ที่อนุมัติแล้ว** (`22` §6.12) ส่วนใบกำกับเปลี่ยนเมื่อสำนักงานบัญชีออกใบลดหนี้/ใบเพิ่มหนี้เท่านั้น (ม.86/9–86/10 · U47) ⇒ ใต้ตารางแสดง (ทุกบรรทัดก่อน VAT · รายได้ในช่วงรายงาน):
```
  ยอดตามใบกำกับภาษี (รายได้ในรอบวางบิลที่มีใบกำกับ active)
− ใบลดหนี้ (active)  + ใบเพิ่มหนี้ (active)
− Adjustment ลดยอดที่ "รอใบลดหนี้"  + Adjustment เพิ่มยอดที่ "รอใบเพิ่มหนี้"
+ รายได้ที่ยังไม่ออกใบกำกับ ± Adjustment ของรายได้นั้น     (แสดงเมื่อมียอด)
= ยอดตามรายงาน      → ไม่ลง ⇒ บรรทัด "ผลต่าง" (ยอดรายงาน − ยอดจากเอกสาร) + ไฮไลต์เตือน
```
สูตรอยู่ใน pure module `buildRevenueReconciliation()` (บวก/ลบ satang ล้วน) · ผลต่างเกิดได้จากใบลดหนี้/ใบเพิ่มหนี้ที่ไม่อ้าง Adjustment หรือยอดเอกสาร ≠ ยอด Adjustment — **ห้ามปรับให้ลงเอง** · Adjustment ระดับรอบวางบิลนับเฉพาะส่วนที่กระจายลงรายได้ในช่วง (ชุดเดียวกับ F2 — มติ U69) จึงลงตัว · แสดงเฉพาะผู้ดูระดับองค์กร (ผู้ที่เห็นเฉพาะทีมไม่มีบรรทัดนี้ เพราะเอกสารออกต่อรอบวางบิล)

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
| KPI | ค่าตอบแทนรวม (ไม่รวมค่าใช้จ่ายตามใบเสร็จ และภาษีที่บริษัทออกให้), ค่าใช้จ่ายตามใบเสร็จ, ภาษีที่บริษัทออกให้, ภาษีที่หักจากผู้รับ, Net จ่ายจริง |
| ภาษีที่บริษัทออกให้ | ผู้รับเงื่อนไข (2) ออกให้ตลอดไป / (3) ออกให้ครั้งเดียว — รายการเก็บ gross = เงินได้ + ภาษี ⇒ แยกภาษีออกเป็นช่องของตัวเอง ค่าตอบแทน = เงินได้จริง · ช่อง WHT = เฉพาะที่หักจากผู้รับ · Gross = ค่าตอบแทน + ภาษีที่บริษัทออกให้ + ค่าใช้จ่ายตามใบเสร็จ (มติ PO U109) · ตัวอย่าง เงินได้ ฿10,000 แบบ (2): ค่าตอบแทน 10,000.00 · ภาษีที่บริษัทออกให้ 309.28 · WHT 0.00 · Net 10,000.00 |
| ค่าใช้จ่ายตามใบเสร็จ | รายการเบิกที่ชนิดไม่อยู่ในฐาน WHT ตามค่าตั้งที่ snapshot ไว้ในรอบจ่าย (ค่าเริ่มต้น: ค่าที่พัก/เบิกตามใบเสร็จ/รายการกรอกเอง) — แยกช่องจากค่าตอบแทน · Gross รวม = ค่าตอบแทน + ค่าใช้จ่ายตามใบเสร็จ (มติ PO U53) |

**ตาราง — รายทีม:**
```
ทีม | ประเภท | จำนวนคน | ค่าตอบแทน | ภาษีที่บริษัทออกให้ | ค่าใช้จ่ายตามใบเสร็จ | Gross รวม | WHT หักจากผู้รับ | Net รวม | จำนวนเคสที่ปิด
```

**ตาราง — รายพนักงาน (drill-down):**
```
ชื่อพนักงาน | จำนวนเคส | Commission | ค่าน้ำมัน | เบี้ยเลี้ยง | อื่น ๆ | ภาษีที่บริษัทออกให้ | ค่าใช้จ่ายตามใบเสร็จ | รวม Gross | WHT หักจากผู้รับ | Net
```

---

#### F5 — อายุเงินทดรองคงค้าง (Advance Aging Report) — มติ PO 06/10/2569 (U96 #18)

> แทนรายงาน "เงินทดรองค้างเคลียร์" เดิม (path `/api/reports/finance/advance-overdue` · สิทธิ์ · โหมดแคช real-time เดิม)

| Field | Detail |
|-------|--------|
| ข้อมูลจาก | Advance สถานะ `approved` / `overdue` / `cleared` ที่ยังมี**ยอดคงค้าง** > 0 + `advance_returns` (ไม่นับแถวที่กลับรายการ) + รอบจ่ายที่จ่ายเงินทดรอง (ไฟล์ 15, 17) |
| คงค้าง | = ยอดคืนค้าง (`22` §6.14) = `return_satang` − ยอดที่ได้คืนแล้ว · ยังไม่เคลียร์ ⇒ ยอดจ่ายทั้งก้อน · เคลียร์แล้วแต่ยังรับคืนไม่ครบ ⇒ ส่วนที่เหลือ · ยอดจ่าย = ใช้แล้ว + คืนแล้ว + คงค้าง เสมอ |
| วันจ่าย | รอบจ่ายแรกที่โอนแล้ว (`completed` — มติ U83) · วันที่ยึดวันสร้างไฟล์โอนแบบเดียวกับ `04_Payments.csv` · ยังไม่เคยจ่ายผ่านรอบ ⇒ ช่องว่าง และนับอายุจากวันอนุมัติ |
| อายุ | วันตามปฏิทินไทยนับจากวันจ่ายถึงวันดูรายงาน · ช่วง **0–30 / 31–60 / 61–90 / 90+ วัน** (เกิน 60 เหลือง · เกิน 90 แดง แบบ F3) |
| เกินกำหนดเคลียร์ | ยังไม่เคลียร์ และเลยวันครบกำหนด — ครบกำหนดวันนี้ยังไม่เกิน (เริ่มนับวันถัดไป) · ตัดสินจากวันจริง ไม่ใช่สถานะที่ job เขียน |
| มุมมอง | `?groupBy=advance` (รายใบ — ค่าเริ่มต้น) / `payee` (รายพนักงาน) |
| KPI | จำนวนใบคงค้าง (+ จำนวนคน), ยอดคงค้างรวม, คงค้างเกินกำหนดเคลียร์, คงค้าง 90+ วัน |

**Columns — รายใบ:**
```
พนักงาน | ทีม | เลขที่ | วันจ่าย | กำหนดเคลียร์ | ยอดจ่าย | ใช้แล้ว | คืนแล้ว | คงค้าง | อายุ (วัน) | ช่วงอายุ | สถานะ
```

**Columns — รายพนักงาน:**
```
พนักงาน | ทีม | จำนวนใบ | ยอดจ่าย | ใช้แล้ว | คืนแล้ว | คงค้าง | 0-30 วัน | 31-60 วัน | 61-90 วัน | 90+ วัน | ใบเกินกำหนดเคลียร์ | อายุสูงสุด (วัน)
```

**Business Rule:**
- เรียงอายุมากสุดก่อน · ส่งออก Excel/PDF ตามกลไกกลาง (คอลัมน์เดียวกับจอ)
- ระบบบล็อก Advance ใหม่ถ้ายังมีรายการไม่เคลียร์ (ตามไฟล์ 15)
- pure module: `lib/reports/finance/advance-aging-report.ts`

-------|--------|
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
| Success Rate | ปิดสำเร็จ ÷ เคสที่ปิดแล้ว (นิยามเดียวกับ O1 — งานที่ค้างไม่เข้าตัวหาร · ยังไม่มีเคสปิด = "N/A") — มติ PO 03/10/2569 (UAT Q20) |

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
| F5 | advances, advance_returns | payout_batch_items, payout_batches, payee_profiles, users, teams |
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

**กลไก (มติ PO 05/10/2569 — UAT U9)**: แคชเก็บในตาราง `report_cache_entries` ของ Postgres (ไม่ใช่หน่วยความจำของ process) ⇒ การล้างแคช (ปุ่มรีเฟรช / อนุมัติ Adjustment) มีผลกับทุก instance ทันที · แถวผูก `organization_id` เสมอ และคีย์รวมขอบเขตทีม/บริษัทของผู้เรียก (ผู้ใช้ต่างขอบเขตไม่ใช้แคชก้อนเดียวกัน) · แถวหมดอายุถูกลบเมื่ออ่านเจอ/เมื่อเขียนแถวใหม่ขององค์กรเดียวกัน

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
- F5: เงินทดรองที่มียอดคงค้างแสดงครบ ไม่หาย ไม่ซ้ำ (รวมใบที่เกินกำหนดแต่ job ยังไม่พลิกสถานะ และใบที่เคลียร์แล้วแต่ยังรับคืนไม่ครบ)
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
| F5: จ่าย ฿5,000 เคลียร์ใช้ ฿3,000 รับคืนแล้ว ฿500 (+ แถวกลับรายการ ฿700) | คงค้าง ฿1,500 · คืนแล้ว ฿500 (ไม่นับแถวกลับรายการ) |
| F5: จ่ายมาแล้ว 30 / 31 / 90 / 91 วัน | ช่วง 0-30 / 31-60 / 61-90 / 90+ วัน ตามลำดับ |
| O1: เคส open ไม่ถูกนับ success/fail | success rate คำนวณจาก closed เท่านั้น |
| O2: TAT ข้ามเดือน | นับ calendar days ถูกต้อง |
| Permission: Manager ดู O1 | เห็นเฉพาะทีมตัวเอง ไม่เห็นทีมอื่น |
| Permission: Finance ดู E1 | ได้รับ 403 |
| F2: บริษัทมีเคสสำเร็จ 1 (มีรายได้) + closed_fail 1 ในช่วง (U55) | % สำเร็จ 50% · เคสทั้งหมด 1 · ไม่สำเร็จ 1 |
| Export F2 Excel | ไฟล์มีข้อมูลตรงกับ UI ทุก row |

---

## 15. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **ทุกรายงานเป็น read-only ไม่มี state machine ของตัวเอง** — คำนวณจากข้อมูลที่มีในระบบแล้วเท่านั้น ไม่สร้าง/แก้ไขข้อมูลต้นทาง (§1)
- **Refresh Policy แยกตามความหนักของ query**: F1/F2/F3/E1-E3 cache รายวัน (refresh เที่ยงคืน + ปุ่มรีเฟรชตอนนี้), F4/F5 real-time (ข้อมูลน้อย), O1-O5 cache รายชั่วโมง, A1-A4 real-time (§8)
- **Chart library: Recharts** (อยู่ใน tech stack Next.js อยู่แล้ว) — **Export Excel: SheetJS (xlsx)** — **Export PDF: @react-pdf/renderer หรือ Puppeteer server-side** (§15 เดิม)
- **Permission scope ตาม role**: Manager เห็นเฉพาะทีมตัวเอง, Finance ไม่เข้าถึงรายงาน Executive ได้ (§10)

## 16. สิ่งที่ยังต้องตัดสินใจ (Open Items)
- ไม่มี Open Item — ข้อมูลทุกตัวมีอยู่แล้วในระบบ พร้อม implement
