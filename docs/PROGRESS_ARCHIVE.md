# PROGRESS_ARCHIVE.md — รายละเอียดเต็มของงานที่เสร็จแล้ว

> ย้ายรายละเอียดของ task ที่มาร์ค ✅ ใน `PROGRESS.md` มาไว้ที่นี่ เพื่อให้ PROGRESS.md บางอยู่เสมอ (≤50,000 ตัวอักษร)
> รูปแบบต่อรายการ: `## Phase <id> — <ชื่องาน>` + วันที่ + commit hash + สรุปสิ่งที่ทำ + การตัดสินใจระหว่างทาง + จุดที่คนถัดไปควรรู้

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
