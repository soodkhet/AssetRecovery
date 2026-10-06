# ด่าน 2/7 — การเงิน: claim / approval / payout / revenue / billing / AR (ทุกสูตรใน `22`)

> อ่าน `0-common.md` ก่อน (ฐาน `assetrecovery_test3` · รายงาน `uat/report/FINAL-2-finance.md`) · ค่าคาดหวังเงินใช้ **golden** ใน `uat/report/FINAL-coverage.md`

อ้างอิง `docs/22` (SSOT), `15`–`20`, `23`, `29` + มติ U1–U5/U7/U16/U27/U29/U30/U33/U40/U41/U66–U68/U73/U74/U80/U83/U86–U88/U95/U103/U105–U107/U109/U112/U117/U118/U121:

1. **สูตรครบตาม `22` ทุกบรรทัด** (รวม §6.9.2 ทบยอด (2)/(3) และ §6.16 ประมาณภาษีลูกค้าหัก) — เทียบ golden ทีละตัวเลขถึงสตางค์ · ทุกสูตรเรียกจาก pure module ตัวเดียว ไม่มีสูตรซ้ำใน route/UI
2. **หน่วยเงิน:** `INTEGER` satang ทุก field · grep หา float/Decimal หลุด · display หาร 100 ที่ layer แสดงผลเท่านั้น · `rate_pct`/`wht_pct` = NUMERIC(5,2)
3. **VAT / WHT:** VAT จาก `vat_rate_history` ตาม `revenue_date` + snapshot `vat_rate_used` (ห้าม hardcode 7%) · WHT ลำดับ **ตั้งรายคน → ค่าเริ่มต้นตามประเภทผู้รับ (U121) → แผน (+warning) → ไม่มีเลย = บล็อกพร้อมคำเตือน ไม่ 500** · ฐานตาม `wht_policy_history` (ชนิดรายการในฐาน U3 · 1 ใบ/ผู้รับ/รอบ U4 · ประเภทเงินได้แยกฝั่ง U33 · 40(2) รายคน U7 · 0% ออกใบ U16) · threshold 1,000 · เงื่อนไข (1)/(2)/(3) + ค่าตั้ง `allow_gross_up_conditions` (U105) · แยก "หักจากผู้รับ / บริษัทออกให้" (U109)
4. **Snapshot:** `expenses`(comp_plan+version) · `revenues`(fee_model, vat_rate_used) · `payout_batch_items`(tax_profile ที่ใช้จริง รวมค่าเริ่มต้นตามประเภท, wht_pct, เงื่อนไข) · `cases`(service fee ตอน approved) · `billing_batches` party snapshot — แก้ template/plan/ค่าตั้งทีหลัง ยอดเดิม**ต้องไม่ขยับ**
5. **Claims & Advances:** ห้ามเบิกซ้อน (`uniq_active_advance_per_payee`) · auto-overdue job (แจ้งเตือนผ่าน outbox U120) · `used > requested` → return = 0 · เคลียร์/รับคืน (U30/U74/U83) · ใบรับรองแทนใบเสร็จ: เพดานต่อใบ/ต่อเดือน · ยกเลิก/ออกแทน + "ออกแทนเลขที่" (U103/U107/U117)
6. **Approval:** reject → reset step 1 · ทุก reject มี reason · ปฏิเสธถาวรค่าที่พัก 3 สถานะ (U118) · คิวอนุมัติไม่ล้มทั้งหน้าเมื่อมีแถวขาดอัตราภาษี
7. **Payout:** `idempotency_key` (ยิงซ้ำ = batch เดิม) · ไฟล์ธนาคารตาม `13` §6.8 · ยกเลิกรอบจ่าย (U67/U73) · ยอดโอน 0 (U68) · หักกลบเงินทดรอง · ส่ง/ล็อกงวดถูกบล็อกเมื่อมีรอบจ่ายค้าง `PERIOD_HAS_OPEN_PAYOUTS` (U112)
8. **Billing/AR:** เลขรอบวางบิล (U76) · กันร่างซ้อน (U88) · ใบเสร็จ/ใบกำกับออกตอนรับเงิน (U95) · ภาษีลูกค้าหัก (U11/U40) · เงินเข้าไม่ทราบที่มา (U41) · รายได้ค้างข้ามเดือน (U86/U87) · gross profit: `revenue = 0` → "N/A" ห้ามหารศูนย์ · AR aging (F3 · การ์ด AR U115)
9. **Adjustment:** 4 FK + CHECK exactly-one (DEC-004) · เส้นทางตาม `20`/`30` · Adjustment รอบบิล + ใบลด/เพิ่มหนี้ (U19/U69/U80)
