ทดสอบทั้งระบบเหมือนใช้งานจริง (ไม่ใช่รีวิว diff รายก้อน) โดยเฉพาะ:

**1. Flow ธุรกิจข้ามเฟส (end-to-end)**
- บริษัทไฟแนนซ์ส่งเคสเข้าระบบ (ทีละเคส/import) → ตรวจ/อนุมัติ (snapshot service fee ตอน approved) → มอบหมายทีม/เจ้าหน้าที่
- เจ้าหน้าที่ภาคสนามรับงาน → ลงพื้นที่ (GPS จริง) → ปิดงาน `closed_success` พร้อมหลักฐาน + ค่าตอบแทนตาม compensation plan
- รับเครื่องเข้าคลัง (IMEI exact 15 หลัก) → สร้าง HandoverLot (1 lot = 1 บริษัท) → **confirm = `$transaction` 4 ขั้น** → ปลดล็อก expense + trigger revenue
- Revenue (expense.approved **AND** lot.confirmed) → billing/AR → รับชำระ → กระทบยอดธนาคาร
- Claim/Advance → approval 2 ขั้น → payout batch (idempotency + bank file) → WHT
- ปิดงวดบัญชี → ตรวจ readiness/exception → ออก Accounting Pack 8 ไฟล์ + SHA-256
- เคส `closed_fail` → **ไม่ผ่านคลัง** และไม่เกิด revenue

**2. ความถูกต้องการเงิน (สำคัญสุด)**
- เงินเป็น `INTEGER` satang ทุกจุด · `rate_pct`/`wht_pct` เป็น NUMERIC(5,2) · ไม่มี float หลุด
- ทุกสูตรตรง `docs/22` (13 สูตร) · VAT จาก `vat_rate_history` + snapshot `vat_rate_used` · WHT Payee ชนะ Plan
- snapshot ไม่เปลี่ยนย้อนหลังเมื่อแก้ template/plan ทีหลัง
- ยอดในรายงาน/dashboard/หน้าบัญชี = ผลรวมธุรกรรมจริง ตรงทุกสตางค์

**3. สิทธิ์ / ความปลอดภัย**
- 15 roles 4 กลุ่ม เข้าถึงได้เฉพาะที่ควร — ทดสอบ endpoint จริง ไม่ใช่ดูแค่ UI
- scope ย่อย: Manager เห็นเฉพาะทีมตัวเอง · Company User เห็นเฉพาะบริษัทตัวเอง (403 แบบไม่ leak)
- `/api/portal/*` = GET เท่านั้น · audit log ครบทุก mutation และแก้ไม่ได้
- ไม่มีข้อมูลข้ามองค์กร/ข้ามบริษัทรั่วทุกช่องทาง (list, detail, export, report)

**4. ความทนทาน**
- concurrent: 2 คน confirm lot เดียวกัน / เลขที่ใบกำกับภาษีออกพร้อมกัน → ต้องไม่ซ้ำ ไม่ gap
- idempotency: รัน job ซ้ำ / ส่ง payout ซ้ำด้วย key เดิม → ไม่เกิดรายการซ้ำ
- period locked → ทุก write ตรงโดน `PERIOD_LOCKED_DIRECT_EDIT` ต้องผ่าน Adjustment เท่านั้น

**5. UI**
- ทุกเมนูตาม `docs/06` เปิดได้จริง ไม่มีหน้าเปล่า/placeholder ที่กดเข้าไปแล้วว่าง
- วันที่บนหน้าจอเป็น พ.ศ. ทุกจุด · badge สีตาม `04` §8.1 · ทุกหน้ามี loading/empty/error state

รายงานเป็นตาราง: `| ด้าน | สถานะ | หลักฐาน/ไฟล์ |` แล้วแก้จุดที่ ❌ ให้เลย พร้อม test ที่พิสูจน์ว่าแก้แล้ว
