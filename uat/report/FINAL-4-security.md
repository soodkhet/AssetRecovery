# FINAL ด่าน 4/7 — สิทธิ์ + Audit + Multi-tenant leak + Portal

> วันที่: 06/10/2569 · ฐานทดสอบ `assetrecovery_test5` (ยืนยันด้วย `prisma migrate status` — 73 migrations up to date)
> วิธี: integration test จริง `lib/security/final-security.db.test.ts` (route handler จริง + Prisma จริง + `loadSessionUser()` จริงจาก DB — mock เฉพาะ Supabase Auth ให้คืน uid ของ persona) + ตรวจโค้ดแบบ static ทุก route (243 ไฟล์) + เทสต์เดิมของโมดูล
> Persona ในเทสต์: Superadmin A/B (2 องค์กร) · การเงิน · บริหาร · ผู้จัดการทีม (ดูแลทีม 1 เท่านั้น) · พนักงานทีม 1/ทีม 2 · ผู้ใช้บริษัท (ผู้จัดการ บริษัท 1) — role/capability ตาม `DEFAULT_ROLE_CAPABILITIES` (matrix `25`)

## ผลรายหัวข้อ

| หัวข้อ | สถานะ | หลักฐาน (ไฟล์:บรรทัด / test) | การแก้ |
|---|---|---|---|
| 1. ทุก route ผ่าน `requirePermission` | ✅ | static test "ทุก route ที่ไม่ใช่ข้อยกเว้นมียามสิทธิ์" (243 route) · wrapper `withEndpoint`/`withApiPermission` (`lib/api/http.ts:29,136`) · `withPortal` (`lib/portal/guard.ts`) · ข้อยกเว้น: `auth/*`, `cron/jobs` (secret) · notifications กรอง user+org (`lib/notifications/queries.ts:159-170,200-202`) | — |
| 1b. mutation ต้องใช้ระดับ `manage` | ❌→✅ | ใบรับรองแทนใบเสร็จ: cancel/signed/reissue ผ่านด้วย `view` แล้วยามระดับแถวใช้ธง "เห็นทั้งองค์กร" (`hasCapability(view)`) ⇒ role ที่ถือ `approve_expense_finance`/`approve_advance` ระดับ **view** ยกเลิก/ออกใหม่/อัปโหลดฉบับเซ็นแทนได้ (ขัด DEC-009) | เพิ่มธง `canManageAllAdvances/Expenses` (ระดับ manage) ใช้กับ `canCancel…`/`canUploadSigned…` (`lib/substitute-receipts/substitute-receipt.ts`, `queries.ts:295`) · test `Final ด่าน 4: ถือสิทธิ์ระดับ view…` |
| 2. Matrix `25` ≥1 endpoint/หมวด | ✅ | การเงิน → E1 403 ทั้ง `/api/reports/kpi-summary` และ `/api/reports/executive/kpi-summary` · บริษัท → `GET /api/dashboard` 403 · บริษัท → cases/users/finance-companies 403 · พนักงาน → payout/periods/tax-profiles/audit-logs/users 403 · การเงิน → แก้ matrix 403 · ไม่มี session 401 | — |
| 3. Scope ย่อย + ไม่ leak | ✅ (⚠️ users/teams) | ผู้จัดการ: เคสทีมอื่น = response เดียวกับ id ที่ไม่มี + list เฉพาะทีม 1 · พนักงาน: เคสทีมอื่น = เหมือนไม่มี + `accept` แทนคนอื่นไม่ได้ (assignment ไม่เปลี่ยน) · บริษัท: เคสบริษัทอื่น = เหมือนไม่มี + `?companyId=/company_id=/company=` ถูกเมิน · ⚠️ `/api/users/:id`, `/api/teams/:id` นอก scope = 403 แต่ไม่มีจริง = 404 (`lib/users/queries.ts:196-206`, `lib/teams/queries.ts:109-148` — คอมเมนต์ระบุว่าจงใจ) | NEEDS_DECISION #1 |
| 4. "✅ only" 9 รายการ | ✅ | `it.each` 9 รายการ: มอบให้ role การเงินไม่ได้ (4xx + ไม่มีแถวใน DB) · บริหาร 3 รายการ ลดเป็น view/none ไม่ได้ (แถวยัง manage) · ไม่มี reason = 400 · ทางเขียน `role_capabilities` มีทางเดียว (`lib/roles/queries.ts:112`) ผ่าน `planPermissionChanges` → `assertCapabilityAssignable` (`lib/roles/guards.ts:67`) ทั้ง roles API และ functional-permissions | — |
| 4b. ค่าตั้งภาษี 3 ตัว (U8) · U121 | ⚠️ | reason บังคับครบ (`lib/settings/schemas.ts:293,298,333`) · แต่ `manage_wht_policy` ไม่อยู่ใน 9 ตัวล็อก (Superadmin มอบให้การเงินได้) · tax-profile-defaults ใช้ `manage_tax_profiles` (ล็อก Superadmin) ⇒ บริหารแก้ไม่ได้ ทั้งที่ U8 ว่า "Superadmin/บริหาร" | NEEDS_DECISION #2 |
| 4c. U106 คนแก้ผู้รับ = คนยืนยันได้ | ✅ | `lib/payees/queries.ts:479-512` (บันทึก verifiedBy + audit) · แก้บัญชี/ภาษีแล้ว reset การยืนยัน (`:436-444`) | — |
| 5a. Audit 9 fields + reason | ✅ | `emitAudit` → `validateAuditEntry` + `lib/audit/reason-policy.ts` · reason บังคับใน schema ของ settings ภาษี/ธนาคาร/เลขเอกสาร/VAT/สิทธิ์/ลายเซ็น+โลโก้ (U122 `lib/organization/schemas.ts:78-90`) | — |
| 5b. UPDATE/DELETE audit_logs ถูกปฏิเสธที่ DB (ยิงจริง) | ✅ | test "UPDATE / DELETE audit_logs ถูก DB ปฏิเสธ" · trigger migration `20260814091702` · immutable อื่นตาม `02` §13 มี trigger ครบ 6 (handover_lots `20260814183000`, tax_invoices `20261006160000`, wht `20261006141000`, export_records/case_evidences/roles `20260815230000`) + `prisma/immutable-rules.db.test.ts` | — |
| 5c. login/logout/failed login | ✅ (⚠️) | `lib/auth/auth-service.ts:84-132,221` (รวม USER_NOT_PROVISIONED/ACCOUNT_INACTIVE) · ⚠️ failed login ที่ไม่รู้ตัวตนลงองค์กรแรกของระบบ (`:52-55`) — ถูกตามสมมติฐาน "องค์กรเดียว" ของ `02` §12 | บันทึกไว้ (ยังไม่ multi-org) |
| 5d. เปิดไฟล์ผ่าน signed URL (U90) | ✅ (⚠️) | `app/api/storage/download-url/route.ts:30-37` audit เอกสารเคส 4 ชนิด + ใบ 50 ทวิลูกค้า · ⚠️ ฉบับเซ็นใบรับรองแทนใบเสร็จ (`substitute-receipts/<id>/signed`) ไม่อยู่ในรายการ audit | NEEDS_DECISION #3 |
| 5e. access_denied ใน portal ลง audit | ✅ | test "การถูกปฏิเสธที่ portal ลง audit access_denied" | — |
| 6. Multi-tenant | ✅ | test Superadmin องค์กร B: detail เคสองค์กร A = 404 เหมือนไม่มี · list เคส/บริษัทไม่เห็นของ A · static: report cache key ขึ้นต้น org (`lib/reports/run.ts:40`) · outbox drain ใช้ org ของแต่ละแถว (`lib/notifications/outbox.ts:116-149`) · ไม่มี `$queryRawUnsafe` ในโค้ดแอป | — |
| 7. Client Portal | ✅ | static test `/api/portal/*` export เฉพาะ GET (16 handler) · company_id จาก session (`lib/portal/guard.ts:189`) · view-as `?as=` จำกัดผู้ใช้ภายในที่ถือ `view_client_portal_as` + บริษัทในองค์กรเดียวกัน (`guard.ts:193-221`) · U12 matrix `default-matrix.ts:241-260` · U13 ไฟล์ล็อตต้อง confirmed / billing ต้องสถานะที่เปิดเผย · U14 แสดงยอดตามเอกสาร (ใบกำกับ − ลดหนี้ + เพิ่มหนี้) ไม่สะท้อน Adjustment ภายใน (`lib/portal/documented-amounts.ts`) · U61 audit download + denied + เปิด view-as | — |
| 8. Storage (DEC-014) | ✅ (⚠️) | magic bytes + ขนาด (`lib/uploads/inspect.ts:74,148-156`) · path ห้าม `..`/`//`/`\` + ผูก prefix เป้าหมาย (`targets.ts:162-171`) · logo/ลายเซ็นตรง org (`access.ts:198,204`) · signed download 300 วิ (`storage.ts:15`) · ไม่มี policy SQL ให้ผู้ใช้ · ⚠️ bucket ไม่ตั้ง `fileSizeLimit/allowedMimeTypes` ⇒ ไฟล์เกิน/ผิดชนิดถูกปฏิเสธตอนผูก แต่ค้างใน Storage (`scripts/setup-storage.ts:100`) · ⚠️ staging ยังรอ user apply policy drop (BUG-143) | งานใหม่ #A |
| 9. Session/Auth | ✅ | 24 ชม. `SESSION_MAX_AGE_MS` (`lib/auth/constants.ts:7`) fail-closed · `SUPABASE_SERVICE_ROLE_KEY` อ่านใน server เท่านั้น ค่าไม่หลุด bundle (Next inline เฉพาะ `NEXT_PUBLIC_*`) แต่ `lib/env.ts` ถูก import เข้า client chain — ไม่มี `import 'server-only'` · dev route `/api/dev/*` = 404 ใน production ก่อนชั้นสิทธิ์ (test ยิงจริงด้วย `NODE_ENV=production`) · dev admin alias ต้อง development + env + localhost (`lib/auth/dev-login-alias.ts:27-30`) · asOf/devTrigger ถูกตัดใน production (`lib/jobs/registry.ts:94,107`) | งานใหม่ #B |

## บั๊กที่แก้ในด่านนี้
1. **ใบรับรองแทนใบเสร็จ — สิทธิ์ระดับ view ทำ mutation ได้** (cancel / ออกใหม่ / อัปโหลดฉบับเซ็นแทนเจ้าของ) → ยามระดับแถวใช้ธงระดับ `manage` แยกจากธง "เห็น" · ค่าเริ่มต้นของ matrix ไม่กระทบ (การเงิน/บริหารถือ manage อยู่แล้ว) · test: `lib/substitute-receipts/substitute-receipt.test.ts`

## [[NEEDS_DECISION]]
1. `/api/users/:id` และ `/api/teams/:id`: id ในองค์กรแต่นอก scope ตอบ **403** ส่วน id ที่ไม่มีจริงตอบ **404** (โค้ดจงใจ — "ผู้ใช้รู้อยู่แล้วว่ามีทีมอื่น") ขัดกับข้อกำหนดด่าน "ไม่ leak ว่ามี record" · [[OPTIONS]] ก (แนะนำ) ตอบ 404 `USER_NOT_FOUND`/`TEAM_NOT_FOUND` ทั้งสองกรณี (เหมือน cases/assets) | ข คงเดิม (ข้อมูลไม่อ่อนไหว: รู้แค่ว่า UUID มีจริง)
2. ค่าตั้งภาษี (U8/U121): `manage_wht_policy` ไม่ถูกล็อก และ tax-profile-defaults ใช้ `manage_tax_profiles` (ล็อก Superadmin) ⇒ บริหารแก้ไม่ได้ · [[OPTIONS]] ก (แนะนำ) ยืนยันว่า U8 = ค่าเริ่มต้นของ matrix (ไม่ล็อก) และ U121 เป็นของ Superadmin เท่านั้น | ข เพิ่มรายการล็อก (กระทบ "9 รายการ" ที่ล็อกไว้)
3. ฉบับเซ็นใบรับรองแทนใบเสร็จมีข้อมูลบุคคลของผู้รับเงิน — เพิ่มเข้า audit การเปิดไฟล์ (U90) หรือไม่ · [[OPTIONS]] ก (แนะนำ) เพิ่ม | ข คงเดิมตาม U90
4. (info) Manager ที่มี `users.team_id` นอก `team_managers` จะเห็นทีมนั้นด้วย (`lib/auth/scope.ts:45-48`) · พนักงานยังเห็นเคสที่ถูก reassign ออกไปแล้ว (`lib/cases/queries.ts:100`) · View-as ผ่าน API ตรงไม่ลง audit เปิดโหมด (ลงจากหน้าเพจเท่านั้น) — ยืนยันว่าตั้งใจ

## งานใหม่ (ไม่ทำในด่าน)
- **A** ตั้ง `fileSizeLimit` + `allowedMimeTypes` ของ bucket ใน `scripts/setup-storage.ts` (กันไฟล์ค้าง)
- **B** แยก server env + `import 'server-only'` ใน `lib/env.ts`/`lib/supabase/server.ts`/`lib/uploads/storage.ts`
- **C** (defence-in-depth) payout batch / payees / advances / ตัวนับแดชบอร์ดบางคิว ไม่มี row scope — พึ่ง capability อย่างเดียว ถ้า Superadmin มอบสิทธิ์ให้ role ระดับทีมจะเห็นทั้งองค์กร → เพิ่ม `assertOrgWideReadable` · E-reports ผูก `approve_expense_executive` (ไม่ล็อก)
- **D** functional-permissions PATCH เขียนทีละ role คนละ transaction (`lib/settings/queries/functional-permissions.ts:141`) — ตรวจกติกาครบก่อนแล้ว เหลือความเสี่ยงเฉพาะ DB ล่มกลางทาง → รวมเป็น transaction เดียว
- **E** (info) cron secret เทียบด้วย `===` (`app/api/cron/jobs/route.ts:56`) → `timingSafeEqual` · push subscription upsert ด้วย endpoint อย่างเดียว (`lib/notifications/queries.ts:39-60`)

## จำนวน tests
- ก่อน: 366 files / 5107 tests (ผ่านทั้งหมด, TEST_DATABASE_URL = test5)
- หลัง: 367 files / 5137 tests ผ่านทั้งหมด (+1 ไฟล์ `lib/security/final-security.db.test.ts` 29 tests · +1 test ใบรับรองแทนใบเสร็จ) · `pnpm typecheck` + `pnpm lint` ผ่าน
