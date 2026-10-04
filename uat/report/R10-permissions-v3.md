# R10 v3 — สิทธิ์/ขอบเขต + ฟีเจอร์ใหม่ (ทุก persona · API ขนาน + Playwright)

> วันที่ทดสอบ: 04/10/2569 13:47–14:08 น. · snapshot ต้นรอบ: `R9-end-v3` + โค้ดหลัง merge fixer R · ปลายรอบ: (orchestrator snapshot `R10-end-v3`)
> ผล R10a–f: ✅ 33 / 🐞 2 ใหม่ (+1 known) / ⚠️ 5 / ❓ 3 · R10g: ✅ 5 ข้อ / 🐞 2 (UI เล็ก)
> สคริปต์ + log: `uat/bin/r10v3/` (`run.log`, `fp.log`, `matrix-G.json`, `matrix-W.json`, `pages.json`) · ภาพ: `uat/shots/R10v3/` 29 ภาพ

## สรุปสั้น "ใครทำอะไรได้"

| กลุ่ม | เห็นเมนู | อ่านได้ | ทำได้ | ขอบเขต |
|---|---|---|---|---|
| Superadmin (`admin`) / บริหาร | ทุกเมนู (บริหารเปิด `/field` แล้วถูกพาไปแดชบอร์ด) | ทุกอย่าง (บริหาร: บัญชีส่วนใหญ่ขึ้น "ไม่มีสิทธิ์" ยกเว้นเอกสารไม่ครบ) | Superadmin ทุกอย่าง · บริหาร: อนุมัติขั้นผู้บริหาร, ปลดล็อกงวด, อนุมัติ Adjustment งวดล็อก, อนุมัติข้อยกเว้น | ทั้งองค์กร |
| ธุรการ | แดชบอร์ด · รับเคส · คลัง · ผู้ใช้งาน | เคส คลัง ทีม/บริษัท/role | รับเคส/แก้/แนบ/ลบเอกสาร (ก่อนส่งตรวจ) · รับเข้าคลัง/ล็อต · ผู้ใช้ (ยกเว้นบัญชีกลุ่ม system) | ทั้งองค์กร |
| เจ้าหน้าที่อนุมัติเคส | แดชบอร์ด · รับเคส | เคส | รับ/ไม่รับเคส · ตีกลับหลักฐาน | ทั้งองค์กร |
| การเงิน | แดชบอร์ด · การเงิน · คลัง · รายงาน (F1–F5) · Audit/Job log | การเงิน + ดูบัญชีบางส่วน | อนุมัติขั้นการเงิน, รอบจ่าย, ไฟล์โอน, billing, Adjustment | ทั้งองค์กร · **E1–E3 = 403** |
| บัญชี | แดชบอร์ด · บัญชี · คลัง · รายงาน (A1–A4) · Audit/Job log | บัญชีทั้งหมด + ดูรอบจ่าย/billing | ปิดงวด ใบกำกับ WHT กระทบยอด export | ทั้งองค์กร |
| ผู้จัดการทีม | แดชบอร์ด · มอบหมาย · การเงิน (แท็บค่าตอบแทนแท็บเดียว) · คลัง (⚠️ BUG-076) · รายงาน O1–O5 | เคส/ผู้ใช้/คิวอนุมัติ เฉพาะทีมตัวเอง | มอบหมาย · อนุมัติขั้น 1 | `team_managers` (mgr.in = A+B · mgr.out = C) |
| หัวหน้าทีม | เหมือนผู้จัดการ แต่ไม่มีเมนูการเงิน | เคสทีมตัวเอง | มอบหมาย | ทีม A |
| พนักงาน | แดชบอร์ด · ภาคสนาม | งาน/เบิก/เงินทดรอง/ผู้รับเงิน ของตัวเอง | เช็คอิน ปิดงาน เบิก ขอเงินทดรอง | ตัวเอง (⚠️ BUG-056 เพื่อนร่วมทีมเปิด detail ได้) |
| บริษัทไฟแนนซ์ (3 ระดับเท่ากัน ❓) | แดชบอร์ด · เคส · คลัง · landing `/portal` | เคส/ทรัพย์/ล็อต/billing/รายได้/AR ของบริษัทตัวเอง (ฟิลด์ภายในถูกตัด) | ไม่มี write | บริษัทตัวเอง |

---

# R10a — session + audit การเข้าระบบ

### R10.01 ตรวจต้นรอบ + FP0
**ทำ**: รัน §0.1 + Q-FP (`uat/bin/r10v3/fp.sh`)
**ผลหลังบ้าน**: งวด ต.ค. `locked` · adj `decrease:approved increase:rejected` · exc `resolved,authorized` · export `1:generated,2:sent,3:generated` · cases 8 · personas 14 · bad 0 · rc 79 · T0 = `2026-10-04 06:47:52Z` · L0 (login/logout) = 44 · FP0 `audit_n` = 385
**สถานะ**: ✅

