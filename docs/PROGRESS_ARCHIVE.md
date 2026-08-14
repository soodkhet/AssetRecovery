# PROGRESS_ARCHIVE.md — รายละเอียดเต็มของงานที่เสร็จแล้ว

> ย้ายรายละเอียดของ task ที่มาร์ค ✅ ใน `PROGRESS.md` มาไว้ที่นี่ เพื่อให้ PROGRESS.md บางอยู่เสมอ (≤50,000 ตัวอักษร)
> รูปแบบต่อรายการ: `## Phase <id> — <ชื่องาน>` + วันที่ + commit hash + สรุปสิ่งที่ทำ + การตัดสินใจระหว่างทาง + จุดที่คนถัดไปควรรู้

---

## Phase 1.5 — UI Kit + App Shell + Navigation

**วันที่**: 2026-08-14 · **commit**: `e4d56b4` · **branch**: `auto/phase-1.5`

### สิ่งที่ทำ

- **Utils กลาง (pure + unit test)**
  - `lib/format/datetime.ts` — `fmtDate`/`fmtDateTime`/`fmtTime`/`nowDate`/`nowDateTime`/`buddhistYear`/`toBangkokParts`/`toDate` + `toInputDate`/`fromInputDate` (ข้อยกเว้น `<input type="date">`) · แปลง UTC → Asia/Bangkok ด้วย `Intl` (ไม่ hardcode offset) แล้วแสดง **พ.ศ. เท่านั้น** (`03` §6.5 · DEC-005)
  - `lib/format/money.ts` — `fmtSatang`/`fmtSatangSymbol`/`fmtSatangRounded`/`fmtCount`/`fmtPercent`/`fmtRatioPct` · แปลง satang → ข้อความด้วยการหาร/มอดจำนวนเต็ม (ไม่มี float) · ส่งค่าไม่ใช่จำนวนเต็มเข้าไป = โยน `MoneyFormatError`
  - `lib/ui/status-badge.ts` — statusBadge mapper **10 กลุ่มสีตายตัว** ถอดจากตาราง `04` §8.1 ครบทั้ง 36 สถานะ · สถานะที่ยังไม่จัดหมวด → `neutral`
- **UI Kit** `components/ui/*` (barrel `@/components/ui`): `Button`/`Spinner` · `Card`/`CardHeader`/`PageHeader`/`StatCard` · `StatusBadge`/`Badge`/`RefText` · `Field`/`Input`/`Select`/`Textarea`/`Label` · `Table`/`THead`/`TBody`/`Tr`/`Th`/`Td`/`TableState` · `Modal`/`ConfirmModal` · `ToastProvider`/`useToast` · `LoadingState`/`EmptyState`/`ErrorState`/`InlineAlert`/`Skeleton` · `cn()` — คลาสทุกตัวถอดจาก `04` §8.1 + mockup
- **Menu registry** `lib/nav/menu-registry.ts` — SSOT ของเมนู 7 ตัว + แท็บย่อย "จัดการเคส" 3 ตัว พร้อม `resolveMenuAudience()`/`visibleMenus()`/`canViewMenu()`/`findMenu()` ถอดจาก `06` §7.2 + §7.1.1 ตรง ๆ · เทสต์ = ตารางในเอกสาร (9 คอลัมน์ × 7 เมนู + submenu matrix)
- **App Shell** `components/shell/*` + route group `app/(app)/` — Top Nav (desktop + จอเล็ก) → Sub-Nav (หาเมนูที่เปิดอยู่จาก pathname) → เนื้อหา · ห่อ `PermissionProvider` + `ToastProvider` ให้ทุกหน้าอัตโนมัติ
- **หน้าใหม่**: `/dashboard` (placeholder + session/menu panel), `/cases`, `/finance`, `/accounting`, `/warehouse`, `/reports`, `/settings` (ModulePlaceholder + `requireMenuPage()`), `/field` + `/portal` (placeholder นอก shell — กัน 404 หลัง login ของ Field Agent/Company User), `/` redirect ตาม `resolveLandingPath()`
- **`GET /api/meta/menu`** (`06` §14) + เทสต์ 5 เคส (matrix + 401)
- Font Inter + Noto Sans Thai ผ่าน `next/font` (self-host ตอน build) ผูกเข้า `@theme --font-sans` ของ Tailwind v4 · เพิ่ม `.no-scrollbar` + scrollbar บางใน `globals.css` · `LogoutButton` เปลี่ยนมาใช้ `<Button variant="secondary">`

### การตัดสินใจระหว่างทาง

