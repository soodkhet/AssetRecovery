# UAT BUGS — AssetRecovery

> ระดับ: **S1** เงิน/ภาษีผิด ข้อมูลหาย/ซ้ำ · **S2** flow เดินต่อไม่ได้/500 · **S3** สิทธิ์-scope รั่ว · **S4** UI/ข้อความ/ค.ศ. · **S5** เล็กน้อย
> ชนิด: `code` · `spec-gap` · `mockup-vs-spec` · `known-debt #n` (หนี้ 4 ข้อใน PROGRESS.md) · สถานะ: open / fixed `<hash>` / needs-decision

| ID | รอบ/step | ระดับ | ชนิด | สรุป | สถานะ |
|---|---|---|---|---|---|
| BUG-001 | R1-probe | S2 | spec-gap | ฟอร์ม/Zod บริษัทไฟแนนซ์ไม่มี `wht_withheld_by_customer_pct` และ `vat_mode` (DB มี, ระบบใช้คำนวณ) ⇒ สร้างบริษัทไม่หักภาษี/รวม VAT ไม่ได้ (default หัก 3%) | fixed `898b123` (มติผู้ใช้ 03/10/2569) · R1 ยืนยันผ่านหน้าจอ: CO1 exclude_vat/3.00, CO2 include_vat/ไม่หัก |
| BUG-002 | R1-probe | S2 | spec-gap | ไม่มี UI/API ตั้ง `reassign_timeout_hours`, `supervisor_can_assign_*`, `accept_deadline_hours` (`40` §6.4 ให้ Superadmin ตั้ง) | fixed `c116827` (branch worktree — รอ merge) · ✅ PO ยืนยันช่วงค่า timeout 1–168 ชม. / เส้นตาย 1–720 ชม. (03/10/2569) |
| BUG-003 | R1-probe | S4 | code | dropdown บังคับที่ไม่เลือก (template ของบริษัท, role ของผู้ใช้, แผนของทีม) โชว์ข้อความดิบ "Invalid input: expected string, received undefined" | open |
| BUG-004 | R1-probe | S4 | code | ข้อความดิบบนจอ: hint แผนค่าตอบแทนโชว์ `**สำเร็จ**` · ฟอร์ม service fee โชว์ชื่อคอลัมน์ `charge_on_fail` + "มติ PO 2026-08-12" (ปี ค.ศ. + ข้อความภายใน) | open |
| BUG-005 | R1-probe | S5 | code | ปุ่มหน้าแผนค่าตอบแทน "+ สร้างเทมเพลต" แต่ modal คือ "สร้างแผนค่าตอบแทน" | open |
| BUG-006 | R1-probe | S5 | code | Audit Log คอลัมน์เป้าหมายติดกัน "ผู้ใช้งานa880581e" | open |
| BUG-007 | R1-probe | S4 | code | `parseBahtInput` ปัดเศษเงียบเมื่อกรอกทศนิยมเกิน 2 ตำแหน่ง (ควร inline error) | open — ยืนยันใน R1 |
| BUG-008 | R1-probe | S3 | code | Approval Matrix ชื่อ role เป็นข้อความอิสระ พิมพ์ผิดก็บันทึกได้ ไปพังตอนอนุมัติ (`APPROVAL_MATRIX_NOT_FOUND`) + ไม่มีกันแถวซ้ำ | open — ยืนยันใน R1/R6 |
| BUG-009 | R1-probe | S4 | code? | ทีมรับแผนค่าตอบแทนของอีกฝั่ง (inhouse ↔ outsource) ได้ · R1 ยืนยัน: รายชื่อ supervisor/manager ในฟอร์มทีมมีพนักงานภาคสนามและคนต่างฝั่งปนมา | ต้องเทียบ spec `09`/`11` |
| BUG-010 | DATASET | S1 | code | ค่าคอมมิชชัน/ค่าเสี่ยงไม่ถูกสร้างเป็น expense ตอนปิดงาน (`commissionSatang()` ไม่มีที่เรียกนอกเทสต์) — หน้า income อ่านจากแผนตรง ⇒ ไม่เข้ารอบจ่าย? | ยืนยันใน R4/R6 |
| BUG-011 | DATASET | S1 | spec-gap | advance คืนเงิน: โค้ด approved − used · `22` §6.13 requested − used · used > requested โค้ดบล็อก แต่ `22`/`15` ว่า return 0 + เบิกส่วนเกินแยก | needs-decision |
| BUG-012 | DATASET | S5 | spec-gap | `22` §6.11 AR = total − received ยังไม่อัปเดตตามมติ A1 (โค้ดถูกแล้ว: − (received + wht)) | doc fix |
| BUG-013 | DATASET | S1 | spec-gap | DAILY_FLAT น้ำมัน: โค้ด+`22` §6.2 = ต่อเคส · `11` §81 = บาทต่อวัน (D1) | needs-decision |
| BUG-014 | DATASET | S1 | spec-gap | WHT threshold 1,000 บาท: โค้ดต่อรายการ — spec ไม่ระบุว่าต่อรายการหรือต่อ payee ต่อรอบ (D4) | needs-decision |
| BUG-015 | fix BUG-001 | S4 | spec-gap | ตาราง `revenues` ไม่มี snapshot ของ `vat_mode` — ป้าย VAT Flag ในแท็บรายได้อ่านค่าปัจจุบันของบริษัท ⇒ เปลี่ยน vat_mode แล้วป้ายของรายการเก่าเปลี่ยนตาม (ยอดเงินไม่เปลี่ยน) · PATCH บริษัทแบบไม่ส่งฟิลด์ → รีเซ็ตเป็น default 3.00 (ฟอร์มส่งครบ ไม่กระทบ UI) | needs-decision (ต้องแก้ `02`) |