### R10.02 เข้าระบบพร้อมกัน 15 บัญชี
**ทำ**: login API ขนาน (pool 5) 15 บัญชี → `GET /api/auth/session` ทุกคน
**ผล**: 200 ทั้ง 15 (1.8 วินาที) · scope `global`×6 · `team`×3 (mgr.in = A+B, sup.in = A, mgr.out = C) · `self`×3 · `company`×3 (co1×2 = UATL, co2 = UATC) · capability ตรงตาราง §0.7 ทุกตัว
**ผลหลังบ้าน**: audit login success 15 แถว · actor 15 คนไม่ซ้ำ · `actor_role` ตรง role จริงทุกแถว · `target_type=users`, `target_id=actor_id` · ip/ua มีค่าทุกแถว
**สถานะ**: ✅

### R10.03–R10.04 รหัสผิด / ผู้ใช้ไม่มีจริง / identifier ผิดรูป
| คำขอ | ผล |
|---|---|
| `uat.finance` + รหัสผิด | 401 `INVALID_CREDENTIALS` |
| `uat.r10.nobody` | 401 · **body เหมือนข้อบนทุกตัวอักษร** |
| `a b c` | 401 · audit identifier = `<invalid>` |
| `{}` | 400 `REQUIRED_MISSING` + fieldErrors ไม่มี audit |

**ผลหลังบ้าน**: audit failed `actor_id`/`target_id` NULL · `after_data={code,result:'failed',identifier}` · ไม่มีสตริงรหัสผ่านใน audit (count 0)
**เวลาตอบ**: ผู้ใช้มีจริง ~210 ms vs ไม่มีจริง ~60–100 ms (ยิง 2 รอบ — ต่างกันคงที่ ~3 เท่า เกินเกณฑ์ 2 เท่า) → 🐞 **R10v3-B01**
**รหัสผิดรวม**: uat.finance 2 ครั้ง (ไม่เกินเพดาน)
**สถานะ**: ✅ (ไม่ leak ทาง body) · 🐞 R10v3-B01 (leak ทางเวลา)

### R10.05 อ่าน audit ตามสิทธิ์
**ผล**: `GET /api/audit-logs?action=login` admin/การเงิน/บัญชี/บริหาร = 200 เห็นแถว failed (ไม่มีรหัสผ่าน) · อีก 11 บัญชี = 403 · detail แถว failed: 4 บัญชีเดิม 200 / ที่เหลือ 403
**ยาม DB**: `trg_audit_logs_no_delete`, `trg_audit_logs_no_truncate`, `trg_audit_logs_no_update`
**สถานะ**: ✅

---

# R10b — matrix สิทธิ์

### R10.06–R10.07 matrix GET 43 + write 38 endpoint × 15 บัญชี
**ทำ**: `node uat/bin/r10v3/matrix.mjs G|W` (ใช้ storageState จาก R10.02 ตาม O38) · เพิ่ม 2 endpoint ใหม่ตามคำสั่ง: **G43** `GET /api/bank-reconciliation/import/template` (คาด: admin + บัญชี) · **W38** `DELETE /api/cases/:id/documents/:documentId` (คาด: admin + ธุรการ)

| ชุด | คำขอ | ตรง | ไม่ตรง | ชนิดที่ได้ |
|---|---|---|---|---|
| GET | 645 | **645** | 0 | A 228 · D 402 · N 15 |
| write | 568 | **568** | 0 | A 83 · D 470 · N 15 |
| **รวม** | **1,213** | **1,213** | **0** | ERR 0 · AUTH 0 · write 2xx 0 |

- ผู้มีสิทธิ์ได้ 400 `REQUIRED_MISSING`/`WHT_CANCEL_REQUIRES_REASON` หรือ 404 `*_NOT_FOUND` (id สุ่ม) — ไม่มีคำขอใดถึงขั้นบันทึก
- G43 การเงิน (view) = 403 ตามคาด · W38 ธุรการ/admin = 404 `CASE_NOT_FOUND` (เคสสุ่ม) อีก 13 = 403
- Q-FP: FP-a = FP-b ทุกช่อง (`audit_n` 385)
**สถานะ**: ✅ (ช่อง X1–X12 ของ §0.9 ผลตรง grid — สถานะตามตารางเดิม)

### R10.08 ลำดับ middleware เมื่องวดล็อก (claim วันที่ 05/10/2569 body ถูกต้อง)
**ผล**: admin · การเงิน · in1 · in2 · out1 = 400 `PERIOD_LOCKED_DIRECT_EDIT` · อีก 10 บัญชี = 403 · `expenses` 17 → 17
**สถานะ**: ✅ (สิทธิ์ก่อนงวด · ยามงวดไม่รั่ว)

### R10.09 รายงานรายหมวด
| คำขอ | ผล |
|---|---|
| การเงิน E1/E2/E3 | 403 ×3 ✅ |
| การเงิน export E1 `{format:'xlsx'}` | 403 · jobs 9→9 · audit export 20→20 ✅ |
| การเงิน export E1 `{}` | **400 `REQUIRED_MISSING`** — ยืนยัน R10-N3 (ตรวจ body ก่อนสิทธิ์) |
| catalog | admin/บริหาร 17 · การเงิน F1–F5 · บัญชี A1–A4 · ทีม×3 O1–O5 · ที่เหลือว่าง ✅ |
| gross-profit | admin/การเงิน/บริหาร 200 · อื่น 403 ✅ |
| no-such-report | 404 `REPORT_NOT_FOUND` ทุกคน ✅ |
| success-rate ทีม | mgr.in/sup.in เห็นทีม A (ทีม B ว่างไม่มีแถว) · mgr.out เห็นเฉพาะ C ✅ |
**สถานะ**: ✅ · ⚠️ R10-N3 ยืนยัน

