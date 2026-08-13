# PROGRESS_ARCHIVE.md — รายละเอียดเต็มของงานที่เสร็จแล้ว

> ย้ายรายละเอียดของ task ที่มาร์ค ✅ ใน `PROGRESS.md` มาไว้ที่นี่ เพื่อให้ PROGRESS.md บางอยู่เสมอ (≤50,000 ตัวอักษร)
> รูปแบบต่อรายการ: `## Phase <id> — <ชื่องาน>` + วันที่ + commit hash + สรุปสิ่งที่ทำ + การตัดสินใจระหว่างทาง + จุดที่คนถัดไปควรรู้

---

## Phase 1.1 — Prisma Schema ชุดที่ 1: Enums + Group A + Group B

**วันที่**: 2026-08-14 · **commit**: `__COMMIT__` · **branch**: `staging`

### สิ่งที่ทำ
- `prisma/schema.prisma` — **enum 55 ตัว** (54 ตามสเปค `02` §3 + `due_rule_type` ตามมติ A5) + **19 ตาราง**: Group A Identity 5 (`organizations`, `roles`, `users`, `capabilities`, `role_capabilities`) + Group B Master Data 14
- Migration 2 ใบ:
  - `20260813215646_init_enums_group_a_b` — DDL หลัก + **raw SQL ที่ Prisma ไม่รองรับ**: CHECK `cycles_cutoff_shape` (`02` §5) · CHECK `cycles_due_rule_shape` (A5) · แปลง FK ที่ปิดวง circular (users↔teams) 7 เส้นเป็น **DEFERRABLE INITIALLY DEFERRED** (`02` §11)
  - `20260813220500_updated_at_db_default` — เติม `DEFAULT NOW()` ให้ `updated_at` ครบ 15 ตาราง
- `prisma/schema.test.ts` — ยาม 8 เคส: satang ต้องเป็น Int · ห้าม Float · Decimal ได้เฉพาะ pct และต้อง `(5,2)` · DateTime ต้องระบุ `Timestamptz(6)`/`Date` · model/enum ต้องมี `@@map` snake_case · field camelCase ต้องมี `@map`
- `prisma.config.ts` — โหลด `.env` + `.env.local` (Next.js ใช้ตัวหลัง) ไม่งั้น Prisma CLI ไม่เห็น `DATABASE_URL`
- อัปเดต spec ตามมติ PO 2026-08-12 (`02` v3.7 + changelog + `02_OPEN_DECISIONS` A1/A5 → ✅, A3/B4/D12 ติ๊กในตารางมติ) + regenerate ช่วงบรรทัดของ `02` ใน `docs/00_MAP.md`

### คอลัมน์ที่เพิ่มจากมติ PO (นอกเหนือ spec เดิม — เฉพาะที่ตกอยู่ใน Group B)
| ข้อ | ที่ไหน | สิ่งที่เพิ่ม |
|---|---|---|
| A1 | `finance_companies` | `wht_withheld_by_customer_pct` NUMERIC(5,2) default 3.00 (NULL = ไม่หัก) — ส่วนที่เหลือของ A1 (billing/receipt + ใบ 50 ทวิฝั่งรับ) อยู่ที่ 1.2/3.6/4.2 |
| A3 | `service_fee_templates` | `charge_per_tracking_round` BOOLEAN default true |
| A5 | `billing_payout_cycles` | enum `due_rule_type` + `due_rule_value` INTEGER + คง `due_rule` เดิมเป็น label + CHECK |
| B4 | `finance_policy_settings` | `write_off_tolerance_satang` INTEGER default 5000 |
| D12 | `finance_policy_settings` | `advance_uncleared_to_employee_receivable` BOOLEAN default true |

