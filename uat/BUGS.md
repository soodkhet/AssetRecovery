# UAT BUGS — AssetRecovery

> ระดับ: **S1** เงิน/ภาษีผิด ข้อมูลหาย/ซ้ำ · **S2** flow เดินต่อไม่ได้/500 · **S3** สิทธิ์-scope รั่ว · **S4** UI/ข้อความ/ค.ศ. · **S5** เล็กน้อย
> ชนิด: `code` · `spec-gap` · `mockup-vs-spec` · `known-debt #n` (หนี้ 4 ข้อใน PROGRESS.md) · สถานะ: open / fixed `<hash>` / needs-decision

| ID | รอบ/step | ระดับ | ชนิด | สรุป | สถานะ |
|---|---|---|---|---|---|
| BUG-001 | R1-probe | S2 | spec-gap | ฟอร์ม/Zod บริษัทไฟแนนซ์ไม่มี `wht_withheld_by_customer_pct` และ `vat_mode` (DB มี, ระบบใช้คำนวณ) ⇒ สร้างบริษัทไม่หักภาษี/รวม VAT ไม่ได้ (default หัก 3%) | fixed `898b123` (มติผู้ใช้ 03/10/2569) · R1 ยืนยันผ่านหน้าจอ: CO1 exclude_vat/3.00, CO2 include_vat/ไม่หัก |
| BUG-002 | R1-probe | S2 | spec-gap | ไม่มี UI/API ตั้ง `reassign_timeout_hours`, `supervisor_can_assign_*`, `accept_deadline_hours` (`40` §6.4 ให้ Superadmin ตั้ง) | fixed `c116827` (branch worktree — รอ merge) · ✅ PO ยืนยันช่วงค่า timeout 1–168 ชม. / เส้นตาย 1–720 ชม. (03/10/2569) |
| BUG-003 | R1-probe | S4 | code | dropdown บังคับที่ไม่เลือก (template ของบริษัท, role ของผู้ใช้, แผนของทีม) โชว์ข้อความดิบ "Invalid input: expected string, received undefined" | fixed `83fbd44` (merge 03/10/2569) |
| BUG-004 | R1-probe | S4 | code | ข้อความดิบบนจอ: hint แผนค่าตอบแทนโชว์ `**สำเร็จ**` · ฟอร์ม service fee โชว์ชื่อคอลัมน์ `charge_on_fail` + "มติ PO 2026-08-12" (ปี ค.ศ. + ข้อความภายใน) | fixed `8708091` (merge 03/10/2569) |
| BUG-005 | R1-probe | S5 | code | ปุ่มหน้าแผนค่าตอบแทน "+ สร้างเทมเพลต" แต่ modal คือ "สร้างแผนค่าตอบแทน" | fixed `791ef8a` (merge 03/10/2569) |
| BUG-006 | R1-probe | S5 | code | Audit Log คอลัมน์เป้าหมายติดกัน "ผู้ใช้งานa880581e" | fixed `fcb89fb` (merge 03/10/2569) |
| BUG-007 | R1-probe | S4 | code | `parseBahtInput` ปัดเศษเงียบเมื่อกรอกทศนิยมเกิน 2 ตำแหน่ง (ควร inline error) | fixed `b79e086` (merge 03/10/2569) |
| BUG-008 | R1-probe | S3 | code | Approval Matrix ชื่อ role เป็นข้อความอิสระ พิมพ์ผิดก็บันทึกได้ ไปพังตอนอนุมัติ (`APPROVAL_MATRIX_NOT_FOUND`) + ไม่มีกันแถวซ้ำ | fixed `511a636` (merge 03/10/2569) |
| BUG-009 | R1-probe | S4 | code? | ทีมรับแผนค่าตอบแทนของอีกฝั่ง (inhouse ↔ outsource) ได้ · R1 ยืนยัน: รายชื่อ supervisor/manager ในฟอร์มทีมมีพนักงานภาคสนามและคนต่างฝั่งปนมา | needs-decision — `09`/`11` ไม่บังคับให้แผน/หัวหน้า/ผู้จัดการเป็นฝั่งเดียวกับทีม (`09` §7.1 ให้ dropdown แสดงทุกแผน) — fixer ไม่แก้ |
| BUG-010 | DATASET | S1 | code | ค่าคอมมิชชัน/ค่าเสี่ยงไม่ถูกสร้างเป็น expense ตอนปิดงาน (`commissionSatang()` ไม่มีที่เรียกนอกเทสต์) — หน้า income อ่านจากแผนตรง ⇒ ไม่เข้ารอบจ่าย? | ยืนยันใน R4/R6 |
| BUG-011 | DATASET | S1 | spec-gap | advance คืนเงิน: โค้ด approved − used · `22` §6.13 requested − used · used > requested โค้ดบล็อก แต่ `22`/`15` ว่า return 0 + เบิกส่วนเกินแยก | needs-decision |
| BUG-012 | DATASET | S5 | spec-gap | `22` §6.11 AR = total − received ยังไม่อัปเดตตามมติ A1 (โค้ดถูกแล้ว: − (received + wht)) | doc fix |
| BUG-013 | DATASET | S1 | spec-gap | DAILY_FLAT น้ำมัน: โค้ด+`22` §6.2 = ต่อเคส · `11` §81 = บาทต่อวัน (D1) | needs-decision |
| BUG-014 | DATASET | S1 | spec-gap | WHT threshold 1,000 บาท: โค้ดต่อรายการ — spec ไม่ระบุว่าต่อรายการหรือต่อ payee ต่อรอบ (D4) | needs-decision |
| BUG-015 | fix BUG-001 | S4 | spec-gap | ตาราง `revenues` ไม่มี snapshot ของ `vat_mode` — ป้าย VAT Flag ในแท็บรายได้อ่านค่าปัจจุบันของบริษัท ⇒ เปลี่ยน vat_mode แล้วป้ายของรายการเก่าเปลี่ยนตาม (ยอดเงินไม่เปลี่ยน) · PATCH บริษัทแบบไม่ส่งฟิลด์ → รีเซ็ตเป็น default 3.00 (ฟอร์มส่งครบ ไม่กระทบ UI) | needs-decision (ต้องแก้ `02`) |

