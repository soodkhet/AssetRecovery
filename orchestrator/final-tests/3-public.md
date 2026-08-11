# ด่าน 3/4 — เว็บสาธารณะ + SEO + performance

1. **SSR ถูกต้อง:** ทุกหน้าป้าย `/plate/{plate_key}` render ฝั่ง server · config ฝัง HTML แรก (กติกา 15 ห้าม hardcode ฟิลเตอร์/SUM_MEANINGS/settings)
2. **ราคา/สถานะ:** แปลงจากสตางค์ด้วย `Intl.NumberFormat('th-TH')` · null = "สอบถามราคา" (ห้าม ฿0) · สถานะป้ายใช้ `displayPlateStatus` · ตรวจสถานะสดก่อนเปิด LINE
3. **ฟิลเตอร์/URL:** filter/search/sort/pagination sync กับ URL ครบ · กลับมาหน้าเดิมได้จาก URL
4. **SEO:** JSON-LD (Article/FAQPage/Product ตามหน้า) · meta/OG · canonical · sitemap/robots · heading structure
5. **UX/a11y:** reduced-motion ปิดอนิเมชันครบ · responsive ตั้งแต่ 375px · สีทองบนพื้นสว่างใช้ goldDeep (AA)
6. **Performance:** Lighthouse budget (12 §6) · รูป/asset ไม่บวมเกินงบ

รายงานตาราง `| หัวข้อ | สถานะ | หลักฐาน |` แล้วแก้จุดที่ ❌
