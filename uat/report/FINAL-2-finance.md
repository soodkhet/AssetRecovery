# Final Test ด่าน 2/7 — การเงิน (claim / approval / payout / revenue / billing / AR)

- วันที่: 06/10/2569 · ฐานทดสอบ `assetrecovery_test3` (ยืนยัน `prisma migrate status` = up to date) · branch `worktree-agent-a5d88e70bb34b213d` (merge `staging` @ `aeb12ba`)
- ค่าคาดหวัง = golden `uat/report/FINAL-coverage.md` ส่วน H + probe F.1 (ไม่คำนวณใหม่จากโค้ด)
- ⚠️ ข้อจำกัด: `scripts/seed-final/` **ยังไม่มีใน repo** ⇒ ด่านนี้เทียบ golden ผ่าน pure module ตัวเดียวกับ service + DB integration test ที่เดินผ่าน service จริงบนฐาน test3 (ไม่ได้รัน seed scenario ทั้งชุด) — ตัวเลขทุกตัวใน H ถูกครอบ
- Tests: ก่อน **366 ไฟล์ / 5107 tests** → หลัง **367 ไฟล์ / 5162 tests** (เขียวทั้งหมด · typecheck + lint ผ่าน)

## ผลตามหัวข้อ

| หัวข้อ | สถานะ | หลักฐาน (ไฟล์:บรรทัด / test) | การแก้ |
|---|---|---|---|
| 1. สูตรครบตาม `22` — H.1 รายได้/VAT 13 แถว + รวม ก.ย. 1832098/86247/1918345 · ต.ค. 2942716/142990/3085706 | ✅ | `lib/finance/final-golden.test.ts` › H.1 (ตรงทุกสตางค์ · FT-13 r1+r2 = 600000 ตาม U125) | — |
| 1. §6.2/6.3 แบ่งรายวัน N=3 เศษ 2 สตางค์ลงเคสแรก (6668/6666/6666) · §6.4 commission ⟂ no_success · v1/v2 | ✅ | final-golden › §6.2–6.4 | — |
| 1. H.2 WHT ต่อผู้รับต่อรอบ PY-1…PY-8 (largest remainder ทุกส่วนแบ่ง) | ✅ | final-golden › H.2 · end-to-end ผ่าน `createPayoutBatch` + ใบ 50 ทวิ: `lib/payout/wht-policy.db.test.ts` "Final ด่าน 2 golden PY-5/PY-8" (9897 · 559897/550000 · เงินได้บนใบ 329897 · 4800 · 764800/760000) | เพิ่ม test |
| 1. §6.9.2 ทบยอด (2)/(3) · §6.16 ประมาณภาษีลูกค้าหัก (1852/8111/6000/1481→51359/7800) | ✅ | final-golden › H.2, H.5 | — |
| 1. สูตรอยู่ pure module ตัวเดียว ไม่มีสูตรซ้ำใน route/UI | ✅ | grep `app/ components/` ไม่พบ `satang × pct`/`Math.round(...pct)` · `pctOfSatang`/`vatIncludedInSatang` ถูกเรียกเฉพาะ pure lib (`lib/sales/receipt-invoice.ts`, `lib/credit-notes/credit-note.ts`, `lib/cases/projected-revenue.ts`) | — |
| 2. หน่วยเงิน INTEGER satang | ✅ | `prisma/schema.prisma` — ไม่มี `Float`; `Decimal` มีแค่ pct + พิกัด/ระยะทาง (`latitude`/`distance_km`) · ทุก `*Satang` = `Int` | — |
| 3. VAT effective-dated + snapshot · ห้าม hardcode 7% | ✅ | final-golden › VAT effective-dated (7→10 ตามวันรายได้ · ไม่มีอัตรา = `VAT_RATE_NOT_FOUND`) · `lib/revenue/revenue-queries.db.test.ts:486,503,543` · ไม่พบ `0.07/1.07/107` ในโค้ด | — |
| 3. VAT — DB default `revenues.vat_rate_pct_used DEFAULT 7.00` | ⚠️ | migration `20260813231247_group_c_g_tables` บรรทัด 408 — service เขียนค่าเองทุกครั้ง (`lib/warehouse/revenue-service.ts:302–315`) จึงไม่เคยใช้ default · เป็นค่าตาม `02` | ไม่แก้ (ข้อสังเกต) |
| 3. WHT ลำดับ รายคน → ค่าเริ่มต้นตามประเภท → แผน+เตือน → ไม่มี = บล็อก (ไม่ 500) | ✅ | final-golden P-03/P-04 · `lib/compensation/approval-payee.db.test.ts:631,645,656,668` · `lib/payout/wht-type-defaults.db.test.ts:189` · `lib/payout/payout-queries.db.test.ts:288` | — |
| 3. ฐาน/ใบ 50 ทวิ/ประเภทเงินได้/0% ออกใบ/เกณฑ์/เงื่อนไข (1)(2)(3)/แยก U109 | ✅ | `lib/payout/wht-policy.db.test.ts` (23 tests) · final-golden H.4 (U109/U114 แยก 15400/0 · 0/9897) | — |
| 4. Snapshot (expense plan+version · revenue fee_model/vat_rate_used/vat_mode · payout item tax_profile/wht_pct/condition/category · case service fee ตอน approved · billing party) | ✅ | `lib/cases/case-workflow.db.test.ts:234` · `lib/payout/wht-policy.db.test.ts:244,541,647` · `lib/sales/sales.db.test.ts:363,494` · `lib/field/field-expense.db.test.ts:402,1248` | — |
| 5. Advances — ห้ามเบิกซ้อน/overdue job/คืน≥0/ใช้เกิน→เบิกส่วนเกิน · H.3 ADV-1…4 | ✅ | final-golden › H.3 + P-11 · `lib/advances/advance-queries.db.test.ts:211,422,512,575` | — |
| 5. CRT เพดาน 50000/ใบ · 300000/เดือน · ยกเลิก/ออกแทน (U103/U107/U117) | ✅ | final-golden P-06 · `lib/substitute-receipts/substitute-receipts.db.test.ts:273,284,631` | — |
| 6. Approval — reject → step 1 · reason บังคับ · U118 · คิวไม่ล้มเมื่อขาดอัตรา | ✅ | `lib/compensation/approval-payee.db.test.ts:484,513,572,656` | — |
| 7. Payout — idempotency · ยกเลิกรอบ · ยอดโอน 0 + ยกยอด · หักกลบ · H.4 ทั้ง 6 รอบ · `PERIOD_HAS_OPEN_PAYOUTS` | ✅ | final-golden › H.4 + P-10 · `lib/payout/payout-queries.db.test.ts:414` · `lib/payout/payout-cancel.db.test.ts:381` · `lib/advances/advance-return.db.test.ts:327` · `lib/accounting/accounting.db.test.ts:523` | — |
| 8. Billing/AR — §6.8.2 ใบตอนรับเงิน (ปิดยอด/บางส่วน 26168/373832) · AR สิ้น ต.ค. 923040 · GP N/A · no_vat บล็อก | ✅ | final-golden › H.5, H.7 · `lib/sales/sales.db.test.ts:444,459` · `lib/revenue/revenue-queries.db.test.ts:643,659` · `lib/accounting/accounting.db.test.ts:431,449` | — |
| 9. Adjustment 4 FK + CHECK exactly-one · ใบลด/เพิ่มหนี้ | ✅ | constraint `adjustments_one_target` (migration `20260813231247` บรรทัด 1536) · `lib/adjustments/adjustments.db.test.ts:224` · `lib/credit-notes/credit-notes.db.test.ts:263` (`CREDIT_NOTE_VAT_MISMATCH`) | — |

