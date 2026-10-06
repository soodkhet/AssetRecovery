# Final Test ด่าน 3/7 — บัญชี: ปิดงวด / เอกสารภาษี / WHT / Export Pack

> วันที่ทดสอบ: 07/10/2569 · ฐาน `assetrecovery_test4` (ยืนยันด้วย `prisma migrate status` — 73 migrations up to date) · branch `worktree-agent-ac7b008579bddabfd` (merge `staging` ที่ `aeb12ba`)
> วิธี: integration test จริง (`*.db.test.ts`) + ตรวจโค้ดเทียบ `docs/30`–`37`, `28`, `13`, `22` และมติ U*/O* · ผล: ✅ 27 · ❌→แก้แล้ว 2 · ⚠️ 6 · ⏸️ 1
> Tests: ก่อน **366 files / 5107 tests** → หลัง **366 files / 5112 tests** (เพิ่ม 5 · เขียวทั้งหมด) · `pnpm typecheck` + `pnpm lint` ผ่าน

## 1. ปิดงวด + lock

| หัวข้อ | สถานะ | หลักฐาน | การแก้ |
|---|---|---|---|
| Readiness ครบ รวมรอบจ่ายค้าง (U112) | ✅ | `lib/accounting/queries.ts:446` `openPayoutBatchesOf` · test `accounting.db.test.ts:523` (PERIOD_HAS_OPEN_PAYOUTS) + critical/U87/BUG-160 `:398–476` | — |
| ล็อกก่อนสิ้นเดือนไม่ได้ (U51) | ✅ | `lib/accounting/period.ts:143` `assertPeriodEnded` · test `accounting.db.test.ts:501` (ขอบ 23:59/00:00) | — |
| หลัง lock เขียนตรง ⇒ `PERIOD_LOCKED_DIRECT_EDIT` ทุก role (รวม Superadmin) | ✅ | `lib/settings/period-lock.ts:95` ไม่มีทางยกเว้น role · guard ครบใน claims/compensation/field/advances/payout/billing/sales/CN-DN/WHT/bank-recon/customer-wht/substitute-receipts (ตารางจาก audit) · tests `accounting.db:657,674,739` `sales.db:825` `credit-notes.db:325,543` `wht.db:639` `bank-recon.db:673` `customer-wht.db:602` | — |
| Job ที่ลงวันที่ในงวดปิด — เหมาจ่ายรายวัน (U25/U50) | ✅ | `lib/field/daily-allowance-job.ts:339` · test `warehouse-workflow.db.test.ts:1452,1524` | — |
| Job ที่ลงวันที่ในงวดปิด — **ค่าน้ำมัน PER_KM retry** | ❌→✅ | `lib/field/fuel-distance-job.ts` สร้าง expense ลงวันปิดงานโดยไม่เช็คงวด — retry ข้ามสิ้นเดือนเขียนเข้างวดที่ล็อกได้ | แก้: เช็คงวดก่อนเรียก Maps · งวดปิด ⇒ ไม่สร้าง + job `failed` พร้อมเหตุผล + นับ `periodLocked` · test `field-expense.db.test.ts` "Final Test ด่าน 3 — retry ข้ามไปหลังงวด…" (พิสูจน์ล้มก่อนแก้) |
| รายได้ที่เกิดตอนยืนยันล็อต (`tryCreateRevenue`) | ⚠️ | `lib/warehouse/revenue-service.ts:277` `revenue_date = closed_at` ไม่เช็คงวด ⇒ ล็อตยืนยันหลังงวดของวันปิดงานถูกล็อก = รายได้ลงงวดที่ล็อก | ไม่แก้ — ขึ้นกับมติวันรับรู้รายได้ (ND-1) |
| `resubmit_close` supersede รายการเบิกที่ลงวันในงวดปิด / `changeAdvanceReturnMethod` | ⚠️ | `lib/field/queries.ts:1644` · `lib/advances/queries.ts:638` ไม่มี guard (ไม่ขยับยอดที่อนุมัติแล้ว) | ไม่แก้ — ND-6 |

