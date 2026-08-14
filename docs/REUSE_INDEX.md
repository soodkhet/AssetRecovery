# REUSE_INDEX.md — ของที่มีแล้ว / แม่แบบ / กับดัก (เช็คก่อนเขียนโค้ดใหม่ทุกครั้ง)

> **กติกา**: ก่อนสร้าง component/util/service ใหม่ ให้ Grep ตารางนี้ก่อน — มีแล้วให้ reuse · สร้างของใหม่ที่คนอื่นใช้ได้ → **ต้องเพิ่มแถวที่นี่ใน commit เดียวกัน** · เจอกับดัก/บั๊กที่แก้ยากให้บันทึกไว้หมวด "กับดัก"

## Shared Components (Frontend)

| ชื่อ | ที่อยู่ | สร้างใน task | หมายเหตุ |
|---|---|---|---|
| (รอเริ่ม — Phase 1.5 จะสร้าง UI Kit ชุดแรก: Button/Table/Modal/Badge/Input/Card/Toast + statusBadge mapper + loading/empty/error states) | | | |

รายการที่**ต้องเกิด**เป็น shared ตามแผน (อย่าสร้างซ้ำในโมดูลตัวเอง):
- `statusBadge()` mapper 10 กลุ่มสี (`04` §8.1) — Phase 1.5
- datetime utils `fmtDate`/`fmtDateTime` พ.ศ. (`03` §6.5) — Phase 1.5
- satang ↔ display utils (÷100 + comma) — Phase 1.5
- 3-tab nested shell (แอดมิน/เจ้าหน้าที่/บริษัทไฟแนนซ์) ใช้ทั้งไฟล์ 07+08 — Phase 1.6
- Address component ×3 ที่อยู่ + cascading จังหวัด/อำเภอ/ตำบล (`38` §6.1.2) — Phase 2.4, ไฟล์ 41 ใช้ซ้ำ
- Case Detail component (`38` §7.5) — Phase 2.5, ใช้ซ้ำใน 40 (Assignment Modal) และ 41 (3 จุด)
- Doc viewer + image lightbox — Phase 2.5
- DateRangePicker + preset / KPI card + MoM / table + virtual scroll — Phase 6.1

## Shared Services / Utils (Backend)

| ชื่อ | ที่อยู่ | สร้างใน task | หมายเหตุ |
|---|---|---|---|
| Prisma models Group A+B (19 ตาราง) + enum 55 ตัว | `prisma/schema.prisma` | 1.1 | ชื่อ model = PascalCase + `@@map` snake_case · เพิ่ม field ใหม่ต้องเทียบ `02` ผ่าน MAP เสมอ · ยามอัตโนมัติอยู่ที่ `prisma/schema.test.ts` |
| Prisma models Group C–G (32 ตาราง) + 2 ตารางตามมติ PO (`BankTransactionAllocation`, `CustomerWhtCertificate`) | `prisma/schema.prisma` | 1.2 | รวม **53 ตาราง** · model `StoredFile` = ตาราง `files` (เลี่ยงชนกับ `File` ของ Web API) · `advances.returnSatang` = **generated column อ่านอย่างเดียว** ห้ามเขียนค่า · `expenses.payoutBatchItemId`/`advances.payoutBatchItemId` เป็นคอลัมน์อ้างอิงเปล่า ไม่ใช่ relation |
| Seed master data (org 1 · roles 15 · VAT 7% · tax profiles 2 · finance policy · capabilities 47) | `prisma/seed.ts` | 1.2 | `pnpm db:seed` — **idempotent** (upsert) รันซ้ำได้ · `ORG_ID`/`SEED_USER_ID` เป็น UUID คงที่ ใช้อ้างใน test/seed ต่อยอดได้ · ผูก role ↔ capability = Phase 1.6 |
| ยาม schema (satang=Int / ห้าม Float / Decimal เฉพาะ pct+พิกัด / Timestamptz / organizationId ครบ / CHECK+partial index อยู่ครบใน migration) | `prisma/schema.test.ts` | 1.1 (ขยาย 1.2) | รันใน `pnpm test` — เพิ่ม model/field ใหม่แล้วเทสต์แดง = ผิดกติกา `02` §2 ไม่ใช่เทสต์พัง · ยาม constraint จับกรณี `migrate dev` เขียนไฟล์ทับจน raw SQL หาย |
| `prisma` (client singleton) | `lib/prisma.ts` | 0.1 | ทุก data access ผ่านตัวนี้ · Prisma 7 ต่อผ่าน driver adapter `PrismaPg` + `DATABASE_URL` (pooler) |
| `getServerEnv()` / `getPublicEnv()` | `lib/env.ts` | 0.1 | validate env ด้วย Zod — ขาดตัวไหน throw พร้อมชื่อตัวแปร · ห้ามอ่าน `process.env` ตรงในโมดูลอื่น |
| `createSupabaseServerClient()` / `createSupabaseAdminClient()` | `lib/supabase/server.ts` | 0.1 | Auth/Storage เท่านั้น · admin = service_role ห้าม import ฝั่ง client |
| `createSupabaseBrowserClient()` | `lib/supabase/client.ts` | 0.1 | Auth ฝั่ง browser · ห้าม query ข้อมูลธุรกิจตรง (DEC-002) |
| `APP_NAME` / `DISPLAY_TIMEZONE` / `BUDDHIST_YEAR_OFFSET` | `lib/constants.ts` | 0.1 | ค่าคงที่ระดับแอป — business rule ต้องมาจาก settings (ไฟล์ 13) ไม่ใช่ที่นี่ |