## Probe F.1

| Probe | สถานะ | หลักฐาน |
|---|---|---|
| P-01 `WHT_CONDITION_NOT_ALLOWED` + ชื่อผู้รับ | ✅ | `lib/payout/wht-policy.db.test.ts:695` |
| P-02 `WHT_40_2_RATE_MISSING` | ✅ | `lib/payout/wht-policy.db.test.ts:340` |
| P-03 fallback แผน 3% ฐาน 200000 → 6000 + เตือน | ✅ | final-golden P-03 · `payout-queries.db.test.ts:288` |
| P-04 ช่องว่าง + ไม่มีแผน → คิวเตือน / รอบ `WHT_RATE_MISSING` | ✅ | final-golden P-04 · `approval-payee.db.test.ts:656` · `wht-type-defaults.db.test.ts:189` |
| P-05 `HOTEL_CLAIM_EXCEEDS_CAP` 80001 | ✅ | final-golden P-05 · `lib/field/field-expense.db.test.ts:1219–1234` |
| P-06 CRT เกินใบ/เกินเดือน | ✅ | final-golden P-06 · `substitute-receipts.db.test.ts:273,284` |
| P-07 gross_amount → 3210 | ✅ | final-golden P-07 |
| P-08/P-09 all_40_2 / sec_40_1 → PND1 | ✅ | `lib/payout/wht-policy.db.test.ts:357,601` |
| P-10 หัก 30000 โอน 0 ยก 10000 | ✅ | final-golden P-10 · `advance-return.db.test.ts` |
| P-11 คืน 0 ไม่มีเบิกส่วนเกิน | ✅ | final-golden P-11 |
| P-12 `TAX_INVOICE_NO_VAT_COMPANY` | ✅ | `lib/sales/sales.db.test.ts:459` |
| P-13 `CREDIT_NOTE_VAT_MISMATCH` | ✅ | `lib/credit-notes/credit-notes.db.test.ts:263` |
| P-15/P-16 `PERIOD_LOCKED_DIRECT_EDIT` / `PERIOD_HAS_OPEN_PAYOUTS` | ✅ | 8 ไฟล์ db test (`PERIOD_LOCKED_DIRECT_EDIT`) · `accounting.db.test.ts:523` |
| P-17/P-18 case_ref ซ้ำพร้อมกัน / idempotency_key เดิม | ✅ | `lib/cases/case-duplicate.db.test.ts:111` · `payout-queries.db.test.ts:414` |
| P-19 basis `asset_value` ถูกปฏิเสธที่ Zod | ✅ | `lib/service-fee/schemas.test.ts:64` |
| P-14 PER_KM | ⏸️ | ไม่เรียก Google Maps ตาม O71/J7 — ครอบด้วย unit test เดิมของ `fuelPerKmSatang` |

## ข้อสังเกต (ไม่ใช่บั๊กโค้ด)

1. **golden H.2 PY-5 ลำดับส่วนแบ่ง**: คอลัมน์ "ในฐาน" เรียง FT-03 r1 · FT-05 · FT-03 r2 · FT-09 แต่ส่วนแบ่ง `464/928/464/3093/464/928/464/3092` ตรงกับลำดับ FT-03 r1 · FT-03 r2 · FT-05 · FT-09 — ยอดรวม 9897 ตรงทุกแบบ ต่างกันแค่รายการ 100000 ตัวไหนได้เศษ 1 สตางค์ (ตามลำดับรายการในรอบ) · เทสต์ end-to-end จึงเทียบเป็นชุดค่าที่เรียงแล้ว
2. `seed-final` ยังไม่มี ⇒ จำนวนคิวส่วน G และสถานะปลายทางส่วน E ยังไม่ได้ตรวจด้วยข้อมูลชุดจริงในด่านนี้

## บั๊กที่แก้
- ไม่มี — ไม่พบตัวเลขเงินที่ไม่ตรง golden หรือพฤติกรรมที่ขัดสเปค/มติ

## NEEDS_DECISION
- ไม่มี
