# Rule 05 — UI Standards (`04` §8.1, `06`)

- Mockup ใน `reference/` = **source of truth ด้าน UI** (โครงหน้า/Tailwind pattern) — แต่ business logic ยึด spec `.md` เสมอ · ออกแบบนอก pattern mockup ไม่ได้ถ้าไม่แก้ mockup คู่กัน
- Font: `'Inter', 'Noto Sans Thai', sans-serif` (400–700) · เลขอ้างอิง/รหัส (case ref, tax id, เลขบัญชี) ใช้ `font-mono`
- Theme slate/emerald · **statusBadge 10 กลุ่มสีตายตัว** (`04` §8.1) — ใช้ mapper กลาง ห้ามใช้สีสุ่มนอกระบบ
- Component classes มาตรฐาน (`04` §8.1): Card `bg-white rounded-xl border border-slate-200 shadow-sm p-6` · Table header `bg-slate-50 text-xs text-slate-600` · ปุ่ม Primary `bg-slate-900 text-white … rounded-lg text-xs font-semibold` — ใช้ shared components จาก UI Kit เท่านั้น
- โครงหน้า: Page → Header → Tabs/Filters → Table/KPI → Modal → Toast · **ทุกหน้าต้องมี loading / empty / error state**
- Modal destructive ต้อง confirm · คำบนปุ่มต้องตรง action · action สำคัญ (ส่งงาน/รับงาน/มอบหมาย/เปลี่ยนสถานะ) ต้องแสดงวันเวลาบน list ไม่ใช่ซ่อนใน audit
- เมนู/สิทธิ์เห็นเมนูตาม `06` §7.1.1 + §7.2 — ปุ่มที่ไม่มีสิทธิ์: กรณี Supervisor assign ที่ปิดด้วย settings = **hide** ไม่ใช่ disabled (`40` §7.2) · ทั่วไป hide/disable ตาม spec ของ module
- Field Tracker: Mobile กับ Desktop ใช้ logic เดียวกัน 100% (`41` §11) · Desktop sidebar 260px `position: fixed`
- วันที่บน UI = พ.ศ. เสมอ (ดู Rule 01)
