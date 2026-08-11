# implementation-todo.md

# 99 — Implementation Todo List (ทีละขั้นตอน)
## AssetRecovery — ลำดับงานตั้งแต่ตั้งค่า Infra จนถึงเริ่มโมดูลแรก

> สถานะ: Execution Roadmap
> วิธีใช้: ทำทีละ checkbox ตามลำดับ **ห้ามข้ามขั้น** แม้จะดูเชื่อมโยงกันชัดเจน (ตาม Execution Workflow ข้อ 5) — จบแต่ละ Phase แล้วรอ Boonphone ตรวจสอบ/อนุญาตก่อนไป Phase ถัดไปเสมอ
> อ้างอิงคู่กับ: `tool-register.md` (ต้องทำ Phase 0 ในนั้นให้เสร็จก่อนเริ่ม Phase 0 ในไฟล์นี้)

---

## Phase 0 — Infrastructure Setup (ก่อนมีโค้ดบรรทัดแรก)

### 0.1 GitHub Repository
- [ ] สร้าง repo ใหม่ (private) ภายใต้ GitHub Organization ที่สมัครไว้
- [ ] ตั้งชื่อ repo — เสนอ `assetrecovery-app` (ชั่วคราว จนกว่าจะมีชื่อ Product จริง เปลี่ยนทีหลังได้ไม่กระทบ Vercel link)
- [ ] สร้าง branch `staging` จาก `main` (ตอนแรก repo ว่างเปล่า มีแค่ `main`)
- [ ] ตั้งค่า Branch Protection บน `main`: require PR + require 1 approval ก่อน merge (ป้องกัน push ตรงเข้า production)
- [ ] `staging` ปล่อยให้ push ตรงได้ (ไม่ต้อง PR) เพื่อความเร็วในการทดสอบ — ปรับเข้มขึ้นทีหลังได้ถ้าทีมใหญ่ขึ้น
- [ ] เพิ่ม `.gitignore` มาตรฐาน Next.js (`node_modules`, `.env*.local`, `.next`, ฯลฯ)

### 0.2 Next.js Project Bootstrap
- [ ] `npx create-next-app@latest` — เลือก App Router + TypeScript + Tailwind CSS + ESLint (ตาม DEC-001)
- [ ] ติดตั้ง Prisma: `pnpm add -D prisma` + `pnpm add @prisma/client`
- [ ] ติดตั้ง Supabase client: `pnpm add @supabase/supabase-js @supabase/ssr`
- [ ] โครงสร้างโฟลเดอร์เริ่มต้น (ตาม DEC-002 permission ที่ backend middleware ไม่ใช่ RLS):
  ```
  /app                    → routes (App Router)
  /components              → shared UI components (แยกตาม module)
  /lib/prisma.ts           → Prisma client singleton
  /lib/supabase/           → Supabase client (server/client แยกกัน)
  /middleware.ts           → permission check กลาง (DEC-002)
  /prisma/schema.prisma    → source of truth ตามไฟล์ 02
  ```
- [ ] Push โครงสร้างเปล่านี้เข้า branch `staging`

### 0.3 Environment Variables แยก Staging/Production
- [ ] ใน Vercel Project Settings → Environment Variables: สร้างชุดตัวแปรแยกกันตาม Environment (Production / Preview) —
  ผูก `staging` branch เข้ากับชุดค่า Supabase Staging, ผูก `main` เข้ากับชุดค่า Supabase Production
- [ ] ตัวแปรที่ต้องมีขั้นต่ำ: `DATABASE_URL`, `DIRECT_URL` (Prisma), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] สร้าง `.env.example` ใน repo (ไม่มีค่าจริง แค่ชื่อตัวแปร) ให้ dev คนอื่นรู้ว่าต้องตั้งอะไรบ้าง

### 0.4 Domain Mapping
- [ ] Vercel → Domains → เพิ่ม `assetrecovery-staging.vercel.app` (ฟรี ได้อัตโนมัติ) ผูกกับ branch `staging`
- [ ] เพิ่ม `assetrecovery-prod.vercel.app` (หรือชื่อที่เลือก) ผูกกับ branch `main`
- [ ] เมื่อมีโดเมนจริง (หลังตัดสินใจชื่อ Product) กลับมาแทนที่ domain ชั่วคราวนี้ — ไม่กระทบโค้ดใดๆ

