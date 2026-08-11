# ด่าน 6 — Phase V2 เท่านั้น (สโคปตามคำสั่ง Boonphone 2026-07-31: ไม่ต้องไล่เทสต์ทั้งระบบซ้ำ)

ทดสอบเฉพาะฟีเจอร์ที่เกิดใน Phase V2 (สเปค = `docs/18_FEATURE_BACKLOG.md`) ด้วย integration/unit test จริง + เปิดใช้งานจริงผ่าน dev server เมื่อจำเป็น — **ห้ามรื้อเทสต์ด่าน 1–5 มารันใหม่ทั้งชุด** (ของเดิมผ่านแล้ว; แตะเฉพาะจุดที่ V2 ไปแก้):

1. **Sync lifecycle (V2.1a/b):** sold คงอยู่แม้หายจาก source · relist → available โดย log/order เดิมครบ · ป้าย sold-มี-Order ไม่ถูกพลิกอัตโนมัติ (เข้า review) · reserved ต้นทางไม่ import · source-sold แสดง "ขายแล้ว" โดยไม่มี Order · dedupe ข้ามร้าน: Order ชนะ > ราคาแพงสุด > พบก่อน · แถบขายแล้วหลังบ้าน badge/กรองแยกสองแบบถูกต้อง
2. **หน้าแรก (V2.2a/b):** มุมมอง "ประเภท" 14 section เรียงตามสเปค + ป้ายอยู่ได้หลาย section + "ทั้งหมด" เดิมไม่พัง · sort 5 แบบ default `number_asc` + URL sync · facet count จริงจาก endpoint (หนี้ `facetCounts` ปิดแล้วจริง)
3. **การ์ด/Detail (V2.3a/b):** view count นับ unique ถูก ไม่ leak ผ่าน DTO · "กำลังดู" window 5 นาที · ริบบิ้นแดง "ขายแล้ว" + ส้ม "ติดจอง" มุมขวาล่าง ทุก surface (การ์ด/detail/lightbox) + ใช้ semantic token ไม่ hardcode สี
4. **Wizard/ตัวกรอง (V2.4 = W3):** filter `birthDay` ครบท่อ (contracts+REST+URL+chips) · apply ทั้งกลุ่ม · sort "เข้ากับดวงที่สุด" client-only ไม่หลุดขึ้น server (SEC-08) · sum/งบประมาณบนแถบกรอง desktop · งบบนสุด mobile · หัวข้อ "เลขที่ต้องไม่มี" แยกแล้วใช้ได้จริง
5. **อัปโหลดตั้งค่า (V2.5):** โลโก้เข้าหัวเอกสาร PDF · favicon ขึ้นเว็บ · ใบทะเบียนพาณิชย์ขึ้นหน้าเกี่ยวกับเรา — ทั้งสามผ่าน gate แบบ P.10 (ลอง fileId ถังอื่น/ไม่ ready → 404, กัน enumerate)
6. **AI บทความ (V2.6):** โหมด AI เขียนเติมครบทุกช่อง + ปก/รูปแทรก + alt · self-check ผ่าน scoreArticle/scoreAiArticle · ยัง draft-only · editor ไม่เปิดช่อง XSS (ลอง payload ผ่าน sanitize)
7. **Chatbot settings (V2.7):** เรทลดราคาเก็บ bps/สตางค์ BIGINT · scope ข้อมูลที่ bot เข้าถึง = PublicPlateDTO เท่านั้น (ทดสอบว่า config ไม่เปิดทางเห็น partner/การเงิน)
8. **Hero CMS (V2.8):** hero มาจาก `cms_pages(home)` แก้จากแอดมินแล้วเว็บเปลี่ยน · ไม่มี literal ค้างใน `HomeShell`
9. **สถิติฝั่งเว็บ (V2.9):** ไม่กรอก keys = ไม่มี tag โหลดเลย · กรอกแล้ว tag โหลด**หลัง consent เท่านั้น** · GSC meta render เมื่อมีค่า · dedupe event_id browser↔server ตรงกัน
10. **Regression ขอบสัมผัส:** `pnpm test` เต็มชุดเขียว (ยืนยันของเดิมไม่พัง — รันครั้งเดียวพอ) + leak tests + `pnpm parity` ถ้าแตะ UI

รายงานตาราง `| หัวข้อ | สถานะ | หลักฐาน (ไฟล์/เทสต์) |` แล้วแก้จุดที่ ❌ พร้อม test ที่พิสูจน์ในก้อนเดียวกัน
