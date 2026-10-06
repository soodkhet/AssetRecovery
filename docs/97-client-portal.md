# 97-client-portal.md

# 97 — Client Portal (พอร์ทัลบริษัทไฟแนนซ์)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: **Draft — Spec/Mockup Ready** (เขียนสเปคและจะทำ HTML Mockup ต่อ — **ยังไม่ implement จริง** รอ Product Owner ยืนยัน Phase ก่อน deploy — ดู §22)
> Document Level: Platform Module — Pre-Build Spec
> เอกสารอ้างอิง: `07-roles-permissions.md` §5.3 (Finance Company Role Group), `10-finance-companies.md` §7.2 (Company User entity), `38-case-submission.md` (Case), `40-case-assignment-routing.md` / `41-field-tracker-mobile.md` (Field status), `19-revenue-billing-receivable.md` (Billing/AR), `31-accounting-sales-and-receipts.md` (Tax Invoice), `44-asset-custody-handover.md` (HandoverLot), `96-reports.md` (F2/F3), `06-menu-and-navigation-map.md`, `DECISIONS-NEEDED.md` §1.2, `00-project-overview.md` §18, `93-roadmap-open-items.md`
> Supersedes: v3 (03/07/2569)

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | 03/07/2569 | สร้างไฟล์ใหม่ — ร่างเฉพาะส่วนที่ตัดสินใจแล้วจากไฟล์ 07/10 ส่วนที่เหลือปักเป็น Open Item ทั้งหมด |
| v2 | 03/07/2569 | **ขยายเป็น Build Spec ตามที่ Product Owner ยืนยัน scope ในรอบสนทนานี้**: (1) ตัด "ส่งเคสผ่านพอร์ทัล" ออกจาก scope ถาวร — คงช่องทาง API/import/manual ตามไฟล์ 38 เดิม ไม่แก้ไฟล์ 38 (2) เพิ่ม §5-20 เต็มรูปแบบ ครอบคลุม 4 หมวดที่ยืนยัน: ติดตามสถานะเคส (แบบสรุป 3 สถานะ ไม่ลงรายละเอียด field-side), เอกสารการเงิน/บัญชี (Billing/AR, ใบกำกับภาษี, ใบส่งมอบทรัพย์), รายงานสรุป (scope เฉพาะบริษัทตัวเอง) (3) ยืนยัน: ไม่เพิ่มสิทธิ์ผู้จัดการบริษัทเชิญ/ปิดใช้งาน Company User เอง — คงผ่าน Superadมิน เท่านั้นตามไฟล์ 10 เดิม ไม่แก้ไฟล์ 10 (4) Phase, Auth method, Notification channel, ความแตกต่างสิทธิ์ 3 ระดับย่อย — ยังเป็น Open Item เดิม (ดู §22) |
| v3 | 03/07/2569 | **ปรับจาก feedback บน HTML Mockup เวอร์ชัน Mobile**: (1) Dashboard (ภาพรวม) ตัดรายการเคสออก รวมเนื้อหา Reports (แนวโน้ม 6 เดือน + AR Aging) เข้ามาเป็นหน้าเดียว — ตัดเมนู "รายงานสรุป" ออกจาก nav (2) เพิ่มตัวกรองสถานะให้ Billing Batch และ HandoverLot (3) หน้าส่งมอบทรัพย์ (§6.4): เพิ่ม drill-down ดูรายการ+รายละเอียดทรัพย์ทีละชิ้นในแต่ละ Lot รวมรูปถ่าย 7 มุมตอนรับเข้าคลัง (4) §6.1 (เคสของเรา): เคสสถานะ "ติดตามสำเร็จ" อนุญาตให้แสดงรูปสินค้าตอนรับเข้าคลัง (Asset.photos จับคู่ผ่าน case_ref) เพิ่มเติมจากเดิม — ยังคง**ไม่แสดง**หลักฐานปิดงานภาคสนาม (checkins/GPS, videos, audio) เนื่องจากอ่อนไหวกว่า (5) label ฝั่ง UI ปรับให้เป็นมุมมองบริษัทไฟแนนซ์: "สรุปรายได้"→"สรุปยอดเรียกเก็บค่าบริการ", ประเภทส่งมอบ "มารับที่คลัง/จัดส่งให้"→"รับเอง/จัดส่ง", Billing card "รับแล้ว/ค้าง"→"ชำระแล้ว/ค้างชำระ" |
| v4 | 04/07/2569 | **กลับคำตัดสินใจ Layout เดิม (v1/§21) ตามคำสั่ง PO**: (1) เปลี่ยนจาก Sidebar ฝั่งซ้าย → Top Bar Nav แบบเดียวกับ Back Office ทุกโมดูล (`finance.html`/`settings.html`/`warehouse.html`) — header 64px + tab strip แนวนอน underline style (2) ยกเลิกการขยาย base font-size เป็น 18px เฉพาะพอร์ทัลนี้ กลับไปใช้ 16px มาตรฐานเดียวกับหน้าอื่น (3) ปรับ `badge()`/`kpi()` component ให้ใช้ Tailwind class ตรงกับ `statusBadge()`/`kpi()` ของ `finance.html`/`settings.html` เป๊ะ (text-[10px] badge, การ์ด KPI ขอบสี) (4) ย้ายข้อความ "แสดงเฉพาะข้อมูลบริษัท / โหมดดูอย่างเดียว" จาก sidebar footer เดิม → บรรทัดท้ายเนื้อหาแต่ละหน้าแทน (5) แก้ §5 ให้ตรงกับโครงสร้างเมนูจริงใน mockup (flat 6 เมนู ไม่มี "การเงิน" parent/"รายงานสรุป" ซ้อนแล้วตาม v3 ที่เคยตัดไปแต่ §5 เดิมยังไม่ได้อัปเดตตาม) — Mobile mockup (`97-client-portal-mobile-mockup.html`) **ไม่เปลี่ยน** ยังคง bottom-nav + hamburger ตามเดิม เพราะคำสั่งนี้ระบุเฉพาะเวอร์ชัน Desktop |
| v4.1 | 03/10/2569 | **มติ PO 03/10/2569 (UAT Q10 · BUG-033)** — §6.6 เพิ่มหมายเหตุ: ผู้ใช้บริษัทเห็นค่าบริการของเคสตัวเองครบ (โมเดล อัตรา ฐาน ยอด) ซ่อนเฉพาะข้อมูลภายใน (รหัส template, ผู้พิจารณา/เวลาพิจารณา) · ข้อจำกัด "ไม่แสดงอัตราละเอียด" คงไว้เฉพาะหน้าข้อมูล template ของบริษัท |
| v5 | 05/10/2569 | **มติ PO 05/10/2569 (U6 "ทำ Portal ให้เสร็จก่อน go-live" + O43 D1–D12)** — ปิด Open Item §22 ข้อ 1 (Phase: ก่อน go-live) และข้อ 4 (สิทธิ์ 3 ระดับ): (1) §3.3/§4/§11/§13 สิทธิ์แยกตามหมวดด้วย capability 5 ตัว `portal_cases`/`portal_finance`/`portal_handover`/`portal_profile`/`portal_download` (D1 — ค่าเริ่มต้น ผู้จัดการ = ทุกหมวด · หัวหน้า = ภาพรวม/เคส + ส่งมอบ + ข้อมูลบริษัท · แอดมิน = เคส + ข้อมูลบริษัท · Superadmin ปรับได้ ไม่ใช่ "✅ only") (2) ผู้ใช้บริษัทใช้พอร์ทัลทางเดียว ไม่เข้าหน้า/API ภายใน (D2) (3) §12 ตอบ 403 `PERMISSION_DENIED` ทั้ง id ที่ไม่มีจริงและ id ข้ามบริษัท + บันทึก audit action `access_denied` (D3/D4) (4) §12 `COMPANY_SUSPENDED` เป็น error code จริง (`24` §6.9) + ผู้ใช้ปิดใช้งานใช้ `ACCOUNT_INACTIVE` (แทน `USER_DEACTIVATED` เดิมที่ไม่มีใน `24`) ตรวจทุก request (D5) (5) §17 endpoint 11 → 13 ตัว เพิ่มรายละเอียดล็อต + รูปทรัพย์ (D6) (6) §6.3/§18 ใบกำกับภาษีใช้ renderer เดียวกับภายใน (D7) (7) §6.4/§18 ใบเซ็นรับดาวน์โหลดได้ (D8) (8) §6.2 นับเฉพาะ batch `sent` ขึ้นไป คำนวณสด (D9) (9) §4/§11/§13 Superadmin ไม่เข้าพอร์ทัล (D11) (10) §17 KPI ยึดตาม §5 (D12) |
| v5.2 | 05/10/2569 | **มติ PO 05/10/2569 (U6/O43 D6/D8 · O44) — Portal-P6 API ส่งมอบ + บังคับ GET-only**: §17 `GET /api/portal/handover-lots` รับตัวกรอง `status` (รหัสสถานะฝั่งพอร์ทัล `awaiting_dispatch`/`dispatched`/`delivered` คั่นจุลภาค — ไม่รับ enum ภายใน) · `dateFrom`/`dateTo` (วันที่สร้างล็อตตามปฏิทินไทย) · `search` (เลขล็อต/เลขใบส่งมอบ — ไม่ค้นด้วย IMEI) · `page`/`limit` · รายละเอียดล็อตไม่ส่ง IMEI/serial/path รูป (O44) · §18 ดาวน์โหลด = ไฟล์ใบส่งมอบที่มีลายเซ็นผู้รับ (`signed_doc_url`) ส่งผ่าน server (DEC-014) เฉพาะล็อต `confirmed` — ล็อตยังไม่ `confirmed` ตอบ 403 `PERMISSION_DENIED` + audit `access_denied` (§14) · ดาวน์โหลดสำเร็จลง audit `export` · §11 GET-only บังคับด้วยกฎ ESLint + test สแกนไฟล์ route ทุกตัว |
| v5.1 | 05/10/2569 | **มติ PO 05/10/2569 (U6/O43 D2/D3/D5/D11) — Portal-P3 guard**: §13 เพิ่มหมายเหตุ capability `view_own_company_data` เดิม (คงในทะเบียน/seed — ไม่ทับแถวเดิม — แต่ไม่เปิด route ภายในใดแล้ว) · §14 `access_denied` บันทึกทั้งการปฏิเสธระดับหมวด (`target_type = portal` + `after.section`) และระดับแถว (`target_type` = ตารางที่ร้องขอ · `after.cause` = `row_not_found`/`cross_company`) รวมถึง `ACCOUNT_INACTIVE`/`COMPANY_SUSPENDED` · login ของผู้ใช้บริษัทตรวจบริษัท active ด้วย (`05` v3.4) |
| v5.3 | 05/10/2569 | **Portal-P5 API การเงิน (มติ U6/O43 D7/D9/O44 — ไม่เปลี่ยนกติกา แค่บันทึกรายละเอียด implementation)**: `billing-batches`/`tax-invoices` กรอง `sent` ขึ้นไปทุกจุด (ใบกำกับของรอบที่ยัง draft/ถูกลบก็ไม่แสดง/ดาวน์โหลดไม่ได้ = 403 แบบ id สุ่ม) · ยอดค้าง = สูตรกลาง `22` §6.11 (หัก WHT ที่ลูกค้าหักแล้ว) · `tax-invoices/:id/download` ใช้ source+renderer ตัวเดียวกับ route ภายใน + audit `export` (`after.channel = portal`) · `reports/revenue-summary?months=1..12` (ค่าเริ่มต้น 6 เดือนปฏิทินไทยรวมเดือนปัจจุบัน) = loader/builder F2 ตัวเดิม scope บริษัท + เฉพาะรายได้ในรอบ `sent` ขึ้นไป · `reports/ar-aging` = loader/builder F3 ตัวเดิม scope บริษัท (ยอดหลัง Adjustment เท่ากับ AR ภายใน) · ทั้งสองคำนวณสดทุกครั้ง ไม่ผ่านแคชรายงาน |
| v5.4 | 05/10/2569 | **Portal-P4 (มติ U6/O43/O44) — API ชุดที่ 1 dashboard/เคส/ข้อมูลบริษัท/รูปทรัพย์**: §17 เติม "รายละเอียด endpoint ชุดที่ 1" ใต้ตาราง (query/response shape · ตัวกรองสถานะใช้รหัสฝั่งบริษัท · รูปทรัพย์ stream ผ่าน server ไม่ส่ง path/signed URL) · รูปทรัพย์เปิดได้ 2 ทาง (หมวดส่งมอบตามตาราง หรือหมวดเคสเฉพาะเคส "ติดตามสำเร็จ" ที่หน้ารายละเอียดเคส §6.1 แสดงจำนวนรูป — กันผู้ใช้ที่ไม่มีหมวดส่งมอบเห็นจำนวนรูปแต่เปิดไม่ได้) · ทรัพย์ของบริษัทตัวเองแต่ยังเปิดไม่ได้ → 403 เดียวกัน + audit `after.cause = asset_not_viewable` · index นอกช่วง → 404 `ASSET_NOT_FOUND` (ทรัพย์เป็นของผู้เรียกแล้ว ไม่ leak) · §6.6 หมายเหตุ v4.1 "เคสบริษัทอื่น = 404" ถูกแทนด้วย §12 (403 — D3) |
| v5.5 | 05/10/2569 | **มติ PO 05/10/2569 (U11/U13/U14)**: (1) U14 §6.2 — ยอดทุกจุดในพอร์ทัล (การ์ด AR ค้าง/ใบกำกับล่าสุด, รอบวางบิล, AR Aging, กราฟรายได้) ใช้**ยอดตามเอกสารที่ออกจริง** (ใบกำกับ − ใบลดหนี้) ผ่าน `documentedBillingAmounts()` จุดเดียว — Adjustment ภายในที่ยังไม่มีใบลดหนี้ไม่สะท้อน · รายงานภายในไม่เปลี่ยน (2) U11 §6.2 — คอลัมน์ "ภาษีหัก ณ ที่จ่าย (ลูกค้าหัก)" + หมายเหตุให้ส่ง 50 ทวิ ต้นฉบับ (DTO `customerWhtSatang`) (3) U13 §6.4/§17/§18 — เพิ่ม `GET /api/portal/handover-lots/:id/delivery-note` (ใบส่งมอบ PDF จากระบบ ตั้งแต่สร้างล็อต) และ `GET /api/portal/handover-lots/:id/delivery-proof` (หลักฐานการจัดส่ง เฉพาะ `we_deliver`) ⇒ §17 = **15 endpoint** |
| v5.6 | 05/10/2569 | **มติ PO U14 (fixer X3) — ต่อใบลดหนี้เข้ายอดตามเอกสาร**: (1) §6.2 — `documentedBillingAmounts()` หักใบลดหนี้ **active** ของใบกำกับทุกใบในรอบ (รวมใบกำกับที่ยกเลิกภายหลัง) ⇒ ยอดรอบวางบิล/ยอดค้าง/AR Aging/การ์ด AR ค้าง = ใบกำกับ − ใบลดหนี้ · ยกเลิกใบลดหนี้ ⇒ ยอดกลับ (2) กราฟรายได้ — ใบลดหนี้ที่ผูก Adjustment → รายได้ของเคส หักตรงรายได้นั้น (ไม่เกินยอดของใบ) ส่วนที่เหลือ/ไม่ผูกกระจายตามสัดส่วนยอดคงเหลือ (largest remainder — deterministic) (3) §6.3 — แต่ละใบกำกับแสดง "ลดหนี้ N ใบ · ยอดสุทธิ" + รายการใบลดหนี้ (เลขที่/วันที่/ก่อน VAT/VAT/รวม) · ยอดหน้าใบและ "ใบกำกับล่าสุด" ไม่หัก (ใบลดหนี้เป็นเอกสารแยก) · DTO ไม่มีเหตุผลภายใน/ผู้บันทึก/ไฟล์สแกน/Adjustment · ยังไม่มีดาวน์โหลดไฟล์สแกนใบลดหนี้ในพอร์ทัล |
| v5.7 | 05/10/2569 | **มติ PO U19 (fixer X4) — ใบเพิ่มหนี้เข้ายอดตามเอกสาร**: (1) §6.2 — `documentedBillingAmounts()` **บวก**ใบเพิ่มหนี้ active (ยอดตามเอกสาร = ใบกำกับ − ใบลดหนี้ + ใบเพิ่มหนี้) ทุกจุด: ยอดรอบวางบิล/ยอดค้าง/AR Aging/การ์ด AR ค้าง (2) กราฟรายได้ — ใบเพิ่มหนี้ที่ผูก Adjustment → รายได้ของเคส บวกตรงรายได้นั้น ส่วนที่ไม่ผูกกระจายตามสัดส่วนยอดคงเหลือ (largest remainder — วิธีเดียวกับใบลดหนี้) (3) §6.3 — แต่ละใบกำกับแสดงใบเพิ่มหนี้ active (เลขที่/วันที่/ก่อน VAT/VAT/รวม) คู่ใบลดหนี้ + ยอดสุทธิตามเอกสาร · DTO `debitNotes` ใช้ whitelist เดียวกับใบลดหนี้ (ไม่มีเหตุผลภายใน/ผู้บันทึก/ไฟล์สแกน/Adjustment) |
| v5.8 | 05/10/2569 | **มติ PO 05/10/2569 U59/U60/U62**: (1) U59 — เพิ่ม §13.1 โหมด "ดู portal ในฐานะลูกค้า" ของผู้ใช้ภายใน (ดูอย่างเดียว): capability ใหม่ `view_client_portal_as` (ค่าเริ่มต้น ธุรการ 👁️ · Superadmin โดยนิยาม · role ภายในอื่นมอบได้ ไม่ใช่ "✅ only") · หน้า `/portal/view-as/<companyId>/...` + `/api/portal/*?as=<companyId>` — ผู้ใช้ภายในยังเป็นตัวเอง (ไม่สลับ session) เห็นเหมือนผู้จัดการของบริษัท (ทุกหมวด + ดาวน์โหลด) · ผู้ใช้บริษัทส่ง `as` = 403 · บริษัทข้าม org/id มั่ว = 403 · บริษัทถูกระงับยังเปิดดูได้ (ป้ายบอกสถานะ) · ป้ายบนสุดทุกหน้า + ลิงก์กลับระบบภายใน · §4 เพิ่มผู้ดูภายใน · §11/§17 ลำดับตรวจโหมดนี้ · §14 audit `view_as` (enum ใหม่ `02` v4.23 — ครั้งแรกต่อ session ต่อบริษัท) + audit ดาวน์โหลด/ปฏิเสธระบุ `mode = view_as` (2) U60 (O44) — §6.2 แก้ถ้อยคำ outstanding = ยอดรวม − ชำระแล้ว − ภาษีที่ลูกค้าหัก ณ ที่จ่าย (ตามสูตรกลางที่ใช้จริง) (3) U62 (O47) — §6.2 เพิ่มเลขที่รอบวางบิล (`BB-<ปี พ.ศ.>-<เดือน>` สร้างจากรอบเดือน) + จำนวนเคส ตาม mockup · §6.3 บันทึกคอลัมน์ ก่อน VAT / VAT / รวม (snapshot `sales_records`) ที่หน้าใบกำกับแสดงอยู่แล้ว |
| v5.9 | 05/10/2569 | **มติ PO 05/10/2569 U76 — เลขรอบวางบิลจริง**: §6.2 `batch_number` ของพอร์ทัลอ่านจาก `billing_batches.batch_number` (`BL-<พ.ศ.>-NNN` ต่อองค์กร รีเซ็ตทุกปี — `02` v4.29) แทน `BB-<พ.ศ.>-<MM>` ที่ serializer สร้างจาก `period` (U62) · mockup `97-client-portal-mockup.html`/`-mobile-mockup.html` เปลี่ยนตัวอย่างเป็น `BL-` · ฟิลด์ยังอยู่ใน whitelist เดิม (ไม่ใช่ข้อมูลภายใน) |
| v5.x-DD | 07/10/2569 | **มติ PO 07/10/2569 (U151 · U154)**: ใบส่งมอบ PDF ที่ดาวน์โหลดจากพอร์ทัล (`delivery-note`) เป็นฉบับเดียวกับภายใน ⇒ พิมพ์ผู้ลงนามฝั่งผู้ส่งมอบ (ผู้มีอำนาจลงนามขององค์กร) และช่อง "ผู้รับมอบ" (ผู้ลงนามของบริษัทไฟแนนซ์) จาก snapshot ตอนยืนยันล็อต · ใบเสร็จ/ใบกำกับภาษีและใบแจ้งหนี้พิมพ์ผู้มีอำนาจลงนามจาก snapshot · (U154) ป้ายมูลหนี้ทุกจุดที่พอร์ทัลแสดง = "มูลหนี้คงเหลือ (บาท)" |
| v6.0 | 06/10/2569 | **มติ PO 06/10/2569 U95 + U96 #4/#11** — (1) §17 เพิ่ม `GET /api/portal/billing-batches/:id/invoice-pdf` (**ใบแจ้งหนี้/ใบวางบิล** PDF — ไม่ใช่เอกสารภาษี · `portal_finance` + `portal_download` · audit `export`) ⇒ §17 = **16 endpoint** (2) §6.3 รายการเอกสารภาษีแสดง **"ใบเสร็จรับเงิน/ใบกำกับภาษี"** (ออกตอนรับเงิน — ยอดตามเงินที่รับ) + ใบกำกับภาษีแบบเดิม · DTO เพิ่ม `documentTitle`, `billingBatchNumber` (whitelist) · ยอด/รูปแบบการส่ง/คู่ค้าอ่านจาก **snapshot บนใบ** (3) §6.2 ยอดตามเอกสาร = **ใบแจ้งหนี้** − ใบลดหนี้ + ใบเพิ่มหนี้ (ตัวตั้งคือยอดใบแจ้งหนี้ ณ วันวางบิล) · AR ภายในใช้ helper เดียวกันแล้ว (U96 #11) |
| v6.1 | 06/10/2569 | **UAT R14 BUG-162/164**: (1) กราฟ/ตาราง/การ์ดสะสมของรายงานรายได้เปลี่ยนป้ายเป็น **"ยอดวางบิล (ก่อน VAT)"** (เดิม "ยอดตามใบกำกับ") — หลัง U95 ใบเสร็จรับเงิน/ใบกำกับภาษีออกตอนรับเงิน แต่ยอดนี้นับตั้งแต่ส่งรอบวางบิล = ใบแจ้งหนี้ − ใบลดหนี้ + ใบเพิ่มหนี้ (นิยามเดียวกับยอดค้าง U14/U96 #11 — ไม่เปลี่ยนตัวเลข) + หมายเหตุใต้ตาราง · (2) PDF ใบแจ้งหนี้/ใบวางบิลในพอร์ทัลอ่านชื่อ/ที่อยู่/เลขผู้เสียภาษีจาก snapshot ตอนส่งรอบ (`19` v2.8) |
| v6.x-HC | 07/10/2569 | **มติ O74**: §10.3 ป้ายสถานะรอบวางบิล `paid` ที่ยอดตามเอกสารยังค้าง ⇒ "รับชำระบางส่วน" + `debitNoteOutstanding` (ป้าย "มีใบเพิ่มหนี้ค้าง") — code คงสถานะจริง |
| v5.x-CB | 07/10/2569 | **มติ PO U141** — audit `view_as` ลงด้วยเมื่อเรียก `/api/portal/*?as=<id>` ตรง (ไม่ผ่านหน้า) · ใช้กลไก "ครั้งแรกต่อ session ต่อบริษัท" ตัวเดียวกับหน้า (`lib/portal/view-as-audit.ts`) จึงไม่ลงซ้ำ · audit ล้มไม่ทำให้การดูล้ม |
| v6.2-GA | 07/10/2569 | **มติ PO U166 — ความจุ/สีของเครื่อง**: §6.4 รายละเอียดล็อตส่งมอบแสดงอุปกรณ์ "ยี่ห้อรุ่น · ความจุ · สี" ตามสัญญา (`GET /api/portal/handover-lots/:id` เพิ่ม `deviceCapacity`/`deviceColor`) + ใบส่งมอบ PDF พิมพ์รูปเดียวกัน · ผลตรวจ "สี/ความจุตรงกับสัญญา" ในคลังไม่ส่งออก |

ขอบเขตเอกสารนี้: พอร์ทัล **read-only** สำหรับ Company User ให้ดูสถานะเคส/เอกสารการเงิน-บัญชี/รายงานสรุปของบริษัทตัวเอง แทนการให้เจ้าหน้าที่ภายในส่งข้อมูลให้ทีละครั้ง — ไม่มีการสร้าง/แก้ไขข้อมูลใดๆ ผ่านพอร์ทัลนี้

**ไม่รวมอยู่ในไฟล์นี้**: การส่งเคส (ยังคงอยู่ที่ไฟล์ `38-case-submission.md` ผ่าน API/import/manual เท่านั้น — Company User **ไม่มี** direct access สร้างเคส), การสร้าง/จัดการ Company User (อยู่ที่ไฟล์ `10-finance-companies.md` §7.2 — Superadmin only, ไม่ทำซ้ำที่นี่), Workflow ภายในของเคส/การเงิน/บัญชี (อยู่ไฟล์ต้นทางแต่ละโมดูล — ไฟล์นี้อ้างอิงแบบ read-only view เท่านั้น)

---

## 1. Summary
พอร์ทัลสำหรับผู้ใช้งานฝั่งบริษัทไฟแนนซ์ (Company User) เข้าระบบเองเพื่อดูสถานะเคส เอกสารการเงิน/บัญชี และรายงานสรุปของบริษัทตัวเองแบบ read-only แทนการให้เจ้าหน้าที่ภายในส่งข้อมูลให้ทีละครั้ง

## 2. Purpose
ลดภาระงานฝั่งเจ้าหน้าที่ภายในที่ต้องคอยตอบคำถามสถานะเคส/ยอดวางบิลให้บริษัทไฟแนนซ์ด้วยตนเอง โดยให้บริษัทเข้าถึงข้อมูลที่ได้รับอนุญาตได้เองแบบ self-service ภายใต้ขอบเขตสิทธิ์ที่กำหนด

## 3. Scope

### 3.1 In Scope
- โครงสร้างสิทธิ์ 3 ระดับของ Company User (ผู้จัดการ/หัวหน้า/แอดมิน) — อ้างอิงไฟล์ 07 §5.3
- Entity `Company User` (id, company_id, name, email, phone, status) — อ้างอิงไฟล์ 10 §7.2
- หลักการ row-level scope ผ่าน `company_id`
- **ติดตามสถานะเคส** — มุมมองสรุป (ไม่ใช่ raw state machine) จากไฟล์ 38/40/41
- **เอกสารการเงิน/บัญชี** — Billing Batch + AR (ไฟล์ 19), ใบกำกับภาษี (ไฟล์ 31), ใบส่งมอบทรัพย์ (ไฟล์ 44)
- **รายงานสรุป** — Revenue Summary + AR Aging เฉพาะบริษัทตัวเอง (scope-down จากไฟล์ 96 §F2/§F3)
- ทุกหน้าจอเป็น **read-only** ทั้งหมด ไม่มี action สร้าง/แก้ไข/ลบ

### 3.2 Out of Scope (ยืนยันถาวร — ไม่ใช่ Open Item)
- **ส่งเคสผ่านพอร์ทัล** — ไม่ทำ ใช้ช่องทาง API/import/manual เดิมตามไฟล์ 38
- **Company User จัดการ Company User อื่นเอง** — ไม่ทำ คงผ่าน Superadmin ตามไฟล์ 10 §12
- **แก้ไขข้อมูลบริษัทตัวเอง** — ดูอย่างเดียว ต้องแจ้ง Admin ภายในให้แก้ (ตามไฟล์ 10 §5 เดิม)
- **สถานะ field-side ระดับละเอียด** (ชื่อ field agent, วันนัด, เส้นทาง, assigned/accepted/scheduled) — ไม่แสดง แสดงแค่สรุป 3 สถานะ (ดู §10.1)

### 3.3 รอการตัดสินใจ (ดู §22)
- Phase ที่จะเปิดใช้งาน (Phase 1 หรือ Phase 2)
- Authentication method
- Notification channel
- ~~ความแตกต่างของสิทธิ์เห็นข้อมูลระหว่าง 3 ระดับ~~ → **ตัดสินแล้ว (มติ PO 05/10/2569 O43 D1)**: แยกตาม**หมวดเมนู**ด้วย capability 5 ตัว (เก็บที่ `role_capabilities` ตามโมเดล 3 ระดับ DEC-009 — Superadmin ปรับได้ที่หน้าจัดการ Role · ไม่ใช่ "✅ only") — ทุกระดับยังเห็นข้อมูล **scope ทั้งบริษัทของตัวเอง** ในหมวดที่ได้สิทธิ์ (ไม่แบ่งย่อยระดับแถว)

| Capability | หมวด (เมนู / endpoint) | ผู้จัดการ | หัวหน้า | แอดมิน |
|---|---|---|---|---|
| `portal_cases` | ภาพรวม + เคสของเรา (`/dashboard`, `/cases*`) | 👁️ | 👁️ | 👁️ |
| `portal_finance` | รอบวางบิล/ยอดค้างชำระ + ใบกำกับภาษี + รายงานสรุป (`/billing-batches`, `/tax-invoices*`, `/reports/*`) | 👁️ | — | — |
| `portal_handover` | ใบส่งมอบทรัพย์ (`/handover-lots*`, `/assets/:id/photos/:index`) | 👁️ | 👁️ | — |
| `portal_profile` | ข้อมูลบริษัท (`/company-profile`) | 👁️ | 👁️ | 👁️ |
| `portal_download` | ดาวน์โหลดเอกสาร (`*/download`, รูปทรัพย์) — **ต้องมีสิทธิ์หมวดของเอกสารนั้นด้วย** | 👁️ | 👁️ | 👁️ |

> พอร์ทัลอ่านอย่างเดียวทั้งหมด ⇒ ระดับ `manage` มีผลเท่ากับ `view` · ไม่มี record = ไม่เห็นเมนูหมวดนั้นและ endpoint ตอบ 403 `PERMISSION_DENIED` · หน้า "ภาพรวม" แสดงเฉพาะการ์ด KPI ของหมวดที่มีสิทธิ์ (เช่น หัวหน้าไม่เห็นการ์ด AR ค้าง)

## 4. Actors & Responsibilities

|Actor / Role|Responsibilities|Access Scope|Role Group|
|---|---|---|---|
|ผู้จัดการ (Company Manager)|เห็นข้อมูลทั้งหมดของบริษัทตัวเอง (ทุกเคส, ทุกยอดวางบิล, ทุก user ของบริษัท)|Company scope — เต็มรูป|finance_company|
|หัวหน้า (Company Supervisor)|ภาพรวม + เคส + ใบส่งมอบ + ข้อมูลบริษัท — ไม่เห็นหมวดการเงิน (ค่าเริ่มต้นตาม §3.3)|Company scope — ตามหมวดที่ได้สิทธิ์|finance_company|
|แอดมิน (Company Admin)|ภาพรวม/เคส + ข้อมูลบริษัท (ค่าเริ่มต้นตาม §3.3)|Company scope — ตามหมวดที่ได้สิทธิ์|finance_company|
|Superadmin|สร้าง/แก้ไข Company User (ไฟล์ 10 §12) + ปรับสิทธิ์หมวดพอร์ทัลของ 3 role ที่หน้าจัดการ Role — **ไม่เข้าพอร์ทัลในฐานะผู้ใช้บริษัท** (มติ O43 D11: ไม่มีบริษัทของตัวเอง ⇒ `/portal` และ `/api/portal/*` ปฏิเสธ แม้ implicit manage ทุก capability) · เปิดดูพอร์ทัลของบริษัทใดก็ได้ผ่านโหมด §13.1 (โดยนิยาม)|global|system|
|ผู้ใช้ภายในที่ถือ `view_client_portal_as` (ค่าเริ่มต้น: ธุรการ)|เปิด "ดู portal ในฐานะลูกค้า" เพื่อช่วยลูกค้า — ดูอย่างเดียว เห็นเหมือนผู้จัดการของบริษัทนั้น (มติ U59 · §13.1)|บริษัทที่เลือก (org เดียวกัน) — ทีละบริษัท|system/inhouse/outsource|

> **ผู้ใช้บริษัทใช้พอร์ทัลทางเดียว** (มติ O43 D2) — role กลุ่ม `finance_company` ไม่เห็นเมนู/หน้า/API ภายใน (`06` §7.2 · `25` §7.3) · หลัง login ถูกส่งไป `/portal` เสมอ

## 5. Menu & Navigation

โครงสร้างเมนู: **Top Bar Nav** (v4 — เปลี่ยนจาก Sidebar ฝั่งซ้ายเดิม ให้ใช้ layout เดียวกับ Back Office ทุกโมดูล ตาม `finance.html`/`settings.html`/`warehouse.html` — header สูง 64px คงที่ด้านบน + แถบเมนูแนวนอนใต้ header แบบ underline tab (`border-b-2`) — ดู §21 การตัดสินใจ v4):

```
Header (สูง 64px, sticky): AssetRecovery + พอร์ทัลบริษัทไฟแนนซ์ · [ชื่อบริษัท]  |  ชื่อ user + role badge + logout
Tab Strip (แนวนอน ใต้ header):
├── ภาพรวม (Dashboard)          — สรุป KPI สั้นๆ 4 ใบ (เคสกำลังดำเนินการ/AR ค้าง/ใบกำกับภาษีล่าสุด/Lot รอส่งมอบ)
├── เคสของเรา                    — List + filter สถานะสรุป (ดู §10.1)
├── รอบวางบิล / ยอดค้างชำระ      — ไฟล์ 19 scope-down
├── ใบกำกับภาษี                  — ไฟล์ 31 scope-down
├── ใบส่งมอบทรัพย์               — ไฟล์ 44 scope-down
└── ข้อมูลบริษัท (ดูอย่างเดียว)   — ไฟล์ 10 §7.1 read-only
```

ข้อความ "แสดงเฉพาะข้อมูลของ [บริษัท] · โหมดดูอย่างเดียว (Read-only)" ย้ายจาก sidebar footer เดิม → แสดงเป็นบรรทัดเล็กท้ายเนื้อหาแต่ละหน้าแทน

Text size: ใช้ base font-size เดียวกับหน้าอื่น (16px มาตรฐาน — ยกเลิกการขยายเป็น 18px ที่เคยทำเฉพาะพอร์ทัลนี้ เพื่อความสอดคล้อง) badge/kpi component ใช้ class เดียวกับ `statusBadge()`/`kpi()` ของ `finance.html`/`settings.html` เป๊ะ (ดู `04-ui-ux-design-system.md` §8.1)

## 6. Data Requirements

### 6.1 เคสของเรา (จากไฟล์ 38)
| Field ที่แสดง | ที่มา | หมายเหตุ |
|---|---|---|
| case_ref | 38 §6.1 | เลขที่สัญญาที่บริษัทส่งมาเอง |
| debtor_name | 38 §6.1 | — |
| status_display | derived (ดู §10.1) | mapped label ไม่ใช่ raw enum |
| status_reason | 38 (`reject_case`/`request_more_info` reason) | แสดงเฉพาะสถานะ "ไม่รับเคส"/"ขอข้อมูลเพิ่มเติม" |
| created_at | 38 §6.1 | แสดงแบบ DD/MM/YYYY พ.ศ. |
| recycle_round | 38 §6.6 `tracking_round` | แสดงเฉพาะเคสที่เคย recycle |

**ไม่แสดง**: ชื่อ/เบอร์ field agent, ทีมที่มอบหมาย, วันนัดหมาย, เส้นทาง, **หลักฐานปิดงานภาคสนาม** (checkins/GPS, videos, audio ตามไฟล์ 41 §6.4), IMEI

**แสดงเพิ่มเติมสำหรับเคสสถานะ "ติดตามสำเร็จ" เท่านั้น** (v3): รูปสินค้า (`Asset.photos`) ที่แอดมินแนบตอนรับเข้าคลังตามไฟล์ 44 §7.1 — จับคู่ผ่าน `case_ref` — เป็นรูปคนละชุดกับหลักฐานปิดงานภาคสนามข้างต้น (ไม่มี GPS/วิดีโอ/เสียง เป็นภาพเครื่อง 7 มุมล้วนๆ) พร้อม `condition`/`condition_note` ถ้ามี

### 6.2 รอบวางบิล / AR (จากไฟล์ 19)
batch_number (เลขที่รอบวางบิล — มติ U62), period, case_count (จำนวนเคส — มติ U62), total_amount, received_amount, customer_wht (ภาษีหัก ณ ที่จ่ายที่ลูกค้าหัก — มติ U11), outstanding (= total − received − ภาษีที่ลูกค้าหัก ณ ที่จ่าย — สูตรกลาง `22` §6.11 · มติ U60/O44), status_display (`draft`→ไม่แสดง เพราะยังไม่ส่งบริษัท / `sent`/`partially_paid`/`paid`), due_date, sent_at

> **ยอดค้างชำระ** (มติ PO 05/10/2569 U60 · O44): ยอดค้าง = ยอดรวม − ชำระแล้ว − **ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักไว้** (ภาษีที่ลูกค้าหักถือว่าชำระแล้วในส่วนนั้น เมื่อส่งหนังสือรับรอง 50 ทวิ) — คำนวณด้วยสูตรกลางตัวเดียวกับ AR ภายใน (`arOutstandingSatang()`) ⇒ ยอดค้างในพอร์ทัลเท่ากับ AR ภายในของบริษัทเดียวกัน · ติดลบไม่ได้ (ต่ำสุด 0)
>
> **เลขที่รอบวางบิล + จำนวนเคส** (มติ U62 → **แก้โดยมติ U76** · mockup `renderBilling()`): เลขที่รอบ = **เลขจริงที่เก็บใน `billing_batches.batch_number`** รูปแบบ `BL-<ปี พ.ศ.>-<ลำดับ 3 หลัก>` ต่อองค์กร รีเซ็ตทุกปี พ.ศ. (เช่น `BL-2569-001` — เดินเลขตอนสร้างรอบ · ตัวเดียวกับที่หน้าภายในแสดง) — **เลิกใช้** `BB-<ปี พ.ศ.>-<เดือน>` ที่เคยสร้างจาก `period` (มติ U62) · จำนวนเคส = จำนวนรายการรายได้ที่ผูกรอบนั้น (1 เคส 1 รายการ)

> **Business Rule**: Billing Batch ที่ `status = draft` **ห้ามแสดงในพอร์ทัล** — บริษัทเห็นได้ตั้งแต่ `sent` เป็นต้นไปเท่านั้น เพราะ draft ยังไม่ถูกยืนยันความถูกต้องจากฝั่งเรา
>
> **ยอดทุกจุดในพอร์ทัล** (การ์ด AR ค้างบนภาพรวม, รายงานสรุป §6.5, AR Aging) **นับเฉพาะ batch ที่ `sent` ขึ้นไปและคำนวณสดทุกครั้ง** (มติ O43 D9) — ไม่ใช้แคชรายงานภายใน เพื่อไม่ให้ยอดของ draft รั่วเข้าตัวเลขรวม
>
> **ยอดตามเอกสารที่ออกจริง** (มติ PO 05/10/2569 U14 · ม.86/10): ยอดบิล/ยอดค้าง/AR Aging/กราฟรายได้ในพอร์ทัลใช้ยอดจากใบกำกับภาษีที่ออกแล้ว (snapshot `sales_records` — ก่อน VAT/VAT/รวม) หักใบลดหนี้ที่ออกแล้ว (เมื่อมีการบันทึกใบลดหนี้) ผ่านฟังก์ชันกลาง `documentedBillingAmounts()` จุดเดียว · **Adjustment ภายในที่ยังไม่มีใบลดหนี้ไม่สะท้อนในพอร์ทัล** · รายงานภายใน (F1/F2/F3 ฯลฯ) ยังใช้ยอดหลัง Adjustment ตามเดิม · กราฟรายได้ติดป้าย "ยอดวางบิล (ก่อน VAT)" (v6.1 — ใบแจ้งหนี้ − ใบลดหนี้ + ใบเพิ่มหนี้ · ใบเสร็จรับเงิน/ใบกำกับภาษีออกเมื่อรับชำระ)
>
> **ภาษีหัก ณ ที่จ่ายที่ลูกค้าหัก** (มติ U11): หน้ารอบวางบิลแสดงคอลัมน์ "ภาษีหัก ณ ที่จ่าย (ลูกค้าหัก)" จากยอดที่บันทึกตอนรับเงิน ⇒ ยอดรวม = ชำระแล้ว + ลูกค้าหัก + ค้างชำระ · เมื่อมียอดลูกค้าหัก แสดงหมายเหตุเตือนให้ส่งหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ต้นฉบับ

### 6.3 ใบกำกับภาษี (จากไฟล์ 31)
invoice_number, issue_date, total_before_vat (ก่อน VAT), vat_amount (VAT), total_amount (รวม) — จาก snapshot `sales_records` ตอนออกใบ (มติ U62/O47 · ลูกค้าใช้ยื่นภาษีซื้อ), delivery_format, status (`active`/`cancelled`), ใบลดหนี้ active ที่อ้างถึงใบนั้น (credit_note_number, issue_date, ก่อน VAT/VAT/รวม + ยอดสุทธิ — มติ U14 v5.6), ปุ่มดาวน์โหลด PDF — PDF สร้างด้วย **renderer เดียวกับฝั่งภายใน** (มติ O43 D7 — เอกสารต้องเหมือนฉบับที่ฝ่ายบัญชีเห็นทุกตัวอักษร ห้ามทำ template แยกของพอร์ทัล)

### 6.4 ใบส่งมอบทรัพย์ (จากไฟล์ 44)
lot_number, doc_ref, type (`finance_pickup`/`we_deliver`), status_display (ดู §10.2), จำนวนเครื่องใน Lot, ปุ่มดาวน์โหลดใบส่งมอบ (เฉพาะ Lot ที่ `confirmed` แล้ว)

> **Business Rule**: Lot ที่ `pending_attach`/`pending_delivery_proof` แสดงได้ (สถานะ "รอดำเนินการส่งมอบ") แต่ปุ่มดาวน์โหลดเอกสารจะ disable จนกว่าจะ `confirmed`
>
> **เอกสารเพิ่ม** (มติ PO 05/10/2569 U13): นอกจากใบเซ็นรับ — (1) **ใบส่งมอบ PDF จากระบบ** (เลข DLV-…) render ด้วย renderer เดียวกับภายใน มี IMEI (เอกสารของบริษัทเอง) ดาวน์โหลดได้**ตั้งแต่สร้างล็อต** (2) **หลักฐานการจัดส่ง** เฉพาะล็อตแบบเราส่ง (`we_deliver`) ที่แนบแล้ว · ทั้งสองต้องมี `portal_handover` + `portal_download` · id ข้ามบริษัท = 403 + audit · ดาวน์โหลดสำเร็จลง audit `export`
>
> **รายละเอียดล็อต + รูปทรัพย์** (มติ O43 D6): เปิดดูรายการทรัพย์ในล็อตและรูปทรัพย์ได้ (`GET /api/portal/handover-lots/:id`, `GET /api/portal/assets/:id/photos/:index`) · **ใบเซ็นรับที่แนบในล็อต (มี IMEI) ดาวน์โหลดได้** เพราะเป็นเอกสารของบริษัทเอง (มติ O43 D8)
>
> **ความจุ/สีของเครื่อง** (v6.2-GA · มติ PO U166): รายการทรัพย์ในล็อตแสดงอุปกรณ์เป็น "ยี่ห้อรุ่น · ความจุ · สี" ตามสัญญา (`device_capacity`/`device_color` — ข้อมูลที่บริษัทส่งมาเอง) และใบส่งมอบ PDF พิมพ์รูปเดียวกัน · ผลติ๊ก "สี/ความจุตรงกับสัญญา" ตอนรับเข้าคลัง (`color_capacity_matched`) เป็นข้อมูลปฏิบัติการภายใน **ไม่ส่งออก**พอร์ทัล

### 6.5 รายงานสรุป
- Revenue Summary: รายเดือน — รายได้รวม, จำนวนเคส, success/fail, revenue/เคสเฉลี่ย (scope เฉพาะบริษัทตัวเอง จากไฟล์ 96 §F2)
- AR Aging: buckets 0-30/31-60/61-90/90+ วัน (scope เฉพาะบริษัทตัวเอง จากไฟล์ 96 §F3)

### 6.6 ข้อมูลบริษัท (read-only)
ชื่อบริษัท, tax_id, ที่อยู่, ผู้ติดต่อ, ผู้ลงนาม, Service Fee Template ที่ผูกอยู่ (ชื่อ+model เท่านั้น ไม่แสดงอัตราละเอียด) — จากไฟล์ 10 §7.1

> **ค่าบริการระดับเคส (v4.1 — มติ PO 03/10/2569 UAT Q10 · BUG-033)**: ข้อจำกัด "ไม่แสดงอัตราละเอียด" ข้างบนใช้กับ *template* ที่ผูกกับบริษัทเท่านั้น — สำหรับ **เคสของบริษัทตัวเอง** ผู้ใช้ฝั่งบริษัทเห็นค่าบริการที่ snapshot ไว้ในเคส**ครบ**: โมเดล, อัตรา (%), ฐาน (บาท), เกณฑ์คำนวณ, คิดเมื่อไม่สำเร็จหรือไม่ และยอดประมาณการ · ซ่อนเฉพาะข้อมูลภายใน: รหัส/ชื่อ template ที่ใช้คิด, ผู้พิจารณา/เวลาพิจารณา/บันทึกของผู้พิจารณา, ทีม, ประวัติแก้ไข, ชื่อพนักงานหลังบ้าน · ใช้ serializer ฝั่งบริษัทตัวเดียวกันทั้งรายการและรายละเอียด · เคสบริษัทอื่น/id ที่ไม่มีจริง = 403 `PERMISSION_DENIED` แบบเดียวกัน ไม่ leak (§12 — มติ O43 D3 แทน 404 เดิม)

## 7. UI Requirements

- Layout ใช้ **Top Bar Nav เดียวกับ Back Office ทุกโมดูล** (v4 — ดู §5, §21) — ใช้ design token เดียวกันตาม `04-ui-ux-design-system.md` §8.1 (สี, font, badge, table/card component) เพื่อความสอดคล้องของแบรนด์ทั้งระบบ
- KPI card, table, badge pattern **reuse โครงสร้างเดียวกับ** `finance.html` (แท็บรายได้และวางบิล), `accounting.html` (modal ดูใบกำกับภาษี), `warehouse.html` (แท็บส่งมอบแล้ว), `reports.html` (F2/F3) — แต่ตัดคอลัมน์/ปุ่มที่เป็น internal action ออกทั้งหมด (ไม่มีปุ่มแก้ไข/ออกเอกสาร/จับคู่ ฯลฯ)
- Badge สถานะเคสใช้ชุดสีใหม่เฉพาะพอร์ทัลนี้ (ดู §10.1) ไม่ใช้ badge map เดิมของ `38-case-submission-mockup.html` เพราะ label ต่างกัน
- Top bar แสดงชื่อบริษัท + ชื่อผู้ใช้ + ปุ่ม logout เท่านั้น (ไม่มี notification bell จนกว่าจะตัดสินใจ channel — ดู §22)

## 8. Actions & Buttons

| Action | Trigger | Behavior | Permission |
|---|---|---|---|
| view_case_list | เมนู "เคสของเรา" | list + filter (status_display, ค้นหา case_ref/ชื่อลูกหนี้) | Company User (ทุกระดับ) |
| view_case_detail | คลิกแถว | เปิด drawer แสดงรายละเอียดตาม §6.1 | Company User |
| view_billing | เมนู "รอบวางบิล" | list (เฉพาะ `sent`+) | Company User |
| download_tax_invoice | ปุ่มดาวน์โหลดในแถวใบกำกับภาษี | โหลด PDF จาก Supabase Storage | Company User |
| download_handover_doc | ปุ่มดาวน์โหลดใน Lot ที่ `confirmed` | โหลด PDF ใบส่งมอบ | Company User |
| view_reports | เมนู "รายงานสรุป" | แสดง Revenue Summary / AR Aging scope ตัวเอง | Company User |

> ไม่มี action สร้าง/แก้ไข/ลบใดๆ ในพอร์ทัลนี้ทั้งหมด — ทุก action เป็น GET/download เท่านั้น

## 9. Workflow

```
Company User login → Dashboard (สรุป KPI) → เลือกเมนู → List/Filter → (ถ้ามี) ดูรายละเอียด/ดาวน์โหลดเอกสาร
```

ไม่มี multi-step workflow เพราะเป็น read-only ทั้งหมด

## 10. Status / State Machine

### 10.1 Case Status Mapping (ใหม่ — เฉพาะพอร์ทัลนี้ ไม่ใช่ state machine ใหม่ แค่ label mapping)

| Internal state (ไฟล์ต้นทาง) | Label ที่บริษัทเห็น | สี Badge |
|---|---|---|
| `draft`/`pending_review` (38) | อยู่ระหว่างตรวจสอบ | slate |
| `need_info` (38) | ขอข้อมูลเพิ่มเติม (ต้อง action) | purple |
| `rejected` (38) | ไม่รับเคส | red |
| `approved` (38) + ทุก assignment/field sub-state ที่ไม่ terminal รวม `needs_revision`, `pending_recycle_review` | กำลังดำเนินการติดตาม | amber |
| field `closed_success` (terminal, ไม่ถูกตีกลับ) | ติดตามสำเร็จ | emerald |
| field `closed_fail` (terminal, ไม่มี recycle ค้าง) | ติดตามไม่สำเร็จ | slate (outline) |

> Mapping นี้ประมวลผลที่ backend (ไม่ใช่ frontend) เพื่อไม่ให้ portal เห็น raw enum ของ 38/40/41 เลย

### 10.2 HandoverLot Status Mapping
| Internal (44) | Label ที่บริษัทเห็น |
|---|---|
| `pending_attach` | รอดำเนินการส่งมอบ (รอเราแนบเอกสาร) |
| `pending_delivery_proof` | จัดส่งแล้ว รอยืนยัน |
| `confirmed` | ส่งมอบสำเร็จ — ดาวน์โหลดเอกสารได้ |

### 10.3 Tax Invoice / Billing Batch
ใช้ status เดิมจากไฟล์ 31/19 ตรงๆ ได้เลย (`active`/`cancelled`, `sent`/`partially_paid`/`paid`) ไม่ต้อง map เพราะคำเหล่านี้เป็นคำที่ภายนอกเข้าใจอยู่แล้ว — ยกเว้น `draft` ของ Billing Batch ที่ไม่แสดงเลยตาม §6.2

**มติ O74** — ป้ายรอบวางบิลสะท้อน**ยอดตามเอกสาร**: รอบ `paid` ที่ยังค้าง > 0 (ใบเพิ่มหนี้หลังรับชำระครบ) ⇒ `statusDisplay.label` = "รับชำระบางส่วน" (tone `partial`) โดย `statusDisplay.code` คง `paid` (ตัวกรองอิงสถานะจริง) + DTO `debitNoteOutstanding: true` ⇒ หน้าจอแสดงป้ายเสริม "มีใบเพิ่มหนี้ค้าง" · ป้ายชุดเดียวกับหน้าภายใน (ไฟล์ 19 §8)

## 11. Business Rules

- **Row-level scope ผ่าน `company_id` บังคับทุก query** — middleware ต้อง inject `WHERE company_id = :current_user.company_id` ทุก endpoint ของพอร์ทัลนี้ ไม่มีข้อยกเว้น
- **ทุก endpoint เป็น read-only (GET เท่านั้น)** — ห้ามมี POST/PATCH/DELETE ใดๆ ในพอร์ทัลนี้
- **Billing Batch `draft` ต้องถูกกรองออกเสมอ** ก่อนถึง response (ดู §6.2)
- **ไม่ expose raw enum ของ case/assignment/field status** — ต้อง map เป็น label ตาม §10.1 เสมอที่ backend
- **สิทธิ์ 3 ระดับแยกตามหมวด** ด้วย capability `portal_*` (§3.3 · มติ O43 D1) — ตรวจที่ API layer ทุก endpoint (สิทธิ์หมวด + `company_id` + สถานะผู้ใช้/บริษัท ทุก request) · UI ซ่อนเมนูเป็นแค่ UX
- **Superadmin ไม่เข้าพอร์ทัล** (มติ O43 D11) · ผู้ใช้บริษัทไม่เข้าหน้า/API ภายใน (มติ O43 D2)
- **ยกเว้นโหมด "ดู portal ในฐานะลูกค้า"** (มติ U59 · §13.1) — ผู้ใช้ภายในที่ถือ `view_client_portal_as` เปิดดูพอร์ทัลของบริษัทที่ระบุได้ทีละบริษัท (scope `company_id` = บริษัทนั้น · ทุกกติกาข้างบนยังใช้ครบ: GET เท่านั้น · กรอง `draft` · map label) — ผู้ใช้บริษัทใช้โหมดนี้ไม่ได้ (ห้ามใช้ข้ามบริษัท)
- **ห้ามมีปุ่ม/endpoint สร้างเคสในพอร์ทัลนี้เด็ดขาด** — ผูกกับการตัดสินใจถาวรใน §3.2

## 12. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| PERMISSION_DENIED | Company User เข้าถึงข้อมูลของ `company_id` อื่น **หรือ id ที่ไม่มีอยู่จริง** หรือหมวดที่ไม่มีสิทธิ์ (§3.3) | reject 403 **แบบเดียวกันทุกกรณี** (ไม่ตอบ 404) — ไม่ leak ว่ามีข้อมูลนั้นอยู่จริงหรือไม่ + บันทึก audit `access_denied` (มติ O43 D3/D4 · §14) |
| COMPANY_SUSPENDED | บริษัทที่ user สังกัดมีสถานะไม่ใช่ `active` (ไฟล์ 10) | reject 403 **ทุก request** (ไม่ใช่เฉพาะตอน login) พร้อมข้อความให้ติดต่อผู้ให้บริการ — code ใน `24` §6.9 (มติ O43 D5) |
| ACCOUNT_INACTIVE | Company User ถูกปิดใช้งาน (ไฟล์ 10 §7.2) | reject 403 ทุก request — ใช้ code เดิมของ `24` §6.9 (แทน `USER_DEACTIVATED` ที่ไม่มีใน dictionary — มติ O43 D5) |
| NO_DATA | ไม่มีข้อมูลในหมวดนั้น (เช่น ยังไม่มีเคสเลย) | แสดง empty state ปกติ ไม่ใช่ error |

## 13. Permissions

ค่าเริ่มต้น (มติ PO 05/10/2569 O43 D1 — ปรับได้ที่หน้าจัดการ Role · รายละเอียด capability ↔ endpoint ดู §3.3):

| Capability | ผู้จัดการ | หัวหน้า | แอดมิน | Superadmin |
|---|---|---|---|---|
| `portal_cases` — ภาพรวม + เคสของบริษัทตัวเอง | 👁️ | 👁️ | 👁️ | — (ไม่เข้าพอร์ทัล — D11) |
| `portal_finance` — Billing/AR + ใบกำกับภาษี + รายงานสรุป | 👁️ | — | — | — |
| `portal_handover` — ใบส่งมอบ + รายการ/รูปทรัพย์ในล็อต | 👁️ | 👁️ | — | — |
| `portal_profile` — ข้อมูลบริษัท (ดูอย่างเดียว) | 👁️ | 👁️ | 👁️ | — |
| `portal_download` — ดาวน์โหลดเอกสารของหมวดที่เห็น | 👁️ | 👁️ | 👁️ | — |
| ปรับสิทธิ์หมวดพอร์ทัลของ 3 role | ❌ | ❌ | ❌ | ✅ (หน้าจัดการ Role) |
| แก้ไขข้อมูลบริษัท/จัดการ Company User | ❌ (ต้องแจ้ง Superadmin) | ❌ | ❌ | ✅ (ที่ไฟล์ 10) |

### 13.1 ดู portal ในฐานะลูกค้า (ผู้ใช้ภายใน — มติ PO 05/10/2569 U59)

| หัวข้อ | กติกา |
|---|---|
| Capability | `view_client_portal_as` (นอก Functional Matrix · module `portal`) — ค่าเริ่มต้น **ธุรการ 👁️** · Superadmin โดยนิยาม · role ภายในอื่นมอบได้ที่หน้าจัดการ Role (ไม่ใช่ "✅ only") · อ่านอย่างเดียว ⇒ `manage` = `view` · role กลุ่ม `finance_company` ถูกผูกก็ไม่มีผล |
| ทางเข้า | ปุ่ม "เปิด portal ของลูกค้า" บนการ์ดบริษัท (ตั้งค่า → บริษัทไฟแนนซ์) → แท็บใหม่ `/portal/view-as/<companyId>` · ธุรการที่ถือสิทธิ์นี้เห็นแท็บ "บริษัทไฟแนนซ์" แบบอ่านอย่างเดียว (`06` §7.2 v2.7) |
| กลไก | **ไม่สลับ/ปลอม session** — ผู้ใช้ภายในยังเป็นตัวเองทุก request · หน้าส่งบริษัทเป้าหมายทาง path, API ทาง query `?as=<companyId>` · ยาม resolve scope = บริษัทนั้น **เฉพาะเมื่อ** ผู้เรียกเป็นผู้ใช้ภายในที่มีสิทธิ์และบริษัทอยู่ใน org เดียวกัน (ไม่ถูกลบ) |
| สิ่งที่เห็น | เหมือนผู้จัดการของบริษัทนั้น — ทุกหมวด + ดาวน์โหลด · ข้อมูล/การกรอง/DTO ชุดเดียวกับผู้ใช้บริษัท (ไม่มีข้อมูลภายในเพิ่ม) |
| ปฏิเสธ (403 `PERMISSION_DENIED` + audit `access_denied` · `after.mode = view_as`) | ผู้ใช้บริษัทส่ง `as` (บริษัทใดก็ตาม — `cause = view_as_by_company_user`) · ผู้ใช้ภายในไม่มีสิทธิ์ (`view_as_missing_capability`) · id ไม่ใช่ uuid / บริษัทข้าม org / ถูกลบ (`view_as_company_not_found`) · แถวของบริษัทอื่นระหว่างดู (`cross_company` เหมือนเดิม) · หน้า: ผู้ใช้บริษัท → `/portal` ของตัวเอง · ไม่มีสิทธิ์ → `/dashboard` · id มั่ว → 404 |
| บริษัทถูกระงับ | **ยังเปิดดูได้** (เพื่อช่วยลูกค้า) — ป้ายบนสุดแจ้งว่าบริษัทถูกระงับ · ผู้ใช้ของบริษัทเองยังถูก `COMPANY_SUSPENDED` ตาม §12 |
| ป้ายบนสุด | ทุกหน้า: "กำลังดูในฐานะ <ชื่อบริษัท> (ดูอย่างเดียว)" + แจ้งว่าการเปิดดู/ดาวน์โหลดถูกบันทึก + ลิงก์ "กลับระบบภายใน" |
| Audit | เปิดโหมดครั้งแรกต่อ session ต่อบริษัท — ทั้งผ่านหน้า `/portal/view-as/**` **และเรียก `/api/portal/*?as=` ตรง** (มติ PO U141 · กลไกเดียวกัน ไม่ลงซ้ำ) → `view_as` (`target_type = finance_companies`, `target_id` = บริษัท · `after` = ชื่อ/สถานะบริษัท) · ดาวน์โหลด → `export` เดิม + `after.mode = view_as` (actor = ผู้ใช้ภายในจริง) · ไม่บังคับ `reason` (ไม่ใช่ mutation) |

> capability `view_own_company_data` เดิม (ก่อนมีพอร์ทัล) **ไม่เปิดหน้า/API ภายในใดแล้ว** — ผู้ใช้กลุ่ม `finance_company` ถูกปฏิเสธทุก capability ที่ไม่ใช่ `portal_*` ที่ชั้นตรวจสิทธิ์กลาง (มติ O43 D2 · v5.1) · ยังคงอยู่ในทะเบียน capability และ seed (นับใน Functional Matrix) โดย seed ไม่ทับ/ลบแถวเดิม

## 14. Audit Log

- บันทึก login/logout ของ Company User (`actor_id`, `role`, `company_id`, `ip`, `created_at`) ตามมาตรฐานกลาง (ไฟล์ 90)
- **ไม่บันทึก audit log ของการ "ดู" ข้อมูลรายแถว** (view-only) — จะทำให้ log ใหญ่เกินจำเป็นโดยไม่มี actor เปลี่ยนแปลงข้อมูลจริง เว้นแต่ PO ต้องการ compliance log ระดับนั้น (ยังไม่ระบุ — ถือเป็นค่าเริ่มต้น)
- บันทึก audit action **`view_as`** (enum `audit_action` — `02` v4.23 · มติ U59) เมื่อผู้ใช้ภายในเปิดโหมด "ดู portal ในฐานะลูกค้า" ครั้งแรกต่อ session ต่อบริษัท — การดาวน์โหลด/การถูกปฏิเสธระหว่างโหมดนี้ใช้ `export`/`access_denied` เดิม + `after.mode = view_as` (ดู §13.1)
- บันทึก audit action **`access_denied`** (enum `audit_action` — `02` §3 · มติ O43 D4) ทุกครั้งที่พอร์ทัลตอบ 403 `PERMISSION_DENIED` (เพื่อตรวจจับความพยายามเข้าถึงข้ามบริษัท/id สุ่ม) — `target_type`/`target_id` = สิ่งที่ร้องขอ · `after` = endpoint + เหตุผลภายใน · ไม่บังคับ `reason` (ไม่ใช่ mutation) · ปฏิเสธระดับหมวด (ยังไม่ระบุแถว) ใช้ `target_type = portal` + `after.section` · ครอบ `ACCOUNT_INACTIVE`/`COMPANY_SUSPENDED` ของผู้ที่มี session ด้วย (v5.1)

## 15. Notifications
- ยังไม่ออกแบบ — ขึ้นกับ Open Item เรื่อง Notification channel โดยรวม (`DECISIONS-NEEDED.md` §1.3) — ดู §22

## 16. Integration Points
- ไม่มี integration ภายนอกใหม่ — ดึงข้อมูลจาก entity ที่มีอยู่แล้วทั้งหมด (38, 19, 31, 44, 96) ผ่าน read-only query layer เฉพาะของพอร์ทัลนี้

## 17. API / Event Contract Draft

> Namespace ใหม่ `/api/portal/*` แยกจาก internal API เดิม (27/45) โดยสิ้นเชิง เพื่อให้บังคับ `company_id` scope ที่ middleware ชั้นเดียวได้ง่าย — ทุก endpoint ด้านล่างเป็น **GET เท่านั้น** · **16 endpoint** (มติ O43 D6 เพิ่ม 2 ตัว · มติ U13 เพิ่มอีก 2 ตัว · มติ U95 เพิ่มใบแจ้งหนี้ 1 ตัวท้ายตาราง) · ทุกตัวตรวจตามลำดับ: role กลุ่ม `finance_company` (Superadmin/role ภายใน = 403 — D11/D2) → ผู้ใช้ active (`ACCOUNT_INACTIVE`) → บริษัท active (`COMPANY_SUSPENDED`) → capability ของหมวด (§3.3) → `company_id` ของแถว (id สุ่ม/ข้ามบริษัท = 403 `PERMISSION_DENIED` + audit `access_denied` — D3/D4)
>
> **query `as=<companyId>`** (ทุก endpoint · มติ U59 §13.1): มีพารามิเตอร์นี้ ⇒ ลำดับตรวจเปลี่ยนเป็น ผู้เรียกไม่ใช่ role กลุ่ม `finance_company` (ผู้ใช้บริษัท = 403) → ผู้ใช้ active → ถือ `view_client_portal_as` → บริษัทมีจริงใน org (ไม่ตรวจ active) → สิทธิ์หมวด = ผู้จัดการบริษัท → `company_id` ของแถว = บริษัทนั้น · ไม่มีพารามิเตอร์ = ลำดับเดิมข้างบน

| Method | Endpoint | Capability | Purpose |
|---|---|---|---|
| GET | /api/portal/dashboard | `portal_cases` | KPI สรุปหน้าแรก (ยึด KPI ตาม §5 — D12 · การ์ดของหมวดที่ไม่มีสิทธิ์ไม่ถูกส่งกลับ) |
| GET | /api/portal/cases | `portal_cases` | list เคสของบริษัทตัวเอง (filter: status_display, search) |
| GET | /api/portal/cases/:id | `portal_cases` | รายละเอียดเคส (mapped fields ตาม §6.1) |
| GET | /api/portal/billing-batches | `portal_finance` | list รอบวางบิล (กรอง `draft` ออกเสมอ) |
| GET | /api/portal/tax-invoices | `portal_finance` | list ใบเสร็จรับเงิน/ใบกำกับภาษี (+ ใบกำกับภาษีแบบเดิม) — มติ U95 |
| GET | /api/portal/tax-invoices/:id/download | `portal_finance` + `portal_download` | ดาวน์โหลด PDF (renderer เดียวกับภายใน — D7) |
| GET | /api/portal/handover-lots | `portal_handover` | list Lot ของบริษัทตัวเอง |
| GET | /api/portal/handover-lots/:id/download | `portal_handover` + `portal_download` | ดาวน์โหลดใบส่งมอบ/ใบเซ็นรับ (เฉพาะ `confirmed` — D8) |
| GET | /api/portal/reports/revenue-summary | `portal_finance` | รายงานสรุปรายได้ (นับ batch `sent` ขึ้นไป คำนวณสด — D9) |
| GET | /api/portal/reports/ar-aging | `portal_finance` | รายงานอายุหนี้ (นับ batch `sent` ขึ้นไป คำนวณสด — D9) |
| GET | /api/portal/company-profile | `portal_profile` | ข้อมูลบริษัทตัวเอง (read-only) |
| GET | /api/portal/handover-lots/:id | `portal_handover` | รายละเอียดล็อต + รายการทรัพย์ในล็อต (มติ O43 D6) |
| GET | /api/portal/assets/:id/photos/:index | `portal_handover` + `portal_download` | รูปทรัพย์ลำดับที่ `index` ของทรัพย์ในล็อตของบริษัทตัวเอง (มติ O43 D6) |
| GET | /api/portal/handover-lots/:id/delivery-note | `portal_handover` + `portal_download` | ใบส่งมอบ PDF จากระบบ (DLV-…) — renderer เดียวกับภายใน มี IMEI · ดาวน์โหลดได้ตั้งแต่สร้างล็อต (มติ U13) |
| GET | /api/portal/handover-lots/:id/delivery-proof | `portal_handover` + `portal_download` | หลักฐานการจัดส่ง — เฉพาะล็อตแบบเราส่ง (`we_deliver`) ที่แนบแล้ว · stream ผ่าน server (มติ U13) |
| GET | /api/portal/billing-batches/:id/invoice-pdf | `portal_finance` + `portal_download` | ใบแจ้งหนี้/ใบวางบิล PDF (เลข `BL-<พ.ศ.>-NNN` · ไม่ใช่เอกสารภาษี · VAT เป็นยอดประมาณการ ณ วันวางบิล) — renderer เดียวกับภายใน · รอบ `draft` = 403 (มติ U95) |

**รายละเอียด endpoint ชุดที่ 1 (Portal-P4 · v5.2)** — ทุกตัวตอบ envelope กลาง `{ success, data, error }` · เงิน = satang · วันเวลา ISO UTC (UI แปลง พ.ศ.) · สถานะ = `statusDisplay { code, label, tone, outline }` (ไม่มี raw enum)

- `GET /api/portal/dashboard` → `{ inProgressCases?: { count }, arOutstanding?: { outstandingSatang }, latestTaxInvoice?: { invoiceNumber, issueDate, totalSatang } | null, pendingLots?: { count } }` — คีย์ของหมวดที่ไม่มีสิทธิ์ไม่ถูกส่ง (และไม่ query) · เคสกำลังดำเนินการ = รหัส `tracking` · ยอดค้าง = ผลรวมยอดค้างของ batch `sent`/`partially_paid`/`paid` (สูตรกลาง — O44) · ใบกำกับล่าสุด = ใบ `active` ล่าสุดตามวันที่ออก · ล็อตรอส่งมอบ = ยังไม่ `confirmed`
- `GET /api/portal/cases?status=&search=&page=&limit=` → `{ items: [{ id, caseRef, debtorName, statusDisplay, statusReason, createdAt, recycleRound }], total, page, limit }` — `status` รับเฉพาะรหัสฝั่งบริษัท (`under_review`/`info_requested`/`declined`/`tracking`/`recovered`/`not_recovered` — ค่าอื่น 400) · `search` = เลขสัญญาหรือชื่อลูกหนี้ · `limit` ≤ 100
- `GET /api/portal/cases/:id` → รายการเดียวกัน + `serviceFee { model, modelLabel, ratePct, baseSatang, basis, basisLabel, failFeeSatang, projectedRevenueSatang } | null` (ยังไม่อนุมัติ = null) + `assetPhotos { assetId, photoCount, condition, conditionLabel, conditionNote } | null` (เฉพาะ "ติดตามสำเร็จ")
- `GET /api/portal/company-profile` → `{ name, taxId, address, contactName, contactPhone, signerName, serviceFeeTemplate: { name, model, modelLabel } | null }` — บริษัทจาก session เท่านั้น
- `GET /api/portal/assets/:id/photos/:index` (index เริ่ม 0) → ตัวไฟล์รูป (stream ผ่าน server ด้วย service role · `Cache-Control: private`) — ต้องมี `portal_download` + หมวดส่งมอบ (ทรัพย์ในล็อตหรือเคส "ติดตามสำเร็จ") **หรือ** หมวดเคส (เฉพาะเคส "ติดตามสำเร็จ") · ไม่พบ/ข้ามบริษัท/ของตัวเองแต่ยังเปิดไม่ได้ → 403 `PERMISSION_DENIED` + audit · index นอกช่วง → 404 `ASSET_NOT_FOUND` · ไฟล์หายจาก Storage → `UPLOAD_FILE_NOT_FOUND`

## 18. Export / Document Requirements
- ดาวน์โหลดใบกำกับภาษี PDF — ใช้ renderer เดียวกับฝั่งภายใน (ไฟล์ 31/28) ไม่ทำ template แยกของพอร์ทัล (มติ O43 D7)
- ดาวน์โหลดใบส่งมอบทรัพย์ PDF / ใบเซ็นรับ — ใช้ไฟล์ที่มีอยู่แล้วจากไฟล์ 44 (`signed_doc_url`) · ใบเซ็นรับมี IMEI ดาวน์โหลดได้เพราะเป็นเอกสารของบริษัทเอง (มติ O43 D8) · ไฟล์ส่งผ่าน server เฉพาะล็อต `confirmed` (ยังไม่ confirmed = 403 `PERMISSION_DENIED` + audit `access_denied`) · ดาวน์โหลดสำเร็จลง audit `export` (v5.2)
- ใบส่งมอบ PDF จากระบบ + หลักฐานการจัดส่ง (มติ U13 — ดู §6.4 · §17) · ไม่ต้องรอ `confirmed` สำหรับใบส่งมอบจากระบบ · หลักฐานการจัดส่งเฉพาะ `we_deliver`
- ไม่มี export format ใหม่เฉพาะพอร์ทัลนี้ (ไม่มี Excel/CSV export ในรอบนี้)

## 19. Acceptance Criteria
- Company User เห็นเฉพาะข้อมูลของ `company_id` ตัวเองในทุกหน้าจอ ทดสอบข้าม company แล้วต้อง 403
- Billing Batch สถานะ `draft` ไม่ปรากฏในพอร์ทัลเด็ดขาด
- Case status ที่แสดงเป็น label ที่ map แล้วเท่านั้น ไม่มี raw enum หลุดออกมา
- ทุก endpoint เป็น read-only จริง — ไม่มี mutation endpoint ใดๆ หลุดเข้ามาใน namespace `/api/portal/*`
- Company ที่ถูก suspend หรือ user ที่ deactivated ใช้พอร์ทัลไม่ได้ทุก request (`COMPANY_SUSPENDED` / `ACCOUNT_INACTIVE`)
- ผู้ใช้แต่ละระดับเห็นเฉพาะหมวดที่ได้สิทธิ์ (§3.3) · Superadmin เข้าพอร์ทัลไม่ได้

## 20. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| Cross-company access | Login บริษัท A แล้วเรียก `/api/portal/cases/:id` ของเคสบริษัท B | reject 403 PERMISSION_DENIED + audit `access_denied` |
| id ที่ไม่มีจริง | เรียก `/api/portal/cases/:id` ด้วย uuid สุ่ม | reject 403 PERMISSION_DENIED (ไม่ใช่ 404 — D3) |
| สิทธิ์ตามหมวด | หัวหน้าเรียก `/api/portal/billing-batches` · แอดมินเรียก `/api/portal/handover-lots` | reject 403 PERMISSION_DENIED (ค่าเริ่มต้น D1) |
| Superadmin ไม่เข้าพอร์ทัล | Superadmin เรียก `/api/portal/dashboard` | reject 403 (D11) |
| Billing draft ถูกกรอง | บริษัทมี Billing Batch สถานะ draft 1 รายการ | ไม่ปรากฏใน list `/api/portal/billing-batches` |
| Case status mapping ถูกต้อง | เคสสถานะ `need_info` พร้อม reason | portal แสดง "ขอข้อมูลเพิ่มเติม" พร้อม reason ไม่ใช่ raw enum |
| ดาวน์โหลด Lot ที่ยังไม่ confirmed | Lot สถานะ `pending_attach` | ปุ่มดาวน์โหลด disabled |
| User deactivated | Company User ถูกปิดใช้งาน แล้วเรียก endpoint พอร์ทัล | 403 `ACCOUNT_INACTIVE` |
| Company suspended | บริษัทถูกระงับระหว่างที่ผู้ใช้ยัง login อยู่ แล้วเรียก endpoint พอร์ทัล | 403 `COMPANY_SUSPENDED` ทุก request |

## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions — ยืนยันในรอบสนทนานี้ 03/07/2569)

- **Layout ใช้ Top Bar Nav เดียวกับ Back Office ทุกโมดูล** (v4 — กลับคำตัดสินใจ v1/§21 เดิมที่เคยแยก layout สิ้นเชิง) ตาม pattern `finance.html`/`settings.html`/`warehouse.html`: header 64px + tab strip แนวนอนใต้ header, base font-size และ component class (badge/kpi) ให้ตรงกับหน้าอื่นทุกจุด (§5)
- **ไม่มีฟอร์มส่งเคสในพอร์ทัล** — ใช้ API/import/manual เดิมตามไฟล์ 38 ถาวร ไม่แก้ไฟล์ 38 (§3.2)
- **สถานะ field-side แสดงแบบสรุปเท่านั้น** (3 label: กำลังดำเนินการ/สำเร็จ/ไม่สำเร็จ) ไม่ลงรายละเอียด assigned/accepted/scheduled (§10.1)
- **ไม่เพิ่มสิทธิ์ผู้จัดการบริษัทจัดการ Company User เอง** — คงผ่าน Superadmin ตามไฟล์ 10 §12 เดิม ไม่แก้ไฟล์ 10 (§3.2)
- **ทุก endpoint เป็น read-only (GET เท่านั้น)** ไม่มี mutation ใดๆ ในพอร์ทัลนี้ (§11, §17)
- **Billing Batch สถานะ `draft` ต้องถูกกรองออกจากพอร์ทัลเสมอ** (§6.2, §11)
- **โครงสร้าง Role/Entity Company User มีอยู่แล้ว** ไม่ต้องออกแบบใหม่ (§3.1, §4)
- **Row-level scope ผ่าน `company_id` เป็นหลักการบังคับทุก endpoint** (§11, §17)

## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items)

1. ~~**Phase ของ Client Portal**~~ — **ปิดแล้ว (มติ PO 05/10/2569 U6): ทำให้เสร็จก่อน go-live** · (ข้อความเดิม) สเปคนี้เขียนพร้อม implement ได้ทันทีที่ตัดสินใจ Phase (`DECISIONS-NEEDED.md` §1.2, `00-project-overview.md` §18)
2. **Authentication method** — ใช้ระบบ login เดียวกับ internal user (Supabase Auth เดิม) หรือแยกต่างหาก (เช่น magic link) ยังไม่ตัดสินใจ — กระทบ §5 (Login screen) และ Auth flow ที่ยังไม่ได้ออกแบบในไฟล์นี้
3. **Notification channel** — ขึ้นกับผลตัดสินใจ `DECISIONS-NEEDED.md` §1.3 (Email/LINE OA/SMS/Push) (§15)
4. ~~**ความแตกต่างของสิทธิ์เห็นข้อมูลระหว่าง 3 ระดับ**~~ — **ปิดแล้ว (มติ O43 D1 — ดู §3.3)** · (ข้อความเดิม) (ผู้จัดการ/หัวหน้า/แอดมิน) — สเปคนี้ใช้สมมติฐานชั่วคราวว่าเหมือนกันหมด (§3.3, §4, §13) ต้องแก้เมื่อ PO ยืนยันการแบ่งย่อยจริง
5. **Audit log ระดับ "การดู" ข้อมูล** — ตอนนี้ไม่บันทึก (§14) ต้องยืนยันถ้าต้องการ compliance log ละเอียดกว่านี้

---

*เอกสารนี้พร้อมขยายเป็น HTML Mockup ตามลำดับ workflow (§5 Ask for Permission) — รอ confirm ก่อนเริ่มสร้าง mockup*