| BUG-016 | R1.14 | S2 | code | `POST /api/teams` ชื่อซ้ำยิงพร้อมกัน 2 ครั้ง → ครั้งที่ 2 ได้ 500 body ว่าง (P2002 ไม่ถูกแปลงเป็น `DUPLICATE_TEAM_NAME`) · ยิงทีละครั้งได้ 400 ถูกต้อง · ไม่เกิดแถวซ้ำ | open |
| BUG-017 | R1.25 | S5 | code | ฟอร์มเพิ่ม payee กดบันทึกได้ก่อน dropdown ผู้ใช้โหลดเสร็จ → ข้อความ "รูปแบบรหัสไม่ถูกต้อง" แทน "กรุณาเลือกผู้ใช้" | open |
| BUG-018 | R1.28 | S5 | code | `/settings/finance` มี `<main>` ซ้อนกัน 2 ชั้น (accessibility) | open |
| BUG-019 | R1.35 | S5 | mockup-vs-spec | modal สิทธิ์โชว์รหัส capability ดิบ (`approve_case`, `approve_recycle` …) ซึ่ง mockup ไม่มี | open |
| BUG-020 | R1.43 | S5 | code | หน้า placeholder โชว์ป้ายเฟสพัฒนาให้ผู้ใช้เห็น ("Phase 7.3" ที่ /portal, "Phase 2.4", "Phase 6.6") | open |
| BUG-021 | R1.41 | S3 | spec-gap | ธุรการมี `manage_users=manage` (`05` §12) → `/api/users` ตอบ 200 แต่หน้า `/settings/users` redirect ไป dashboard (`06` §7.2 + หมายเหตุบรรทัด 134 รู้อยู่แล้วว่ายังไม่เปิด) ⇒ สิทธิ์ API กับ UI ไม่ตรงกัน · ส่วนความปลอดภัยผ่าน (ตั้งรหัสให้กลุ่ม system ได้ 403) | needs-decision |

## รายละเอียด
<!-- ### BUG-001 …  reproduce / คาดหวัง (อ้าง §spec) / เกิดจริง / snapshot / ภาพ -->

## ไม่ใช่บั๊กของแอป (บันทึกไว้กันสับสน)
- R0: `pnpm add` ระหว่าง dev server รัน → Turbopack ถือ module graph เก่า ทุก API ตอบ 500 (`next/headers … instantiated because it was required from…`) — แก้ด้วย `~/bin/dev restart asset` · **กฎ: ติดตั้งแพ็กเกจแล้วต้อง restart dev server เสมอ**

## ข้อสังเกตที่ต้องตรวจต่อ (ยังไม่ใช่บั๊ก)
- R1.43: ผู้ใช้กลุ่มบริษัทไฟแนนซ์เข้า `/dashboard`, `/cases`, `/warehouse` ในแอปภายในได้ และ `/api/cases`, `/api/assets`, `/api/handover-lots` ตอบ 200 — **ตรง `06` §7.2** (Company User เห็นแดชบอร์ด/จัดการเคส/คลัง read company scope) ⇒ R2 และ R5 ต้องพิสูจน์ว่าเห็นเฉพาะข้อมูลบริษัทตัวเอง (`uat.co2.admin` ห้ามเห็นเคส CO1)
