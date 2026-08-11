# RTB Dev Panel

แผงควบคุม dev แบบกดปุ่ม — เปิด/ปิดบริการ, docker Postgres, migrate/seed, typecheck/test/build
โดยไม่ต้องพิมพ์คำสั่งใน terminal เอง (โหลด `.env` + cd + `ulimit` ให้อัตโนมัติ)

## วิธีเปิด

ดับเบิลคลิกไฟล์ **`เปิด RTB Dev Panel.command`** ที่โฟลเดอร์หลักของโปรเจค
(macOS ครั้งแรกอาจถามยืนยัน → คลิกขวา > Open ครั้งเดียว)

หรือสั่งเอง:

```
node tools/devpanel/server.mjs
```

แล้วเปิดเบราว์เซอร์ไปที่ http://localhost:4600

## ปุ่มมีอะไรบ้าง

- **🚀 เปิดครบพร้อมใช้** — เปิด Postgres → API → หน้าบ้าน + หลังบ้าน ให้ตามลำดับ (รอ ~10 วิ)
- **บริการ** — เปิด/หยุด API (3001) · หน้าบ้าน (3000) · หลังบ้าน admin (5173) · worker + ปุ่ม "เปิดเว็บ"
- **Postgres** — เปิด/ปิด docker + เปิด Drizzle Studio
- **จัดการข้อมูล** — db:migrate · seed demo · clear demo
- **ตรวจสุขภาพโค้ด** — typecheck · test · build (ตั้ง ulimit + env ให้เอง)

ทุกปุ่มมีคำอธิบายว่าใช้ตอนไหนอยู่ในหน้า + มี log สดด้านล่าง

## หมายเหตุ

- เครื่องมือ dev ล้วน — เซิร์ฟเวอร์ bind `127.0.0.1` เท่านั้น (เครื่องตัวเองเข้าได้คนเดียว) ไม่ ship production
- ไม่มี dependency ภายนอก (ใช้แต่ core modules ของ Node)
- ปิดหน้าต่าง Terminal = ปิดแผง + ปิดบริการที่แผงเปิดไว้ทั้งหมด
- เปลี่ยนพอร์ตแผงได้ด้วย env `PANEL_PORT`