### R10.10 คัดแยก
ไม่มีแถว ✗ — ไม่มีสิทธิ์รั่ว/สิทธิ์ขาดใหม่

---

# R10c — scope (ปฏิเสธต้องไม่ leak)

### R10.11 บริษัท — รายการเฉพาะบริษัทตัวเอง
| คำขอ | co1.mgr / co1.sup | co2.admin |
|---|---|---|
| `/api/cases` | 5: C1 C2 C4 C6 C8 | 3: C3 C5 C7 |
| `?companyId=<อีกบริษัท>` | ยังเป็น 5 ใบของ CO1 (query ถูกเมิน) | ยังเป็น 3 ใบของ CO2 |
| `/api/assets` · `?companyId=อื่น` | 3 · 0 | 1 · 0 |
| `/api/handover-lots` | LOT-2569-003 | LOT-2569-004 |
| `/api/billing-batches` | 1 (UATL) | 1 (UATC) |
| `/api/revenues` · `?companyId=อื่น` | 3 · 0 | 1 · 0 |
| `/api/ar-aging` | ไม่มีข้อมูลอีกบริษัท | ไม่มีข้อมูลอีกบริษัท |
**สถานะ**: ✅

### R10.12 บริษัท — เปิด detail ข้ามบริษัท = เหมือน id สุ่ม
11 คู่ (เคส ×7, ทรัพย์ ×2, ล็อต ×2, billing ×2 ตามตาราง) → 404 `CASE_/ASSET_/LOT_/BILLING_BATCH_NOT_FOUND` · `sameDenial=true` ทุกคู่ · co1.mgr PDF ล็อตตัวเอง = 403
**สถานะ**: ✅

### R10.13 บริษัท — ฟิลด์ภายในถูกตัด
co1.mgr เปิด C1: ทีม/ผู้สร้าง/ประวัติแก้/แม่แบบค่าบริการ/ที่มาประมาณการ = null/''/[] · ทรัพย์ทุกแถว IMEI จริง/serial/ทีม/พนักงาน = null — บริหารเปิดเคสเดียวกันเห็นค่าครบ
**สถานะ**: ✅

### R10.14 บริษัท — ปลายทางภายใน
kanban · compensation · payees · periods · adjustments · jobs · audit-logs · users = 403 ทั้ง 8 · หลัง login ไป `/portal`
**สถานะ**: ✅

### R10.15 ทีม — เคสตามทีม
mgr.in/sup.in: C1 C2 C3 C4 C7 · mgr.out: C5 · `?teamId=A` ของ mgr.out ยังได้ C5 · เปิดนอกทีม 5 คู่ = 404 = สุ่ม
**สถานะ**: ✅

### R10.16 ทีม — kanban / ผู้ใช้
| คำขอ | ผล |
|---|---|
| mgr.in kanban ทีม B | 200 |
| kanban/agents นอกทีม 4 คู่ | 403 = id สุ่ม 403 (`sameDenial=true`) |
| mgr.in `/api/users` · `?search=uat` | 4: mgr.in, sup.in, in1, in2 ✅ (BUG-025) |
| mgr.out `?search=uat` · `?teamId=A` | mgr.out, out1 · ว่าง ✅ |
| mgr.out `/api/users/<in1>` vs สุ่ม | **403 vs 404 `USER_NOT_FOUND`** — ยืนยัน R10-N4 |
| ธุรการ `/api/users/<uat.finance>` vs สุ่ม | 403 vs 404 — R10-N4 |
| ธุรการ `?roleGroup=system` | 200 แต่มีแค่ตัวเอง · รายการทั้งหมด 10 คน (ไม่มีบัญชี system อื่น) |
**สถานะ**: ✅ · ⚠️ R10-N4 ยืนยัน

### R10.17 ทีม — คิวค่าตอบแทน
mgr.out: 3 แถว ของ out1 เท่านั้น · mgr.in: 13 แถว ของ in1/in2 (รวมค่าที่พัก in1 ไม่ผูกเคส) · การเงิน/บริหาร: 16 แถว · `PATCH /api/compensation/<out1>/approve {}` mgr.out = 400 `EXPENSE_INVALID_STATUS` (ผ่านสิทธิ์ ถูกปัดที่สถานะ)
**สถานะ**: ✅

