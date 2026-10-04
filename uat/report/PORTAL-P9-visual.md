# PORTAL-P9 — ตรวจด้วยตา: วางบิล + ใบกำกับภาษี (อ่านอย่างเดียว)

วันที่ 05/10/2569 · dev server http://localhost:3000 (portal ตอบ 307→login/200 ปกติ) · สคริปต์ `uat/bin/probe-portal-p9.mjs` (ใช้ session `uat/.auth/` เท่านั้น ไม่พิมพ์รหัสผ่าน)

| # | ข้อ | ผล |
|---|---|---|
| 1a | co1.mgr `/portal/billing` desktop — ตาราง 1 รอบ "ตุลาคม 2569" ยอดรวม ฿3,991.10 · ชำระแล้ว ฿3,879.20 · ค้าง "—" · ครบกำหนด 03/11/2569 · ส่งบิล 04/10/2569 02:23 · สถานะ "รับชำระครบ" · KPI ยอดค้างรวม ฿0.00 / ค้าง 0 รอบ / ทั้งหมด 1 | ✅ |
| 1b | billing mobile — แสดงแบบการ์ด ข้อมูลครบ ไม่มี horizontal scroll | ✅ |
| 1c | `/portal/tax-invoices` — INV-0001 · 04/10/2569 · ฿3,730.00 / VAT ฿261.10 / ฿3,991.10 · "ใช้งาน" ตรงกับ API (373000/26110/399110 satang) · mobile ไม่ล้น | ✅ |
| 1d | ดาวน์โหลด PDF → `uat/fixtures/downloads-PORTAL-P9/INV-0001.pdf` (15,250 B, ขึ้นต้น `%PDF-`) | ✅ |
| 1e | `/portal` mobile กราฟรายได้ — ป้ายเดือนสั้นถูก ("พ.ค. 69"…"ต.ค. 69") แต่**ป้ายแกน X ซ้อนกัน** | 🐞 |
| 2 | co1.sup — เมนูมีแค่ ภาพรวม/เคส/ใบส่งมอบ/ข้อมูลบริษัท · เปิด billing/tax-invoices ตรง → กลับ `/portal` · API tax-invoices = 403 | ✅ |
| 3 | co2.admin — เมนูมีแค่ ภาพรวม/เคส/ข้อมูลบริษัท · URL ตรง → กลับ `/portal` | ✅ |
| 4 | console error = 0 ทุก persona · `/api/portal/*` ไม่มี 4xx/5xx ที่ไม่คาด (403 ของ sup = คาดไว้) · pm2 log ไม่มี 500 ของ portal (มีแค่ PERMISSION_DENIED ของรายงานเมื่อ 04/10 และ "destination stream closed early" 01:42 หลัง Fast Refresh — ไม่เกี่ยวรอบนี้) | ✅ |

## บั๊ก / ข้อสังเกต
- **🐞 P9-V1 (Low)** — กราฟ "ยอดเรียกเก็บค่าบริการ — 6 เดือนย้อนหลัง" บน mobile (iPhone 14): ป้ายแกน X หมุนแค่ -15° แต่ละป้ายกว้าง ~39px ขณะระยะห่าง tick ~27px → ทับกัน ~12px ทุกคู่ (เช่น "69" ของ พ.ค. ทับ "มิ.ย.") · ภาพ `uat/shots/PORTAL-P9/10-chart-mobile-zoom.png`, `04-overview-mobile.png` · แนวแก้: หมุน -35/-45° + เพิ่มความสูงแกน หรือใช้ interval/ป้ายแค่ชื่อเดือนบนจอแคบ
- **ข้อสังเกต (UX, Low)** — billing: "ชำระแล้ว ฿3,879.20" น้อยกว่ายอดรวม ฿3,991.10 อยู่ ฿111.90 (= WHT 3% ของ ฿3,730) แต่สถานะ "รับชำระครบ" และค้าง "—" โดยไม่มีคำอธิบายว่าส่วนต่างคือภาษีหัก ณ ที่จ่าย — ลูกค้าอาจสับสน · ควรมีคอลัมน์/หมายเหตุ WHT (ให้ PO ตัดสิน)
- หมายเหตุ: endpoint จริงคือ `/api/portal/billing-batches` (ไม่ใช่ `/api/portal/billing`)

## ภาพ
`uat/shots/PORTAL-P9/` — 01-billing-desktop · 02-tax-desktop · 03-overview-desktop · 04-overview-mobile · 05-billing-mobile · 06-tax-mobile · 07-sup-overview · 08-sup-after-redirect · 09-co2-overview · 10-chart-mobile-zoom
