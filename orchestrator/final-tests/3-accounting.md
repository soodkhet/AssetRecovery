# ด่าน 3/7 — บัญชี: ปิดงวด / เอกสารภาษี / WHT / Export Pack

> อ่าน `0-common.md` ก่อน (ฐาน `assetrecovery_test4` · รายงาน `uat/report/FINAL-3-accounting.md`)

อ้างอิง `docs/30`–`37`, `28`, `13`, `29` · **Hybrid Accounting Boundary**: ระบบ*เตรียมข้อมูล*เท่านั้น ห้ามลง GL ห้ามยื่นภาษีเอง · มติ U15/U18–U21/U25/U31/U32/U45/U47/U48/U50/U51/U57/U65/U72/U77–U79/U82/U84/U93/U94/U96/U99–U104/U110/U112/U114/U122:

1. **ปิดงวด + lock:** readiness check ครบ (รวมรอบจ่ายค้าง U112) · หลัง lock ทุก write ตรงโดน `PERIOD_LOCKED_DIRECT_EDIT` ทุกกรณี (รวม Superadmin) → Adjustment + Executive เท่านั้น · job ที่ลงวันที่ในงวดปิด (U25/U50) · ล็อกก่อนสิ้นเดือน (U51)
2. **ใบกำกับภาษี/ใบเสร็จ:** เลขที่ห้าม gap/ซ้ำภายใต้ concurrency · cancelled ห้ามลบ/reverse · ยกเลิกเมื่อมีใบลดหนี้ active (U18) · เพดานใบลดหนี้ (U32) · ใบลดหนี้ในงวด sent_to_accountant (U20) · สาขาผู้ขาย/ผู้ซื้อ (U77/U82)
3. **WHT (50 ทวิ):** ยอดตรง payout จริง · **cancelled ไม่นับยอด** · ภ.ง.ด.1/3/53 ถูกฟอร์ม · กำหนดยื่นตามวิธียื่น (U45) · ยกเลิก/ออกใหม่
4. **Exception + Document Checklist:** critical open → **บล็อก export** · `08_Document_Checklist` 4 สถานะ (U31)
5. **Bank Reconciliation:** trigger 2 ทาง · `ALREADY_MATCHED`/`DUPLICATE_PAYMENT_FILE` = เตือนไม่บล็อก · ที่เหลือ reject · suspense (U41/U72)
6. **Export Pack 17 ไฟล์ `00`–`16`** ตาม `docs/37` ทีละคอลัมน์ (เทียบ `reference/samples/`) · `00_Control_Totals` คำนวณจากแถวชุดเดียวกับไฟล์ + แยก "หักจากผู้รับ / บริษัทออกให้ / รวมนำส่ง" (U114) · PDF ในโฟลเดอร์ `vouchers/`, `wht_certificates/`, `tax_invoices/` (+ เพดาน `NOT_ATTACHED.txt` U78) · หน้าปก · **versioned + SHA-256 ห้าม overwrite** · `export_records` ลบไม่ได้ · ยอดในไฟล์ตรง golden
7. **PDF ทุกชนิด (13 ตัวอย่าง U104 + ฉบับจริง):** ตัวเลขตรง DB · วันที่ **พ.ศ.** · หัวกระดาษจากข้อมูลองค์กร (U99) + **snapshot ครบทุกช่อง** พิมพ์ซ้ำเหมือนเดิม (U110/U111) · 50 ทวิ แบบทางการไม่มีหัวกระดาษกลาง · ข้อความท้าย + ลายเซ็นตามแท็บเทมเพลตเอกสาร (U122) และ snapshot · เลขเอกสาร 9 ชนิดจาก `document_number_series` (U102)
8. **ขอบเขตบัญชี (U42/U47):** ไม่มีฟังก์ชันลง GL/ยื่นภาษี · ค่าตั้งที่รอนักบัญชี (Q1–Q18) มีป้าย "สมมติฐาน" และ `<SettingHelp>` (U93/U108)
