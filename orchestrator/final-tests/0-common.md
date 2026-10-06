# กติกากลางของ Final Test รอบสุดท้าย (มติ U119 · ใช้กับทุกด่าน 1–7)

## สภาพระบบที่ทดสอบ (06–07/10/2569)
- build ครบทุก Phase (รวม 6.6 แดชบอร์ด + Phase 7 Client Portal) · มติผู้ใช้ **U1–U122** + มติ orchestrator O1–O70 + มติเชิงบัญชี A1–A9 ใน `uat/PO-DECISIONS-2569-10-04.md` (และ `-10-03.md`) = **ส่วนหนึ่งของ spec** — พฤติกรรมที่มติเปลี่ยนแล้วถือมติเป็นหลัก (spec ใน `docs/` ถูกแก้ตามพร้อม changelog แล้ว)
- Export Pack = **17 ไฟล์ `00`–`16`** (`docs/37` §ตารางไฟล์) · "✅ only" = **9 รายการ** (Superadmin 6 + บริหาร 3 — `lib/roles/capability-locks.ts`) · Client Portal `/portal` + `/api/portal/*` มีจริง · แดชบอร์ด `/dashboard` + `GET /api/dashboard`
- ข้อมูลทดสอบมาตรฐาน: สคริปต์ seed scenario (`scripts/seed-final/` — ตารางความครอบคลุม + golden อยู่ที่ `uat/report/FINAL-coverage.md`) — ใช้ golden นี้เป็นค่าคาดหวังของตัวเลขเงิน **ห้ามคำนวณคาดหวังใหม่เองจากโค้ด** (ต้องมาจากสูตร `docs/22`)

## การเตรียม (ด่าน 1–6 = agent ใน worktree)
1. `git merge staging` · `cp /Users/beer/AssetRecovery/.env.local .env.local` (ห้ามพิมพ์/commit) · `pnpm install --frozen-lockfile && pnpm db:generate`
2. ฐานทดสอบของด่าน N = `assetrecovery_test{N+1}` (ด่าน 1 → test2 … ด่าน 6 → test7) · export `TEST_DATABASE_URL` ชี้ฐานนั้น → `PRISMA_USE_TEST_DB=1 pnpm db:deploy:test` · **ห้ามแตะ `assetrecovery_dev` / `assetrecovery_test`**
3. ทดสอบด้วย **integration test จริง** (`*.db.test.ts`) ไม่ใช่อ่านโค้ดอย่างเดียว · test ใหม่ที่พิสูจน์บั๊กต้องอยู่ใน repo
4. ห้าม `git push` · ห้ามแตะ Supabase dashboard/Vercel · ห้ามอัปโหลดไฟล์ขึ้น Storage จริงใน test (mock) · ห้ามพิมพ์รหัสผ่าน `uat/personas.json`

## การแก้
- บั๊กชัด (ขัด spec/มติ) → แก้ + test พิสูจน์ในด่านเดียวกัน
- ต้องตัดสินใจ (spec ขัดกัน/ไม่มีมติ/กระทบภาษีจริง) → **ห้ามแก้เงียบ** บันทึกเป็น `[[NEEDS_DECISION]]` ในรายงาน
- ฟีเจอร์ใหญ่ที่ขาด → ห้ามสร้างในด่าน · บันทึกเป็นงานใหม่ในรายงาน

## Verify + รายงาน
- `pnpm typecheck && pnpm lint && pnpm test` เขียว (TEST_DATABASE_URL = ฐานของด่าน) → commit `test(final): ด่าน N …` / `fix(...)` ลงท้าย `Co-Authored-By`
- รายงาน `uat/report/FINAL-<N>-<ชื่อด่าน>.md`: ตาราง `| หัวข้อ | สถานะ ✅/❌/⚠️/⏸️ | หลักฐาน (ไฟล์:บรรทัด / test) | การแก้ |` + รายการ NEEDS_DECISION + จำนวน tests ก่อน/หลัง