| BUG-016 | R1.14 | S2 | code | `POST /api/teams` ชื่อซ้ำยิงพร้อมกัน 2 ครั้ง → ครั้งที่ 2 ได้ 500 body ว่าง (P2002 ไม่ถูกแปลงเป็น `DUPLICATE_TEAM_NAME`) · ยิงทีละครั้งได้ 400 ถูกต้อง · ไม่เกิดแถวซ้ำ | fixed `ebe34bb` (merge 03/10/2569) |
| BUG-017 | R1.25 | S5 | code | ฟอร์มเพิ่ม payee กดบันทึกได้ก่อน dropdown ผู้ใช้โหลดเสร็จ → ข้อความ "รูปแบบรหัสไม่ถูกต้อง" แทน "กรุณาเลือกผู้ใช้" | fixed `745fa18` (merge 03/10/2569) |
| BUG-018 | R1.28 | S5 | code | `/settings/finance` มี `<main>` ซ้อนกัน 2 ชั้น (accessibility) | fixed `b61ff12` (merge 03/10/2569) |
| BUG-019 | R1.35 | S5 | mockup-vs-spec | modal สิทธิ์โชว์รหัส capability ดิบ (`approve_case`, `approve_recycle` …) ซึ่ง mockup ไม่มี | fixed `d0b9dc0` (merge 03/10/2569) |
| BUG-020 | R1.43 | S5 | code | หน้า placeholder โชว์ป้ายเฟสพัฒนาให้ผู้ใช้เห็น ("Phase 7.3" ที่ /portal, "Phase 2.4", "Phase 6.6") | fixed `951b6f1` (merge 03/10/2569) |
| BUG-021 | R1.41 | S3 | spec-gap | ธุรการมี `manage_users=manage` (`05` §12) → `/api/users` ตอบ 200 แต่หน้า `/settings/users` redirect ไป dashboard (`06` §7.2 + หมายเหตุบรรทัด 134 รู้อยู่แล้วว่ายังไม่เปิด) ⇒ สิทธิ์ API กับ UI ไม่ตรงกัน · ส่วนความปลอดภัยผ่าน (ตั้งรหัสให้กลุ่ม system ได้ 403) | fixed `02e66ed` (merge 03/10/2569) |
| BUG-022 | R2-sheet | S3 | spec-gap | การเงิน/บัญชี/บริหาร อ่านเคสทุกใบผ่าน API ได้ รวมเลขบัตรประชาชน เบอร์โทร ที่อยู่ลูกหนี้ — spec ให้ "เห็นทุกเคส" แค่ Superadmin + บริหาร ⇒ เกี่ยว PDPA | needs-decision (PO) |
| BUG-023 | R2-sheet | S4 | spec-gap | ผู้จัดการทีมเห็นเคสของทีมตัวเองตั้งแต่ยัง pending/rejected (ผ่านทีมที่ระบบเสนอ) — `38` §13 ไม่ระบุ | needs-decision |
| BUG-024 | R2-sheet | S5 | code | ฟอร์มเคสบังคับรหัสไปรษณีย์/อำเภอ/ตำบล แต่ backend ไม่บังคับ (FE/BE ไม่ใช้ schema ชุดเดียวกัน — Rule 04) | open — ยืนยันใน R2 |
| BUG-025 | fixer R1 | S3 | code | `listUsers`: เงื่อนไขค้นหา (`OR`) เขียนทับ scope ทีม (`OR`) ⇒ ผู้จัดการทีมที่ค้นชื่อเห็นผู้ใช้ทั้งองค์กร · พบระหว่างแก้ BUG-021 | fixed `02e66ed` + regression test · ⚠️ staging ที่ deploy อยู่ยังมีช่องโหว่นี้จนกว่าจะ push |
| BUG-026 | R2.02 | S2 | env | Supabase project `qgshdg…` (localhost + Vercel staging) **ไม่มี Storage bucket เลย** ⇒ อัปโหลดเอกสารเคส `Bucket not found` (staging ที่ deploy ไว้ก็อัปโหลดไม่ได้มาตลอด) | fixed: `scripts/setup-storage.ts` (`pnpm storage:setup`) สร้าง bucket private 4 ตัว + policy `case-documents` 3 ตัว (มติ PO 03/10/2569) — ต้องรันอีกครั้งตอนสร้าง production |
| BUG-027 | fixer R1 | S5 | code | Approval Matrix แถวเก่าที่บันทึกชื่อ role เป็น alias อังกฤษ (เช่น "Manager") แก้ไขแล้วไม่ผ่าน validation ใหม่ — ฟอร์มขึ้น "(ไม่พบในระบบ — เลือกใหม่)" · ตอนอนุมัติจริงยังรับ alias | known — ข้อมูล UAT ใช้ชื่อไทยอยู่แล้ว |
| BUG-028 | R2.03/R2.06 | S4 | code | ส่งตรวจถูกปัดแล้ว toast ไม่บอกว่าขาดเอกสาร/ช่องไหน ทั้งที่ API ส่ง `missing`/`missingFields` มา | fixed `714a2f0` (merge 03/10/2569) |
| BUG-029 | R2.20/R2.30 | S5 | code | แจ้งเตือน `case.approved` ถึงธุรการพ่วงข้อความภายใน "snapshot ค่าบริการอัตโนมัติ… v2" | fixed `cefa71e` (merge 03/10/2569) |
| BUG-030 | R2.16/R2.28 | S4 | code | list เคสมีแต่ "สร้างเมื่อ" ไม่มีวันเวลาส่งตรวจ/รับเคส/ไม่รับเคส (ขัด Rule 05) | fixed `6d82386` (merge 03/10/2569) |
| BUG-031 | R2 | S4 | code | เปิดไฟล์จากหน้าต่างพิจารณาแล้วกด Esc → หน้าต่างพิจารณาด้านหลังปิด แต่หน้าดูไฟล์ค้าง (`components/ui/modal.tsx:46` — modal ซ้อนจัดการ Esc ผิดชั้น) | fixed `eb4fb52` (merge 03/10/2569) |
| BUG-032 | R2 | S5 | code | หน้า `/cases/submit` ของเจ้าหน้าที่อนุมัติเคสเรียก `GET /api/finance-companies?status=active` ได้ 403 สองครั้งทุกครั้ง ⇒ ตัวกรองไฟแนนซ์เหลือแค่ "ทั้งหมด" | fixed `3bd7037` (merge 03/10/2569) |
| BUG-033 | R2.18 | S5 | code | ผู้ใช้บริษัท `GET /api/cases/:id` ซ่อนข้อมูลไม่สม่ำเสมอ — เห็น `serviceFeeTemplateId`/`serviceFeeModelSnapshot`/`serviceFeeChargeOnFail`/`reviewedAt` แต่ base/rate เป็น null · ❓ บริษัทควรเห็นโมเดลค่าบริการของเคสตัวเองไหม | needs-decision |
| BUG-034 | R2 | S5 | code | กล่องประมาณการรายได้แสดง `projected_revenue_source` ดิบ (มี UUID ของ template) | fixed `efbcad7` (merge 03/10/2569) |
| BUG-035 | R2.15/R2.25 | S3 | code-risk | เปลี่ยนสถานะเคสใช้ `tx.case.update({where:{id}})` ไม่เช็คสถานะเดิม (`lib/cases/status-queries.ts:308`) — race ใน UAT ได้ผลถูก (200 + 400) เพราะ guard อื่นจับไว้ แต่ยังเป็นแพตเทิร์นเสี่ยง (เทียบแพตเทิร์น optimistic ที่แก้ใน 8.3) | fixed `83c9d85` (merge 03/10/2569) · race เกิดจริง (เทสต์กับโค้ดเดิม: สำเร็จทั้งคู่) |
| BUG-036 | R2.08 | S4 | data | ตาราง lookup รหัสไปรษณีย์เป็น placeholder 5 รหัส ⇒ กรอกรหัสอื่นไม่เติมจังหวัด/อำเภอ/ตำบลให้ | needs-decision — ไม่มีชุดข้อมูลรหัสไปรษณีย์ไทยในโปรเจกต์ · ทางเลือก: นำเข้าไฟล์ข้อมูล (ระบุ license) ลง `lib/address/` หรือเรียก API ไปรษณีย์ไทย — ต้องมีมติเรื่องแหล่งข้อมูล |
| BUG-037 | R2-A | S3 | spec-gap | `POST /api/cases/:id/documents` เชื่อ path + SHA-256 ที่ browser ส่งมา (server ไม่คำนวณ hash/ไม่ตรวจว่าไฟล์มีจริง) ⇒ hash หลักฐานปลอมได้ · ใน UAT ข้อมูลจริงตรงทุกแถว (24/24) · เกี่ยวกับหนี้ #1 (เอกสารล็อต) | needs-decision |
| BUG-038 | R3-sheet | S2 | code-risk | `assignCase` เช็ค assignment เดิมนอก transaction + DB ไม่มี unique index ของ assignment ที่ active ⇒ race อาจได้ 2 แถว | ยืนยันใน R3.13 |
| BUG-039 | R3-sheet | S3 | code | API มอบหมายตรวจแค่ว่าอยู่ทีมเดียวกับเคส ไม่ตรวจ role ⇒ มอบหมายให้หัวหน้า/ผู้จัดการได้ (UI กรองถูก) | ยืนยันใน R3.07 |
| BUG-040 | R3-sheet | S3 | spec-gap | ไม่มีแจ้งเตือนตอนมอบหมาย/รับงาน/ยินยอม-ปฏิเสธ ตาม `40` §15 · แต่ `90` §6.3 ระบุแค่ event เปลี่ยนผู้รับผิดชอบ | needs-decision (spec ขัดกัน) + ยืนยันใน R3 |
| BUG-041 | R3-sheet | S4 | code | แจ้งเตือนคำขอเปลี่ยนผู้รับผิดชอบแสดงแค่วันที่ ไม่มีเวลา | ยืนยันใน R3 |
| BUG-042 | R3-sheet | S5 | spec-gap | เหตุผลว่าง/สั้นได้ `REQUIRED_MISSING` แทน `ASSIGNMENT_REASON_REQUIRED` (`40` §12) · UI disable ปุ่มเฉพาะตอนว่าง · error code ของงานมอบหมายนิยามใน `40` §12 ไม่ใช่ `24` | needs-decision |
| BUG-043 | R3-sheet | S4 | code | timeout แล้ว `reassignment_history.reassigned_by` บันทึกคนที่มอบหมายครั้งแรก แทนคนที่ขอเปลี่ยน | ยืนยันใน R3 |
| BUG-044 | R3-sheet | S5 | spec-gap | คนที่ไม่ใช่เจ้าของงานตอบคำขอ ได้ 404 `CASE_NOT_FOUND` แต่ spec ว่า `PERMISSION_DENIED` (ไม่ leak — ยอมรับได้?) | needs-decision |