### บั๊ก/กับดักที่เจอระหว่างทาง
1. **Prisma `@updatedAt` ไม่ออก DB default** — `updated_at` เป็น `NOT NULL` เปล่า ๆ ⇒ INSERT ด้วย SQL ตรง (seed/ops/psql) ล้มทันที ทั้งที่ `02` §2.4 กำหนด `DEFAULT NOW()` · เจอตอนทดสอบ CHECK ด้วย raw SQL แล้วโดน not-null violation ก่อนถึง CHECK
2. **แก้ migration ที่ apply แล้ว = checksum drift** → Prisma บังคับ `migrate reset` ซึ่งเป็นคำสั่งทำลายข้อมูลและต้องขอ consent · เลี่ยงด้วยการแยกเป็น migration ใบใหม่ (ไม่ต้อง reset ไม่ต้องขอ consent)
3. **`docker exec` ไม่มี `-i`** → heredoc ไม่ถูกส่งเข้า psql เลย คำสั่งจบเงียบ exit 0 ไม่มี output — เสียเวลาเข้าใจผิดว่า SQL ไม่ทำงาน
(ทั้งสามข้อบันทึกใน `docs/REUSE_INDEX.md` แล้ว)

### verify ที่รันจริง (DoD ของ PLAN §1.1)
- `prisma validate` เขียว · `prisma migrate dev` + `migrate deploy` ผ่าน · `migrate status` = up to date (2 migrations)
- **ตรวจไขว้อัตโนมัติกับ spec** (แทน subagent — ใช้สคริปต์เทียบตรง ๆ กับ DB จริง): ตาราง 19/19 ตรง · **ทุกคอลัมน์ทุกตารางตรง spec ไม่ขาดไม่เกิน** (ยกเว้น 5 คอลัมน์ตามมติ PO ที่ระบุไว้ข้างบน) · enum 54/54 **ค่าและลำดับตรงเป๊ะ** + `due_rule_type` ที่เพิ่มตามมติ
- **ทดสอบ constraint ด้วยข้อมูลจริง**: circular insert (org → user ที่ชี้ team ยังไม่เกิด + created_by ชี้ตัวเอง → team) ผ่านใน transaction เดียว = DEFERRABLE ทำงานจริง · CHECK ทั้ง 2 ตัวปฏิเสธข้อมูลผิดรูปจริง (`cycles_cutoff_shape`, `cycles_due_rule_shape`)
- ตรวจ `information_schema`: คอลัมน์ `%satang%` เป็น `integer` ทุกช่อง · `updated_at` มี default 15/15
- `pnpm typecheck` / `lint` / `test` (21 เคส) / `build` เขียวครบ

### จุดที่คนถัดไปควรรู้
- **ตารางที่เพิ่มใน 1.2 ต้องรัน `ALTER ... SET DEFAULT NOW()` สำหรับ `updated_at` ด้วย** (Prisma ไม่ทำให้เอง) — คัดลอก DO block จาก migration ใบที่สองได้เลย
- FK ที่เป็น DEFERRABLE มี 7 เส้น — ถ้า generate migration ใหม่ทับ `users`/`teams` ต้องเติมบล็อก DEFERRABLE ซ้ำ (Prisma ไม่รู้จัก attribute นี้)
- `cutoff_dates` เป็น `Int[]` ซึ่ง Postgres ทำให้ NOT NULL default `{}` เสมอ ⇒ CHECK ต้องเช็ค `array_length > 0` ไม่ใช่ `IS NOT NULL` (เขียนไว้แล้ว)
- ข้อ A2/A4/A6/B3-recycle ยัง ⬜ อยู่ — ตกอยู่ใน Group C–G ต้องเคาะ/ทำตอน **1.2**
- ยังไม่มี seed — `prisma/seed.ts` เป็น stub · master data จริง (15 roles + capabilities 37) อยู่ใน 1.2

---

## Phase 0.3 — Adapt Orchestrator + Dev Panel เข้าโปรเจกต์นี้

**วันที่**: 2026-08-14 · **commit**: `3a54bb2` · **branch**: `staging`

