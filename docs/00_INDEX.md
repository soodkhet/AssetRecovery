# 00_INDEX.md — ดัชนีเอกสารทั้งหมด (1 บรรทัดต่อไฟล์)

> **ลำดับความสำคัญเมื่อเอกสารขัดกัน**: `02` (schema) → ไฟล์ spec ของ module → reference กลาง (`22`/`23`/`24`/`25`/`26`/`27`/`45`) → mockup (`reference/*.html`) — ขัดกันจริงให้ `[[NEEDS_DECISION]]` · mockup ใช้เฉพาะเรื่อง UI/layout ห้ามอ้าง business logic
> ไฟล์ 39, 42, 43 ไม่มีจริง (merge เข้า 38 และ 41 แล้ว — ไม่ renumber เพื่อรักษาการอ้างอิงเดิม)

## เอกสารคุมโปรเจกต์ (ชั้นใหม่)

| ไฟล์ | เนื้อหา |
|---|---|
| `00_INDEX.md` | ไฟล์นี้ — ดัชนี + ลำดับความสำคัญ |
| `00_MAP.md` | ช่วงบรรทัดของไฟล์ใหญ่ทุกไฟล์ — เปิดก่อน Read เสมอ |
| `01_PLAN.md` | แผนงานละเอียดทุก task: scope + reading list + งบ context + DoD |
| `03_PRODUCTION_CHECKLIST.md` | สิ่งที่ต้องทำครบก่อนเปิด PR แรกจาก `staging` เข้า `main` (Supabase production / env / seed / verify การแยก env) |
| `PROGRESS_ARCHIVE.md` | รายละเอียดเต็มของงานที่เสร็จแล้ว (ย้ายมาจาก PROGRESS.md) |
| `REUSE_INDEX.md` | ของที่มีแล้ว/แม่แบบ/กับดัก — เช็คก่อนเขียนโค้ดใหม่ทุกครั้ง |
| `README.md` | Build Specification Index ฉบับเดิม (tech stack, file index, key business rules) |
| `implementation-todo.md` | Execution roadmap ฉบับเดิม (Phase 0–7 เชิง checklist — แผนที่ใช้จริงคือ 01_PLAN.md + PROGRESS.md) |
| `tool-register.md` | เครื่องมือ/บัญชีที่ PO ต้องสมัครก่อนเริ่ม (GitHub/Vercel/Supabase ฯลฯ) |

## Foundation & Platform (00–06, 90–95)

| ไฟล์ | เนื้อหา |
|---|---|
| `00-project-overview.md` | ขอบเขตธุรกิจ, Actors, Hybrid Accounting Boundary ที่ทุก module ต้องเคารพ |
| `01-architecture.md` | Tech Stack (DEC-001), Permission Architecture (DEC-002), Layer Architecture, Jobs/Audit/Export |
| `02-database-schema-design.md` | **Full Production Schema — 51 ตาราง 54 enums** + migration order + seed + Immutable Rules (ไฟล์ใหญ่ — ใช้ MAP) |
| `03-non-functional-requirements.md` | NFR + **Datetime Standard §6.5 (บังคับทุก module)** + RPO/RTO 24/24 |
| `04-ui-ux-design-system.md` | Design tokens: font, status badge 10 กลุ่ม, component classes, กฎ datetime บน UI |
| `05-auth-and-access-control.md` | Login/Session (24 ชม.)/MFA (ปิดเฟส 1)/Route guard/Supabase Auth |
| `06-menu-and-navigation-map.md` | Top Nav 7 เมนู + sub-tabs ทุกโมดูล + Role×Menu Visibility Matrix |
| `90-platform-audit-notification-reporting.md` | Audit Log (immutable, 9 fields, 5 ปี) + Notification (Push/In-app) + event trigger list §6.3 + PDPA draft |
| `91-platform-api-integration-jobs.md` | Background Jobs (idempotent + idempotency_key), job lifecycle, dev trigger endpoint |
| `92-platform-data-model.md` | ภาพรวมความสัมพันธ์ + **Warehouse gate + Snapshot pattern §7.1** (index — field จริงอยู่ `02`) |
| `93-roadmap-open-items.md` | **Consolidated Open Items ทุกเรื่อง §7.1** + Phase 2 roadmap |
| `94-decision-log.md` | DEC-001…DEC-009 ครบ — เปลี่ยน architecture ต้องเพิ่ม DEC ที่นี่ |
| `95-diagrams.md` | Mermaid: System Architecture + ER + Use Case + Main Workflow (SSOT ของ diagram) |