### R10.18 own — พนักงาน
| | in1 | in2 | out1 |
|---|---|---|---|
| field/cases (กำลังทำ + ปิดแล้ว) | C7 + C1 C2 | C3 C4 + **C7** (ประวัติ — เคยถูกมอบแล้วถูกย้ายออก `reassigned_away`) | C5 |
| advances | 2 | 1 | 1 |
| payees | 1 (ของตัวเอง) | 1 | 1 |
| field/expenses | 6 แถว | 7 | 2 |
| cases / payout-batches / users | 403 | 403 | 403 |
| detail งานคนอื่น vs สุ่ม | 404 = สุ่ม | `/C1` = **200** (⚠️ BUG-056 accepted risk) | 404 = สุ่ม |
| payee คนอื่น vs สุ่ม | 404 = สุ่ม | 404 = สุ่ม | 404 = สุ่ม |
**สถานะ**: ✅ · ⚠️ BUG-056 (known) · ข้อสังเกต R10v3-N3 (in2 เห็น C7 ในแท็บปิดแล้วจากประวัติการมอบ)

### R10.19 แจ้งเตือนของตัวเอง + BUG-064
จำนวนจาก API = DB ทุกบัญชี (ธุรการ 12 · in1 10 · in2 11 · out1 3 · การเงิน 7 · บัญชี 4 · mgr.in 8 · mgr.out 1 · sup.in 6 · อื่น 0) · mgr.out ไม่มี `UAT-CO1-`/C3/C7 · mgr.out mark-read แจ้งเตือนของ in1 vs id สุ่ม = 200 เหมือนกัน และ `read_at` ไม่เปลี่ยน (ตั้งใจไม่แยก)
**สถานะ**: ✅

### R10.20 `/api/portal/*`
GET/POST = 404 ทุก persona — **N/A เลื่อนไป R12**

---

# R10d — 9 รายการ "✅ only"

### R10.21 ธงล็อกที่ API คืน
role ธุรการ `isEditable=true` · `locked=true` ครบ 9 รหัสพอดี · grid functional 37 รายการ ล็อก 9 ตัวเดียวกัน
**สถานะ**: ✅

### R10.22 Superadmin มอบรายการล็อกให้ธุรการ
9 คำขอ (มีรหัสหลอก `zz_r10_probe` กันพลาด) → **400 `CAPABILITY_LOCKED` ×9** · ข้อความ “ความสามารถนี้เป็นของบทบาทเดียว…” ไม่มีเลขสเปค/รหัสดิบ · rc 79 เท่าเดิม
**สถานะ**: ✅ ครบ 9 (O35)

### R10.23 ทางอื่น / role เจ้าของ / ผู้ไม่ใช่ Superadmin
| คำขอ | ผล |
|---|---|
| `PATCH /api/settings/functional-permissions` unlock_period / manage_roles | **500** (log: `RoleError CAPABILITY_LOCKED`) → 🐞 **R10v3-B02** |
| เดียวกัน manage_settings | **500** (log: `CAPABILITY_NOT_FOUND`) → R10v3-B02 |
| ลดระดับ unlock_period ของบริหาร | 400 `ROLE_NOT_EDITABLE` ✅ |
| บริหาร / ธุรการ ยิงแก้สิทธิ์ | 403 ×2 ✅ |
ยามล็อกทำงาน (ไม่มี mutation · rc/audit เท่าเดิม) แต่ route นี้แปลง error ไม่ได้ → ผู้ใช้เห็น 500
**สถานะ**: 🐞 R10v3-B02

### R10.24 seed role ลบไม่ได้
ลบ role หัวหน้า (finance_company) → 400 `SEED_ROLE_DELETE` · roles active 15
**สถานะ**: ✅

---

# R10e — เมนูและการพิมพ์ URL

### R10.25 เมนูต่อ role (`/api/meta/menu`)
| persona | เมนูที่ได้ |
|---|---|
| admin / บริหาร | dashboard · cases(submit, assign, field) · finance · accounting · warehouse · reports · settings(9 ข้อ) |
| การเงิน | dashboard · finance · warehouse · reports · settings(audit-logs, jobs) |
| บัญชี | dashboard · accounting · warehouse · reports · settings(audit-logs, jobs) |
| เจ้าหน้าที่อนุมัติเคส | dashboard · cases(submit) |
| ธุรการ | dashboard · cases(submit) · warehouse · settings(users) |
| mgr.in / mgr.out | dashboard · cases(assign) · finance · warehouse · reports |
| sup.in | dashboard · cases(assign) · warehouse · reports |
| พนักงาน ×3 | dashboard · cases(field) |
| บริษัท ×3 | dashboard · cases · warehouse |
ตรงตารางคาดหวังทุกบัญชี
**สถานะ**: ✅ · ⚠️ BUG-076 (เมนูคลังของทีม — API 403)

### R10.26 พิมพ์ URL ตรง ๆ (14 หน้า × 15)
- ทุกหน้าที่ไม่มีสิทธิ์ → `/dashboard` (บริษัทเปิด `/field` → `/portal`) · ไม่พบ `UAT-CO…` ใน HTML ของหน้าที่ถูกพาออก
- `/reports/kpi-summary` การเงิน/บัญชี/mgr.in/sup.in/mgr.out = **500** → ⚠️ **BUG-133 (รู้แล้ว)** · ไม่มีตัวเลขรั่ว
- `/field` ของบริหาร → `/dashboard` แม้มีเมนูย่อย (จดตาม sheet)
- `/portal` **ทุก session (รวมบัญชีภายใน) เปิดได้** — หน้ารอสร้าง ไม่มีข้อมูล → ข้อสังเกต R10v3-N1
**สถานะ**: ✅ · ⚠️ BUG-133