### สิ่งที่ทำ (adapt ตาม `promptmovetools.md` — ไม่เขียนใหม่ ไม่แตะ logic ที่มี comment บทเรียน)
**A. Orchestrator**
- `config.mjs`: **`baseBranch` = `staging`** (สายพัฒนาจริงตาม rules/06 — เดิม `main`) · verify 3 ด่านตรงกับโปรเจกต์นี้อยู่แล้ว (`pnpm typecheck` เต็ม + `vitest run --changed` + eslint ผ่าน xargs) · เขียน comment ด้าน release flow ใหม่ให้ตรงกับ staging→PR→main · `finalTestStages` 6 ด่านใหม่ · `uiTaskPrefixes` = ว่าง
- `lib/prompt.mjs`: แทน `RULES` ทั้งก้อนด้วยกติกาจาก CLAUDE.md ของโปรเจกต์นี้ (satang/พ.ศ./permission API layer/audit 9 fields/snapshot/idempotency/state+error code/ห้าม push) · แก้ชื่อโปรเจกต์ · path เอกสาร (`docs/REUSE_INDEX.md`, `docs/01_PLAN.md`, `docs/00_MAP.md`) · flow ตัวอย่างใน final test เป็นสายงานจริงของเรา · `${stage.key}/4` hardcode → `/${config.finalTestStages.length}`
- `review-prompt.md` + `final-test-prompt.md` + `final-tests/*.md` — เขียนใหม่ทั้งชุดตามธุรกิจนี้ (ลบไฟล์ RTB 5 ไฟล์ สร้างใหม่ 6 ไฟล์: operations / finance / accounting / security / ui-completeness / reliability)
- ข้อความแสดงผล "RTB" → "AssetRecovery" ใน `engine.mjs`, `notify.mjs`, `orchestrate.mjs`, `server.mjs`, `dashboard.html`, `scripts/*.sh`
- `README.md` / `REMOTE.md` / `ADAPT_GUIDE.md` — path เครื่อง, port 4174, ชื่อ container, `.env.local`, หมายเหตุว่าขั้นตอนแปลงเอกสาร 7 ข้อทำครบแล้ว

**B. Dev Panel**
- `server.mjs`: `SERVICES` เหลือตัวเดียว (`app` = Next.js dev :3000 — โปรเจกต์นี้ frontend+backend อยู่ด้วยกัน ไม่มี api/admin/worker แยก) · `TASKS` = generate/migrate/seed/typecheck/test/lint/build ของจริง · Studio = `pnpm db:studio` (Prisma :5555) · **docker ต้องส่ง `-f docker-compose.dev.yml`** เพราะไฟล์ไม่ใช่ชื่อ default · container = `assetrecovery-postgres-dev` · โหลด env จาก `.env` **และ `.env.local`** (Next.js ใช้ตัวหลัง)
- `index.html`: header/ปุ่ม/คำอธิบาย/URL เปิดเว็บตาม service ใหม่ + เพิ่มปุ่ม lint และ prisma generate