## Settings Module (07–13)

| ไฟล์ | เนื้อหา |
|---|---|
| `07-roles-permissions.md` | **Master Role List 15 roles / 4 groups** (SSOT) + permission matrix ระดับ capability |
| `08-users.md` | User CRUD + lifecycle + Supabase Auth linking + conditional team/company |
| `09-teams.md` | Teams: Manager N:N / Supervisor เดี่ยว, บังคับผูก Compensation Plan, จังหวัด |
| `10-finance-companies.md` | บริษัทไฟแนนซ์ + Company User + **Service Fee snapshot ตอนเคส approved §9.2** |
| `11-compensation.md` | แผนค่าตอบแทน: fuel PER_KM/DAILY_FLAT, commission/no_success_fee, versioning |
| `12-service-fee.md` | Service Fee Template: SUCCESS_FEE/FLAT/HYBRID + charge_on_fail + basis |
| `13-accounting-finance-settings.md` | **ตั้งค่ากลาง 13 sub-tabs** (cycles/approval/bank/tax/VAT/cost center/bank file/permission 3 ระดับ/lock/numbering/template) (ไฟล์ใหญ่ — ใช้ MAP) |

## Finance Module (14–21) + Finance Reference (22–29)

| ไฟล์ | เนื้อหา |
|---|---|
| `14-finance-dashboard.md` | KPI 4 ตัว + exception list (read-only) |
| `15-claims-and-advances.md` | Claim (auto+manual) + Advance 5 สถานะ + ห้ามเบิกซ้อน + auto-overdue |
| `16-compensation-approval.md` | Multi-step approval ตาม matrix + reject=reset step 1 + แยก reject_expense/reject_evidence |
| `17-payroll-and-payout.md` | Payout Batch แยก side + WHT + Bank File + **Idempotency Key §6.3** |
| `18-payee-and-tax-profile.md` | Payee + verification gate + **WHT Priority: Payee ชนะ Plan §6.3** |
| `19-revenue-billing-receivable.md` | **Revenue trigger ซับซ้อนสุด §6.1** + Billing Batch + AR Aging + VAT versioning §6.3 |
| `20-adjustment.md` | ทางเดียวที่แก้ยอดย้อนหลัง — separate FK (DEC-004) + ระดับอนุมัติตาม period lock |
| `21-profitability-report.md` | Gross Profit actual (ไม่ใช่ projection) + drill-down |
| `22-finance-calculation-spec.md` | **SSOT สูตรคำนวณเงินครบ 13 สูตร** — ห้าม hardcode สูตรเองทุกกรณี |
| `23-finance-state-machines.md` | State machine ครบ 16 entity + cross-entity flow §7 |
| `24-finance-validation-rules.md` | Error code dictionary 33 codes / 8 หมวด — ห้ามตั้ง code ใหม่โดยไม่เช็ค |
| `25-finance-permission-matrix.md` | Permission matrix 10 roles × 26 capabilities + mapping DEC-009 (view/manage/✅only) |
| `26-finance-data-model.md` | Entity index ฝั่งการเงิน + polymorphic DEC-004 (field จริงอยู่ `02`) |
| `27-finance-api-contracts.md` | API endpoints ครบ 16 กลุ่ม Finance/Accounting + REST convention |
| `28-finance-export-pdf-spec.md` | เอกสาร export: PDF ภายใน 5 + ทางการ 2 (ใบกำกับ/50 ทวิ — ฟิลด์กฎหมาย) + XLSX (@react-pdf/renderer) |
| `29-finance-acceptance-tests.md` | E2E 5 scenarios + Integration checklist 9 จุด — definition of done ของ Finance |

## Accounting Module (30–37)