### R10.27 ภาพประกอบคู่มือ
**บริษัทไฟแนนซ์หลัง login** → `/portal` (หน้ารอสร้าง)
![](../shots/R10v3/01-company-landing.png)
**การเงินเปิดรายงาน** → เห็น F1–F5 เท่านั้น
![](../shots/R10v3/02-finance-reports.png)
**ผู้จัดการทีมเปิดการเงิน** → แท็บ “ค่าตอบแทน” แท็บเดียว เฉพาะทีมตัวเอง
![](../shots/R10v3/03-manager-finance-tab.png)
**บริหารเปิดบัญชี** → เห็น 9 แท็บ แต่ รายได้และขาย / เงินรับ / ค่าใช้จ่าย / กระทบยอด / เอกสาร & WHT / ข้อซักถาม / ส่งมอบ ขึ้น “ไม่มีสิทธิ์” · เปิดได้เฉพาะ รอบส่งบัญชี + เอกสารไม่ครบ (ตรง grid G19–G26)
![](../shots/R10v3/04-exec-accounting.png)
![](../shots/R10v3/04b-exec-accounting-bankrecon.png)
ทุกภาพ: วันที่ พ.ศ. · ไม่มีเลขสเปค · ไม่มี console/5xx
**สถานะ**: ✅ · ข้อสังเกต R10v3-N2 (แท็บที่ไม่มีสิทธิ์แสดงแต่เปิดแล้วขึ้น "ไม่มีสิทธิ์" แทนการซ่อน)

### R10.28 แท็บการเงินของหัวหน้าทีม
mgr.in: payout-batches / billing-batches / advances / payees / adjustments / dashboard-kpi = 403 ทั้ง 6 · หน้าแสดงแท็บค่าตอบแทนแท็บเดียว
**สถานะ**: ✅

---

# R10f — เช็คซ้ำ · race · logout

### R10.29 เช็คบั๊กเดิม
| บั๊ก | ผล |
|---|---|
| BUG-025 / BUG-021 / BUG-064 | ผ่าน (R10.16 / R10.25–26 / R10.19) |
| BUG-090 | บริหาร payout 200 · advances 403 ✅ |
| BUG-087 | การเงินเปิด `/finance?tab=payee` อยู่หน้าเดิม ✅ |
| BUG-032 | approver `/api/finance-companies` 403 (ถูกต้อง) ✅ |
| BUG-076 / BUG-081 | ⚠️ ยังเหมือนเดิม |
| BUG-111 | บัญชี `PATCH …/transactions/not-a-uuid/match {}` = 400 `REQUIRED_MISSING` (ไม่ 500 ด้วย body นี้) · co1.mgr = 403 (สิทธิ์มาก่อน) |
| BUG-022 / BUG-056 | ⚠️ known |

### R10.30 session ไม่ปนกันภายใต้โหลด
300 คำขอพร้อมกัน (15 context × 20 สลับ session/menu) — 200 ทั้งหมด · ตรงเจ้าของ 300/300 · 2.4 วินาที
**สถานะ**: ✅

### R10.31 login ซ้อนบัญชีเดียว
co2.admin login พร้อมกัน 2 context → 200 ทั้งคู่ · audit +2
**สถานะ**: ✅

### R10.32 logout แล้วใช้ cookie เดิม
logout S1 = 200 · audit `logout` (แอดมิน|uat.co2.admin) · replay cookie S1 = 401 · **S2 (login แยก) = 401** และ session จาก R10.02 ก็ 401 → ยืนยัน R10-N11 (ออกจากระบบทุกอุปกรณ์) · login co2.admin ใหม่เก็บ storageState แล้ว
**สถานะ**: ✅ · ❓ R10-N11

### R10.33 เคลียร์เงินทดรองของคนอื่น
in2 `PATCH /api/advances/<in1 cleared>/settle` body ถูกต้อง → 404 `ADVANCE_NOT_FOUND` (= id สุ่ม) · advance `cleared|245000` เท่าเดิม → ยาม scope มาก่อนยามสถานะ
**สถานะ**: ✅

### R10.34 ตรวจรวม
- **Q-FP ปลาย R10f = FP0 ทุกช่อง** (`audit_n` 385 = 385) · ต่างแค่ `audit_login` 44 → 69 (+25 = login สำเร็จ 18 + failed 6 + logout 1)
- pm2 log 500 ระหว่าง R10a–f: `PATCH /api/settings/functional-permissions` ×3 (R10v3-B02) · `GET /reports/kpi-summary` ×5 (BUG-133) — ไม่มีอื่น
- jobs 9 / files 0 / export 3 ไม่เพิ่ม
**สถานะ**: ✅

---

# R10g — คู่มือรับเคสแบบใหม่ (ฟีเจอร์ใหม่ 04/10/2569)

> ผู้เล่น: `uat.admin` (ธุรการ) · `uat.approver` (ผู้ตรวจเคส) · บริษัท CO1 · Q-FP ก่อน R10g = ปลาย R10f