- **กรองเมนูด้วย role ไม่ใช่ capability** — `06` §7.2 เป็น source of truth ของการมองเห็นเมนูและเขียนเป็นราย role · capability (DEC-009) ตอบคำถามคนละข้อ ("ทำอะไรได้ในหน้านั้น") ซึ่งบังคับที่ `requirePermission()` + `<Can>` อยู่แล้ว · อีกเหตุผลเชิงปฏิบัติ: `role_capabilities` ยังว่างจนถึง Phase 1.6 ถ้ากรองด้วย capability ตอนนี้ทุก role ที่ไม่ใช่ Superadmin จะไม่เห็นเมนูเลย
- **role "ธุรการ" ไม่มีในตาราง `06` §7.2** → ยึด mockup `app-shell.html` (`ROLE_CONFIG.admin_office`): แดชบอร์ด + จัดการเคส (แท็บรับเคส) ตามหน้าที่คีย์ข้อมูลเคส (`07` §5.1 อ้างไฟล์ 38) — บันทึกไว้เป็น assumption ในโค้ด + REUSE_INDEX
- **"มอบหมายงาน" ไม่ให้ Case Approver เห็น** — `06` §7.1 (บรรทัดบรรยาย) กับ §7.1.1 (ตาราง) ขัดกัน · §17 ของไฟล์ 06 ระบุชัดว่า §7.1.1 เป็น source of truth และ mockup ก็ให้ `caseSubmenus: ['submit']` เท่านั้น
- **custom role (ที่จะสร้างเพิ่มภายหลัง) → `resolveMenuAudience()` คืน `null`** = เห็นเฉพาะเมนูที่ทุกคอลัมน์เห็น (ปัจจุบัน = แดชบอร์ด) — least privilege จนกว่า Phase 1.6 จะผูก capability
- **`GET /api/meta/menu` ใช้ `requireSession()` ไม่ผูก capability** — ไม่มี capability code สำหรับ "เมนู" ใน `02` §12 และการสร้าง code ใหม่เป็นงานของ Phase 1.6 · endpoint คืนข้อมูลของผู้เรียกเองล้วน (เหมือน `GET /api/auth/session` ที่ทำแบบเดียวกันมาตั้งแต่ 1.3)
- **ไม่ใส่สูตรคำนวณเงินใน display layer** — ตัด `fmtMarginPct` ที่เคยร่างไว้ออก เหลือ `fmtRatioPct(value|null)` ที่รับผลลัพธ์จาก pure module ของ `22` มาแสดงอย่างเดียว (กันสูตรซ้ำก่อน Phase 3.1)
- **Field Tracker (41) / Client Portal (97) ไม่อยู่ใน route group `(app)`** — ทั้งสองมี shell ของตัวเองตามสเปก (mobile-first sidebar / portal nav) จึงวางเป็น route ระดับบนแยก

### verify ที่รันจริง (DoD ของ PLAN §1.5)

`pnpm typecheck` ✅ · `pnpm lint` ✅ (0 error 0 warning) · `pnpm test` ✅ 318/318 (21 ไฟล์ — ใหม่ 5 ไฟล์ 118 เคส) · `pnpm build` ✅ (17 route, font โหลดผ่าน `next/font` สำเร็จ)

### จุดที่คนถัดไปควรรู้

- **ทุกหน้าใหม่ต้อง import จาก `@/components/ui` เท่านั้น** — เขียนคลาส Tailwind เองในหน้าจอโมดูล = หลุด design system (`04` §8.1) · ตารางต้องใช้ `<TableState>` เพื่อให้ครบ loading/empty/error (`04` §9)
- **วันที่ทุกจุดต้องผ่าน `fmtDate`/`fmtDateTime`** และ **เงินทุกจุดผ่าน `fmtSatang`** — ห้าม format เอง (มีเทสต์ยามอยู่แล้วแต่กันได้เฉพาะใน util)
- เพิ่มเมนู/แท็บใหม่ = แก้ `lib/nav/menu-registry.ts` ที่เดียว แล้วอัปเดตตารางในเทสต์ให้ตรง `06` — เทสต์แดง = หลุด spec ไม่ใช่เทสต์พัง
- หน้า `/cases`, `/finance`, `/accounting`, `/warehouse`, `/reports`, `/settings` เป็น **placeholder** — โมดูลที่มาทำต่อให้แทนที่ `<ModulePlaceholder>` ด้วยของจริง และเปลี่ยน `available: true` ใน registry (แท็บย่อยที่ `available: false` ยัง disabled อยู่)
- ยังไม่ได้ทดสอบด้วยตาบน browser จริง (ต้องมี Supabase + DB ครบ) — build/typecheck/test เขียวทั้งหมด แต่การไล่ดู nav ต่อ role จริงควรทำตอน push ขึ้น staging
- กระดิ่งแจ้งเตือนบน header (`06` §8 · `90` §6.3) ยังไม่มี — เป็นงาน Phase 5.1