### 0.5 CI Pipeline พื้นฐาน (GitHub Actions)
- [ ] สร้าง `.github/workflows/ci.yml` — รันทุก PR: `pnpm install`, `pnpm lint`, `pnpm typecheck` (`tsc --noEmit`), `pnpm build`
- [ ] (ยังไม่ทำตอนนี้) Automated test suite — รอจนกว่าจะมี acceptance test จริงจากไฟล์ 29/spec อื่นๆ ผูกเข้า pipeline

### 0.6 Verify Pipeline ทำงานจริง
- [ ] Push placeholder page (`app/page.tsx` แสดงข้อความ "AssetRecovery — Staging OK") เข้า `staging` → เช็คว่าเว็บขึ้นที่ domain staging จริง
- [ ] Merge เข้า `main` ผ่าน PR → เช็คว่าเว็บขึ้นที่ domain production จริง แยกจาก staging
- [ ] ทดสอบว่า staging กับ production ต่อ Supabase คนละ project จริง (เช่น สร้าง table ทดสอบใน staging DB แล้วเช็คว่า production DB ไม่มี table นั้น)

> ✅ **จบ Phase 0 เมื่อ**: Push โค้ดเข้า `staging` แล้วเห็นผลที่ domain staging, merge เข้า `main` แล้วเห็นผลที่ domain production แยกกันชัดเจน ทั้งสอง environment ต่อ Database คนละตัว — **หยุดตรงนี้ รอ Boonphone ตรวจสอบก่อนเริ่ม Phase 1**

---

## Phase 1 — Foundation Modules (ตามลำดับ dependency)

> แต่ละโมดูลทำตาม Execution Workflow เต็มรูปแบบ: **Analyze & Plan → Database First (Prisma) → Backend API → Frontend Integration → รอ approve** ก่อนไปโมดูลถัดไปเสมอ

### 1.0 Database Seeding (Master Data) — ทำก่อน Auth เสมอ
- [ ] สร้างไฟล์ `prisma/seed.ts` เพื่อ Insert ข้อมูล Master Data ลง Database อัตโนมัติ โดยอ้างอิง Seed Data SQL ที่มีอยู่แล้วใน `02-database-schema-design.md` §12 (`99_seed_data.sql`) ได้แก่:
  - Organization record เริ่มต้น (1 record)
  - รายชื่อ Role มาตรฐานทั้ง 15 ตัว (system 6 / inhouse 3 / outsource 3 / finance_company 3 = 15 — ตามไฟล์ 07 §5 v2.2, `is_seed=true`, ห้ามลบ/แก้ชื่อ)
  - สร้าง User "Superadmin" คนแรก (ผูกกับ Supabase Auth UID จริงหลัง sign up ครั้งแรก)
  - ตั้งค่าเริ่มต้นของระบบ: VAT 7% (`vat_rate_history`), Tax Profile เริ่มต้น WHT 3% (`tax_profiles` — `Outsource Standard 3%`, `Juristic Entity 3%`)
  - Capabilities list ทั้งหมด (ตามไฟล์ 25 Permission Matrix)
- [ ] เพิ่ม script `pnpm db:seed` ใน `package.json` (เรียก `prisma db seed`) — ใช้รันได้ทั้ง staging และ production (คนละค่า Organization/Tax ID ตาม environment)
- [ ] รัน seed จริงบน staging DB แล้วตรวจสอบว่า login ด้วย Superadmin ได้และเห็น 15 roles ครบก่อนเริ่มข้อ 1.1
- [ ] **รอ approve ก่อนไปข้อถัดไป**

### 1.1 Auth & Access Control (ไฟล์ 05)
- [ ] Analyze: ทบทวนไฟล์ 05 + 07 (roles) + 08 (users)
- [ ] Database: `users`, `roles` ตาม schema ไฟล์ 02 (Schema Group A) — **ไม่มีตาราง `sessions`** ใน schema เพราะ session จัดการโดย Supabase Auth (JWT) ตาม DEC-001/ไฟล์ 05 (แก้ 04/07/2569 — เดิมเขียนอ้างตารางที่ไม่มีจริง)
- [ ] Backend: Supabase Auth integration + `/middleware.ts` (permission check กลาง ตาม DEC-002) + Session timeout 24 ชม. (ตัดสินใจแล้ว)
- [ ] Frontend: หน้า Login จาก `login.html`
- [ ] **รอ approve ก่อนไปข้อถัดไป**