### R10g.1 กรอบโฟกัส — คลิกไม่มีกรอบ · กด Tab มีกรอบ
**เมนู**: บัญชี (`uat.account`) และ การตั้งค่า → เมนูย่อย (`admin`)
**ผล**: คลิกแท็บ/เมนูย่อย → `:focus-visible=false` ไม่มีกรอบ · กด Tab 12–14 ครั้ง → ทุกปุ่ม/ลิงก์/ช่องกรอก `outline solid 2px` ครบ (ไม่มีกรอบ 0 จุด)
![](../shots/R10v3/g1-accounting-click.png)
![](../shots/R10v3/g1-accounting-tab.png)
![](../shots/R10v3/g1-settings-click.png)
![](../shots/R10v3/g1-settings-tab.png)
**สถานะ**: ✅

### R10g.2 ดาวน์โหลดแม่แบบนำเข้า + นำเข้าเคสจากแม่แบบ
**เมนู**: จัดการเคส → รับเคส → **Import ไฟล์** → modal “นำเข้าเคสจากไฟล์”
![](../shots/R10v3/g2-01-import-modal.png)
**ทำ**: กด “ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)” และ “หรือ CSV” → ได้ `case-import-template.xlsx` (2 ชีต: ข้อมูล / คำอธิบาย) + `case-import-template.csv` (UTF-8 BOM)
**ตรวจไฟล์ (SheetJS)**: หัวคอลัมน์ไทย 29 คอลัมน์ (เลขที่สัญญา, ชื่อลูกหนี้, เบอร์มือถือ, IMEI / Serial, มูลหนี้คงเหลือ (บาท) …) · ทุกเซลล์ข้อมูลเป็นข้อความ (`t=s`, รูปแบบ `@`) รวมเบอร์ `0812345678` และ IMEI `350000000000001`
**นำเข้าจริง**: แก้แม่แบบ .xlsx เป็น UAT-CO1-901 (IMEI 359901000009011) / UAT-CO1-902 (359901000009029) → เลือกบริษัท ยูเอที ลิสซิ่ง → เลือกไฟล์ → จับคู่คอลัมน์อัตโนมัติ (ไม่มีคำเตือน) → “ตรวจสอบข้อมูล (ไม่บันทึก)” พร้อมนำเข้า 2 → “ยืนยันนำเข้า 2 รายการ”
![](../shots/R10v3/g2-xlsx-mapping.png)
![](../shots/R10v3/g2-xlsx-preview.png)
![](../shots/R10v3/g2-xlsx-done.png)
**ผลหลังบ้าน**: `cases` UAT-CO1-901 `b976a24e-…` / UAT-CO1-902 `76ef07bb-…` สถานะ `draft` · IMEI ตรงทุกหลัก · source `import`
**probe เลขยกกำลัง**: CSV ที่ IMEI = `3.5E+14` (dry-run เท่านั้น) → แถวนั้น “ไม่ผ่าน” ข้อความไทย “IMEI / Serial "3.5E+14" ถูก Excel แปลงเป็นเลขยกกำลัง ตัวเลขเดิมหายไปแล้ว — ตั้งรูปแบบเซลล์…” ไม่เดาค่า · อีกแถวพร้อมนำเข้า → **ไม่กดยืนยัน**
![](../shots/R10v3/g2-probe-exp-preview.png)
แต่ข้อความขึ้นต้นด้วยชื่อฟิลด์ดิบ `assetImeiSerial:` และคอลัมน์เลขที่สัญญาของแถวที่ไม่ผ่านแสดง “–” (ไฟล์มี UAT-CO1-903) → 🐞 **R10v3-B03**
**Bank Statement**: บัญชี → กระทบยอด → “Import Statement” → modal “นำเข้า Bank Statement” มีปุ่มแม่แบบ → ได้ `bank-statement-template.xlsx/.csv` (วันที่ / รายละเอียด / เลขที่อ้างอิง / เงินเข้า / เงินออก · วันที่ตัวอย่าง พ.ศ. `01/10/2569` · เซลล์ข้อความ) · **ไม่นำเข้า** (bank_transactions 4 เท่าเดิม)
![](../shots/R10v3/g2-bank-statement-modal.png)
**สถานะ**: ✅ · 🐞 R10v3-B03 (S4)