---

## Phase 1.4 — Audit Core Service (immutable)

**วันที่**: 2026-08-14 · **commit**: `09b283a` · **branch**: `auto/phase-1.4`

### สิ่งที่ทำ
- **Immutable guard 2 ชั้น** (`02` §13 · `90` §10/§17):
  - **ระดับ DB** — migration `20260814091702_audit_logs_immutable`: function `audit_logs_immutable()` + trigger 3 ตัว (`trg_audit_logs_no_update` / `_no_delete` / `_no_truncate`) แบบ **statement-level** ยกเว้น `AUDIT_IMMUTABLE` (ERRCODE 42501)
  - **ระดับ service** — `lib/audit/immutable.ts` (`auditLogImmutableExtension` = Prisma extension `$allOperations` ของ model `auditLog`) ต่อเข้า `lib/prisma.ts` แล้ว ⇒ `prisma.auditLog.update/updateMany/updateManyAndReturn/delete/deleteMany/upsert` โยน `AuditError('AUDIT_IMMUTABLE')` · `create`/read ผ่านปกติ
- **นโยบาย `reason`** — `lib/audit/reason-policy.ts` (pure) แปล `90` §13 เป็นกติกา 4 ข้อ: (1) action แทรกแซง `delete`/`reject`/`lock`/`unlock` ต้องมีเสมอทุกตาราง (2) ตาราง master/ตั้งค่า 17 ตัว ต้องมีทุก mutation (3) ตารางธุรกรรม 16 ตัว ต้องมีเมื่อ `update`/`delete` (แก้ย้อนหลังด้วยมือ) (4) `users`/`teams`/`finance_companies`/`organizations`/`cases` ต้องมีเมื่อฟิลด์ที่เปลี่ยนอยู่ในรายการอ่อนไหว + (5) actor = system (NULL) ต้องระบุ job id ใน reason ยกเว้น login/logout
- **before/after diff util** — `lib/audit/diff.ts` (pure): `diffRecords()` เก็บเฉพาะฟิลด์ที่เปลี่ยน (ข้าม `updated_at`) · `toAuditJson()` แปลง Date→ISO UTC, Decimal/BigInt→string, binary→marker, กัน circular · ปิดบัง password/token/apiKey ทุกชั้น (`90` §6.2 PDPA)
- **`emitAudit()` ตัวเต็ม** — `lib/audit/audit.ts`: validate ก่อนเขียน (`lib/audit/validate.ts`) → normalize JSON → create · รับ **tx client เป็น argument ที่ 2** เพื่อให้ audit อยู่ใน `$transaction` เดียวกับ mutation ได้ (`44` §11) · action `update` เก็บเฉพาะฟิลด์ที่เปลี่ยนอัตโนมัติ (`diffOnly: false` = snapshot เต็ม)
- **error code** — `lib/audit/errors.ts` (`AUDIT_REASON_REQUIRED` 400 / `AUDIT_IMMUTABLE` 403 / `REQUIRED_MISSING` 400) + เพิ่ม **`24` §6.10 หมวด Audit** (v3.3) ตาม Rule 04
- **โครงเทสต์ที่แตะ DB จริง** — `pnpm db:deploy:test` (`PRISMA_USE_TEST_DB=1` ใน `prisma.config.ts` → ชี้ `TEST_DATABASE_URL`) · `vitest.config.mts` ส่งต่อ **เฉพาะ** `TEST_DATABASE_URL` จาก `.env.local` · CI เพิ่มขั้น `Migrate test DB` และเปลี่ยนชื่อ DB ของ CI เป็น `assetrecovery_test`