## 2. ใบกำกับภาษี / ใบเสร็จ / ใบลดหนี้

| หัวข้อ | สถานะ | หลักฐาน | การแก้ |
|---|---|---|---|
| เลขที่ไม่ gap/ซ้ำภายใต้ concurrency | ✅ | `sales.db.test.ts:573,581,598,459,468,610` · CRT `substitute-receipts.db.test.ts:216` · 9 ชนิด `document-numbering.db.test.ts:180,193` | — |
| cancelled ห้ามลบ/reverse | ✅ | trigger `tax_invoices_immutable()` (`20261006160000_receipt_tax_invoice`) · tests `sales.db:841` `credit-notes.db:341,371` | — |
| U18 ยกเลิกใบกำกับที่มีใบลดหนี้ active ⇒ บล็อก | ✅ | `lib/sales/queries.ts:817–836` + trigger FOR UPDATE · test `credit-notes.db:470` + **ใหม่** "U18 ภายใต้ concurrency" (3 รอบแข่ง cancel × create) | เพิ่ม test |
| U32 เพดานใบลดหนี้ (ไม่นับใบเพิ่มหนี้) | ✅ | `credit-note.ts:192–216` + trigger `credit_notes_guard_balance` · test `:270` + **ใหม่** "U32 ภายใต้ concurrency" (2×700,000 ⇒ ผ่านใบเดียว) | เพิ่ม test |
| U20 ใบลดหนี้ในงวด `sent_to_accountant` ⇒ ปฏิเสธ | ✅ | เดิมมี test แค่งวด `locked` · **ใหม่** "U20: … sent_to_accountant" | เพิ่ม test |
| สาขาผู้ขาย/ผู้ซื้อ (U77/U82) | ✅ | `sales.db:647,674` · `credit-notes.db:644` | — |

## 3. WHT (50 ทวิ)

| หัวข้อ | สถานะ | หลักฐาน | การแก้ |
|---|---|---|---|
| ยอดตรง payout จริง | ✅ | `lib/wht/wht.ts:209–253` · `wht-policy.test.ts:35,41` · `wht.db.test.ts:254` | — |
| cancelled ไม่นับยอด (ทุกจุดรวมยอด) | ✅ | `wht.ts:389` · export 05 `status:'active'` `lib/exports/queries.ts:546` · A1 อ่าน summary · tests `wht.test.ts:168` `wht.db:497,666` `exports.db:1290` | — |
| ภ.ง.ด.1/3/53 ถูกฟอร์ม | ✅ | `wht.ts:135–146` (นิติ = 53 · 40(1)/40(2) = 1 · อื่น = 3) · `wht.test.ts:50` `wht.db:809` | — |
| กำหนดยื่นตามวิธียื่น + เลื่อนวันหยุด (U45/U93) | ✅ | `wht.ts:255–279` · `wht.db:307,352,443` | — |
| ยกเลิก/ออกใหม่ | ✅ | `lib/wht/queries.ts:578–670` · `wht.db:481,497,531,566,691` | — |
| **รอบนำส่งที่ mark `filed` แล้วถูกคิดทับ** | ❌→✅ | `refreshFilingSummary` (เรียกทุกครั้งที่ออก/ยกเลิกใบ + job รายวัน) เขียนทับยอด/วันกำหนด/วิธียื่นของรอบ `filed` — ขัด `docs/33` §7.2 "รอบที่ filed แล้วไม่แตะ" | แก้ `lib/wht/queries.ts`: รอบ `filed` คืนค่าเดิมไม่เขียน · test ใหม่ "รอบที่ mark filed แล้ว ⇒ คิดสรุปใหม่…ไม่แตะ" (ล้มก่อนแก้) · ปรับ test ด่าน 6 ที่อาศัยพฤติกรรมเดิมให้ทดสอบกับรอบ `pending` |
| J.2 Tax Profile ไม่รับ PND1 | ✅ (ตั้งใจ) | PND1 มาจาก `wht_income_category` 40(1)/40(2) + อัตรารายคน `payee_profiles.wht_40_2_pct` ไม่ผ่าน Tax Profile (`docs/13` §6.4.3 · `docs/33:20,96` O57) | spec เก่า → แก้ `docs/13` v3.22 |
| J.2 `vat_mode`/`applies_to` บน Tax Profile | ✅ (spec เก่า) | `vat_mode` อยู่ `finance_companies` · การผูกประเภทผู้รับ = `tax_profile_default_history` (U121) · โค้ดบันทึกไว้แล้ว `lib/settings/tax-profile.ts:11–16` | แก้ `docs/13` §6.4 + §6.4.2 (U93) + changelog v3.22 |