### การตัดสินใจเอง (ต้องรายงานตาม DoD ข้อ 7)
1. **`uiTaskPrefixes` = ว่าง** (ไม่เปิด rule "task UI → Fable 5") — task ในแผนนี้เกือบทุกตัวเป็นงานผสม BE+FE และถูกวางขนาดไว้กับงบ context 800k ของ Opus 5 · วิธีเปิดเขียนไว้ใน comment แล้ว
2. **คง env prefix `RTB_*` ทั้ง 33 ตัว** ตามคำแนะนำใน promptmovetools §A5 (เปลี่ยน = ต้อง grep ครบทุกไฟล์รวม docs, ได้ไม่คุ้มเสีย)
3. **คง `globalThis.__rtbHandoffTarget`** — เป็นสัญญาระหว่าง `engine.mjs` ↔ `prompt.mjs` เปลี่ยนชื่อแล้วพลาดจุดเดียว = prompt บอกเป้า context ผิดเงียบ ๆ
4. **เอา `orchestrator/lib/progress.test.mjs` เข้า `pnpm test`** (แก้ `vitest.config.mts` ให้ include `orchestrator/**/*.test.mjs` และเลิก exclude โฟลเดอร์นี้) — เดิมเทสต์นี้ไม่เคยถูกรันในโปรเจกต์นี้เลย ทั้งที่มันคือยามกันบั๊ก "dashboard โชว์ 100% ปลอม / orchestrator หยุดหยิบงาน" · มันรันกับ `PROGRESS.md` **จริง** จึงจับได้ทันทีถ้าแก้ฟอร์แมตพัง
5. **แก้เทสต์ 1 เคสใน `progress.test.mjs`** — เคส "รับ id ทุกแบบ" เดิม assert ว่า id ของโปรเจกต์เดิม (`RET-2b`, `OPS-1`, …) มีอยู่ใน PROGRESS.md จริง ซึ่งเป็นข้อมูลเฉพาะโปรเจกต์นั้น · เปลี่ยนไปทดสอบ parser กับ **ไฟล์ fixture** ที่มี id รูปแบบเดียวกันแทน — บทเรียนยังอยู่ครบและแข็งขึ้น (ไม่ผูกกับข้อมูลโปรเจกต์) ส่วนเคส "ไม่ทิ้งแถวเงียบ ๆ" ยังเทียบกับไฟล์จริงเหมือนเดิม

### verify ที่รันจริง (DoD 7 ข้อของ promptmovetools)
1. `node --check` ทุกไฟล์ `.mjs` ที่แก้ ✅
2. `orchestrate.mjs status` → **AssetRecovery — 2/60 (3%)** + งานถัดไป `Phase 0.3` ถูกต้อง ✅
3. `run --dry-run` → branch `auto/phase-0.3`, model `claude-opus-5`, prompt อ้าง `docs/00_MAP.md`/`docs/01_PLAN.md`/`docs/REUSE_INDEX.md` + กติกาโปรเจกต์นี้ ✅
4. dashboard :4174 → ไม่มี token = **401**, มี token = เห็นหัวข้อ AssetRecovery + `next.id=0.3` + `finalStages` 6 ด่านใหม่ ✅
5. dev panel :4600 → เปิด/ปิด `app` ได้จริง (เห็นสถานะ managed→listening ครบ 3 สถานะ), one-shot `lint` รันจบ, docker postgres up→**ตรวจเจอ container**→down, `/api/quit` ปิดสะอาด ✅ (ยืนยันว่า init script สร้าง `assetrecovery_dev` + `assetrecovery_test` จริง)
6. `grep -ri "RTB|Boonphone|zeegamemsg"` → เหลือเฉพาะ: env prefix `RTB_*`, path เครื่องนี้ใน plist/REMOTE (ตั้งใจ), `__rtbHandoffTarget`, และ false positive (`insertBefore`/`restartBtn`) ✅
7. รายงานการตัดสินใจ = หัวข้อด้านบน ✅

เพิ่มเติม: `pnpm typecheck` / `lint` / `test` (14 เคส) / `build` เขียวครบ · ไม่มี state เก่าจากโปรเจกต์เดิมติดมา (`queue/`, `logs/`, `.token`, `.run.lock`, `review-checkpoint.json` — ไม่มีเลย และ gitignore ครอบครบ)

### จุดที่คนถัดไปควรรู้
- **orchestrator ไม่มี `git push` โดยตั้งใจ** — auto-merge แตะแค่ `staging` ในเครื่อง (reset กลับได้) · เส้นแบ่ง production คือคนกด push เอง
- เริ่มใช้จริงครั้งแรกแนะนำตั้ง `RTB_AUTO_MERGE=false` ก่อน แล้วค่อยเปิดเมื่อมั่นใจ · `state.auto` default ปิดทุกครั้งที่ restart โดยตั้งใจ
- dashboard สั่งรันโค้ดได้ → **ห้ามเปิดออกอินเทอร์เน็ต** ใช้ Tailscale + token เท่านั้น (`REMOTE.md`)
- แก้ `PROGRESS.md` เมื่อไหร่ให้รัน `pnpm test` ด้วยเสมอ — ยาม parser จะจับฟอร์แมตพังให้ (บันทึกใน REUSE_INDEX แล้ว)