### การตัดสินใจระหว่างทาง
- **trigger เป็น `FOR EACH STATEMENT` ไม่ใช่ `FOR EACH ROW`** — row trigger ไม่ยิงเมื่อ `WHERE` ไม่โดนแถวไหน ทำให้ `DELETE FROM audit_logs WHERE ...` ผ่านเงียบ ๆ · เพิ่ม trigger `TRUNCATE` ด้วยเพราะ TRUNCATE ข้าม row trigger โดยธรรมชาติ
- **ต้องมี guard ทั้ง 2 ชั้น** — Prisma extension กันได้เฉพาะทางที่ผ่าน Prisma Client (raw SQL / psql / งาน ops ยังลบได้) จึงยึด DB เป็นชั้นสุดท้ายตาม `90` §16 ("reject ที่ระดับ backend ไม่ใช่แค่ UI")
- **นโยบาย reason แยก "master data" กับ "ธุรกรรม"** — ถ้าบังคับ reason ทุก mutation ของตารางเงินทั้งหมด flow ปกติ (ระบบสร้าง expense/revenue เอง, agent ปิดเคส) จะต้องกรอกเหตุผลทั้งที่ spec ต้นทาง (`15`/`16`/`41`) ไม่มีช่องให้กรอก — จึงบังคับเฉพาะจุดที่เป็น "การแทรกแซงของคน"
- **ตารางกลุ่มข้อ 4 ไม่บังคับ reason ตอน `create`** — ฟอร์มสร้าง user/ทีม/บริษัทตามไฟล์ 08/09/10 ไม่มีช่องเหตุผล · แต่ถ้าไม่ส่ง before/after มาเลยตอน `update` จะถือว่า "อาจแตะฟิลด์อ่อนไหว" แล้วบังคับ reason ไว้ก่อน (fail-safe)
- **`REQUIRED_MISSING` ใช้ code เดิมจาก `24` §6.1** ไม่ตั้ง code ใหม่สำหรับ field ที่ขาดใน audit entry
- **ยามความครบถ้วนใน `reason-policy.test.ts`** — ไล่ `@@map` ทุก model ใน `schema.prisma` แล้วบังคับว่าต้องถูกจัดหมวด ⇒ ตารางใหม่ที่ยังไม่จัดหมวดจะทำให้เทสต์แดงแทนที่จะหลุดกติกาเงียบ ๆ

### verify ที่รันจริง (DoD ของ PLAN §1.4)
- `pnpm typecheck` เขียว · `pnpm test` **201 tests / 16 files** ผ่านหมด · `pnpm lint` เขียว
- **DoD ข้อ 1 (UPDATE/DELETE ถูก reject ที่ DB)**: `lib/audit/audit-immutable.db.test.ts` รันกับ Postgres จริง — UPDATE/DELETE ที่ไม่ match แถวไหนก็ถูกปฏิเสธ, TRUNCATE ถูกปฏิเสธ, trigger ครบ 3 ตัว, และ `prisma.auditLog.delete()/updateMany()` โดน guard ระดับ service
- **DoD ข้อ 2 (mutation ผ่าน helper แล้วมี record ครบ 9 fields)**: เทสต์ INSERT ผ่าน `$transaction` แล้ว rollback — ตรวจครบทั้ง 9 fields รวม `created_at` จาก DB default · ฝั่ง service ตรวจ payload ที่ `emitAudit()` เขียนใน `audit.test.ts`
- เทสต์ pure: `diff.test.ts` (16) · `reason-policy.test.ts` (52 รวมยามความครบถ้วนของตาราง) · `validate.test.ts` · `immutable.test.ts` · `audit.test.ts`

### จุดที่คนถัดไปควรรู้
- **ทุก mutation หลังจากนี้เรียก `emitAudit()` เท่านั้น** — ห้ามเขียน `prisma.auditLog.create()` ตรง · อยู่ใน `$transaction` ให้ส่ง tx client เป็น argument ที่ 2
- **เพิ่มตารางใหม่ใน `02` = ต้องจัดหมวดใน `lib/audit/reason-policy.ts` ด้วย** ไม่งั้น `pnpm test` แดง
- **`audit_logs` ลบไม่ได้จริง ๆ แม้ในเทสต์** — เทสต์ที่ต้อง insert audit ให้ทำใน `$transaction` แล้ว throw เพื่อ rollback (ดูตัวอย่างในไฟล์เทสต์)
- **เทสต์ที่แตะ DB ต้องรัน `pnpm db:deploy:test` ก่อน** และต้องมี `TEST_DATABASE_URL` (ไม่มี = ข้ามเทสต์นั้นเงียบ ๆ พร้อม warning) · guard ในไฟล์เทสต์ปฏิเสธ host ที่ไม่ใช่ localhost และ DB ที่ชื่อไม่มีคำว่า `test`
- ยังไม่ได้ทำในก้อนนี้ (ตาม PLAN): endpoint `GET /api/audit-logs` (+ detail) ของ `90` §14 และ Notification service — จะเกิดใน Phase 5 (`90`/`91`)