| ไฟล์ | เนื้อหา |
|---|---|
| `30-accounting-handover-monthly-close.md` | Accounting Period + **Readiness Check 3 เงื่อนไข** + Lock/Unlock (Executive) |
| `31-accounting-sales-and-receipts.md` | Sales Record + Tax Invoice (auto-number ห้าม gap, active→cancelled) + Cash Receipt (จาก 35 เท่านั้น) |
| `32-accounting-expenses-payments.md` | Expense Record (sync จาก payout completed) + Cost Center mapping |
| `33-accounting-wht-data.md` | WHT Certificate 50 ทวิ (active→cancelled + replaces) + ภ.ง.ด.3/53 + due date countdown |
| `34-accounting-document-checklist-exceptions.md` | Exception (info/warning/critical) + **Critical open บล็อก Export** + Authorized (ไม่สืบทอดข้ามรอบ) |
| `35-bank-reconciliation.md` | Import statement + auto/manual matching 4 สถานะ + match_note บังคับ |
| `36-accountant-questions.md` | Q&A กับสำนักงานบัญชี (เล็กสุด — ⚠️ เลข section ต่างจากไฟล์อื่น) |
| `37-accounting-pack-export-history.md` | Export Pack 8 ไฟล์ 01–08 + versioning + SHA-256 + generated→sent→accepted |

## Case & Field Operations (38–45)

| ไฟล์ | เนื้อหา |
|---|---|
| `38-case-submission.md` | รับเคส 3 ช่องทาง + review + Recycle flow (ไฟล์ใหญ่ — ใช้ MAP) |
| `40-case-assignment-routing.md` | มอบหมายงาน + reassign 2 branch + timeout + Kanban (ไฟล์ใหญ่ — ใช้ MAP) |
| `41-field-tracker-mobile.md` | **Field Tracker Mobile+Desktop** — GPS check-in, ปิดงาน, expense auto, QC ตีกลับ 2 เส้นทาง §10.1 (ไฟล์ใหญ่สุด — ใช้ MAP) |
| `44-asset-custody-handover.md` | Warehouse: IMEI intake, HandoverLot, **confirm = transaction 4 steps §11** (ใช้ MAP) |
| `45-case-warehouse-api-contracts.md` | API contracts รวม 37 endpoints + 28 events ฝั่ง Case/Warehouse (คู่กับ `27`) |

## Reports & Portal (96–97)

| ไฟล์ | เนื้อหา |
|---|---|
| `96-reports.md` | **17 รายงาน 4 หมวด** F1–F5/O1–O5/A1–A4/E1–E3 + data source + cache + permission ครบ |
| `97-client-portal.md` | Portal read-only ของบริษัทไฟแนนซ์ — `/api/portal/*` GET เท่านั้น + company_id scope (ใช้ MAP) |

## Decision & Planning

| ไฟล์ | เนื้อหา |
|---|---|
| `DECISIONS-NEEDED.md` | รายการตัดสินใจนอกเรื่องบัญชี 5 หมวด + สถานะ (Tech Stack ปิดครบ) |
| `DECISIONS-NEEDED-BATCH6.md` | D1–D10 Consistency Sync — **PO ตอบครบแล้ว → DEC-006** |
| `QUESTIONS-FOR-ACCOUNTANT.md` | 18 คำถามนักบัญชี 7 หมวด (ส่วนใหญ่เป็น config ไม่บล็อก build) |

## reference/ (UI Mockups + Samples)

| ไฟล์ | ใช้กับ |
|---|---|
| `login.html` / `app-shell.html` | ไฟล์ 05 / โครง shell (04, 06) |
| `settings.html` | ไฟล์ 07–13 ทุกแท็บ (ไฟล์ใหญ่ — ใช้ MAP) |
| `38-case-submission-mockup.html` / `case-management.html` | ไฟล์ 38 |
| `40-case-assignment-mockup.html` | ไฟล์ 40 |
| `41-field-tracker-mobile-mockup.html` / `41-field-tracker-desktop-mockup.html` | ไฟล์ 41 |
| `warehouse.html` | ไฟล์ 44 |
| `finance.html` | ไฟล์ 14–21 ทุกแท็บ (ใหญ่สุด — ใช้ MAP) |
| `accounting.html` | ไฟล์ 30–37 ทุกแท็บ (ใช้ MAP) |
| `reports.html` | ไฟล์ 96 |
| `notifications.html` | ไฟล์ 90 §6.3 |
| `dashboard.html` | 🔶 DRAFT — ยังไม่มี spec .md (รอ PO) ห้ามใช้ implement |
| `97-client-portal-mockup.html` / `97-client-portal-mobile-mockup.html` | ไฟล์ 97 |
| `samples/01_tax_invoice.pdf` … `08_Document_Checklist.xlsx` | template ตัวอย่างของ Export Pack + เอกสารทางการ (ไฟล์ 28, 31, 33, 37) |
| `samples/01_Revenue.csv` … `07_Adjustment_Log.csv` | ตัวอย่าง format CSV ของ Export Pack (ไฟล์ 37 §6.1) |