## 4. Exception + Document Checklist

| หัวข้อ | สถานะ | หลักฐาน | การแก้ |
|---|---|---|---|
| critical open ⇒ บล็อก export (`EXPORT_BLOCKED_CRITICAL`) | ✅ | `lib/accounting/exception.ts:144` เรียกใน `lib/exports/queries.ts:1497` · `exception.test.ts:99` · `exports.db.test.ts:485` | — (เช็คอยู่นอกทรานแซกชันสร้าง export — race แคบมาก บันทึกไว้) |
| `08_Document_Checklist` 4 สถานะ (U31) | ✅ | `lib/exports/pack.ts:1236,1263` · `pack.test.ts:679–720` | — |

## 5. Bank Reconciliation

| หัวข้อ | สถานะ | หลักฐาน | การแก้ |
|---|---|---|---|
| trigger 2 ทาง | ⚠️ | statement → billing/payout auto-match ตอน import (`lib/bank-recon/queries.ts:583–611`) · ฝั่ง payout/receipt → statement = จับคู่มือ (รอบ completed ยังเลือกได้ `:313`) — ตรง `docs/35` (import auto + manual) ไม่มี reverse auto | ไม่แก้ — ND-7 |
| `ALREADY_MATCHED` / `DUPLICATE_PAYMENT_FILE` = เตือนไม่บล็อก | ✅ | `bank-recon.db:504` · `payout-queries.db:476` · ล็อก `error-catalog.test.ts:117` | — |
| ที่เหลือ reject | ✅ | `bank-recon.db:444,479,594,627,640,673` | — |
| suspense (U41/U72) | ✅ | `customer-wht.db.test.ts:456,496,530,614` · `matching.ts:244` | — |

## 6. Export Pack

| หัวข้อ | สถานะ | หลักฐาน | การแก้ |
|---|---|---|---|
| 17 ไฟล์ `00`–`16` | ✅ | `pack.ts:109–125` · `pack.test.ts:94,138` · `exports.db:338` | — |
| คอลัมน์ทีละไฟล์เทียบ `reference/samples` | ✅ | สคริปต์เทียบ header ทุกไฟล์ CSV + xlsx 08 = ตรงทั้งหมด · `pack.test.ts:201` | — |
| คอลัมน์เทียบตาราง `docs/37` §6.1 | ⚠️ | 04/05 มี `wht_paid_by_payer_baht` (U105 — changelog มีแต่ตารางไม่มี) · 07 ในเอกสารยังเขียน `adjustment_type`/`target_id` แต่ code+sample ใช้ `adjustment_ref`/`target_ref`/`approved_date`/`billing_batch_number` | ไม่แก้ (doc เท่านั้น — ND-8) |
| `00_Control_Totals` จากแถวชุดเดียวกัน + แยก WHT 3 บรรทัด (U114) | ✅ | `queries.ts:1533–1599` · `control-totals.ts:196–207` · `pack.test.ts:1207,1260` · `exports.db:1186` | — |
| PDF `vouchers/` `wht_certificates/` `tax_invoices/` + `NOT_ATTACHED.txt` (U78) | ✅ | `pack.ts:851–894` · `pack.test.ts:1330–1362` · `exports.db:848,1246` | — |
| หน้าปก | ✅ | `00_Cover_Sheet.pdf` `pack.ts:140` · `pack.test.ts` หน้าปก | — |
| versioned + SHA-256 ห้าม overwrite · `export_records` ลบไม่ได้ | ✅ | `uniq_export_period_version` · trigger `EXPORT_RECORD_IMMUTABLE` · `pack.test.ts:145,187,225` · `exports.db:456,596,832` · `immutable-rules.db:94` | — |
| ยอดในไฟล์ตรง golden (`FINAL-coverage` H.6) | ⏸️ | สคริปต์ `scripts/seed-final/` ยังไม่มีใน repo ⇒ เทียบ golden ไม่ได้ในด่านนี้ | รอ seed scenario |