### R10g.3 เอกสารชุด (สแกนรวมเล่ม)
**เมนู**: รับเคส → แถว UAT-CO1-901 → แก้ไข → เอกสารแนบ → “เอกสารชุดเดียว (สแกนรวมเล่ม)”
1. เลือก PDF 26 MB → ปัดทันที “ไฟล์ R10g-bundle-26MB-probe.pdf ใหญ่เกิน 25 MB” (ไม่อัปโหลด)
![](../shots/R10v3/g3-01-bundle-26mb-rejected.png)
2. เลือก PDF 8 หน้า **12.0 MB** (> 10 MB) → รับ → “บันทึกการแก้ไข” → อัปโหลดสำเร็จ (`case_documents` `bundle_doc` 12,585,900 bytes `application/pdf`)
![](../shots/R10v3/g3-02-bundle-12mb-staged.png)
3. แถวขึ้นปุ่ม “ส่งตรวจสอบเคส” → กด → `pending_review` โดยไม่มีสัญญา/บัตรแยก
![](../shots/R10v3/g3-04-submitted.png)
4. ผู้ตรวจ (`uat.approver`) กด “พิจารณา” → หัวข้อเอกสารแนบมีป้าย **เอกสารชุด** + ช่องติ๊ก “ตรวจเอกสารชุดแล้ว — ในชุดมีสัญญา… และบัตรประชาชน/Passport ลูกหนี้ครบ”
![](../shots/R10v3/g3-05-reviewer-bundle-badge.png)
5. กด “รับเคส & ยืนยันทีม” โดยไม่ติ๊ก → 400 `CASE_BUNDLE_CONFIRMATION_REQUIRED` “ต้องยืนยันเอกสารชุดก่อนรับเคส” (ข้อความขึ้นบนสุดของ modal ที่เลื่อนลงอยู่ — มองไม่เห็นในภาพ → 🐞 **R10v3-B04**)
![](../shots/R10v3/g3-06-accept-without-tick.png)
6. ติ๊กแล้วกดอีกครั้ง → 200 `approved` ทีม A
![](../shots/R10v3/g3-07-accepted.png)
**ผลหลังบ้าน**: audit `update {documentMode:'bundle'}` · `status_change review` · `approve` มี `documentMode:'bundle'` + **`bundleDocumentsConfirmed: true`** · ไม่มอบหมายต่อ (case_assignments 8 เท่าเดิม)
**ข้อจำกัด**: probe 26 MB พิสูจน์ที่ฝั่งหน้าจอ (โค้ดมี `BUNDLE_MAX_UPLOAD_BYTES` = 25 MB ฝั่ง server ด้วย แต่ไม่ได้ยิงตรง)
**สถานะ**: ✅ · 🐞 R10v3-B04 (S4)

### R10g.4 จำโหมด + ติ๊กรูปสินค้า + ลบเอกสาร
**เคส**: UAT-CO1-902 (โหมดเริ่มต้น “แยกตามประเภท”)
1. แนบสัญญา `R10g-902-contract.pdf` + บัตร `R10g-902-idcard.png` ไม่แนบรูปสินค้า → บันทึก (POST documents 201 ×2)
![](../shots/R10v3/g4-01-separate-staged.png)
2. “ส่งตรวจสอบเคส” → 400 `CASE_DOCUMENT_INCOMPLETE` บนจอ “เอกสารแนบยังไม่ครบ · เอกสารที่ยังไม่ได้แนบ: รูปสินค้า”
![](../shots/R10v3/g4-02-submit-blocked-no-photo.png)
3. ติ๊ก “รูปสินค้ารวมอยู่ในไฟล์สัญญาแล้ว” → บันทึก → เปิดใหม่ **ติ๊กยังอยู่** (audit `productPhotoInContract false→true`)
![](../shots/R10v3/g4-03-photo-in-contract-ticked.png)
4. กด “ลบ” ไฟล์บัตร → ConfirmModal “ลบเอกสารที่แนบ … ระบบเก็บประวัติไว้ตรวจย้อนหลัง…” + ช่องเหตุผล (ไม่บังคับ) → “ลบเอกสาร” → DELETE 200
![](../shots/R10v3/g4-04-delete-confirm.png)
   - `case_documents.deleted_at` มีค่า · `file_url` เดิมยังอยู่ · audit `delete` target `case_documents` reason “ลบเอกสารที่แนบผิดก่อนส่งตรวจ” before/after ครบ · โค้ด `deleteCaseDocument` ไม่เรียก Storage + after มี `storageFileKept: true` (ตรวจไฟล์ใน Supabase Storage ตรงไม่ได้ — การอ่าน env/token ถูกปฏิเสธในเครื่องนี้)
5. สลับเป็นโหมดชุดขณะยังมีสัญญา → ถูกห้าม “เคสนี้มีไฟล์ “สัญญาเช่าซื้อ…” ที่อัปโหลดแล้ว — สลับ… ไม่ได้ (กด “ลบ” ไฟล์เหล่านั้นให้หมดก่อน)”
![](../shots/R10v3/g4-05-switch-blocked.png)
6. ลบสัญญา → สลับโหมดชุดได้ → บันทึก → เปิดใหม่ **ยังเป็นโหมดชุด** (audit `documentMode separate→bundle`)
![](../shots/R10v3/g4-06-reopen-bundle-mode.png)
**probe ลบเอกสาร** UAT-CO1-901 (approved แล้ว): ธุรการ → 400 `CASE_DOCUMENT_DELETE_NOT_ALLOWED` “ลบเอกสารได้เฉพาะเคสสถานะ ร่าง / ขอข้อมูลเพิ่ม…” · ผู้ตรวจเคส / co1.mgr / in1 → 403 `PERMISSION_DENIED` · เอกสาร 901 ยัง active
**ข้อสังเกต**: บันทึกครั้งแรก (ไม่มีช่องเปลี่ยน มีแต่แนบไฟล์) เกิด audit `update` before `{}` after `{}` → R10v3-N4
**สถานะ**: ✅

