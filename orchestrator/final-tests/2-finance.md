# ด่าน 2/6 — การเงิน: claim / payout / revenue / billing (ทุกสูตรใน `22`)

อ้างอิง `docs/22` (SSOT ของสูตร), `15`, `16`, `17`, `18`, `19`, `20`, `23`, `29`:

1. **สูตรครบ 13 ตัวตรง `22` ทุกบรรทัด** — ทดสอบด้วยตัวเลขจริงจาก §16/§17 ของแต่ละไฟล์ spec · ทุกสูตรต้องเรียกจาก pure module ตัวเดียว **ไม่มี hardcode สูตรซ้ำใน route/UI**
2. **หน่วยเงิน:** `INTEGER` satang ทุก field · ไม่มี float/Decimal หลุด (grep ทั้ง repo) · display หาร 100 ที่ layer แสดงผลเท่านั้น · `rate_pct`/`wht_pct` = NUMERIC(5,2)
3. **VAT / WHT:** VAT resolve จาก `vat_rate_history` ตาม `revenue_date` + snapshot `vat_rate_used` (**ห้าม hardcode 7%**) · WHT: Payee-level ชนะ Plan-level เสมอ, fallback ต้องมี warning, ฐาน before_vat, ต่ำกว่า threshold 1,000 ไม่หัก
4. **Snapshot:** `expenses`(comp_plan+version) · `revenues`(fee_model, vat_rate_used) · `payout_batch_items`(tax_profile, wht_pct) · `cases`(service fee ตอน approved) — แก้ template/plan ทีหลังแล้วยอดเดิม**ต้องไม่ขยับ**
5. **Claims & Advances:** ห้ามเบิกซ้อน (`approved|overdue` ต้องติด `uniq_active_advance_per_payee`) · auto-overdue job · `used > requested` → return = 0 ไม่ติดลบ
6. **Approval:** reject → reset กลับ step 1 เสมอ (`16` §9) · ทุก reject มี reason
7. **Payout:** `idempotency_key` กันโอนซ้ำจริง (ยิงซ้ำ = ได้ batch เดิม) · bank file ตรงสเปค **`13` §6.8** (layout ไฟล์ธนาคารอยู่ที่นั่น — `28` เป็นสเปค PDF/XLSX) · gate `BANK_FILE_NOT_TESTED` ยังปิดอยู่ถ้ายังไม่เคยทดสอบกับไฟล์จริง
8. **Billing/AR:** invoice ↔ revenue 1:1 · payment allocation · gross profit: `revenue = 0` → margin "N/A" **ห้ามหารศูนย์**
9. **Adjustment:** 4 FK + CHECK exactly-one non-null (DEC-004) · ใช้ได้เฉพาะเส้นทางที่ `20`/`30` อนุญาต

รายงานตาราง `| หัวข้อ | สถานะ | หลักฐาน (ไฟล์/เทสต์) |` แล้วแก้จุดที่ ❌ พร้อม test ที่พิสูจน์