## 7. PDF

| หัวข้อ | สถานะ | หลักฐาน | การแก้ |
|---|---|---|---|
| เลขเอกสาร 9 ชนิดจาก `document_number_series` (U102) | ✅ | tax_invoice `sales/queries.ts:689` · wht `wht/queries.ts:273` · LOT/DLV `warehouse/queries.ts:665` · PV `payout/queries.ts:1093` · CRT `substitute-receipts/queries.ts:227` · billing/ADV/RAV = trigger `next_document_number()` · `document-numbering.db:180` | — |
| ตัวเลขตรง DB · วันที่ พ.ศ. · 13 ตัวอย่าง (U104) | ✅ | `components/pdf/documents.test.tsx` · `document-samples.test.tsx:51,79` · `document-samples.db.test.ts:112` | — |
| หัวกระดาษ + snapshot (U99/U110/U111) — ใบกำกับ/ใบเสร็จ/ใบแจ้งหนี้/LOT/DLV | ✅ | `lib/organization/letterhead.ts:172` · `sales.db:363,494,693` · `warehouse-workflow.db:762` | — |
| snapshot เอกสารภายใน (PV/CRT/ADV/RAV/payslip) + ใบแจ้งหนี้อ่าน WHT%/บัญชีรับเงินสด | ⚠️ | ใช้หัวกระดาษปัจจุบันทุกครั้งที่พิมพ์ (`app/api/payout-batches/[id]/voucher-pdf/route.ts:40` · `lib/exports/queries.ts:1386` · CRT route `:33`) · `billing-invoice-queries.ts:87–103` | ไม่แก้ — ND-3/ND-4 |
| 50 ทวิ แบบทางการไม่มีหัวกระดาษกลาง | ✅ | `OfficialFooter` · snapshot ผู้จ่าย/ผู้ถูกหัก `wht/queries.ts:832–848` · `wht-official-form.test.ts` | — |
| ข้อความท้าย + ลายเซ็น (U122) + snapshot | ✅ | `letterhead.ts:132–141` · `sales.db:765` · `warehouse-workflow.db:818–829` | — |

## 8. ขอบเขตบัญชี

| หัวข้อ | สถานะ | หลักฐาน | การแก้ |
|---|---|---|---|
| ไม่มีฟังก์ชันลง GL / ยื่นภาษี (U42/U47) | ✅ | ไม่มี journal/GL/e-filing · mark-filed = บันทึกการยื่นนอกระบบ · CN/DN = บันทึกเลขที่สำนักงานบัญชีออก | — |
| `<SettingHelp>` ทุกค่าตั้งการเงิน/บัญชี (U108) | ✅ | ทุกแท็บบัญชี/การเงิน + modal บริษัท/แผน/service fee · `help.test.ts` `setting-help.test.tsx` | — |
| ป้าย "สมมติฐาน" ค่าที่รอนักบัญชี (U119 ข้อ 2) | ⚠️ | ป้ายมีในตาราง `uat/report/FINAL-coverage.md` (A.*) แต่ **ไม่มีในหน้าจอ** (ไม่มี field ใน `SettingHelpContent`) | ไม่แก้ — ND-5 |

## NEEDS_DECISION