---

## Phase 0.2 — Deploy pipeline ฝั่ง Staging

**วันที่**: 2026-08-14 · **commit**: `6e3fedf` (setup) + `6cccf92` (fix build) + `04f5341` (ตรึง Node) · **branch**: `staging`

### สิ่งที่ทำ (ฝั่ง repo)
- `vercel.json` — ตรึง `framework: "nextjs"` ไว้ในโค้ด ไม่พึ่ง Framework Preset ใน UI อย่างเดียว
- `.vercelignore` — ตัด `docs/ reference/ orchestrator/ tools/ _to_delete/` + ไฟล์คุมงาน ออกจาก build context (**ยืนยันจาก build log จริงว่า Vercel เคารพไฟล์นี้บน Git integration** — `Removed 133 ignored files`)
- `docs/03_PRODUCTION_CHECKLIST.md` — checklist 6 หมวดที่ต้องครบก่อนเปิด PR แรกเข้า `main` (มติ PO 2026-08-12 ที่เลื่อน production ออกไป) + ลิงก์จาก `00_INDEX` และ `01_PLAN §0.2`
- **แก้ Vercel build ล้ม**: script `build` = `prisma generate && next build` (+ `postinstall: prisma generate`)
- ตรึง `engines.node` = `24.x` ให้ตรงกับ CI และเครื่อง dev

### สิ่งที่ทำ (ฝั่ง PO — นอก repo)
- Vercel project `asset-recovery` ผูกกับ repo · Production branch = `main` · `staging` เข้า Preview
- Branch ruleset บน `main`: require PR (approvals 0) + block force push + restrict deletion + merge method = Merge อย่างเดียว

### บั๊กที่เจอและแก้ (สำคัญ — อย่าให้เกิดซ้ำ)
Vercel build ล้มที่ `lib/prisma.ts(2,30): error TS2307: Cannot find module '@/lib/generated/prisma/client'`
- **สาเหตุ**: `lib/generated/` ถูก gitignore (Prisma Client เป็นไฟล์ generate) แต่ Vercel รัน `pnpm run build` ตรงๆ ซึ่งตอนนั้นเป็น `next build` เปล่าๆ ไม่มีขั้น generate — local/CI ไม่เจอเพราะมีขั้น `pnpm db:generate` แยกไว้ก่อนหน้า (**false negative ที่ปิดบังว่า `pnpm build` เดี่ยวๆ พังอยู่**)
- **วิธียืนยันสาเหตุ**: ลบ `lib/generated/` บนเครื่องแล้วรัน typecheck → ได้ error บรรทัดเดียวกับ Vercel เป๊ะ
- **แก้**: ให้ `build` เลี้ยงตัวเองได้ (`prisma generate && next build`) — เลือกแก้ที่ `package.json` ไม่ใช่ `buildCommand` ใน `vercel.json` เพื่อให้ Vercel/CI/local ใช้นิยามเดียวกัน
- **ข้อจำกัดของ `postinstall`**: ทดสอบแล้วพบว่าถ้า dependencies ครบอยู่แล้ว pnpm ข้าม lifecycle script ทั้งหมด (แม้ใส่ `--force`) — ตัวที่การันตีจริงคือ script `build`

### verify ที่รันจริง
`pnpm lint` / `typecheck` / `test` / `build` เขียวครบทุก commit · CI บน GitHub เขียว 4 รอบติด (`31732139912`, `31736505966`, `31740188322`, `31740725871`) · Vercel deployment เขียว 2 รอบติดหลังแก้ + เปิดหน้า staging เห็นจริง (PO ยืนยัน) · สแกน git history ทั้งหมดแล้ว **ไม่มี secret หลุด** (ที่ match เป็น localhost/dummy ของ `.env.example`, CI placeholder, test fixture เท่านั้น)

