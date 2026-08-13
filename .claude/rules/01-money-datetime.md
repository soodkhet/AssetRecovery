# Rule 01 — เงินและวันเวลา (บังคับทุกไฟล์ทุกบรรทัด)

## เงิน (`02` §2.2, `22`)
- เก็บเป็น **`INTEGER` satang เท่านั้น** — ห้าม float ห้าม DECIMAL (฿100.50 → `10050`) · field ลงท้าย `_satang`
- ข้อยกเว้นเดียว: `rate_pct` / `wht_pct` = `NUMERIC(5,2)`
- Display layer หาร 100 + comma — ห้ามคำนวณเงินฝั่ง display
- สูตรคำนวณทุกสูตรอยู่ `docs/22-finance-calculation-spec.md` เท่านั้น — implement เป็น pure module (Phase 3.1) แล้วเรียกใช้ ห้าม hardcode สูตรซ้ำ
- Gross Profit: `revenue = 0` → margin แสดง "N/A" **ห้ามหารศูนย์** · Advance: `used > requested` → `return = 0` **ห้ามติดลบ**
- VAT **ห้าม hardcode 7%** — resolve จาก `vat_rate_history` ตาม `revenue_date` + snapshot `vat_rate_used` ลง record เสมอ
- WHT: rate จาก Payee-level (tax_profile) **ชนะ** Plan-level เสมอ · fallback Plan ได้แต่ต้องมี warning · ฐาน before_vat · ต่ำกว่า threshold (default 1,000 บาท) ไม่หัก

## วันเวลา (`03` §6.5, DEC-005)
- **Storage**: UTC เสมอ (`TIMESTAMPTZ`) · **API**: ISO 8601 UTC (`2026-08-11T07:30:00Z`)
- **Display**: แปลง Asia/Bangkok (UTC+7) + **พ.ศ. เท่านั้น** (ค.ศ. + 543) — แสดง ค.ศ. บนหน้าจอ = bug (`DISPLAY_CE_YEAR`)
- Format: `DD/MM/YYYY` หรือ `DD/MM/YYYY HH:mm` — separator `/` เท่านั้น
- ข้อยกเว้นเดียว: `<input type="date">` ใช้ ISO ค.ศ. (browser บังคับ)
- ใช้ utils กลาง `fmtDate` / `fmtDateTime` / `nowDate` (`TZ='Asia/Bangkok'`) — ห้าม format เอง
- เลขเอกสาร `LOT-YYYY-XXX` / `DLV-YYYY-XXX` ใช้ปี **พ.ศ.**