### 1.2 Roles & Permissions Matrix (ไฟล์ 07)
- [ ] Database: `capabilities` + `role_capabilities` (role-permission mapping) — 15 roles ตาม Master Role List (แก้ชื่อตารางให้ตรงไฟล์ 02: ไม่มีตาราง `permissions` — ใช้ `capabilities`)
- [ ] Backend: permission checking utility ใช้ร่วมกับ middleware ข้อ 1.1
- [ ] Frontend: ยังไม่มีหน้าจอเฉพาะ (ใช้ผ่านทุกโมดูลถัดไป)
- [ ] **รอ approve**

### 1.3 Settings / Master Data (ไฟล์ 08–13) — ทำทีละไฟล์ย่อยตามลำดับ
- [ ] 08 Users CRUD
- [ ] 09 Teams
- [ ] 10 Finance Companies
- [ ] 11 Compensation Plans
- [ ] 12 Service Fee Templates
- [ ] 13 Accounting/Finance Settings (13 sub-tabs — Tax Invoice Numbering, VAT Rate, Bank File Format ฯลฯ) — **schema รองรับครบแล้ว** (`02` v3.5: `billing_payout_cycles`, `approval_matrices`, `finance_policy_settings`, `bank_file_formats`, `tax_document_template_settings` — DEC-006/D1)
- [ ] Frontend: อ้างอิง `settings.html` ทุกแท็บ
- [ ] **รอ approve หลังจบทั้งหมวด**

> ⏸️ **Checkpoint**: หลัง Phase 1 เสร็จ ระบบควร login ได้จริง มี user/role/permission ทำงานจริง และตั้งค่า master data ได้ครบ — ยังไม่มี business flow ใดๆ

---

## Phase 2 — Case & Field Operations (ไฟล์ 38, 40, 41, 44)

- [ ] 38 Case Submission — Database → API → Frontend (`38-case-submission-mockup.html`)
- [ ] 40 Case Assignment — Database → API → Frontend (`40-case-assignment-mockup.html`)
- [ ] 41 Field Tracker — Database → API → Frontend (Mobile + Desktop mockup) — **ต้องมี Google Maps API key พร้อมก่อนถึงข้อนี้**
- [ ] 44 Asset Custody & Handover — Database → API → Frontend (`warehouse.html`)
- [ ] **รอ approve หลังจบแต่ละไฟล์** (ไม่ใช่รอจนจบทั้ง Phase)

---

## Phase 3 — Finance Module (ไฟล์ 14–21)

- [ ] 14 Finance Dashboard
- [ ] 15 Claims & Advances
- [ ] 16 Compensation Approval
- [ ] 17 Payroll & Payout (**ต้องมี Bank File format ที่ test_status=passed ก่อนใช้งานจริง**)
- [ ] 18 Payee & Tax Profile
- [ ] 19 Revenue, Billing & Receivable
- [ ] 20 Adjustment
- [ ] 21 Profitability Report
- [ ] Frontend: อ้างอิง `finance.html` ทุกแท็บ
- [ ] **รอ approve หลังจบแต่ละไฟล์**

---

## Phase 4 — Accounting Module (ไฟล์ 30–37)

- [ ] 30 Monthly Close
- [ ] 31 Sales & Receipts (Tax Invoice — ใช้ template PDF ที่ทำไว้แล้ว)
- [ ] 32 Expenses & Payments
- [ ] 33 WHT Data (WHT Certificate — ใช้ template PDF ที่ทำไว้แล้ว)
- [ ] 34 Document Checklist & Exceptions (ใช้ template XLSX ที่ทำไว้แล้ว)
- [ ] 35 Bank Reconciliation
- [ ] 36 Accountant Questions
- [ ] 37 Accounting Pack Export History (ใช้ template Cover Sheet ที่ทำไว้แล้ว)
- [ ] Frontend: อ้างอิง `accounting.html` ทุกแท็บ
- [ ] **รอ approve หลังจบแต่ละไฟล์**

---

