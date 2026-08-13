# 01_PLAN.md — แผนงานละเอียดทั้งโปรเจกต์ (ทุก Task + Reading List + งบ Context)

> **วิธีใช้**: ไฟล์นี้คือรายละเอียดเต็มของทุก task ใน `PROGRESS.md` — ตอนเริ่ม session ให้อ่าน**เฉพาะ § ของ task ที่กำลังทำ** (ห้ามอ่านทั้งไฟล์) · ตอนจบ task ให้คัดรายละเอียดของ task ถัดไปจากที่นี่ไปใส่ส่วน "🎯 งานถัดไป" ใน PROGRESS.md
> อัปเดตไฟล์นี้เมื่อ: แตก task ใหม่ / scope เปลี่ยน / ประเมินงบใหม่จากของจริง

## วิธีคิดงบ Context (Opus 5 — window 1M, เพดานใช้งาน 800k)

- **ต้นทุนคงที่ต่อ session ≈ 60k tokens**: CLAUDE.md + PROGRESS.md + WORKFLOW.md + § ของ task ใน PLAN นี้ + rules ที่เกี่ยว + MAP lookup + overhead เครื่องมือ
- **ต้นทุนอ่าน spec**: ประเมินจากขนาดไฟล์ ≈ bytes ÷ 3.5 (ไทยปน English markdown) — ไฟล์ใหญ่อ่านผ่าน MAP เฉพาะ section จึงต่ำกว่าตัวเลขเต็มมาก
- **ต้นทุนเขียนโค้ด ≈ 100 tokens/LOC ใหม่** (รวม iterate + verify + fix) — ตัวเลข LOC ในแผนคือค่ากลาง อาจ ±30%
- ตัวเลข "งบรวม" ต่อ task ด้านล่างเผื่อแล้ว — ทุก task ออกแบบให้จบ **ต่ำกว่า 500k** เพื่อเหลือ margin ถึงเพดาน 800k เกินครึ่งเสมอ
- ถ้าระหว่างทำจริง context แตะ **600k** ให้เริ่มเก็บงาน และแตะ **800k** ต้อง commit + `[[HANDOFF]]` ตาม WORKFLOW.md
- กันเหตุ "ซอยถี่เกิน": task ถูกจัดให้ใหญ่ที่สุดเท่าที่ยัง verify จบในตัวได้ — **ห้ามรวม task เพิ่มเอง** และห้ามแตกย่อยเพิ่มถ้าไม่จำเป็นจริง (ทุกครั้งที่ขึ้น session ใหม่มีต้นทุนคงที่ ~60k)

## กติกาการแตก task เพิ่ม (ถ้าจำเป็น)

migration/schema เป็นก้อนแรกเสมอ → สูตร/ตรรกะสำคัญแยก pure module + test ก่อน router/UI → backend ก่อน UI ตามทีหลัง → หน้าหลายแท็บแตกที่ขอบแท็บ · ตั้ง id เป็น `<เดิม>a`, `<เดิม>b` ใน PROGRESS.md

---

# Phase 0 — Infrastructure & Automation Setup

> **Prerequisite (งานคน — ทำนอกระบบก่อนเริ่ม 0.1)**: สมัคร GitHub Organization + Vercel (Pro) + Supabase 2 projects (staging ฟรี / production Pro) ตาม `docs/tool-register.md` แล้วส่งค่าตาม checklist ท้ายไฟล์นั้น · ยืนยัน package manager (แนะนำ pnpm)
> **หมายเหตุ local-first**: เจ้าของโปรเจกต์จะพัฒนาบนเครื่อง local เป็น staging โดยมี Docker — ให้ 0.1 จัด docker-compose PostgreSQL สำหรับ dev/test ในเครื่อง (Prisma ต่อได้ปกติ) ส่วน Supabase Auth/Storage ใช้ staging project จริงตาม DEC-001 — **ห้ามเปลี่ยน production architecture โดยไม่มี DEC ใหม่**

### 0.1 — Bootstrap โปรเจกต์ Next.js + โครงสร้าง + CI
- **ขอบเขต**: `create-next-app` (App Router + TS + Tailwind + ESLint) · ติดตั้ง Prisma + Supabase client + vitest + Zod · โครงโฟลเดอร์ตาม `docs/implementation-todo.md` §0.2 (`/app /components /lib /middleware.ts /prisma`) · `.env.example` · `docker-compose.dev.yml` (PostgreSQL local) · `.github/workflows/ci.yml` (install/lint/typecheck/build) · scripts ใน package.json: `typecheck`, `test`, `db:seed` · push เข้า branch `staging`
- **อ้างอิง**: `docs/implementation-todo.md` (Phase 0 ทั้งหมด), `docs/tool-register.md`, `docs/01-architecture.md`
- **LOC ~600 (config) · งบรวม ~150k / 800k**
- **DoD**: `pnpm typecheck && pnpm build` เขียว · CI รันผ่านบน PR แรก · dev server ขึ้น local ได้

