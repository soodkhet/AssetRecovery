ทดสอบทั้งระบบเหมือนใช้งานจริง (ไม่ใช่รีวิว diff รายก้อน) โดยเฉพาะ:

**1. Flow ธุรกิจข้ามเฟส (end-to-end)**
- รับป้ายเข้าระบบ (sync/manual) → ตรวจ → ประกาศขาย → ลูกค้าสนใจ
- สร้าง Order (reservation/sale) → lock ป้ายกันขายซ้ำ → รับเงินงวดแรก → ออก RC
- รับเงินเพิ่ม → เอกสารครบ → โอนสิทธิ → จ่ายพาร์ทเนอร์ (PV/PR) → ปิดยอด
- เคสคืนเงิน/ยกเลิก → RF + recovery + void (ห้าม negative mutation)
- ตรวจว่ายอดสุดท้ายในรายงาน/บัญชี ตรงกับธุรกรรมจริงทุกบาท

**2. ความถูกต้องการเงิน (สำคัญสุด)**
- เงินเป็น BIGINT สตางค์ทุกจุด · % เป็น basis points · ไม่มี float หลุด
- snapshot commission ณ สร้าง Order ไม่เปลี่ยนย้อนหลังเมื่อแก้ master
- trace chain ครบ: ป้าย → Order → รับ/คืนเงิน → จ่าย/รับคืนพาร์ทเนอร์ → เอกสารทุกใบ

**3. Security / สิทธิ์**
- RBAC ทุก role (owner/sales/finance/content/viewer) — เข้าถึงได้เฉพาะที่ควร ทดสอบ endpoint จริง
- Source Confidentiality: รัน leak test — partner/source_url/commission/ข้อมูลการเงิน ห้ามหลุด public ทุกช่องทาง (รวม URL/alt/metadata)
- ไฟล์ private + signed URL หมดอายุ · audit log เขียนครบทุก mutation

**4. ความทนทาน**
- concurrent: 2 คนจอง/ขายป้ายเดียวกันพร้อมกัน ต้องมีคนเดียวสำเร็จ
- idempotency: รัน sync/worker job ซ้ำ ต้องไม่เกิดข้อมูลซ้ำ
- ข้อมูลเสีย/ไม่ครบจากต้นทาง → เข้า review queue ไม่ทำ pipeline ล้ม

**5. Public web**
- SSR ทุกหน้าป้าย · ราคาแปลงจากสตางค์ถูกต้อง · null = "สอบถามราคา"
- filter/URL sync · SEO/JSON-LD/sitemap · reduced-motion

รายงานเป็นตาราง: `| ด้าน | สถานะ | หลักฐาน/ไฟล์ |` แล้วแก้จุดที่ ❌ ให้เลย พร้อม test ที่พิสูจน์ว่าแก้แล้ว
