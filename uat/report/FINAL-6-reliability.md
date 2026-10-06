# Final Test ด่าน 6/7 — ความทนทาน (idempotency / concurrency / jobs / outbox)

- วันที่: 06/10/2569 · ฐานทดสอบ `assetrecovery_test7` (migrate status = up to date) · branch worktree `worktree-agent-a0af4a3e2e7451ad2` (merge `staging` @ `aeb12ba`)
- วิธี: integration test จริง (`*.db.test.ts` ยิง Postgres) + ยิงพร้อมกันจริงด้วย `Promise.all/allSettled` · ทุก test ใหม่ที่พิสูจน์บั๊กถูกรันกับโค้ดก่อนแก้แล้วล้มจริง
- Tests: ก่อน **5,107** (366 ไฟล์) → หลัง **5,128** (366 ไฟล์) เขียวทั้งหมด · `pnpm typecheck` + `pnpm lint` ผ่าน

## สรุปผล

| หัวข้อ | สถานะ | หลักฐาน (ไฟล์:บรรทัด / test) | การแก้ |
|---|---|---|---|
| 1.1 Payout `idempotency_key` | ✅ | `lib/payout/payout-queries.db.test.ts:447` (สร้างไฟล์พร้อมกัน 2 คำขอ ⇒ key เดียว) · :476/:488 · `payout-cancel.db.test.ts:377/:400` | — |
| 1.2 Job idempotent + `JOB_DUPLICATE` คืนงานเดิม | ✅ | `lib/jobs/engine.db.test.ts:158/:185/:199/:220/:235` | — |
| 1.3 Export versioned + SHA-256 ไม่ทับ | ✅ | `lib/exports/exports.db.test.ts:338/:456/:472/:596/:832` · storage `upsert:false` | — |
| 1.4 Evidence hash ฝั่ง server | ✅ | `lib/field/field-workflow.db.test.ts:357` · `field-expense.db.test.ts:1106` | — |
| 1.5 Event consumer กัน duplicate delivery | ✅ | ผู้บริโภคเดียว = แจ้งเตือน (UUIDv5 จาก dedupeKey) `lib/notifications/notify.db.test.ts:140/:149` | — |
| 1.6 Job รายวันน้ำมัน/เบี้ยเลี้ยง (DEC-012) รันซ้ำ | ✅ | `lib/warehouse/warehouse-workflow.db.test.ts` (rerun settled=0 · backdated race + job ไม่สร้างซ้ำ) · unique `uniq_field_day_settlements_org_agent_date` | — |
| 2.1 Outbox enqueue ใน tx เดียว / rollback ⇒ ไม่มีแถว | ✅ | `lib/notifications/outbox.db.test.ts:104/:117` | — |
| 2.2 Dispatch ล้ม ⇒ retry รอบถัดไปสำเร็จ | ✅ | `outbox.db.test.ts:175` · `lib/advances/advance-queries.db.test.ts` (overdue job flow) | — |
| 2.3 Drain พร้อมกันไม่แจ้งซ้ำ | ✅ | `outbox.db.test.ts:150` (5 ตัวพร้อมกัน) · :162 (ตายหลังเขียนก่อนมาร์ค) | — |
| 2.4 การรวมแจ้งเตือน (U49) | ✅ | `lib/notifications/approval-queue.db.test.ts:184` · `approval-notices.test.ts` | — |
| 3.1 เลขเอกสารทุกชนิด (ใบกำกับ/ใบเสร็จห้าม gap) | ✅ | `lib/document-numbering/document-numbering.db.test.ts:181` (9 ชนิด × 20 tx พร้อมกัน) · :193 rollback · `lib/sales/sales.db.test.ts:573/:581` | — |
| 3.2 Duplicate `case_ref` | ✅ (เพิ่ม test) | ใหม่: `lib/cases/case-workflow.db.test.ts` "Final Test ด่าน 6 — createCase เลขเดียวกันพร้อมกัน 3 คำขอ" (ชั้น service ⇒ `CASE_REF_DUPLICATE` ไม่ใช่ 500) · เดิม `case-duplicate.db.test.ts:110` (raw SQL) | — |
| 3.3 2 คน confirm lot เดียวกัน | ✅ (เพิ่ม test) | ใหม่: `warehouse-workflow.db.test.ts` "Final Test ด่าน 6 — 2 คนกดยืนยันล็อตเดียวกันพร้อมกัน" ⇒ สำเร็จ 1 · `LOT_ALREADY_CONFIRMED` · รายได้/audit ชุดเดียว | — |
| 3.4 Reassign timeout race | ✅ (เพิ่ม test) | ใหม่: `lib/assignments/assignment-workflow.db.test.ts` "job 2 instance + ผู้รับงานตอบ ยิงพร้อมกัน" ⇒ โอนครั้งเดียว · ตอบได้ `REASSIGNMENT_ALREADY_TIMED_OUT` | — |
| 3.5 Advance เบิกซ้อน | ✅ | `advance-queries.db.test.ts:248` (อนุมัติ 2 ใบพร้อมกัน ⇒ partial unique) | — |
| 3.5b อนุมัติ/ปฏิเสธใบเดียวกันพร้อมกัน | ❌→✅ **แก้แล้ว** | ใหม่: `advance-queries.db.test.ts` "Final Test ด่าน 6 — อนุมัติกับปฏิเสธใบเดียวกันพร้อมกัน" (โค้ดเดิมล้ม 3/3 รอบ: ทั้งคู่สำเร็จ last-write-wins + audit 2 แถว) | `lib/advances/queries.ts` `approveAdvance`/`rejectAdvance` → `updateMany` ผูกสถานะเดิม (compare-and-set) แพ้ ⇒ `ADVANCE_INVALID_STATUS` |
| 3.6 ออก 50 ทวิ ซ้ำ | ✅ | `lib/wht/wht.db.test.ts:583/:691` (unique `uniq_wht_cert_active_per_expense`) | — |
| 3.7 รอบวางบิลร่างซ้อน (U88) | ✅ | `lib/revenue/revenue-queries.db.test.ts:998` (ล็อกแถวบริษัท) | — |
| 3.8 ล็อกงวดพร้อมสร้างรอบจ่าย (U112) | ⚠️ | U112 ผูกรอบจ่ายด้วย `created_at` ⇒ รอบที่สร้างใหม่ (เวลาจริง > สิ้นงวด) ไม่ตกงวดที่กำลังส่ง/ล็อกโดยโครงสร้าง · ยามงวดของรอบจ่าย (`assertPeriodOpenAt` ตาม `cutoffDate`) อ่านนอก tx ไม่ล็อกแถวงวด ⇒ หน้าต่าง TOCTOU ระดับ ms (pattern เดียวกับทุกผู้เรียกยามงวด) | ไม่แก้ในด่าน — เสนองานใหม่ "ยามงวดใน tx + `FOR SHARE` แถวงวด" |
| 3.9 ส่ง/ล็อกงวดพร้อมกัน 2 คำขอ | ❌→✅ **แก้แล้ว** | ใหม่: `lib/accounting/accounting.db.test.ts` "Final Test ด่าน 6 — กดส่ง/ล็อกงวดพร้อมกัน" (โค้ดเดิม: ทั้งสองคำขอสำเร็จ · audit/แจ้งเตือนซ้ำ · เวลาส่ง/ล็อกถูกทับ) | `lib/accounting/queries.ts` `transitionPeriod` → `updateMany` ผูกสถานะเดิมใน UPDATE เดียว (trigger งวดปิดยอมเฉพาะ UPDATE ที่เปลี่ยนสถานะ) แพ้ ⇒ `PERIOD_INVALID_STATUS` |
| 4.1 Lot confirm + letterhead snapshot rollback | ✅ (เพิ่ม test) | เดิม T11 `warehouse-workflow.db.test.ts:890` (step 2) · ใหม่ "step 4 (สร้างรายได้) ล้ม ⇒ rollback รวม snapshot หัวกระดาษ/เทมเพลต · ไม่มี audit/รายได้ค้าง · ยืนยันใหม่ผ่าน" | — |
| 4.2 Payout rollback | ⚠️ | สร้างรอบ/ไฟล์โอน/ยกเลิกอยู่ใน `$transaction` เดียว (`lib/payout/queries.ts:868/:1492`) · แต่ `completePayoutBatch` commit `completed` แล้วจึง `syncExpenseRecordsFromPayout` → ออก 50 ทวิ **นอก tx** (`lib/payout/queries.ts:1369`) ถ้าขั้นนี้ล้ม รอบเป็น completed โดยไม่มีบันทึกจ่าย/50 ทวิ และไม่มีทางซ่อมอัตโนมัติ | NEEDS_DECISION #1 |
| 4.3 ออกเอกสารภาษี + snapshot | ✅ | เลขจาก series ใน tx เดียวกับแถว (`sales/queries.ts:659-760`) · ตัวนับ rollback `document-numbering.db.test.ts:193` · validation ก่อนกินเลข `sales.db.test.ts:559` | — |
| 5.1 Retry/backoff | ✅ | job 1/5/15/60 นาที เพดาน `max_retries` ⇒ dead_letter ตรง state diagram `91` (`failed→dead_letter: retry_count >= max_retries`) `engine.db.test.ts:254` · outbox 1,2,4…≤60 นาที 8 ครั้ง `outbox-core.test.ts` | — |
| 5.2 Job log ตามรอยผู้สั่ง (system + job id) | ⚠️ | audit ระดับ handler มี `[job:<id>]` (advance overdue / reassign / daily allowance / purge / fuel) · แต่ audit ระดับ engine ถูกข้ามเมื่อ `organization_id = null` (`lib/jobs/engine.ts:145/:362`) ⇒ cron ทุกตัวเหลือแค่แถว `jobs` + audit ของ handler | งานใหม่ (ไม่บล็อก) |
| 5.3 Dev trigger/asOf (U65) = 404 ใน production | ✅ | `app/api/job-routes.test.ts:199/:213` · `app/api/dev-period-close-routes.test.ts:79/:147` · ชั้นสองใน registry ไม่อ่าน `date/asOf` · Vercel staging/prod รัน `NODE_ENV=production` | — |
| 5.4 Cache รายงานหลาย instance (U9/U35) | ✅ | `lib/reports/cache-store.db.test.ts:100/:124/:142/:163` | — |
| 6.1 Job คร่อมปิดงวด — เบี้ยเลี้ยงรายวัน | ✅ | `daily-allowance-job.ts:339` → `period_locked` + แจ้งเตือน (U50) | — |
| 6.2 Job คร่อมปิดงวด — ค่าน้ำมัน `fuel_distance_retry` | ❌→✅ **แก้แล้ว** | ใหม่: `lib/field/field-expense.db.test.ts` "Final Test ด่าน 6 — job คร่อมปิดงวด" (โค้ดเดิมเขียนค่าน้ำมันย้อนเข้างวด `locked`) | `lib/field/fuel-distance-job.ts` เรียก `assertPeriodOpenAt` ก่อนเขียน ⇒ งาน `failed` (`PERIOD_LOCKED_DIRECT_EDIT`) ไม่ retry วน เห็นใน Job Log · ทางกู้ = NEEDS_DECISION #2 |
| 6.3 Job คร่อมปิดงวด — สรุป WHT | ✅ | `lib/wht/summary-job.ts:36/:71` ข้ามงวดที่แก้ไม่ได้ | — |
| 7.1 Import CSV เคส | ⚠️ | per-row error ตาม `24` + dryRun ไม่เขียน (`case-workflow.db.test.ts:710/:904`) · ช่องโหว่: error ที่ไม่ใช่ `ModuleError` กลางไฟล์ ⇒ แถวก่อนหน้า commit แล้ว + 500 (`lib/cases/import-queries.ts:95`) · เครื่องหมายคำพูดไม่ปิด ⇒ parser กลืนทั้งไฟล์เป็นช่องเดียวโดยไม่มี error | งานใหม่ |
| 7.2 Import statement ธนาคาร | ⚠️ | ไฟล์เสีย ⇒ `STATEMENT_FILE_INVALID` · แถวเสียข้าม+รายงาน · import ซ้ำพร้อมกันกันด้วย unique (`bank-recon.db.test.ts:382/:395/:411/:673`) · **คีย์กันซ้ำ = วัน+ยอด+รายละเอียด** (`lib/bank-recon/statement.ts:343`) ⇒ เงินเข้าจริง 2 รายการเหมือนกันในวันเดียว ถูกนับเป็นรายการเดียว | NEEDS_DECISION #3 |
| 8.1 โลโก้/ลายเซ็นโหลดไม่ได้ ⇒ เว้นช่อง | ✅ | loader คืน `null` ทุกกรณีเสีย `lib/organization/letterhead.ts:76` · `organization.db.test.ts:242/:258/:316` | — |
| 8.2 รูปผ่านยามแต่เนื้อพัง ⇒ PDF ไม่ล้ม | ✅ (เพิ่ม test) | ใหม่: `components/pdf/letterhead.test.tsx` "โลโก้ PNG/JPEG เสีย ⇒ เอกสารยังออกได้" × 7 ชนิดเอกสาร (render จริง) | — |
| 8.3 PDF route ไม่ลากทั้ง server (BUG-172) | ✅ | ยามแบบ static `components/pdf/no-react-hooks.test.ts` · error ใน route ⇒ 500 เฉพาะคำขอ (`lib/api/http.ts`) · ⚠️ `downloadUploadedFile` ไม่มี timeout (Storage ค้าง ⇒ คำขอค้าง) | งานใหม่ (ไม่บล็อก) |