รายการที่**ต้องเกิด**เป็น shared ตามแผน:
- `requirePermission(action, resource, scope)` + scope resolver — Phase 1.3 (ทุก endpoint ต้องใช้)
- Audit emit helper (9 fields + immutable) — Phase 1.4 (ทุก mutation ต้องผ่าน)
- Pure calculation modules ครบ 13 สูตร (`22`) — Phase 3.1 (ห้ามคำนวณเงินนอก module นี้)
- `success_rate` service กลาง (`40` §6.2) — Phase 2.6 (Report ใช้ซ้ำ)
- Response envelope + error catalog — Phase 2.1
- Period Lock guard interceptor — Phase 4.1 (write endpoint การเงิน/บัญชีทุกตัว)
- VAT resolver / WHT resolver — Phase 3.1 (19/31/33 ใช้ร่วม)

## กับดัก (Lessons Learned)

| วันที่ | เรื่อง | รายละเอียด |
|---|---|---|
| 2026-08-13 | Next 16 เลิกใช้ `middleware.ts` | convention เปลี่ยนเป็น `proxy.ts` (default export `proxy`) — เอกสาร `implementation-todo` §0.2 ที่เขียนว่า `/middleware.ts` หมายถึงไฟล์นี้ · `next lint` ถูกถอดออกแล้ว ใช้ `eslint .` แทน |
| 2026-08-13 | Prisma 7 ย้าย datasource url ออกจาก schema | `prisma.config.ts` ถือ url ของ CLI (ใช้ `DIRECT_URL`) · runtime ต้องส่ง driver adapter (`PrismaPg` + `DATABASE_URL`) ให้ `new PrismaClient()` เสมอ · client ถูก generate ไปที่ `lib/generated/prisma` (gitignored — CI ต้องรัน `pnpm db:generate` ก่อน verify) |
| 2026-08-13 | ESLint 10 ยังใช้กับ `eslint-config-next` 16 ไม่ได้ | `eslint-plugin-react` 7.37.x พังกับ context API ของ ESLint 10 (`contextOrFilename.getFilename is not a function`) — ตรึงไว้ที่ `eslint@^9` จนกว่า plugin จะรองรับ |
| 2026-08-14 | Prisma `@updatedAt` **ไม่ออก DB default** | คอลัมน์ `updated_at` จะเป็น `NOT NULL` เปล่า ๆ ⇒ INSERT ที่ไม่ผ่าน Prisma Client (seed ด้วย SQL, psql, งาน ops) ล้มด้วย not-null violation ทั้งที่ `02` §2.4 กำหนด `DEFAULT NOW()` — แก้ด้วย migration `20260813220500_updated_at_db_default` (DO block ไล่ทุกตารางที่มีคอลัมน์นี้) · **ตารางใหม่ที่เพิ่มทีหลังต้องรัน ALTER เดิมซ้ำ** |
| 2026-08-14 | แก้ migration ที่ apply ไปแล้ว = ต้อง reset DB | Prisma เก็บ checksum ของทุก migration ⇒ ถ้าเติม SQL ลงไฟล์ที่ apply แล้วจะ drift และบังคับ `migrate reset` (ทำลายข้อมูล + ต้องขอ consent) — ให้เพิ่มเป็น migration **ใบใหม่** เสมอ · เติม raw SQL ลง migration ได้เฉพาะตอนสร้างด้วย `--create-only` ก่อน apply |
| 2026-08-14 | `docker exec` ไม่มี `-i` = heredoc หายเงียบ | `docker exec ... psql <<'SQL'` โดยไม่ใส่ `-i` จะไม่ส่ง stdin เข้าไป psql เลย — คำสั่งจบเงียบ ๆ exit 0 ไม่มี output ทำให้เข้าใจผิดว่า "รันแล้วไม่มีอะไรเกิดขึ้น" · ต้องใช้ `docker exec -i` เสมอเมื่อส่ง SQL ทาง stdin |
| 2026-08-14 | แก้ `PROGRESS.md` ต้องคง marker ภาษาไทยเป๊ะ | parser ของ orchestrator (`orchestrator/lib/progress.mjs`) จับคำไทยตรงตัว: `## 🎯 งานถัดไป — Phase <id>: <ชื่อ>` (มีได้อันเดียว), หัวตาราง `\| # \| งาน \| สถานะ \| หมายเหตุ \|`, สถานะ ⬜/🔄/✅/⏸️ เท่านั้น, `## บันทึกการตัดสินใจ` = จุดหยุด parser, ไฟล์ ≤50,000 ตัวอักษร (วัดด้วย python `len()` ไม่ใช่ `wc -c`) · ผิดฟอร์แมต = แถวหาย**เงียบ ๆ** ไม่มี error → `pnpm test` มียามอยู่แล้ว (`orchestrator/lib/progress.test.mjs`) ให้รันก่อน commit ทุกครั้งที่แก้ PROGRESS |
| 2026-08-14 | Vercel build ล้ม `TS2307: Cannot find module '@/lib/generated/prisma/client'` | `lib/generated/` ถูก gitignore ไว้ ถ้า pipeline ไหนไม่รัน `prisma generate` ก่อน `next build` จะพังตอน typecheck (local/CI ผ่านเพราะมีขั้น generate แยก) — แก้โดยให้ script `build` = `prisma generate && next build` · **ห้ามเอา `prisma generate` ออกจาก build** และถ้าเพิ่ม pipeline ใหม่ที่ typecheck โดยไม่ build ต้องมีขั้น generate ของตัวเอง |
| 2026-08-14 | Prisma ไม่รู้จัก generated column | `advances.return_satang` เป็น `GENERATED ALWAYS AS ... STORED` (เติมมือตอน `--create-only`) แต่ Prisma มองเป็นคอลัมน์ธรรมดา ⇒ **client ยอมให้ใส่ค่าใน create/update แล้วไปตายที่ DB** (`cannot insert a non-DEFAULT value into column`) · เวลาสร้าง Advance ให้เซ็ตแค่ `requestedSatang`/`approvedSatang`/`usedSatang` · ยามอยู่ใน `prisma/schema.test.ts` (เช็คว่า SQL generated ยังอยู่ในโฟลเดอร์ migrations) |
| 2026-08-13 | `next dev` เขียนบล็อกต่อท้าย CLAUDE.md เอง | บล็อก `<!-- BEGIN:nextjs-agent-rules -->` ถูกเติมกลับทุกครั้งที่รัน dev — commit ไปเลย (ปิดได้ด้วย `agentRules: false` ใน next.config ถ้าไม่ต้องการ) |