### 0.2 — Deploy pipeline แยก Staging/Production
> ⚠️ **Schema ownership**: Prisma เป็นเจ้าของ schema แต่เพียงผู้เดียว — Supabase project มี GitHub integration เชื่อมอยู่ (inert) **ห้ามเปิด Branching / migration sync / แก้ตารางผ่าน Dashboard** ทุกกรณี (ดู `.claude/rules/02-database.md`)
> **มติ PO 2026-08-12**: เลื่อนการสร้าง Supabase Production ออกไปจนกว่า staging จะสมบูรณ์พร้อมใช้งาน — task นี้ทำ**เฉพาะฝั่ง staging** ให้จบ (Vercel + env staging + verify) ส่วนฝั่ง production (สร้าง project Pro + env `main` + migrate/seed + Organization/Tax ID จริง) แยกเป็น **checklist ก่อนเปิด PR เข้า `main` ครั้งแรก** — ห้าม merge PR แรกก่อนทำครบ · checklist ฉบับเต็มอยู่ที่ **`docs/03_PRODUCTION_CHECKLIST.md`** (เขียนแล้วใน 0.2)
- **ขอบเขต**: ผูก Vercel กับ repo · env vars แยกชุดตาม branch (`staging` → Supabase staging, `main` → Supabase production) ขั้นต่ำ: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` · domain ชั่วคราว 2 ตัว · Branch Protection บน `main` (require PR + **จำกัดให้ merge ได้เฉพาะ PR จาก `staging`** — Release Flow ตาม `.claude/rules/06-git-workflow.md`: local → push staging → ทดสอบบนระบบจริง → PR staging→main เท่านั้น) · verify แยกจริง (สร้าง table ทดสอบใน staging DB → production ต้องไม่มี)
- **อ้างอิง**: `docs/implementation-todo.md` §0.3–0.6, `docs/tool-register.md`
- **LOC ~200 · งบรวม ~120k** · ⚠️ ต้องมีบัญชี/สิทธิ์จาก Prerequisite ครบก่อน — ขาด → `[[NEEDS_DECISION]]`
- **DoD**: push `staging` เห็นผลที่ domain staging · merge `main` ผ่าน PR เห็นผลที่ domain production · DB แยกกันจริง

### 0.3 — Adapt Orchestrator + Dev Panel เข้าโปรเจกต์นี้
- **ขอบเขต**: ทำตาม `promptmovetools.md` **ทั้งไฟล์อย่างเคร่งครัด** (ห้ามเขียนใหม่จากศูนย์ ห้ามแตะ logic ที่มี comment บทเรียน) — แก้ `orchestrator/config.mjs` (verify commands ของโปรเจกต์นี้, **`baseBranch = staging`** ตาม Release Flow ใน rules/06 — สายพัฒนาคือ staging ไม่ใช่ main, finalTestStages, uiTaskPrefixes) · แทน RULES ใน `lib/prompt.mjs` ด้วยกติกาจาก CLAUDE.md ของโปรเจกต์นี้ + path เอกสาร (docs/00_MAP.md, docs/01_PLAN.md, docs/REUSE_INDEX.md) · เขียน `review-prompt.md` / `final-test-prompt.md` / `final-tests/*.md` ใหม่ตามโปรเจกต์นี้ (โครงเดิมเป็นแม่แบบ) · `tools/devpanel/server.mjs` SERVICES/TASKS/docker ตาม stack จริง + `index.html` header/desc · ตรวจไม่มี state เก่า (queue/logs/.token/.run.lock/review-checkpoint.json) · README/REMOTE/ADAPT_GUIDE อัปเดต path
- **อ้างอิง**: `promptmovetools.md` (ทั้งไฟล์ — เป็น requirement หลัก), `orchestrator/ADAPT_GUIDE.md`, `orchestrator/config.mjs`
- **LOC ~500 (แก้ไข) · งบรวม ~280k** (โค้ด orchestrator อ่านผ่าน grep เฉพาะจุด hardcode ที่ promptmovetools ระบุ)
- **DoD**: ตาม Definition of Done 7 ข้อใน promptmovetools.md (`node --check` ทุกไฟล์ที่แก้ · `orchestrate.mjs status` แสดง % + งานถัดไปถูกต้อง · `run --dry-run` ได้ prompt อ้างเอกสารโปรเจกต์นี้ · dashboard + dev panel เปิดใช้จริง · grep RTB/Boonphone เหลือเฉพาะจุดตั้งใจ · รายงานจุดที่ตัดสินใจเอง)

---

# Phase 1 — Foundation (Database → Auth → Master Data → Settings)

> ลำดับ dependency ใน Phase นี้: 1.1→1.2 (schema ก่อนทุกอย่าง) · 1.3 ต้องมี 1.2 (seed roles) · 1.6 ก่อน 1.7–1.9 (permission middleware ใช้ทุก module) · 1.7 ก่อน 1.8 (teams FK→compensation, companies FK→service fee) · 1.10 ก่อน 1.11/1.12

### 1.1 — Prisma Schema ชุดที่ 1: Enums ทั้งหมด + Group A (Identity) + Group B (Master Data)
- **ขอบเขต**: แปลง DDL จาก `02` เป็น `prisma/schema.prisma` — enum ครบ 54 ตัว (`02` §3, L76–345) + 5 ตาราง Group A (§4, L349) + 14 ตาราง Group B (§5, L443) ตาม convention §2 เป๊ะ (satang, common columns, soft delete, ข้อยกเว้นตารางที่ไม่ครบ §2.4) · migration + ตรวจ CHECK `cycles_cutoff_shape` (L654 — Prisma ไม่รองรับ CHECK ต้องใส่ผ่าน raw SQL migration) · จุดระวัง: circular FK users↔teams↔organizations ใช้ DEFERRABLE (§11 L1603)
- **อ้างอิง**: `02` ผ่าน MAP §2 (L34), §3 (L76), §4 (L349), §5 (L443), §11 (L1545) · `26`, `94` (DEC-004)
- **LOC ~1,800 · งบรวม ~280k**
- **DoD**: `prisma migrate dev` ผ่าน · `prisma validate` เขียว · spot-check field ทุกตารางเทียบ `02` (ใช้ subagent ตรวจไขว้) ครบ 19 ตาราง + 54 enums

### 1.2 — Prisma Schema ชุดที่ 2: Group C–G (32 ตาราง) + Seed Data
- **ขอบเขต**: ตาราง Group C Case (§6 L726, 7 ตาราง) + D Warehouse (§7 L915, 2) + E Finance (§8 L995, 8) + F Accounting (§9 L1230, 11) + G Platform (§10 L1466, 4) · constraint พิเศษ: partial unique `uniq_active_advance_per_payee` (L1094), generated column `advances.return_satang` (L1075), CHECK `adjustments_one_target`/`bank_tx_one_match`/`bank_tx_status_fk_shape` — ทั้งหมดผ่าน raw SQL migration · `prisma/seed.ts` ตาม `02` §12 (L1609): organization 1, roles 15 (`is_seed=true`), VAT 7%, tax profiles 2, finance_policy_settings 1, capabilities 37 รายการตามไฟล์ `25`/`13` §6.10 · script `pnpm db:seed`
- **อ้างอิง**: `02` ผ่าน MAP §6–§12 · `25` (capability list), `07` §5 (รายชื่อ 15 roles), `13` §6.10
- **LOC ~1,800 · งบรวม ~290k**
- **DoD**: migrate + seed รันจริงบน staging DB · query เห็น 15 roles + capabilities ครบ · Immutable Rules `02` §13 บันทึกเป็น TODO comment ณ ตารางที่เกี่ยว (บังคับจริงใน task ของ module)

### 1.3 — Auth & Access Control + Permission Middleware
- **ขอบเขต**: Supabase Auth integration (server/client แยก) · `/middleware.ts` verify JWT · `requirePermission(action, resource, scope)` + scope resolver (global/team/company/self ตาม role_group) + session cache role+scope (ไม่ query DB ทุก request) · session timeout 24 ชม. · guard ห้าม deactivate Superadmin คนสุดท้าย · audit hooks login/logout/failed (ใช้ audit core จาก 1.4 — ถ้าทำก่อน 1.4 ให้ stub interface) · หน้า Login จาก `reference/login.html` · route guard + `<Can>`/`usePermission()`
- **อ้างอิง**: `05` ทั้งไฟล์ · `07` §6–§7 · `01` §6.1 · `02` Group A · mockup `login.html`
- **LOC ~1,800 · งบรวม ~280k**
- **DoD**: login/logout จริงบน staging · user ไม่ active ถูกปฏิเสธ · endpoint ไม่มีสิทธิ์ตอบ 403 แม้เรียกตรง · test permission middleware ครอบ scope ทั้ง 4 แบบ

### 1.4 — Audit Core Service (immutable)
- **ขอบเขต**: audit emit helper กลาง (9 fields บังคับ) + validator `reason` เมื่อกระทบเงิน/สิทธิ์/ธนาคาร/ภาษี/lock · immutable guard ระดับ DB (trigger/rule ห้าม UPDATE/DELETE `audit_logs`) + ระดับ service · before/after diff util · ทุก module หลังจากนี้เรียกผ่าน helper นี้เท่านั้น
- **อ้างอิง**: `90` §6.1, §13, §16–17 · `02` Group G (L1470)
- **LOC ~1,000 · งบรวม ~180k**
- **DoD**: test พิสูจน์ UPDATE/DELETE audit ถูก reject ที่ DB · mutation ตัวอย่างผ่าน helper แล้วมี record ครบ 9 fields

### 1.5 — UI Kit + App Shell + Navigation
- **ขอบเขต**: Design tokens ตาม `04` §8.1 (font Inter+Noto Sans Thai, statusBadge mapper 10 กลุ่ม, component classes) → shared components: Button/Table/Modal/Badge/Input/Card/Toast + loading/empty/error states · datetime utils (`fmtDate`/`fmtDateTime` พ.ศ., TZ Asia/Bangkok — `03` §6.5) · satang display utils · Top Nav 7 เมนู + sub-tab shell + menu registry filter ตาม role (`06` §7.2 Top Nav Visibility Matrix) + `GET /api/meta/menu` · โครงหน้าแดชบอร์ดหลักเป็น placeholder (spec จริงยังรอ PO — Phase 6.6)
- **อ้างอิง**: `04` ทั้งไฟล์ · `06` ผ่าน MAP §7–§8 · `03` §6.5 · mockup `app-shell.html`, `login.html`
- **LOC ~1,700 · งบรวม ~280k**
- **DoD**: ทุกหน้าใหม่หลังจากนี้ใช้ shared components เท่านั้น · nav แสดง/ซ่อนตาม role ถูกต้องตาม matrix `06` §7.2 · เพิ่มรายการทั้งหมดลง `docs/REUSE_INDEX.md`

### 1.6 — Roles & Permissions Module (ไฟล์ 07)
- **ขอบเขต**: BE: roles/capabilities API 4 endpoints + guards `SEED_ROLE_DELETE`/`SEED_ROLE_RENAME`/`LAST_SUPERADMIN_REMOVAL` + permission resolve (role→capability set + access_level view/manage ตาม DEC-009, Superadmin implicit-manage) · FE: หน้า "บทบาทและสิทธิ์" 3 tab หลัก (แอดมิน / เจ้าหน้าที่ติดตามทรัพย์ [sub-toggle Inhouse/Outsource] / บริษัทไฟแนนซ์) + Permission Matrix editor (disabled ตาม editable, Seed badge)
- **อ้างอิง**: `07` ทั้งไฟล์ · `25` · `13` §6.10 · mockup `settings.html` ผ่าน MAP (render roles)
- **LOC ~1,900 · งบรวม ~290k**
- **DoD**: ลบ/เปลี่ยนชื่อ seed role ถูก reject · role ชื่อซ้ำข้าม group เป็นคนละ record จริง · matrix แก้ได้เฉพาะ editable + audit

### 1.7 — Compensation Plans (11) + Service Fee Templates (12)
- **ขอบเขต**: BE 11: fuel 2 โหมด (PER_KM: rate+max_per_case / DAILY_FLAT) validate เลือกได้โหมดเดียว + commission/no_success_fee (mutually exclusive ตาม outcome) + allowance/hotel/WHT/receipt_required + **versioning: PATCH สร้าง version ใหม่ไม่ overwrite** + snapshot resolver · BE 12: 3 model SUCCESS_FEE/FLAT/HYBRID + conditional validation (base/rate/basis/charge_on_fail ตาม model) + `TEMPLATE_IN_USE`/`INVALID_RATE_RANGE` · FE: การ์ดเทมเพลตทั้งสองแบบ (DEC-008 — service fee เป็นการ์ด แสดงสูตร 2 กรณี), form conditional fields, version history
- **อ้างอิง**: `11`, `12` ทั้งไฟล์ · `22` §6.1–6.7 · mockup `settings.html` ผ่าน MAP (compensation/servicefee)
- **LOC ~2,400 · งบรวม ~340k**
- **DoD**: test conditional validation ครบทุก model/โหมด · แก้ template ที่ถูกใช้แล้ว → version ใหม่ · audit+reason ครบ

### 1.8 — Teams (09) + Finance Companies (10)
- **ขอบเขต**: BE 09: teams + `team_managers` N:N (Manager หลายทีม / Supervisor เดี่ยว 1 ทีม) + บังคับ compensation_plan ตอนสร้าง + guard deactivate ทีมที่มีงาน active + provinces (PROVINCE_DATA master) · BE 10: companies CRUD + tax_id 13 หลัก format-only + `DUPLICATE_TAX_ID` + suspend (reason บังคับ, event `finance-company.suspended`) + company users sub-resource + vat_registered/delivery_format · FE: ตารางทีม + form (plan dropdown, manager multi-select, supervisor select, province picker) · การ์ดบริษัท (ไม่ใช่ตาราง) + form + suspend dialog
- **อ้างอิง**: `09`, `10` ทั้งไฟล์ · mockup `settings.html` ผ่าน MAP (teams/companies)
- **LOC ~2,200 · งบรวม ~330k** · หมายเหตุ: snapshot service ตอนเคส approved อยู่ Phase 2.3 (spec เจ้าของ `10` §9.2)
- **DoD**: ทีมไม่มีแผน → สร้างไม่ได้ · tax_id ซ้ำ → reject · company user เห็นเฉพาะ company ตัวเอง

### 1.9 — Users Module (08)
- **ขอบเขต**: BE: users CRUD + Supabase Auth provisioning (`supabase_uid`) + conditional required (`team_id` ถ้า inhouse/outsource, `company_id` ถ้า finance_company) + lifecycle active→suspended→deleted (soft) + `USER_HAS_HISTORY` + suspend/reactivate พร้อม reason · FE: 3-tab nested (reuse component จาก 1.6) + search/filter + form cascading role select
- **อ้างอิง**: `08` ทั้งไฟล์ · `05` §10 · mockup `settings.html` ผ่าน MAP (users)
- **LOC ~1,700 · งบรวม ~260k**
- **DoD**: สร้าง user แล้ว login ได้จริงผ่าน Supabase Auth · hard-delete user มี history ถูก reject

### 1.10 — Settings ไฟล์ 13: Backend ครบ 13 หมวด
- **ขอบเขต**: API + validation + audit ทั้ง 13 sub-sections — §6.1 Cycles (CHECK cutoff_shape) · §6.2 Approval Matrix (threshold เป็น satang) + §6.2.1 Finance Policy (1 record/org) · §6.3 Bank Accounts (usage enum, ห้ามลบที่มีรายการผูก, `is_payout_account` deprecated ห้ามใช้) · §6.4 Tax Profiles (WHT 3% default, applies_to ไม่มี inhouse) · §6.5 VAT Rate effective-dated + `VAT_RATE_OVERLAP` resolver · §6.6 Cost Centers (auto running code) · §6.7/§6.9 read-only endpoints · §6.8 Bank File Formats + `POST /:id/test` + `BANK_FILE_NOT_TESTED` gate · §6.10 Functional Permission Matrix (37 รายการ, 3 ระดับ, 7 รายการ "✅ only" ล็อก Superadmin) · §6.11 Period Lock Policy + interceptor `PERIOD_LOCKED_DIRECT_EDIT` (โครง — บังคับจริงตอน Phase 4) · §6.12 Tax Invoice Numbering (sequence, yearly reset, `last_number` ห้ามแก้มือ) · §6.13 Tax Doc Template Settings · **เพิ่ม endpoint ที่ spec §13 ตกหล่น**: `/api/settings/finance-policy`, `/api/settings/tax-document-templates`
- **อ้างอิง**: `13` ผ่าน MAP ทีละ § · `27` §6.1 · `25` · `02` Group B
- **LOC ~3,100 · งบรวม ~430k**
- **DoD**: test VAT overlap/resolve ข้ามช่วงเวลา · bank file ใช้จริงไม่ได้จนกว่า test_status=passed · numbering ไม่มี gap ภายใต้ concurrency

### 1.11 — Settings FE ชุดที่ 1 (แท็บ §6.1, §6.2+6.2.1, §6.3, §6.6, §6.8)
- **ขอบเขต**: Settings shell 13 แท็บ + shared table/CRUD-modal pattern + แท็บ: Cycles · Approval Matrix + Finance Policy · Bank Accounts · Cost Centers · Bank File Format (สถานะทดสอบ + ปุ่ม test)
- **อ้างอิง**: `13` §7 + mockup `settings.html` ผ่าน MAP เฉพาะ render function ที่เกี่ยว
- **LOC ~2,000 · งบรวม ~310k**
- **DoD**: ทุกแท็บ CRUD ได้จริงบน staging ตรง pattern mockup

### 1.12 — Settings FE ชุดที่ 2 (แท็บ §6.4, §6.5, §6.7, §6.9, §6.10, §6.11, §6.12, §6.13)
- **ขอบเขต**: แท็บ Tax Profile · VAT Rate (timeline effective-date + overlap warning) · Internal Doc Templates (read-only) · Export Format (read-only) · Functional Permission Matrix (grid 37×role, dropdown 3 ระดับ, 🔒 7 รายการ) · Period Lock Policy (policy banner เหลือง) · Tax Invoice Numbering · Tax Doc Template
- **อ้างอิง**: `13` §7 + mockup `settings.html` ผ่าน MAP
- **LOC ~2,150 · งบรวม ~330k**
- **DoD**: ครบ 13 แท็บตรง spec + mockup · audit+reason ทุกจุดที่กำหนด

> ⏸️ **Checkpoint จบ Phase 1**: login ได้จริง มี user/role/permission ทำงานจริง ตั้งค่า master data ครบ — ยังไม่มี business flow

---

# Phase 2 — Case & Field Operations (ไฟล์ 38, 40, 41, 44, 45)

> ลำดับ: 2.1 (contract infra) → 2.2–2.5 (Case) → 2.6–2.7 (Assignment) → 2.8–2.12 (Field) → 2.13–2.15 (Warehouse — 2.13 ปิดวงจร expense unlock + Revenue ร่วมกับ Phase 3.6) · **ต้องมี Google Maps API key ก่อน 2.9** · Component reuse สำคัญ: Address form (2.4) และ Case Detail component (2.5) ถูกใช้ซ้ำใน 40/41

### 2.1 — API Contract Infra (ไฟล์ 45)
- **ขอบเขต**: TypeScript route contract จาก `45` §6.1–6.5 (37 endpoints) เป็น single source สำหรับ router + client typing · event registry (28 events §7) + naming lint · response envelope middleware `{success, data, error{code,message,field}}` + error-code catalog รวม (จาก `24` + `38`/`40`/`41`/`44`) · ⚠️ แก้ความไม่ตรงชื่อ event ระหว่าง `41` §17.2 / `44` §14 / `45` §7 — ยึดไฟล์ต้นทาง แล้วบันทึกลง PROGRESS_ARCHIVE
- **อ้างอิง**: `45` ทั้งไฟล์ · `24` · `27` §7 (convention)
- **LOC ~1,000 · งบรวม ~190k**
- **DoD**: ทุก endpoint หลังจากนี้ประกาศผ่าน contract นี้ · lint จับ event ชื่อนอก registry

### 2.2 — Case Submission Backend ชุดที่ 1 (schema + CRUD + เอกสาร)
- **ขอบเขต**: migration cases/case_contacts/case_documents/edit_history/recycle_history + unique `(finance_company_id, case_ref_normalized)` (normalize = uppercase+trim เท่านั้น) · `POST/GET /api/cases`, `GET /:id` + duplicate 2-layer check (DB + API pre-check พร้อมลิงก์เคสเดิม) + `edit_history` append-only · API ingestion สร้าง draft เสมอแม้ข้อมูลไม่ครบ (ยกเว้น ref ซ้ำ) · documents API (slot-based + file_hash) + required-doc gate ก่อน `pending_review` (contract_doc + national_id_doc + product_photo ≥1 ≤8) · identity conditional ตามสัญชาติ + phone format filters
- **อ้างอิง**: `38` ผ่าน MAP §6 (L68–197), §11–12 (L306), §17 (L371) · `02` Group C
- **LOC ~1,950 · งบรวม ~300k**
- **DoD**: test duplicate ภายใต้ concurrency 3 ช่องทาง · draft จาก API ที่ข้อมูลไม่ครบสร้างได้

### 2.3 — Case Submission Backend ชุดที่ 2 (state machine + routing + recycle + import)
- **ขอบเขต**: `PATCH /:id/status` state machine (`draft→pending_review→approved|rejected|need_info→draft`) + permissions (Case Approver = system role global เท่านั้น) + events · team suggestion service (routing จาก `debtor_address_current.province` ตัวเดียว, `CASE_NO_TEAM_MATCH`, default ไม่ auto-assign) · projected revenue calculator (best-case 100%, FLAT/SUCCESS_FEE/HYBRID) · **service fee snapshot ตอน `approved`** (4 columns ตาม `10` §9.2) · Recycle flow (เฉพาะ closed_fail, ไม่จำกัดรอบ, approve → round+1 ข้าม pending_review ตรงเข้า ready_to_assign) · Import Excel/CSV (mapping, per-row validation, batch draft)
- **อ้างอิง**: `38` ผ่าน MAP §6.5–6.6, §8–10 (L258–305), §16 · `10` §9.2 · `12`
- **LOC ~2,500 · งบรวม ~350k**
- **DoD**: test ตาม `38` §20 — โดยเฉพาะ recycle round + snapshot ตอน approved ไม่เปลี่ยนเมื่อแก้ template

### 2.4 — Case Submission Frontend ชุดที่ 1 (list + form + address)
- **ขอบเขต**: หน้า List + filter/search/pagination + badge + responsive card · ฟอร์ม Manual (ข้อมูลสัญญา/ลูกหนี้ + conditional identity + input filters) · **Address component ×3 ที่อยู่** (postal auto-complete + cascading จังหวัด/อำเภอ/ตำบล) — ทำเป็น shared component (ไฟล์ 41 ใช้ซ้ำ) → ลง REUSE_INDEX
- **อ้างอิง**: `38` §7 ผ่าน MAP (L198–257) · mockup `38-case-submission-mockup.html` ผ่าน MAP
- **LOC ~1,950 · งบรวม ~310k**
- **DoD**: สร้างเคส manual ครบ flow บน staging

### 2.5 — Case Submission Frontend ชุดที่ 2 (docs + suggestion + review modal + import)
- **ขอบเขต**: Contact Persons dynamic list + Document slots + Product Photo dropzone (max 8) · Team Suggestion UI (inline + toggle ดูทีมอื่น + กล่องค่าใช้จ่ายทีม [ข้อมูลดิบเท่านั้น ห้ามคำนวณกำไร] + reason modal เมื่อเปลี่ยนทีม) · **Case Detail/Review Modal** (4 โหมดตามสถานะ + doc viewer/lightbox + recycle history) — shared component (40/41 ใช้ซ้ำ) → REUSE_INDEX · Import wizard UI
- **อ้างอิง**: `38` §7.3–7.5 ผ่าน MAP · mockup เดียวกัน
- **LOC ~2,400 · งบรวม ~350k**
- **DoD**: review/approve/reject/need_info ครบจาก UI · Case Approver เท่านั้นที่เห็นเมนูรับเคส

### 2.6 — Case Assignment Backend (ไฟล์ 40)
- **ขอบเขต**: migration assignments/pending_reassignments/reassignment_history + settings keys (`reassign_timeout_hours` default 3, `supervisor_can_assign_*` default true) · assign (กรองพนักงานตาม `assigned_team_id` ของเคส, `ASSIGNMENT_TEAM_MISMATCH`, 1 เคส 1 คน) + accept · reassign 2 branch (ยังไม่ accepted = เปลี่ยนทันที / accepted = pending_reassignment รอ consent ไม่ freeze งาน) + respond + scheduled job timeout (auto-assign, resolution=timeout_auto) + race guard `REASSIGNMENT_ALREADY_TIMED_OUT` · reassign สำเร็จ → reset `assigned` + ล้าง accepted_at เสมอ · agent decision-support (`active_case_count`, `success_rate` เป็น service กลาง, `covered_provinces`) · Kanban aggregation + supervisor permission gate
- **อ้างอิง**: `40` ผ่าน MAP §6 (L63–113), §8–§12 (L167–234), §17 (L273) · `09` §7.1
- **LOC ~2,650 · งบรวม ~370k**
- **DoD**: test ตาม `40` §20 — โดยเฉพาะ timeout job race กับ respond ที่มาช้า

### 2.7 — Case Assignment Frontend (ไฟล์ 40)
- **ขอบเขต**: หน้า List (filter, badge inhouse/outsource คนละบรรทัด, pending_reassignment badge แยก, วันเวลากำกับ) · Assignment Modal (Case Detail reuse จาก 2.5 + Agent Picker + expand ดูเคสที่ถืออยู่) · Reassign flow UI (reason form + warning) · Kanban full-screen (คอลัมน์ต่อพนักงาน read-only, filter ระดับการ์ด, โชว์คอลัมน์ว่าง) · ปุ่ม assign ของ Supervisor: ปิดสิทธิ์ = **hide ไม่ใช่ disabled**
- **อ้างอิง**: `40` §7 ผ่าน MAP (L114–166) · mockup `40-case-assignment-mockup.html` ผ่าน MAP
- **LOC ~2,700 · งบรวม ~380k** · หมายเหตุ: Agent Accept UI ฝั่งพนักงานทำใน 2.10 (ไฟล์ 41) ครั้งเดียว
- **DoD**: มอบหมาย/รับงาน/reassign ครบ flow บน staging

### 2.8 — Field Tracker Backend ชุดที่ 1 (core flow)
- **ขอบเขต**: migration ส่วน field (assignment_status 7 ค่า, schedule_date/order, evidence, checkins, travel_origins, close_case_drafts) · `GET /api/field/cases` 4 กลุ่มสถานะ + detail payload เต็ม · accept/schedule/reorder (recompute ทั้งวัน) + team view (read-only เห็นรายละเอียดเต็ม) · checkin (device GPS เท่านั้น — **ห้ามมีช่องกรอกพิกัดมือ**, หลายจุด, ล็อกตลอดแก้ไม่ได้) · travel_origin (แยกจาก checkins เด็ดขาด, auto GPS ตอนกด "เริ่มงาน", ปรับได้, 1 เคส 1 จุด, ไม่ auto-fill จากเคสก่อน) · close-draft (1:1 ต่อเคส, autoload, ลบตอน submit, ไม่มี expiry) · `submit_close_case` (validate หลักฐานตาม outcome: checkin≥1, รูป≥1, วิดีโอ≥1, รูปสินค้าเฉพาะ success, travel_origin เฉพาะ PER_KM) + transition + events
- **อ้างอิง**: `41` ผ่าน MAP §6 (L80–198), §9–10 (L322–372), §17 (L435) · `23` §6.3
- **LOC ~2,500 · งบรวม ~350k**
- **DoD**: flow รับงาน→จัดวัน→เช็คอิน→ปิดงานครบบน staging + test validation ทุก error code

### 2.9 — Field Tracker Backend ชุดที่ 2 (เงิน + ตีกลับ + reassign + push)
- **ขอบเขต**: Distance service (Google Maps Distance Matrix, ลำดับ origin→checkins ตามเวลา, เรียกเฉพาะตอน submit/resubmit, retry/cache, `MIN(dist×rate, max_per_case)`) · expense auto-generation (fuel/allowance ตาม plan snapshot; `closed_success` → `pending_warehouse_confirm` เสมอ / `closed_fail` → `pending_approval`) · hotel claim (เบิกแยก, ใบเสร็จรวมหลายวัน, `shared_with` ทีมเดียวกัน validate ฝั่ง BE, matched_case_ids เพื่อตรวจสอบเท่านั้น) · **2 เส้นทางตีกลับ (`41` §10.1 ห้ามสลับ)**: `reject_expense`+`resubmit_expense` (เจ้าของรายการเท่านั้น, กลับ pending_approval ไม่ผ่าน warehouse ซ้ำ) / `reject_evidence`+`resubmit_close_case` (Case Approver system role เท่านั้น, แก้ได้เฉพาะสื่อ ล็อก checkin+outcome, expense เดิม→`superseded`+สร้างใหม่) · reassignment respond ฝั่ง field + `reassigned_away` (ไม่นับ success_rate) · income-summary aggregation · Web Push (VAPID) + in-app notification store
- **อ้างอิง**: `41` ผ่าน MAP §6.4–6.6 (L113–198), §10.1 (L362), §11–12 (L373–398) · `22` §6.1–6.4 · `11`
- **LOC ~2,800 · งบรวม ~400k**
- **DoD**: test จุดเสี่ยง: resubmit_close → superseded + expense ใหม่ไม่ซ้ำไม่หาย · DAILY_FLAT ไม่เรียก distance · fuel cap ทำงาน

### 2.10 — Field Tracker Frontend ชุดที่ 1 (shell + detail + งานรายวัน)
- **ขอบเขต**: App shell (Mobile bottom nav 4 + hamburger / Desktop fixed sidebar 260px) + routing + badge store · **Case Detail component ใช้ซ้ำ 3 ที่** (deep links tel:/LINE/Maps + doc viewer + lightbox — ต่อยอดจาก 2.5) · แท็บรอรับงาน (+Agent Accept UI รวมของไฟล์ 40) · แท็บรับงานแล้ว (toggle ของฉัน/ทีม) · Calendar Picker (custom grid + badge/วัน + popup + banner เพื่อนร่วมทีมจังหวัดเดียวกัน) · แท็บกำลังติดตาม (group ตามวัน + drag reorder + ปุ่ม 3 สถานะ)
- **อ้างอิง**: `41` §5, §7.1–7.5 ผ่าน MAP (L199–243) · mockup `41-field-tracker-mobile-mockup.html` + `-desktop-` ผ่าน MAP
- **LOC ~3,250 · งบรวม ~450k**
- **DoD**: mobile + desktop logic เดียวกัน 100% · flow ถึงก่อนเปิดฟอร์มปิดงานครบ

### 2.11 — Field Tracker Frontend ชุดที่ 2 (ฟอร์มปิดงาน + reassignment)
- **ขอบเขต**: ฟอร์มปิดงาน 3 ส่วน — A: outcome picker + travel origin (auto GPS + แผนที่ลากปรับ, แสดงเฉพาะ PER_KM) · B: เช็คอิน (Geolocation + static map preview) + รูป/วิดีโอ/รูปสินค้า/เสียง (camera & file picker + thumbnail grid) · C: draft save/restore + validation ตาม outcome + โหมด `needs_revision` (banner reject_reason, ล็อก checkin/outcome) · Pending Reassignment flow (auto-popup + "ดูทีหลัง" + badge ม่วงค้าง + countdown + toast auto-dismiss เมื่อ auto-resolved)
- **อ้างอิง**: `41` §7.6–7.8 ผ่าน MAP (L244–285) · mockup เดียวกัน
- **LOC ~2,250 · งบรวม ~350k**
- **DoD**: ปิดงานจริงบน staging มือถือ (GPS/กล้องจริง) · needs_revision แก้ได้เฉพาะสื่อ

### 2.12 — Field Tracker Frontend ชุดที่ 3 (เงิน + dashboard + PWA)
- **ขอบเขต**: แท็บเบิกค่าใช้จ่าย 2 ขอบแท็บ (ผูกกับเคส group ต่อเคส / เบิกแยก + ฟอร์มที่พัก + upload ใบเสร็จ + flow แก้ needs_revision) · หน้าสรุปรายได้ (สะสม + รายเดือน) · แท็บจบงาน (pill filter 4 รวม "ถูกโอนไป" — การ์ด reassigned_away ไม่มีสถานะค่าใช้จ่าย) · Dashboard 5 บล็อก · PWA + Web Push client (service worker, permission prompt, iOS A2HS banner) + in-app notification list
- **อ้างอิง**: `41` §7.9–7.11, §15 ผ่าน MAP · mockup เดียวกัน
- **LOC ~2,550 · งบรวม ~380k**
- **DoD**: Field Tracker ครบทุกหน้าตรง mockup · push แจ้งเตือนจริงบน staging

### 2.13 — Warehouse Backend (ไฟล์ 44)
- **ขอบเขต**: migration assets + handover_lots + PostgreSQL sequence `LOT-`/`DLV-` (พ.ศ., immutable) · asset auto-create hook เมื่อ case→closed_success (idempotent + snapshot fields) · assets list/detail (filter 8 ตัว + company scope) · intake (IMEI exact 15 หลัก compare + เตือน mismatch แต่ force proceed ได้ / condition+note / รูป 7 มุม) + reject-intake + retry · lot create (1 บริษัท/lot, `MIXED_COMPANY_LOT`/`EMPTY_LOT`/`ASSET_NOT_IN_CUSTODY`/`ASSET_ALREADY_IN_LOT`, status ตาม type: finance_pickup→pending_attach / we_deliver→pending_delivery_proof) · **confirm = `$transaction` 4 steps + rollback (`CONFIRM_TRANSACTION_FAILED`) + `RevenueService.tryCreateRevenue()` interface (ตัวจริง Phase 3.6 — ทำ stub ที่ idempotent + test contract ไว้)** + เอกสารบังคับตาม type · PDF ใบส่งมอบ + Excel export
- **อ้างอิง**: `44` ผ่าน MAP §6–§7 (L62–169), §9–§12 (L309–443), §15 (L475) · `92` §6.1 · `19` §6.1
- **LOC ~2,850 · งบรวม ~400k**
- **DoD**: test T11/T12/T13 ของ `44` §17 (confirm ครบ/ล้ม rollback/expense ยังไม่ approved → Revenue ยังไม่เกิด)

### 2.14 — Warehouse Frontend ชุดที่ 1 (รับเข้าคลัง + ในคลัง)
- **ขอบเขต**: Warehouse shell 4 แท็บ + badge counts + Company User read-only scope · แท็บรับเข้าคลัง (filter 7 + ตาราง 9 คอลัมน์) · Modal intake 3 ขั้น (IMEI compare highlight + force proceed / สภาพ / upload 7 มุม) · Modal ตีกลับ/ดูเหตุผล/รับใหม่ · แท็บในคลัง (การ์ด group ตามบริษัท + drill-down + checkbox + ปุ่มนัดวันส่งมอบ)
- **อ้างอิง**: `44` §8.1–8.3 ผ่าน MAP (L170–264) · mockup `warehouse.html` ผ่าน MAP
- **LOC ~2,400 · งบรวม ~360k**

### 2.15 — Warehouse Frontend ชุดที่ 2 (ส่งมอบ)
- **ขอบเขต**: Modal นัดวันส่งมอบ (radio 2 type + conditional fields + auto-gen เลข + preview/พิมพ์ PDF + Export Excel) · แท็บรอส่งมอบ + ส่งมอบแล้ว (การ์ด Lot + drill-down) · Modal แนบเอกสาร (1 หรือ 2 ช่องตาม type) + ดูเอกสาร
- **อ้างอิง**: `44` §8.4–8.5 ผ่าน MAP (L265–308) · mockup เดียวกัน
- **LOC ~1,550 · งบรวม ~260k**
- **DoD**: วงจร closed_success → intake → lot → confirm ครบบน staging (expense ปลดล็อกจริง)

---

# Phase 3 — Finance Module (ไฟล์ 14–21 + สูตรจาก 22)

> ลำดับบังคับ: 3.1 (pure calc) ก่อนทุกอย่าง → 3.2 (payee gate + approval emit) → 3.3 → 3.4 → 3.6 (Revenue — ปิดวงจรกับ 2.13) → 3.7 → 3.8 · `13` ต้องเสร็จก่อนทั้ง Phase (approval matrix, tax, vat, bank file, policy)

### 3.1 — Pure Finance Calculation Modules + Unit Tests (ไฟล์ 22 ทั้งหมด)
- **ขอบเขต**: pure modules ไม่มี I/O ครบ 13 สูตร: fuel PER_KM/DAILY_FLAT · allowance (นับ DISTINCT วันปฏิทินจาก check_ins) · commission/no_success_fee · service fee SUCCESS_FEE/FLAT/HYBRID · VAT resolver (effective-dated + include/exclude/no_vat + snapshot) · **WHT resolver (Payee ชนะ Plan + fallback warning + threshold + basis)** · payout batch รวม · AR outstanding · Gross Profit (revenue=0 → "N/A" ห้ามหารศูนย์) · advance return (used>requested → return 0 ห้ามติดลบ) · **revenue-trigger-rules** (`shouldCreateRevenue({model, charge_on_fail, outcome, expense_state, lot_state, has_expense})` — ครอบ DEC-006/D6) · approval-flow-resolver (matrix→step list) · adjustment-approval-policy (period_status→ระดับผู้อนุมัติ) — unit test ครอบทุก test case §16 ของไฟล์ 15/16/19/20/22
- **อ้างอิง**: `22` ทั้งไฟล์ · `18` §6.3 · `19` §6.1+§16 · `13` §6.4–6.5
- **LOC ~2,500 (รวม tests) · งบรวม ~360k**
- **DoD**: coverage 100% ของ pure modules · ทุก service หลังจากนี้เรียกสูตรจากที่นี่เท่านั้น

### 3.2 — Payee & Tax Profile (18) + Compensation Approval Backend (16)
- **ขอบเขต**: BE+FE 18: payee CRUD + verify + auto-reset unverified เมื่อแก้ธนาคาร/ภาษี + `require_payee_id_document` policy + `BANK_ACCOUNT_NAME_MISMATCH` (เตือน) + FE ตาราง/ฟอร์มใน settings · BE 16: multi-step approve/reject transaction + step guard (`APPROVAL_STEP_OUT_OF_ORDER`, SoD เมื่อเปิด) + reject → reset step 1 เสมอ + `approval_history` append + emit `expense.approved` + แยกสิทธิ์ `reject_expense` vs `reject_evidence` เด็ดขาด
- **อ้างอิง**: `18`, `16` ทั้งไฟล์ · `13` §6.2 · `23` §6.5
- **LOC ~1,750 · งบรวม ~280k**

### 3.3 — Compensation Approval FE (16) + Claims & Advances (15)
- **ขอบเขต**: FE 16: แท็บ comp (ตาราง + stepper ขั้นอนุมัติ + modal "ดูสูตร") · BE 15: Advance 5 สถานะ + **ห้ามเบิกซ้อน** (`ADVANCE_PENDING_SETTLEMENT` — approved|overdue, DB partial unique มีแล้วจาก 1.2) + `ADVANCE_EXCEEDS_MAX` (null=ไม่จำกัด) + settle (`USED_EXCEEDS_REQUEST_NO_TOPUP`) + background job auto-overdue (actor=system) · Manual Claim (enum ของ `41` §6.6 ห้ามสร้างใหม่) · FE 15: แท็บรออนุมัติ (2 ตาราง + ฟอร์ม Advance + modal เคลียร์ยอด + overdue badge แดง)
- **อ้างอิง**: `15` ทั้งไฟล์ · `16` §8 · `23` §6.3–6.4 · mockup `finance.html` ผ่าน MAP
- **LOC ~2,300 · งบรวม ~340k**

### 3.4 — Payout Batch Backend (17) + Claims FE ส่วนที่เหลือ
- **ขอบเขต**: batch builder (ดึง approved ตาม cutoff/side, `UNVERIFIED_PAYEE_IN_PAYOUT` reject, `MIXED_SIDE_BATCH`, draft→checking auto) + roll-up gross/wht/net · payment file generator ตาม `13` §6.8 (gate `BANK_FILE_NOT_TESTED`) + **idempotency key** + `DUPLICATE_PAYMENT_FILE` (เตือนพร้อมวันที่ครั้งก่อน) + audit · complete endpoint + hook รอรับ sync จาก 35 (Phase 4.2)
- **อ้างอิง**: `17` ทั้งไฟล์ · `18` §6.2 · `22` §6.9–6.10 · `13` §6.1/§6.8
- **LOC ~1,950 · งบรวม ~300k**

### 3.5 — Payout FE + Internal PDFs
- **ขอบเขต**: FE 17: ตาราง batch + Modal สร้างรอบจ่าย + Modal สร้างไฟล์โอน (ข้อความยืนยัน idempotency) · PDF ภายใน (`28` §6.1): Payout Batch Summary + Payment Voucher + Payslip/Compensation Statement (`@react-pdf/renderer` — เทียบ `reference/samples/04_payout_batch_summary.pdf`, `05_payment_voucher.pdf`, `06_payslip.pdf`)
- **อ้างอิง**: `17` §8 · `28` §6.1+§7 · mockup `finance.html` ผ่าน MAP
- **LOC ~1,450 · งบรวม ~250k**

### 3.6 — Revenue / Billing / AR Backend (19)
- **ขอบเขต**: Revenue creation service — subscribe `expense.approved` + `handover_lot.confirmed` + case terminal, เรียก revenue-trigger-rules จาก 3.1, **idempotent ต่อเคส**, snapshot vat_rate_used + fee model · **เสียบของจริงแทน stub `RevenueService.tryCreateRevenue()` ของ 2.13 แล้วรัน test contract เดิมให้ผ่าน** · Billing Batch builder (รวมหลายเคส/บริษัท/รอบ, `NO_REVENUE_TO_BILL`) + send + guard `EDIT_BILLED_REVENUE` + ห้ามลบ non-draft · AR Aging (buckets จาก `13`) · received_amount รอ hook จาก 35
- **อ้างอิง**: `19` ทั้งไฟล์ · `44` §11 · `22` §6.5–6.8, §6.11 · `12`
- **LOC ~1,900 · งบรวม ~310k**
- **DoD**: unit + integration test ครอบ `19` §16 ทั้ง 8 เคส + DEC-006/D6 (เคสไม่มี expense)

### 3.7 — Billing FE + Adjustment (20)
- **ขอบเขต**: FE 19: แท็บรายได้และวางบิล (2 ตาราง) + AR Aging view · BE+FE 20: Adjustment CRUD (4 FK แยก + CHECK, amount บวกเสมอ + type increase/decrease, `REASON_REQUIRED`) + snapshot `period_status_at_target` ณ ตอนสร้าง + ระดับอนุมัติตาม policy (จาก 3.1) + `INSUFFICIENT_APPROVAL_LEVEL` + FE แท็บ adjustment (target search + แสดงระดับอนุมัติ)
- **อ้างอิง**: `19` §8 · `20` ทั้งไฟล์ · `13` §6.11 · `23` §6.9 · mockup `finance.html` ผ่าน MAP
- **LOC ~2,000 · งบรวม ~310k**

### 3.8 — Profitability Report (21) + Finance Dashboard (14)
- **ขอบเขต**: profitability aggregation (มิติบริษัท/ทีม + drill-down + daily cache + force refresh; closed_fail ที่มี cost ต้องลด margin จริง) + FE แท็บ profit · dashboard KPI 4 ตัว (สูตรตาม `14` §6.1) + exception aggregator + FE (KPI cards + ตาราง alerts ลิงก์กลับต้นทาง — read-only)
- **อ้างอิง**: `21`, `14` ทั้งไฟล์ · `22` §6.12 · mockup `finance.html` ผ่าน MAP
- **LOC ~1,750 · งบรวม ~280k**

---

# Phase 4 — Accounting Module (ไฟล์ 30–37)

> ⚠️ ก่อนเริ่ม 4.1 ต้องเคลียร์ spec↔schema drift 5 จุด (ดู "คำถามค้าง" ใน PROGRESS.md ข้อ Q4) — ถ้ายังไม่มีคำตอบ ให้ยึด **schema `02` เป็นหลัก** แล้วบันทึกลง PROGRESS_ARCHIVE · ลำดับ: 4.1 → 4.2 → 4.3 → (4.4, 4.5 ขนาน) → 4.6 → 4.7

### 4.1 — Exceptions (34) + Accounting Period / Readiness / Lock Guard (30)
- **ขอบเขต**: BE 34: exceptions CRUD (3 levels / 3 status ไม่มี in_progress) + authorize (Executive + note บังคับ, สถานะ→authorized ทันที) + **กฎกันหายเงียบ 3 ข้อ**: แสดงแยกหมวดเสมอ / ไม่สืบทอดข้ามรอบ (record ใหม่ต่อ period) / ปลดบล็อกเฉพาะ period เดียวกัน · BE 30: period state machine (collecting→sent_to_accountant→locked, unlock→sent_to_accountant โดย Executive เท่านั้น) + **Readiness Check 3 เงื่อนไข** (billing-revenue sync / reconcile 100% รวม unmatched_resolved / ไม่มี critical open) ห้าม force ข้าม + critical/warning_count เป็น derived ห้ามสร้าง column · **Period Lock guard cross-cutting**: interceptor `PERIOD_LOCKED_DIRECT_EDIT` บังคับใช้กับ write endpoint การเงิน/บัญชีทุกตัว
- **อ้างอิง**: `34`, `30` ทั้งไฟล์ · `13` §6.11 · `23` §6.12–6.13
- **LOC ~1,950 · งบรวม ~300k**

### 4.2 — Bank Reconciliation (35)
- **ขอบเขต**: CSV import ตาม format ที่ตั้งค่า (`13` §6.8) · auto-match engine (ยอดตรงเป๊ะ + tolerance days + candidate เดียวเท่านั้น; เงินเข้า↔billing sent / เงินออก↔payout file_generated) · manual match (`MATCH_NOTE_REQUIRED` เมื่อยอดไม่ตรง) + `unmatched_resolved` (note บังคับ, ห้ามผูก FK) + `ALREADY_MATCHED` เตือน + re-match audit · **trigger 2 ทาง**: สร้าง Cash Receipt (31) + payout→completed (17) + update billing received_amount (19) · FE: ตาราง + Modal จับคู่ Manual + Modal Import
- **อ้างอิง**: `35` ทั้งไฟล์ · `13` §6.3/§6.8 · `23` §6.14 · mockup `accounting.html` ผ่าน MAP
- **LOC ~1,900 · งบรวม ~300k**

### 4.3 — Sales & Receipts + Tax Invoice (31)
- **ขอบเขต**: sales records sync จาก billing (1:1) · Tax Invoice: **auto-number เท่านั้น เรียงต่อเนื่องห้าม gap** (advisory lock/`SELECT FOR UPDATE`) + ไม่มี draft (สร้าง=active) + cancel (reason บังคับ, เลขใหม่ไม่ reuse) + ฟิลด์บังคับตามกฎหมายครบก่อนออก (`TAX_INVOICE_FIELD_MISSING`) · Cash Receipt สร้างจาก 35 เท่านั้นห้ามกรอกมือ + `bank_transaction_id` ref · `TaxInvoicePDF.tsx` ตาม `28` §6.2 (7 ฟิลด์บังคับ — เทียบ `reference/samples/01_tax_invoice.pdf`)
- **อ้างอิง**: `31` ทั้งไฟล์ · `13` §6.12 · `28` §6.2 · `24` §6.8
- **LOC ~1,500 · งบรวม ~260k**
- **DoD**: test ยกเลิกใบ 005 → ใบใหม่ได้ 006 · number gap ภายใต้ concurrency

### 4.4 — Accounting Expenses (32) + Accountant Questions (36)
- **ขอบเขต**: BE 32: expense records sync เฉพาะ payout `completed` (จ่ายจริง ไม่ใช่อนุมัติ) + payee_name snapshot + cost center (แก้เฉพาะ manual, `COST_CENTER_AUTO_EDIT`) + `EDIT_AMOUNT_DIRECTLY` + document_status incomplete → auto exception (34) · BE+FE 36: questions CRUD + answer (`is_resolved` boolean) + due date · FE 32: แท็บ expenses
- **อ้างอิง**: `32`, `36` ทั้งไฟล์ · `13` §6.6 · mockup `accounting.html` ผ่าน MAP
- **LOC ~1,400 · งบรวม ~240k**

### 4.5 — WHT Data (33)
- **ขอบเขต**: WHT Certificate auto-create จาก payout completed (1 รายการจ่าย = 1 ใบ) + status model active→cancelled (**ห้ามลบ/reverse**, `cancel_reason` + `replaces_certificate_id` trace 2 ทาง) + **ใบ cancelled ไม่นับใน pnd3/pnd53 totals** · Filing Summary ต่อรอบ (PND3 บุคคล/PND53 นิติ) + `filing_due_date` auto (default วันที่ 15 เดือนถัดไป) + `FILING_OVERDUE_WARNING` (เตือนไม่ block) + mark-filed · `WhtCertificatePDF.tsx` ใบ 50 ทวิ ตาม `28` §6.3 (เทียบ `reference/samples/02_wht_certificate.pdf`) · FE: แท็บ wht_docs + banner countdown
- **อ้างอิง**: `33` ทั้งไฟล์ · `13` §6.4 · `22` §6.9 · `28` §6.3 · mockup `accounting.html` ผ่าน MAP
- **LOC ~1,950 · งบรวม ~300k**

### 4.6 — Accounting Pack Export (37)
- **ขอบเขต**: generators 8 ไฟล์ 01–08 (CSV UTF-8 + XLSX checklist — format ตรง `reference/samples/` ทุกไฟล์; `05_WHT_Data.csv` tax_id 13 หลักล้วน / `06_Bank_Reconciliation.csv` enum เต็ม 4 ค่า — DEC-006/D10) + Cover Sheet PDF · zip + **SHA-256 hash** (`export_records.file_hash` — schema บังคับแม้ spec 37 ไม่เขียน) · versioning ไม่ overwrite ห้ามลบ record เก่า · block เมื่อ critical open ไม่มี authorized (`EXPORT_BLOCKED_CRITICAL`) · สถานะ generated→sent→accepted (mark-sent แยกเพราะส่งนอกระบบ) · FE: ตารางประวัติ + Modal Export Pack
- **อ้างอิง**: `37` ทั้งไฟล์ · `13` §6.9 · `34` · `reference/samples/` (ทุกไฟล์ 01–08)
- **LOC ~1,850 · งบรวม ~300k**

### 4.7 — Accounting Frontend ที่เหลือ (shell + periods + exceptions + sales/receipts)
- **ขอบเขต**: Accounting shell 9 แท็บ · แท็บ Monthly Close (ตาราง period + Modal readiness checklist) · แท็บ Exceptions (ตาราง + ฟอร์ม + authorize) · แท็บรายได้และขาย + เงินรับ · เก็บตกทุกแท็บให้ตรง `accounting.html`
- **อ้างอิง**: `30` §8, `34` §8, `31` §8 · mockup `accounting.html` ผ่าน MAP
- **LOC ~2,300 · งบรวม ~350k**
- **DoD**: วงจรปิดงวดเต็ม (`29` §6.5) เดินได้จริงบน staging

---

# Phase 5 — Platform Services (ไฟล์ 90, 91)

### 5.1 — Notification Service + Notification Center
- **ขอบเขต**: notification service (create/dispatch, idempotent) + event registry ตาม `90` §6.3 · API 3 endpoints (`GET /api/notifications`, `PATCH /:id/read`, `/read-all`) · FE: กระดิ่ง + dropdown + หน้ารายการเต็ม + deep link (`link_path`) ตาม `reference/notifications.html` · เฟส 1 = Push/In-app เท่านั้น (ไม่มี gateway ภายนอก)
- **อ้างอิง**: `90` §6.3, §14 · `02` L1489 · mockup `notifications.html`
- **LOC ~1,750 · งบรวม ~270k**

### 5.2 — Event Wiring ทุกโมดูล + Audit Log UI
- **ขอบเขต**: ผูก event ทั้ง 9 กลุ่มของ `90` §6.3 เข้า notification (Case/Assignment/Field/Warehouse/Finance/Payout/WHT/Exception) — ตรวจว่า event ถูก emit จริงจากโค้ด Phase 2–4 แล้วเติมที่ขาด · Audit query API (filter target/actor/date ตาม permission scope) + FE ตาราง read-only + detail drawer (before/after JSON diff)
- **อ้างอิง**: `90` §6.3, §8, §14 · โค้ด event ที่มีอยู่ (grep)
- **LOC ~1,550 · งบรวม ~280k**

### 5.3 — Background Job Engine + Handlers + Job Log
- **ขอบเขต**: job engine (queue abstraction + idempotency store + state machine pending→running→completed|failed + retry/backoff + dead_letter derive จาก retry_count≥max — Superadmin manual retry เท่านั้น) · `JOB_DUPLICATE` คืน job เดิม · API + dev trigger (`/api/dev/trigger-job` — **404 ใน production**, จำกัด job_type 5 ตัวรวม `advance_overdue`) · Vercel Cron/QStash wiring · ย้าย/ผูก handlers ที่สร้างไว้ในโมดูล (reassign_timeout, advance_overdue, export_pack, bank_file, wht_summary) เข้า engine เดียว · output versioned+hash · FE: Job Log (list/filter/detail/retry/download)
- **อ้างอิง**: `91` ทั้งไฟล์ · `01` §11
- **LOC ~2,400 · งบรวม ~350k**

---

# Phase 6 — Reports (ไฟล์ 96) + แดชบอร์ดหลัก

### 6.1 — Report Framework + Export Engine
- **ขอบเขต**: query builder + date-range util + preset · permission guard ต่อหมวด (F=Finance/Exec · O=Manager team-scope/Exec · A=Accounting/Exec · E=Exec เท่านั้น — Finance ดู E1 ต้อง 403) · cache layer 3 โหมด (daily/hourly/real-time) + refresh endpoint + `REPORT_CACHE_STALE` · shared UI (DateRangePicker + preset, KPI card + MoM badge, table + virtual scroll >100 แถว, skeleton, empty state) · export engine Excel (SheetJS) + PDF + hook "export ตรง UI ทุกแถว"
- **อ้างอิง**: `96` §8–§12 ผ่าน MAP · mockup `reports.html` ผ่าน MAP
- **LOC ~1,800 · งบรวม ~290k**

### 6.2 — รายงานหมวด F (F1–F5)
- **ขอบเขต**: F1 Gross Profit (drill-down รายเคส) · F2 Revenue Summary (bar รายเดือน + MoM) · F3 AR Aging (>60 เหลือง >90 แดง) · F4 Compensation Summary (drill-down รายพนักงาน) · F5 Advance Overdue (due วันนี้ยังไม่ overdue — นับวันถัดไป)
- **อ้างอิง**: `96` §6-F, §7, §13–14 ผ่าน MAP · **LOC ~1,900 · งบรวม ~300k**

### 6.3 — รายงานหมวด O (O1–O5)
- **ขอบเขต**: O1 Success Rate (= success/(success+fail) ไม่รวม open) · O2 Team Performance/SLA (TAT calendar days, `slaAlertHours`) · O3 Workload · O4 SLA Breach · O5 Warehouse Summary — ทั้งชุด cache รายชั่วโมง + Manager เห็นเฉพาะทีมตัวเอง
- **อ้างอิง**: `96` §6-O ผ่าน MAP · **LOC ~1,700 · งบรวม ~280k**

### 6.4 — รายงานหมวด A (A1–A4)
- **ขอบเขต**: A1 WHT Summary (ใช้ `wht_filing_summaries` — ชื่อ v2.1) · A2 Tax Invoice Summary · A3 Export History · A4 Exception Summary — real-time ทั้งชุด
- **อ้างอิง**: `96` §6-A ผ่าน MAP · **LOC ~1,050 · งบรวม ~210k**

### 6.5 — Executive Dashboard (E1–E3)
- **ขอบเขต**: E1 KPI ภาพรวม (6 KPI + Revenue trend 12 เดือน + Success trend + Top 5 บริษัท — Recharts, refresh ≤24 ชม. + แสดงเวลา refresh) · E2 Company Scorecard · E3 Team Scorecard — Executive/Superadmin เท่านั้น
- **อ้างอิง**: `96` §6-E ผ่าน MAP · **LOC ~1,600 · งบรวม ~270k**

### 6.6 — แดชบอร์ดหลัก (Top Nav เมนูแรก) — ⏸️ รอ PO
- **สถานะ**: `reference/dashboard.html` เป็น DRAFT — **ยังไม่มี spec .md** ต้องรอ PO ตรวจ mockup + อนุมัติ spec ก่อน (ดู `93` §7.1 Mockup Audit) → เมื่อได้ spec แล้วค่อยประเมิน LOC/งบ แล้วเปลี่ยน ⏸️ เป็น ⬜

---

# Phase 7 — Client Portal (ไฟล์ 97) 🔒

> 🔒 **ปลดล็อกเมื่อ**: PO ตอบ Open Item #2 ของ `97` §22 — **Auth method** (Supabase Auth เดียวกับ internal หรือแยก/magic link) — บล็อก 7.1 ทั้งก้อน · Portal เป็นส่วนหนึ่งของ release แรก (ยืนยัน 04/07/2569) แต่ build ท้ายสุดตาม dependency

### 7.1 — Portal Auth + Scope Middleware
- **ขอบเขต**: login/logout Company User + guard `COMPANY_SUSPENDED`/`USER_DEACTIVATED` · middleware inject `WHERE company_id = :current_user.company_id` ทุก query · 403 แบบไม่ leak · audit login/logout + `PERMISSION_DENIED` ทุกครั้ง (ไม่ audit การดูรายแถว)
- **อ้างอิง**: `97` §11–§14 ผ่าน MAP · `10` §7.2 · **LOC ~1,000 · งบรวม ~210k**

### 7.2 — Portal API + Status Mapping Layer
- **ขอบเขต**: 11 endpoints GET เท่านั้น (`/api/portal/*` — **ห้ามมี mutation หลุดเข้า namespace นี้** + เขียน lint/test บังคับตาม §19) · status mapping ที่ backend (`97` §10.1 case labels / §10.2 lot labels — ห้าม expose raw enum) · กรอง billing `draft` ออกเสมอ · ดาวน์โหลดเอกสารเฉพาะ lot confirmed · ข้อมูลอ่อนไหว field-side ต้องไม่หลุด (ยกเว้น Asset.photos เมื่อติดตามสำเร็จ)
- **อ้างอิง**: `97` §6, §10, §17 ผ่าน MAP · **LOC ~1,150 · งบรวม ~230k**

### 7.3 — Portal Frontend (6 เมนู Desktop + Mobile)
- **ขอบเขต**: Top Bar Nav แบบเดียวกับ Back Office (v4) + base font 16px + badge/kpi ตรง design token · ภาพรวม (KPI 4 + trend 6 เดือน + AR Aging) · เคสของเรา (list/filter/drawer + gallery รูป 7 มุม) · รอบวางบิล/AR · ใบกำกับภาษี (+download) · ใบส่งมอบ (+download เมื่อ confirmed) · ข้อมูลบริษัท read-only · Mobile ตาม `97-client-portal-mobile-mockup.html`
- **อ้างอิง**: `97` §5, §7 ผ่าน MAP · mockup ทั้ง 2 ไฟล์ผ่าน MAP · **LOC ~2,800 · งบรวม ~410k**

---

# Phase 8 — Integration, Acceptance & Final

### 8.1 — E2E Acceptance Tests (ไฟล์ 29)
- **ขอบเขต**: 5 scenario เต็ม (`29` §6.1–6.5: รายรับ happy path / รายจ่าย happy path / QC ตีกลับไม่กระทบ Revenue / locked→Adjustment / Full Monthly Close) + Integration Checklist 9 จุด (`29` §7) + เพิ่ม scenario Advance 5 สถานะ (Open Item ของ `29`) — เป็น automated integration tests ผูกเข้า CI
- **อ้างอิง**: `29` ทั้งไฟล์ · `22`/`23`/`24` ประกอบ · **LOC ~2,000 (tests) · งบรวม ~360k**

### 8.2 — Consistency Sweep + Hardening
- **ขอบเขต**: กวาดเทียบ implementation ↔ mockup ↔ spec ทุก module (ใช้ subagents) · ตรวจ cross-cutting: เงิน satang ทุกจุด / วันที่ พ.ศ. ทุกจุด / RBAC ทุก role / audit ครบ / idempotency · แก้จุดที่พบ · index profiling เบื้องต้น (dashboard query ที่ join หนัก)
- **งบรวม ~350k**

### 8.3 — Final Test ทั้งระบบ (ด่านของ orchestrator)
- **ขอบเขต**: เขียน/ปรับ `orchestrator/final-tests/*.md` ให้ครอบระบบจริง (แนวด่าน: การเงิน E2E / Security+สิทธิ์ / Portal / ความทนทาน+jobs / UI ครบทุกเมนู) แล้วรัน Final Test ผ่านทุกด่าน + แก้จุดที่พัง
- **งบรวม ~400k**

---

## สรุปยอดรวม (ประมาณการ)

| Phase | Tasks | LOC ใหม่ (โดยประมาณ) |
|---|---|---|
| 0 Infra + Automation | 3 | ~1,300 |
| 1 Foundation | 12 | ~23,000 |
| 2 Case & Field | 15 | ~34,700 |
| 3 Finance | 8 | ~15,600 |
| 4 Accounting | 7 | ~12,850 |
| 5 Platform | 3 | ~5,700 |
| 6 Reports | 5+1⏸️ | ~8,050 |
| 7 Client Portal 🔒 | 3 | ~4,950 |
| 8 Acceptance & Final | 3 | ~2,000+ |
| **รวม** | **60** | **~108,000** |