---

## Phase 1.3 — Auth & Access Control + Permission Middleware

**วันที่**: 2026-08-14 · **commit**: `edfdd9b` · **branch**: `staging`

### สิ่งที่ทำ
- **ชั้นสิทธิ์ (pure — ไม่แตะ DB/HTTP ทดสอบได้ล้วน)**: `lib/auth/permission.ts` (`hasCapability` / `canAccess` / `checkPermission` / `isSessionExpired`) · `lib/auth/scope.ts` (`resolveScope` / `isWithinScope`) · `lib/auth/superadmin-guard.ts` · `lib/auth/landing.ts` · `lib/auth/errors.ts`
- **จุดบังคับสิทธิ์เดียวของระบบ**: `lib/auth/require-permission.ts` — `requirePermission(action, resource, scope)` + `withPermission()` (ห่อ route handler) + `withAuthErrors()` · ลำดับปฏิเสธ: บัญชีไม่ active → session หมดอายุ → capability → scope ย่อย
- **Session**: `lib/auth/session.ts` — Supabase JWT = ตัวตน / role+scope จาก Prisma = สิทธิ์ (แยกกันตาม DEC-002 ไม่ใช้ RLS) · `lib/auth/session-cache.ts` cache role+scope TTL 5 นาทีต่อ instance + `invalidateSessionCache()`
- **Audit**: `lib/audit/audit.ts` — `emitAudit()` ครบ 9 fields + ip/user-agent · ใช้จริงที่ login สำเร็จ/ล้มเหลว/logout (ทั้ง 3 ทางตาม `05` §13–14)
- **API**: `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/session` (ตาม `05` §14)
- **Proxy**: `proxy.ts` refresh session cookie ของ Supabase + route guard หน้าเว็บ (redirect `/login?next=`) — `/api/*` ไม่ redirect เพราะต้องตอบ 401/403 เป็น JSON
- **FE**: `app/login/page.tsx` + `components/auth/login-form.tsx` (โครง/คลาสตาม mockup `login.html` รวม shake/fade-in/focus-ring ที่ย้ายมาไว้ใน `app/globals.css`) · `components/auth/permission-provider.tsx` (`<PermissionProvider>` / `usePermission()` / `<Can>`) · `components/auth/logout-button.tsx` · `app/dashboard/page.tsx` = placeholder ที่ guard จริงด้วย `requireSessionPage()`
- **เครื่องมือ**: `scripts/link-superadmin.ts` + `pnpm auth:link-superadmin` — ผูก seed user เข้ากับ Supabase Auth (idempotent)
- **spec**: `24` v3.2 เพิ่ม **§6.9 หมวด Auth & Access Control** (รวบ `PERMISSION_DENIED`/`LAST_SUPERADMIN_REMOVAL` เดิม + เพิ่ม `UNAUTHENTICATED`/`SESSION_EXPIRED`/`INVALID_CREDENTIALS`/`ACCOUNT_INACTIVE`/`USER_NOT_PROVISIONED`) · `REUSE_INDEX` เพิ่ม 15 รายการ + 2 กับดัก

### การตัดสินใจระหว่างทาง
- **Scope 4 แบบ map จาก role_group** (`05` §5 + `07` §6): `system` → `global` (ข้อจำกัดเชิงหน้าที่มาจาก capability ไม่ใช่ scope) · ผู้จัดการ/หัวหน้าทีม → `team` (union ของ `team_managers` + `teams.supervisor_id` + `users.team_id`) · พนักงานติดตามทรัพย์ → `self` · `finance_company` → `company`
- **Session timeout 24 ชม. วัดจาก `users.last_login_at`** ไม่ใช่ cookie แยก — ไม่ต้องเพิ่ม state ใหม่ ตรวจซ้ำได้ทุก request และ audit ย้อนกลับได้ (`05` §10/§17)
- **failed login ใช้ `action = login` + `after.result = 'failed'`** เพราะ enum `audit_action` ใน `02` §3 ไม่มี `login_failed` — ห้ามสร้าง enum ใหม่เอง (event ชื่อ `auth.login.failed` ตาม `05` §14 เก็บใน `after.code`)
- **failed login ของอีเมลที่ไม่มีในระบบ**: หา `organization_id` จาก user ที่อีเมลตรงก่อน ถ้าไม่มีใช้ organization เดียวของระบบ (`02` §12) — เพื่อให้ audit ลงได้ทุกครั้งตาม `05` §13 โดยไม่ leak ว่ามีอีเมลนี้จริงหรือไม่ (ข้อความตอบกลับเป็น `INVALID_CREDENTIALS` เสมอ)
- **`toAuthErrorResponse()` โยน error ที่ไม่ใช่ `AuthError` ต่อ** — ไม่กลืน DB error เป็น 401/403 ปลอม (มี test คุม)
- **แยก `superadmin-guard.ts` (pure) ออกจาก `superadmin-queries.ts` (Prisma)** เพราะ `lib/prisma.ts` สร้าง client ตอน import ⇒ ไฟล์ที่ import มันจะเทสต์ใน vitest ไม่ได้ถ้าไม่มี `DATABASE_URL`
- **`lib/supabase/server.ts` เรียก `await cookies()` ก่อน `getPublicEnv()`** — runtime API ต้องมาก่อน ไม่งั้น `next build` พยายาม prerender `/dashboard` แล้วตายที่ env (พังจริงตอน build ครั้งแรก)