## รายละเอียด
<!-- ### BUG-001 …  reproduce / คาดหวัง (อ้าง §spec) / เกิดจริง / snapshot / ภาพ -->

## ไม่ใช่บั๊กของแอป (บันทึกไว้กันสับสน)
- R0: `pnpm add` ระหว่าง dev server รัน → Turbopack ถือ module graph เก่า ทุก API ตอบ 500 (`next/headers … instantiated because it was required from…`) — แก้ด้วย `~/bin/dev restart asset` · **กฎ: ติดตั้งแพ็กเกจแล้วต้อง restart dev server เสมอ**

## ข้อสังเกตที่ต้องตรวจต่อ (ยังไม่ใช่บั๊ก)
- R1.43: ผู้ใช้กลุ่มบริษัทไฟแนนซ์เข้า `/dashboard`, `/cases`, `/warehouse` ในแอปภายในได้ และ `/api/cases`, `/api/assets`, `/api/handover-lots` ตอบ 200 — **ตรง `06` §7.2** (Company User เห็นแดชบอร์ด/จัดการเคส/คลัง read company scope) ⇒ R2 และ R5 ต้องพิสูจน์ว่าเห็นเฉพาะข้อมูลบริษัทตัวเอง (`uat.co2.admin` ห้ามเห็นเคส CO1)