### จุดที่คนถัดไปควรรู้ — **ยังค้าง 2 อย่างฝั่ง Vercel UI (session อัตโนมัติทำแทนไม่ได้)**
1. **Domain ประจำของ staging** — ยังไม่ผูก: Settings → Domains → Add `asset-recovery-staging.vercel.app` → ตั้ง **Git Branch = `staging`** (ตอนนี้ URL ยังเปลี่ยนตาม deployment hash)
2. **env 5 ตัว** — ยังไม่ใส่: `DATABASE_URL` (Transaction pooler **6543**), `DIRECT_URL` (Session pooler **5432** — เลี่ยง direct `db.<ref>.supabase.co` ที่เป็น IPv6-only), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` · scope = **Preview → branch `staging`** เท่านั้น ห้ามติ๊ก Production · ใส่เสร็จต้อง **Redeploy** ค่าถึงมีผล
   - ⚠️ **บล็อก Phase 1.1** — `prisma migrate` ต้องใช้ `DIRECT_URL` จริง · ตอนนี้ยังไม่บล็อกเพราะหน้าแรกไม่เรียก `lib/env.ts`/`lib/prisma.ts` build เลยผ่านทั้งที่ env ว่าง
   - ห้ามใส่ `pgbouncer=true` / `connection_limit=1` — เป็น flag ของ Prisma engine เดิม ไม่มีผลกับ driver adapter (`PrismaPg`/node-postgres) · ขนาด pool คุมในโค้ดผ่าน `PoolConfig` (`PrismaPg` รับ `pg.PoolConfig` ได้ตรงๆ) เมื่อถึงเวลา tune
3. Framework Preset + Node 24 ใน UI ไม่จำเป็นแล้ว — `vercel.json` และ `engines` ในโค้ดคุมให้ทั้งคู่ (ตั้งใน UI ซ้ำได้ ไม่เสียหาย)

---

## Phase 0.1 — Bootstrap โปรเจกต์ Next.js + โครงสร้าง + CI

**วันที่**: 2026-08-13 · **commit**: `7eda8e3` · **branch**: `staging`

### สิ่งที่ทำ
- โครง Next.js 16.3 (App Router + TS strict + Tailwind v4) วางที่ root ของ repo เดิม (ไม่ใช้ `create-next-app` เพราะ repo มีไฟล์อยู่แล้ว — scaffold เองทุกไฟล์)
- ติดตั้ง: Prisma 7.9 + `@prisma/adapter-pg`, `@supabase/supabase-js` + `@supabase/ssr`, Zod 4, vitest 4, ESLint 9 + `eslint-config-next` 16, tsx, dotenv
- โครงโฟลเดอร์ตาม `docs/implementation-todo.md` §0.2: `app/` (layout+page "Staging OK"), `components/`, `lib/` (`prisma.ts`, `env.ts`, `constants.ts`, `supabase/{server,client}.ts`), `proxy.ts` (= `/middleware.ts` ของเอกสาร), `prisma/{schema.prisma,seed.ts}` + `prisma.config.ts`
- `.env.example` (DATABASE_URL/DIRECT_URL/Supabase 3 ตัว + TEST_DATABASE_URL) · `docker-compose.dev.yml` (Postgres 17 port **5433** + init script สร้าง `assetrecovery_test`)
- `.github/workflows/ci.yml` — push/PR เข้า `staging`+`main`: install → `db:generate` → lint → typecheck → test → build (มี service postgres รอไว้ให้ test ที่แตะ DB ตั้งแต่ Phase 1.1)
- scripts: `dev/build/start/lint/typecheck/test/test:watch/db:generate/db:migrate/db:deploy/db:seed/db:studio`
- test ชุดแรก 4 เคสที่ `lib/env.test.ts` (env ครบ/ขาด/URL ผิด + ตรึงค่า `DISPLAY_TIMEZONE`+`BUDDHIST_YEAR_OFFSET` ตาม Rule 01)

### การตัดสินใจระหว่างทาง (ไม่ใช่ระดับ DEC — เป็นรายละเอียดเชิงเครื่องมือ ไม่กระทบ tech stack ตาม DEC-001)
- **`middleware.ts` → `proxy.ts`**: Next 16 deprecate ชื่อ `middleware` แล้ว (build เตือนทุกครั้ง) — ใช้ชื่อใหม่ตาม framework แล้ว comment กำกับว่าเป็นไฟล์เดียวกับที่เอกสารเรียก `/middleware.ts` · ไฟล์นี้**ไม่ใช่**จุดบังคับสิทธิ์ (DEC-002 ยังยืน — permission อยู่ที่ API layer ใน Phase 1.3)
- **TypeScript ตรึง 5.9** ทั้งที่ latest = 7.0 (native port) — เลี่ยงความเสี่ยง toolchain (typescript-eslint / next plugin / prisma) ในงานฐานราก · อัปเป็น 7.x ได้ทีหลังเมื่อ ecosystem นิ่ง
- **ESLint ตรึง 9.39** — ESLint 10 พังกับ `eslint-plugin-react` ที่ `eslint-config-next` 16 ดึงมา
- **`next lint` ถูกถอดใน Next 16** → script `lint` = `eslint .` + flat config นำเข้า `eslint-config-next/core-web-vitals` และ `/typescript` ตรงๆ (FlatCompat ใช้ไม่ได้)
- **Prisma 7**: datasource url ย้ายไป `prisma.config.ts` (CLI ใช้ `DIRECT_URL` เพราะ migration ผ่าน pooler ไม่ได้) · runtime ต้องมี driver adapter (`PrismaPg` + `DATABASE_URL`) · client generate ไป `lib/generated/prisma` และ **gitignore ไว้** (CI generate เอง)
- **pnpm 11**: setting `allowBuilds` ย้ายไป `pnpm-workspace.yaml` (package.json `pnpm` field ถูกเมิน) — อนุญาต build script เฉพาะ prisma/engines/esbuild/unrs-resolver
- **ไม่ตั้ง `process.env.TZ` ใน next.config** โดยเจตนา — server เป็น UTC เสมอ, แปลง Asia/Bangkok + พ.ศ. ที่ display layer ผ่าน utils กลาง (Phase 1.5) ตาม Rule 01
- Postgres dev map ที่ port **5433** กันชนกับ Postgres ตัวอื่นบนเครื่อง

### verify ที่รันจริง
`pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ (4/4) · `pnpm build` ✅ · `pnpm dev` ขึ้นจริง (curl 200 + เห็นข้อความ "Staging OK") · `docker compose -f docker-compose.dev.yml config` ✅

### จุดที่คนถัดไปควรรู้
- **ยังไม่ได้ push** — ตาม Rule 06 การ push `origin staging` เป็นงานของคน
- CI ยังไม่เคยรันจริงบน GitHub (DoD ข้อ "CI ผ่านบน PR แรก" จะพิสูจน์ตอนคน push) — env ใน workflow เป็นค่า placeholder ทั้งหมด ไม่แตะ DB จริง
- ยังไม่มี `.env.local` บนเครื่อง — ก่อนเริ่ม Phase 1.1 ต้อง `cp .env.example .env.local` + `docker compose -f docker-compose.dev.yml up -d` และเติมค่า Supabase staging จริง
- ตารางจริงทั้งหมดยังไม่มี — `prisma/schema.prisma` มีแค่ generator+datasource, `prisma/seed.ts` เป็น stub (ของจริง Phase 1.1/1.2)
- ของที่ reuse ได้ทั้งหมดบันทึกไว้ใน `docs/REUSE_INDEX.md` แล้ว (รวมกับดัก 4 ข้อของ Next 16 / Prisma 7 / ESLint / CLAUDE.md auto-block)

---