- **ND-1 วันรับรู้รายได้ + งวดปิด**: `revenue_date` = วันปิดงาน (`docs/19:123`, code) แต่ `docs/19:90` (U87) พูดถึงเดือนส่งมอบ · ล็อตยืนยันหลังงวดของวันปิดงานถูกล็อก ⇒ รายได้ลงงวดที่ล็อก (ไม่มี guard) — [[OPTIONS]] ก (แนะนำ) ลงวันที่ในงวดที่เปิดอยู่ + แจ้งบัญชี (แบบ U50) | ข บล็อกยืนยันล็อต ต้อง Adjustment | ค คงเดิม (ถือว่ารายได้ค้างรับ ไม่ใช่การแก้ยอดเดิม)
- **ND-2 ยกเลิก/ออกใหม่ 50 ทวิ หลังรอบนำส่ง `filed`**: ตอนนี้ (หลังแก้) ยอดที่ยื่นแล้วคงเดิม แต่ใบที่ยกเลิก/ออกใหม่ไม่ถูกสะท้อนที่ไหน — [[OPTIONS]] ก (แนะนำ) อนุญาต + ติดธง "ต้องยื่นเพิ่มเติม" บนรอบ + แจ้งบัญชี | ข บล็อกการยกเลิกหลัง filed | ค เปิดรอบกลับเป็น pending อัตโนมัติ
- **ND-3** PV/CRT/ADV/RAV/payslip ต้อง snapshot หัวกระดาษตอนออกไหม (U99 vs ขอบเขต U110/U111) — Export pack เวอร์ชันหลังพิมพ์ PV ใหม่ด้วยหัวกระดาษปัจจุบัน
- **ND-4** ใบแจ้งหนี้ (billing) snapshot `customerWhtPct` / บัญชีรับเงิน / รายละเอียดทรัพย์ ตอนส่งไหม (เปลี่ยน % ภาษีลูกค้าหักแล้วพิมพ์ซ้ำ ยอดคาดรับเปลี่ยน)
- **ND-5** ป้าย "สมมติฐาน" (U119 ข้อ 2) ต้องแสดงบนหน้าตั้งค่าด้วย หรือพอแค่ในเอกสาร Final Test
- **ND-6** supersede รายการเบิก (ยังไม่อนุมัติ) ที่ลงวันในงวดปิดตอน resubmit_close — บล็อกหรือยอม · และรายการเบิกที่ลงวันในงวดปิดอนุมัติไม่ได้ ⇒ เกตรายได้ไม่เปิด: ใช้ทาง U50 (ลงวันใหม่ในงวดเปิด) หรือ Adjustment
- **ND-7** Bank recon reverse auto-match (payout/receipt ค้นหา statement ที่ยังไม่จับคู่) — ต้องการไหม (ตอนนี้จับคู่มือได้)
- **ND-8** WHT file 05 เลือกใบตามงวดของรายการเบิก (`expense.period_id`) แต่ ภ.ง.ด. ยื่นตามเดือนที่จ่าย (`payment_date`) — จ่ายข้ามเดือนจะคนละงวด · ใบ 50 ทวิ ที่ยกเลิกในงวดถัดไปของ pack ที่ส่งแล้วไม่มีแถว reversal ในไฟล์ 05 (มีแค่ PDF `-CANCELLED`) · ตาราง `docs/37` §6.1 ของ 04/05/07 ควรปรับให้ตรง sample (doc เท่านั้น) · ถามนักบัญชี
- **ND-9** เลขใบลดหนี้/ใบเพิ่มหนี้กรอกเอง (ไม่ใช้ `document_number_series`) — ยืนยันว่าตั้งใจ (U47 = บันทึกเอกสารที่สำนักงานบัญชีออก)

## Tests ที่เพิ่ม/แก้

- `lib/wht/wht.db.test.ts` — ใหม่: "รอบที่ mark filed แล้ว ⇒ คิดสรุปใหม่ไม่แตะ" · ปรับ "ด่าน 6" ให้ใช้รอบ `pending`
- `lib/field/field-expense.db.test.ts` — ใหม่: retry ค่าน้ำมันข้ามงวดที่ล็อก
- `lib/credit-notes/credit-notes.db.test.ts` — ใหม่ 3: U20 `sent_to_accountant` · U32 concurrency · U18 concurrency
- `app/api/job-routes.test.ts` — mock ผลลัพธ์ job เพิ่ม `periodLocked`