## Phase 5 — Platform Services (ไฟล์ 90–92)

- [ ] 90 Audit Log + Notification (Push/In-app เท่านั้นตามที่ตัดสินใจ) + Event trigger list (§6.3) — ตาราง `notifications` อยู่ใน `02` v3.5 แล้ว (DEC-006/D3)
- [ ] 91 Background Jobs / External API Integration
- [ ] 92 Data Model แบบรวม (ใช้ตรวจสอบความสอดคล้อง ไม่ใช่โมดูลที่ implement แยก)
- [ ] **รอ approve**

---

## Phase 6 — Reports (ไฟล์ 96)

- [ ] 17 รายงาน 4 หมวด (Finance F1–F5 / Operations O1–O5 / Accounting A1–A4 / Executive E1–E3) — แก้เลข 13→17 เมื่อ 04/07/2569
- [ ] Frontend: อ้างอิง `reports.html`
- [ ] **รอ approve**

---

## Phase 7 — Client Portal (ไฟล์ 97) ✅ Phase ยืนยันแล้ว — เป็นส่วนหนึ่งของ Phase 1 (release scope)

> ✅ **Product Owner ยืนยัน 04/07/2569**: Client Portal deploy เป็นส่วนหนึ่งของ Phase 1 (ไม่เลื่อนไป Phase 2) — ดู `97-client-portal.md` §21, `DECISIONS-NEEDED.md` §1.2
> หมายเหตุ: ยัง**ทำเป็นลำดับที่ 7 ในไฟล์นี้**เหมือนเดิม เพราะพอร์ทัลเป็น read-only view ที่ดึงข้อมูลจาก Case (Phase 2), Finance (Phase 3), Accounting (Phase 4), Warehouse (Phase 2/ไฟล์ 44) — ต้องมีโมดูลต้นทางเหล่านี้ implement เสร็จก่อนถึงจะมีข้อมูลให้พอร์ทัลแสดงผลได้จริง "Phase 1" ในที่นี้หมายถึงขอบเขต product release ครั้งแรก ไม่ใช่ลำดับ build

- [ ] Analyze: ทบทวน `97-client-portal.md` (spec เต็ม v4) + Auth method ที่ยังเป็น Open Item #1 (ต้องถามก่อนเริ่ม Database/Backend)
- [ ] Database: ไม่มี table ใหม่ (reuse entity เดิมทั้งหมด — cases, billing_batches, tax_invoices, handover_lots, revenues ฯลฯ) — ตรวจสอบว่า `company_id` scope ครบทุก table ที่เกี่ยวข้อง
- [ ] Backend: API namespace `/api/portal/*` — **read-only (GET เท่านั้น)** ทุก endpoint ต้อง enforce `company_id` scope ที่ middleware — ห้ามมี endpoint mutation ใดๆ หลุดเข้ามาในนี้ (ดู §19 Acceptance Criteria)
- [ ] Frontend: ใช้ mockup Desktop (`97-client-portal-mockup.html`) และ Mobile (`97-client-portal-mobile-mockup.html`) ที่ทำไว้แล้ว
- [ ] **รอ approve**

---

## หมายเหตุการทำงานร่วมกันทุก Phase

- ทุก endpoint ที่กระทบเงิน/ภาษี ต้องผ่าน Permission Matrix (ไฟล์ 25) ก่อนเสมอ — ตรวจตอน code review
- ทุก mutation สำคัญต้องมี Audit Log (ผูกกับ Phase 5 แต่ implement ตั้งแต่ Phase 1 เพราะ users/roles ก็ต้อง audit)
- เงินทุกจุด: `INTEGER satang` ห้าม float — ตรวจใน PR review ทุกครั้ง
- วันที่ทุกจุดที่แสดงผล: Asia/Bangkok + พ.ศ. เสมอ ยกเว้น `<input type="date">`
- จบแต่ละไฟล์สเปคที่ implement แล้ว ให้ทำ acceptance test คร่าวๆ เทียบกับ Test Cases ในไฟล์สเปคนั้นก่อนขอ approve ไปต่อ

---

*ไฟล์นี้เป็นไฟล์ที่ 2 ของ 2 ไฟล์เตรียมพร้อมก่อน Implement — คู่กับ `tool-register.md`*