### R10g.5 สถานะปลาย R10g
- เคสใหม่ค้างไว้: UAT-CO1-901 `approved` ทีม A (ไม่มอบหมาย) · UAT-CO1-902 `draft` โหมดชุด ไม่มีเอกสาร active
- Q-FP ปลาย: cases 8→10 · notifications 62→63 (แจ้งรับเคส) · `audit_n` 385→399 (+14 จาก R10g) · อื่นเท่าเดิม (ไม่มี assignment/expense/bank_transactions ใหม่)
- ไฟล์ขยะ/ตัวอย่างที่ต้องลบก่อนใช้งานจริง: Supabase Storage `cases/b976a24e-af0d-490c-a8be-e402f9b9ecd4/bundle_doc/…R10g-bundle-12MB-8pages.pdf` (12 MB) · `cases/76ef07bb-4a2f-4b39-8c37-2492cf2b4e38/contract_doc/…R10g-902-contract.pdf` · `…/national_id_doc/…R10g-902-idcard.png` (2 ตัวหลัง soft-delete แล้ว) · ในเครื่อง `uat/fixtures/files/R10g/` (PDF 12 MB + 26 MB + ไฟล์เล็ก 2) · `uat/fixtures/downloads-R10v3/` (6 ไฟล์)

---

## 🐞 บั๊กที่พบ

| id | ระดับ | ชนิด | สรุป | reproduce | สถานะ |
|---|---|---|---|---|---|
| R10v3-B01 | S5 | code | login: บัญชีที่มีจริงตอบ ~210 ms แต่ไม่มีจริงตอบ ~60–100 ms (คงที่ ~3 เท่า) → ไล่หา username จากเวลาได้ · ทางที่มีจริงยิง `getAuthEmail` + `signInWithPassword` ส่วนที่ไม่มีจริงยิงแค่ `verifyPassword(LOGIN_TIMING_DUMMY_EMAIL)` (`lib/auth/auth-service.ts` ~บรรทัด 97–114) | `POST /api/auth/login` รหัสผิดสลับกับผู้ใช้ไม่มีจริง | open |
| R10v3-B02 | S2 | code | `PATCH /api/settings/functional-permissions` ตอบ **500** เมื่อชน `CAPABILITY_LOCKED`/`CAPABILITY_NOT_FOUND` — `toModuleErrorResponse` ไม่แปลง `RoleError` (route `/api/roles/:id/permissions` ตอบ 400 ถูก) · ยามล็อกยังกันไว้ ไม่มี mutation | admin ส่ง entries มี `unlock_period`/`manage_roles` | open |
| R10v3-B03 | S4 | code | preview นำเข้าเคส: ข้อความ error ขึ้นต้นด้วยชื่อฟิลด์ดิบ `assetImeiSerial:` + เลขที่สัญญาของแถวที่ไม่ผ่านแสดง “–” | นำเข้า CSV ที่ IMEI = `3.5E+14` | open |
| R10v3-B04 | S4 | code | modal ผู้ตรวจ: กดรับเคสไม่ติ๊กเอกสารชุด → ข้อความ error ขึ้นบนสุดของ modal ซึ่งเลื่อนลงอยู่ ผู้ใช้ไม่เห็น (ไม่เลื่อนไปหา) | R10g.3 ข้อ 5 | open |
| BUG-133 | — | — | `/reports/kpi-summary` ผู้ไม่มีสิทธิ์ → 500 (การเงิน/บัญชี/ทีม×3) | — | known |

ไม่พบสิทธิ์รั่ว (S3) · ไม่พบ scope leak

## ข้อสังเกต (ไม่ใช่บั๊ก / รอ triage)
- R10-N3 ยืนยัน (export E1 `{}` → 400 ก่อน 403) · R10-N4 ยืนยัน (users นอก scope 403 vs สุ่ม 404) · R10-N11 ยืนยัน (logout = ทุกอุปกรณ์) · R10-N10 ไม่ได้ probe เพิ่ม (กัน rate limit)
- **R10v3-N1** `/portal` เปิดได้ทุก session รวมบัญชีภายใน (หน้ารอสร้าง ไม่มีข้อมูล) — Phase 7 ควรจำกัดเฉพาะกลุ่มบริษัท
- **R10v3-N2** บริหารเห็นแท็บบัญชี 7 แท็บที่เปิดแล้วขึ้น “ไม่มีสิทธิ์” แทนการซ่อน
- **R10v3-N3** พนักงาน in2 เห็น C7 ในแท็บปิดแล้ว (เคยถูกมอบแล้วถูกย้ายออก) — ตรวจว่าตั้งใจให้เห็นประวัติ
- **R10v3-N4** บันทึกแก้ไขเคสที่ไม่มีช่องเปลี่ยน (มีแต่แนบไฟล์) เกิด audit `update` before/after `{}`

## ❓ ต้องตัดสินใจ
- ❓-R10-3 / O37 สิทธิ์ 3 ระดับของบริษัทเท่ากันหมด (co1.mgr = co1.sup = co2.admin ทุก endpoint) → Phase 7
- ❓ R10-N11 logout ควรเป็น `global` (ทุกอุปกรณ์ — ปัจจุบัน) หรือ `local`
- ❓ R10v3-N1 จำกัด `/portal` เฉพาะกลุ่มบริษัทตอนนี้เลย หรือรอ Phase 7