### verify ที่รันจริง (DoD ของ PLAN §1.3)
- `pnpm typecheck` เขียว · `pnpm vitest run` **85 tests / 10 files** ผ่านหมด · `pnpm lint` เขียว · `pnpm build` (Next 16 + Turbopack) ผ่าน — route ทั้ง 5 เส้นเป็น dynamic ตามที่ควร
- **test ครอบ scope ทั้ง 4 แบบ** (`scope.test.ts`): global เห็นทุกแถว · team เฉพาะทีมที่ดูแล/แถวตัวเอง · company ข้ามบริษัทถูกปฏิเสธ · self เฉพาะของตัวเอง
- **test สิทธิ์ 3 ระดับ DEC-009** (`permission.test.ts`): ไม่มี record = มองไม่เห็น · `view` ดูได้แต่สั่งการไม่ได้ · `manage` ผ่านทั้งคู่ · Superadmin ผ่านทุก capability โดยไม่มี record
- **test endpoint ไม่มีสิทธิ์ตอบ 403 แม้เรียกตรง** (`require-permission.test.ts`): การเงิน/Field Agent เรียก endpoint ของ `manage_roles` → 403 + ไม่มี `data` ใน body · ไม่ได้ login → 401 · บัญชีถูกระงับ → 403 `ACCOUNT_INACTIVE`
- test session timeout ที่ขอบ 24 ชม. พอดี/เกิน · test cache หมด TTL แล้วโหลดใหม่ · test `LAST_SUPERADMIN_REMOVAL` ทั้งทางปิดใช้งานและย้าย role

### จุดที่คนถัดไปควรรู้
- **ทุก endpoint ที่เขียนต่อจากนี้ต้องขึ้นต้นด้วย `requirePermission()`** — ไม่มีข้อยกเว้น (DEC-002) · scope ย่อยส่งผ่านพารามิเตอร์ที่ 3 (`{ teamId }` / `{ companyId }` / `{ userId }`)
- **ต้องรัน `pnpm auth:link-superadmin <email> <password>` 1 ครั้งต่อ environment** (local/staging/production) ไม่งั้น seed user จะ login ไม่ได้ (`supabase_uid` เป็น NULL → ตอบ `USER_NOT_PROVISIONED`) — ยังไม่ได้รันบน staging ในเซสชันนี้ (ต้องใช้ service role key + ตั้งรหัสผ่านโดยคน)
- **ยังไม่ผูก role ↔ capability** (`role_capabilities` ว่างตามงาน 1.2) ⇒ ตอนนี้มีแต่ Superadmin ที่ทำอะไรได้จริง — role อื่นจะได้สิทธิ์เมื่อ **Phase 1.6** seed matrix เต็ม
- **เปลี่ยน role / สถานะ / ทีม / บริษัทของผู้ใช้ ต้องเรียก `invalidateSessionCache(supabaseUid)`** ไม่งั้นสิทธิ์เก่าค้างได้สูงสุด 5 นาที (Users module 1.9 / Roles module 1.6 ต้องไม่ลืม)
- ปลายทาง redirect `/portal` (บริษัทไฟแนนซ์) และ `/field` (พนักงานติดตามทรัพย์) **ยังไม่มีหน้าจริง** — เกิดใน Phase 6.x / 2.10 · ตอนนี้มีแต่ `/dashboard` (placeholder ที่ Phase 1.5 จะแทนที่ด้วย App Shell)
- Phase 1.4 ให้ **ต่อยอด `lib/audit/audit.ts`** ไม่ใช่สร้างไฟล์ใหม่ (validator `reason` + diff util + trigger กัน UPDATE/DELETE ระดับ DB)