## NEEDS_DECISION

1. **[[NEEDS_DECISION]] รอบจ่าย `completed` แต่บันทึกจ่าย/50 ทวิ ล้มหลัง commit** — `completePayoutBatch`/การจับคู่ธนาคาร sync นอก tx ไม่มีทางซ่อม · `[[OPTIONS]]` ก (แนะนำ) ตัวกวาดใน `runSweeperJobs` หา completed batch ที่รายการยังไม่มี expense_record แล้วเรียก sync (idempotent อยู่แล้ว) + audit `[job:id]` | ข ย้าย sync เข้า tx เดียวกับ completed (รื้อ wht/expenses ให้รับ tx) | ค ปุ่ม "ซ่อมบันทึกจ่าย" ให้การเงินกดเอง
2. **[[NEEDS_DECISION]] ค่าน้ำมันที่คำนวณได้หลังงวดของวันปิดงานถูกล็อก** — ตอนนี้ไม่เขียน (งาน failed) · `[[OPTIONS]]` ก (แนะนำ) ใช้ทางเดียวกับ U50: การเงินสร้างรายการย้อนหลังลงงวดที่เปิด | ข job ลงวันที่ในงวดที่เปิดอยู่ถัดไปอัตโนมัติ + หมายเหตุ | ค ทิ้ง (ต้องไป Adjustment)
3. **[[NEEDS_DECISION]] คีย์กันนำเข้า statement ซ้ำ** — (วัน+ยอด+รายละเอียด) กลืนรายการเงินเข้าจริงที่หน้าตาเหมือนกัน · `[[OPTIONS]]` ก (แนะนำ) เพิ่มลำดับการเกิดในไฟล์ (occurrence index ของคีย์เดียวกัน) หรือยอดคงเหลือ ถ้ามีคอลัมน์ | ข คงเดิม + เตือนผู้ใช้เมื่อพบแถวซ้ำในไฟล์เดียว | ค คงเดิม

## งานใหม่ที่เสนอ (ไม่บล็อก Final)
- ยามงวด (`assertPeriodOpenAt`) ให้อ่านใน tx ของผู้เขียนพร้อม `FOR SHARE` แถว `accounting_periods` (ปิดหน้าต่าง TOCTOU ทุกโมดูล)
- audit ระดับ engine ของ cron (org = null) — เขียนแถวต่อองค์กรที่ handler แตะ หรือเปิดให้ audit ระดับระบบได้
- import เคส: จับ error ไม่คาดคิดเป็น error ต่อแถว + parser ฟ้องเครื่องหมายคำพูดไม่ปิด · จำกัดจำนวนแถวของ `csv`
- `downloadUploadedFile` ใส่ timeout · outbox `markOutcome` ผูก lease (แข่งเมื่อส่งช้ากว่า 5 นาที — นับ attempts เพี้ยน แต่ไม่แจ้งซ้ำ)