---

## Phase 1.2 — Prisma Schema ชุดที่ 2: Group C–G + Seed Data

**วันที่**: 2026-08-14 · **commit**: `1eba90e` · **branch**: `staging`

### สิ่งที่ทำ
- `prisma/schema.prisma` — **+34 ตาราง** (Group C Case 7 · D Warehouse 2 · E Finance 8 · F Accounting 11 · G Platform 4 · +2 ตารางตามมติ PO) รวมทั้งระบบเป็น **53 ตาราง / 55 enums** · เติม back-relation ของ `created_by`/`updated_by` ครบทุกตารางใน Group A/B
- Migration `20260813231247_group_c_g_tables` — DDL + **raw SQL ที่ Prisma ไม่รองรับ**: generated column `advances.return_satang` · partial unique `uniq_active_advance_per_payee` + `uniq_assets_active_imei` · CHECK `assets_identifier_required` / `pbi_one_source` / `adjustments_one_target` / `bank_tx_one_match` / `bank_tx_status_fk_shape` / `bank_tx_alloc_shape` / `bank_tx_alloc_amount_positive` · DO block เติม `updated_at DEFAULT NOW()` ให้ตารางใหม่
- `prisma/seed.ts` — **idempotent (upsert ทุกจุด)**: organization 1 · **roles 15** (`is_seed=true`, ธุรการ = editable) · seed user Superadmin (`supabase_uid` ยัง NULL รอ 1.3) · VAT 7% (effective 2025-10-01) · tax profiles 2 · finance_policy_settings 1 · **capabilities 47** = 37 ใน Functional Matrix (`13` §6.10 + `25`: ops 6 / finance 12 / accounting 11 / admin 8) + 10 รายการนอก matrix ที่ `02` §12 ระบุ (warehouse/user/team/settings — `functional_group = NULL`)
- `prisma/schema.test.ts` — ขยายยาม: Decimal ใช้ได้เฉพาะ pct `(5,2)` และพิกัด GPS `(10,7)` · ทุก model ต้องมี `organizationId` (ยกเว้น 5 ตารางที่ `02` §2.4 ยกเว้น) · **CHECK/partial index/generated column ต้องยังอยู่ในโฟลเดอร์ migrations** (กัน `migrate dev` เขียนทับจนหาย)
- อัปเดต spec ตามมติ PO 2026-08-12: `02` v3.8 (+changelog +migration order) · `02_OPEN_DECISIONS` A2/A4/A6/B3 → ✅ · `00_MAP` (บรรทัดของ `02` เลื่อน) · `README` 51→53 tables · `REUSE_INDEX`

### สิ่งที่เพิ่มจากมติ PO (นอกเหนือ spec เดิม)
| ข้อ | ที่ไหน | สิ่งที่เพิ่ม |
|---|---|---|
| A1 | `billing_batches`, `cash_receipts` + ตารางใหม่ `customer_wht_certificates` | `wht_withheld_by_customer_satang` + ที่เก็บใบ 50 ทวิ **ฝั่งรับ** (ไฟแนนซ์ออกให้เรา = เครดิตภาษี) |
| A2 | ตารางใหม่ `bank_transaction_allocations` + `bank_transactions.is_split_allocation` | เงินเข้าก้อนเดียวตัดได้หลายรอบบิล/บางส่วน · ส่วนเกิน = แถว `is_credit` (ไม่ให้ AR ติดลบ) · CHECK `bank_tx_status_fk_shape` ขยายรองรับโหมดแบ่งยอด |
| A4 | `payout_batch_items`, `advances`, `bank_transactions` | `expense_id` เป็น nullable + `advance_id` + CHECK `pbi_one_source` · `advances.payout_batch_item_id` · `matched_advance_id` |
| A6 | `cases`, `assets` | `serial_no` / `serial_contract` / `serial_actual` · `imei_contract` nullable · partial unique แทน UNIQUE เต็มตาราง + CHECK ต้องมี identifier |
| B3 | `revenues`, `payout_batch_items` | `tracking_round` (default 1) |

### การตัดสินใจระหว่างทาง
- **ชื่อคอลัมน์ A4 ใช้ `expense_id`/`advance_id` ไม่ใช่ `source_*`** ตามข้อเสนอเดิม — `02` เป็น SSOT ของชื่อคอลัมน์และคอลัมน์เดิมชื่อ `expense_id` อยู่แล้ว (บันทึกไว้ใน changelog `02` v3.8)
- **A2 ต้องมี `is_split_allocation`** เพราะ CHECK `bank_tx_status_fk_shape` เดิมบังคับว่า matched ⇒ ต้องมี FK — ถ้าจับคู่ผ่านตารางกลางอย่างเดียว CHECK จะปฏิเสธทันที (CHECK มองข้ามตารางไม่ได้)
- **capabilities = 47 ไม่ใช่ 37**: 37 คือจำนวนแถวใน Functional Matrix (`13` §6.10) ส่วน `02` §12 ระบุ capability ฝั่ง warehouse/user/team/settings เพิ่ม — เก็บทั้งคู่โดยใช้ `functional_group = NULL` แยกกลุ่ม (คอลัมน์นี้ nullable มาตั้งแต่ v3.5)
- **ไม่ seed `role_capabilities`** — `02` §12 ไม่ได้กำหนด และการผูก role ↔ capability เต็ม matrix เป็นงาน Phase 1.6 (Superadmin ไม่มี record โดยนิยาม — DEC-009)
- `expenses.payout_batch_item_id` / `advances.payout_batch_item_id` ประกาศเป็น**คอลัมน์ UUID เปล่า ไม่ใช่ relation** ตาม DDL ของ `02` (เลี่ยง 1:1 วนกลับกับ `payout_batch_items.expense_id`)
- model `StoredFile` ↔ ตาราง `files` — เลี่ยงชื่อชนกับ `File` ของ Web API ในโค้ดอัปโหลด

### verify ที่รันจริง (DoD ของ PLAN §1.2)
- `prisma validate` เขียว · `migrate dev` ผ่าน · `migrate status` = up to date (3 migrations) · `pnpm db:seed` **รัน 2 รอบได้ผลเท่ากัน** (idempotent จริง)
- **ตรวจไขว้อัตโนมัติกับ spec**: สคริปต์เทียบ `CREATE TABLE` ใน `02` §6–§10 กับ `information_schema` → 34/34 ตาราง **ทุกคอลัมน์ตรง ไม่ขาดไม่เกิน**
- query DB จริง: 53 ตาราง · roles 15 (system 6 / inhouse 3 / outsource 3 / finance_company 3) · capabilities 47 (matrix 37 = ops 6 / finance 12 / accounting 11 / admin 8) · VAT 7% · tax profiles 2 · policy 1
- ทดสอบ constraint ด้วยข้อมูลจริง: INSERT `adjustments` ที่ไม่มี target → ถูกปฏิเสธด้วย `adjustments_one_target` · generated column `return_satang` มีจริงใน `information_schema` (`GREATEST(0, COALESCE(approved_satang,0) - used_satang)`)
- `pnpm typecheck` / `pnpm test` (35 เคส) / `pnpm lint` เขียวครบ

### จุดที่คนถัดไปควรรู้
- **`advances.return_satang` เขียนค่าไม่ได้** — Prisma ไม่รู้ว่าเป็น generated column จึงยอมให้ใส่ใน `create`/`update` แล้วไปตายที่ DB · เซ็ตแค่ `requestedSatang`/`approvedSatang`/`usedSatang`
- Immutable Rules (`02` §13) เขียนเป็นคอมเมนต์ `⚠️ Immutable` ไว้ที่ model ที่เกี่ยวแล้ว (`case_evidences`, `handover_lots`, `payout_batches`, `tax_invoices`, `wht_certificates`, `export_records`, `bank_transactions`, `audit_logs`, `accounting_periods`) — **การบังคับจริงเป็นงานของ task โมดูลนั้น ๆ**
- ⚠️ **spec ไม่ตรงกันเรื่องจำนวน "✅ only"**: `25` §16.1 เขียน 7 รายการ แต่ mockup `settings.html` ติดธง `superadminOnly` แค่ 6 (ad1/ad2/ad4/ad5/ad6/ad7) — ไม่บล็อก 1.2 (seed ไม่ได้เก็บ flag นี้) แต่ **ต้องเคาะตอน 1.6** ตอน implement การล็อกสิทธิ์จริง
- seed user `superadmin@assetrecovery.local` (`00000000-...-0002`) ยังไม่มี `supabase_uid` — งาน 1.3 ต้องผูกกับ Supabase Auth ก่อน login ได้จริง

---

## Phase 1.1 — Prisma Schema ชุดที่ 1: Enums + Group A + Group B

**วันที่**: 2026-08-14 · **commit**: `35dfb6e` · **branch**: `staging`

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
