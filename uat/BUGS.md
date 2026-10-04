# UAT BUGS — AssetRecovery

> ระดับ: **S1** เงิน/ภาษีผิด ข้อมูลหาย/ซ้ำ · **S2** flow เดินต่อไม่ได้/500 · **S3** สิทธิ์-scope รั่ว · **S4** UI/ข้อความ/ค.ศ. · **S5** เล็กน้อย
> ชนิด: `code` · `spec-gap` · `mockup-vs-spec` · `known-debt #n` (หนี้ 4 ข้อใน PROGRESS.md) · สถานะ: open / fixed `<hash>` / needs-decision

| ID | รอบ/step | ระดับ | ชนิด | สรุป | สถานะ |
|---|---|---|---|---|---|
| BUG-001 | R1-probe | S2 | spec-gap | ฟอร์ม/Zod บริษัทไฟแนนซ์ไม่มี `wht_withheld_by_customer_pct` และ `vat_mode` (DB มี, ระบบใช้คำนวณ) ⇒ สร้างบริษัทไม่หักภาษี/รวม VAT ไม่ได้ (default หัก 3%) | fixed `898b123` (มติผู้ใช้ 03/10/2569) · R1 ยืนยันผ่านหน้าจอ: CO1 exclude_vat/3.00, CO2 include_vat/ไม่หัก |
| BUG-002 | R1-probe | S2 | spec-gap | ไม่มี UI/API ตั้ง `reassign_timeout_hours`, `supervisor_can_assign_*`, `accept_deadline_hours` (`40` §6.4 ให้ Superadmin ตั้ง) | fixed `c116827` (merge `630a101`) · ✅ PO ยืนยันช่วงค่า timeout 1–168 ชม. / เส้นตาย 1–720 ชม. (03/10/2569) |
| BUG-003 | R1-probe | S4 | code | dropdown บังคับที่ไม่เลือก (template ของบริษัท, role ของผู้ใช้, แผนของทีม) โชว์ข้อความดิบ "Invalid input: expected string, received undefined" | fixed `83fbd44` (merge 03/10/2569) |
| BUG-004 | R1-probe | S4 | code | ข้อความดิบบนจอ: hint แผนค่าตอบแทนโชว์ `**สำเร็จ**` · ฟอร์ม service fee โชว์ชื่อคอลัมน์ `charge_on_fail` + "มติ PO 2026-08-12" (ปี ค.ศ. + ข้อความภายใน) | fixed `8708091` (merge 03/10/2569) |
| BUG-005 | R1-probe | S5 | code | ปุ่มหน้าแผนค่าตอบแทน "+ สร้างเทมเพลต" แต่ modal คือ "สร้างแผนค่าตอบแทน" | fixed `791ef8a` (merge 03/10/2569) |
| BUG-006 | R1-probe | S5 | code | Audit Log คอลัมน์เป้าหมายติดกัน "ผู้ใช้งานa880581e" | fixed `fcb89fb` (merge 03/10/2569) |
| BUG-007 | R1-probe | S4 | code | `parseBahtInput` ปัดเศษเงียบเมื่อกรอกทศนิยมเกิน 2 ตำแหน่ง (ควร inline error) | fixed `b79e086` (merge 03/10/2569) |
| BUG-008 | R1-probe | S3 | code | Approval Matrix ชื่อ role เป็นข้อความอิสระ พิมพ์ผิดก็บันทึกได้ ไปพังตอนอนุมัติ (`APPROVAL_MATRIX_NOT_FOUND`) + ไม่มีกันแถวซ้ำ | fixed `511a636` (merge 03/10/2569) |
| BUG-009 | R1-probe | S4 | code? | ทีมรับแผนค่าตอบแทนของอีกฝั่ง (inhouse ↔ outsource) ได้ · R1 ยืนยัน: รายชื่อ supervisor/manager ในฟอร์มทีมมีพนักงานภาคสนามและคนต่างฝั่งปนมา | fixed `c8a2632` (มติ PO Q12) |
| BUG-010 | DATASET | S1 | code | ค่าคอมมิชชัน/ค่าเสี่ยงไม่ถูกสร้างเป็น expense ตอนปิดงาน (`commissionSatang()` ไม่มีที่เรียกนอกเทสต์) — หน้า income อ่านจากแผนตรง ⇒ ไม่เข้ารอบจ่าย? | fixed `7c34edb` (มติ PO Q2) |
| BUG-011 | DATASET | S1 | spec-gap | advance คืนเงิน: โค้ด approved − used · `22` §6.13 requested − used · used > requested โค้ดบล็อก แต่ `22`/`15` ว่า return 0 + เบิกส่วนเกินแยก | fixed `8d4befc` (มติ PO Q3 — ใช้เกินบันทึกได้ คืน 0 + เบิกส่วนเกินอัตโนมัติ) |
| BUG-012 | DATASET | S5 | spec-gap | `22` §6.11 AR = total − received ยังไม่อัปเดตตามมติ A1 (โค้ดถูกแล้ว: − (received + wht)) | doc fix |
| BUG-013 | DATASET | S1 | spec-gap | DAILY_FLAT น้ำมัน: โค้ด+`22` §6.2 = ต่อเคส · `11` §81 = บาทต่อวัน (D1) | fixed `adf437d` (Q4) → แทนที่ด้วยมติ Q21 merge แล้ว (วันละครั้งต่อพนักงาน เฉลี่ยทุกเคส job `daily_field_allowance`) |
| BUG-014 | DATASET | S1 | spec-gap | WHT threshold 1,000 บาท: โค้ดต่อรายการ — spec ไม่ระบุว่าต่อรายการหรือต่อ payee ต่อรอบ (D4) | fixed `8d6158c`+`8627a24` (มติ PO Q5 — ต่อ payee ต่อรอบจ่าย) · ⚠️ นักบัญชียืนยัน |
| BUG-015 | fix BUG-001 | S4 | spec-gap | ตาราง `revenues` ไม่มี snapshot ของ `vat_mode` — ป้าย VAT Flag ในแท็บรายได้อ่านค่าปัจจุบันของบริษัท ⇒ เปลี่ยน vat_mode แล้วป้ายของรายการเก่าเปลี่ยนตาม (ยอดเงินไม่เปลี่ยน) · PATCH บริษัทแบบไม่ส่งฟิลด์ → รีเซ็ตเป็น default 3.00 (ฟอร์มส่งครบ ไม่กระทบ UI) | fixed `2d7d30d` (มติ PO Q6 — migration `20261003113300`) |

| BUG-016 | R1.14 | S2 | code | `POST /api/teams` ชื่อซ้ำยิงพร้อมกัน 2 ครั้ง → ครั้งที่ 2 ได้ 500 body ว่าง (P2002 ไม่ถูกแปลงเป็น `DUPLICATE_TEAM_NAME`) · ยิงทีละครั้งได้ 400 ถูกต้อง · ไม่เกิดแถวซ้ำ | fixed `ebe34bb` (merge 03/10/2569) |
| BUG-017 | R1.25 | S5 | code | ฟอร์มเพิ่ม payee กดบันทึกได้ก่อน dropdown ผู้ใช้โหลดเสร็จ → ข้อความ "รูปแบบรหัสไม่ถูกต้อง" แทน "กรุณาเลือกผู้ใช้" | fixed `745fa18` (merge 03/10/2569) |
| BUG-018 | R1.28 | S5 | code | `/settings/finance` มี `<main>` ซ้อนกัน 2 ชั้น (accessibility) | fixed `b61ff12` (merge 03/10/2569) |
| BUG-019 | R1.35 | S5 | mockup-vs-spec | modal สิทธิ์โชว์รหัส capability ดิบ (`approve_case`, `approve_recycle` …) ซึ่ง mockup ไม่มี | fixed `d0b9dc0` (merge 03/10/2569) |
| BUG-020 | R1.43 | S5 | code | หน้า placeholder โชว์ป้ายเฟสพัฒนาให้ผู้ใช้เห็น ("Phase 7.3" ที่ /portal, "Phase 2.4", "Phase 6.6") | fixed `951b6f1` (merge 03/10/2569) |
| BUG-021 | R1.41 | S3 | spec-gap | ธุรการมี `manage_users=manage` (`05` §12) → `/api/users` ตอบ 200 แต่หน้า `/settings/users` redirect ไป dashboard (`06` §7.2 + หมายเหตุบรรทัด 134 รู้อยู่แล้วว่ายังไม่เปิด) ⇒ สิทธิ์ API กับ UI ไม่ตรงกัน · ส่วนความปลอดภัยผ่าน (ตั้งรหัสให้กลุ่ม system ได้ 403) | fixed `02e66ed` (merge 03/10/2569) |
| BUG-022 | R2-sheet | S3 | spec-gap | การเงิน/บัญชี/บริหาร อ่านเคสทุกใบผ่าน API ได้ รวมเลขบัตรประชาชน เบอร์โทร ที่อยู่ลูกหนี้ — spec ให้ "เห็นทุกเคส" แค่ Superadmin + บริหาร ⇒ เกี่ยว PDPA | closed — มติ PO Q9: เห็นได้ตามเดิม (accepted risk) |
| BUG-023 | R2-sheet | S4 | spec-gap | ผู้จัดการทีมเห็นเคสของทีมตัวเองตั้งแต่ยัง pending/rejected (ผ่านทีมที่ระบบเสนอ) — `38` §13 ไม่ระบุ | fixed `eaf6706` (มติ PO Q11) |
| BUG-024 | R2-sheet | S5 | code | ฟอร์มเคสบังคับรหัสไปรษณีย์/อำเภอ/ตำบล แต่ backend ไม่บังคับ (FE/BE ไม่ใช้ schema ชุดเดียวกัน — Rule 04) | open — ยืนยันใน R2 |
| BUG-025 | fixer R1 | S3 | code | `listUsers`: เงื่อนไขค้นหา (`OR`) เขียนทับ scope ทีม (`OR`) ⇒ ผู้จัดการทีมที่ค้นชื่อเห็นผู้ใช้ทั้งองค์กร · พบระหว่างแก้ BUG-021 | fixed `02e66ed` + regression test · ⚠️ staging ที่ deploy อยู่ยังมีช่องโหว่นี้จนกว่าจะ push |
| BUG-026 | R2.02 | S2 | env | Supabase project `qgshdg…` (localhost + Vercel staging) **ไม่มี Storage bucket เลย** ⇒ อัปโหลดเอกสารเคส `Bucket not found` (staging ที่ deploy ไว้ก็อัปโหลดไม่ได้มาตลอด) | fixed: `scripts/setup-storage.ts` (`pnpm storage:setup`) สร้าง bucket private 4 ตัว + policy `case-documents` 3 ตัว (มติ PO 03/10/2569) — ต้องรันอีกครั้งตอนสร้าง production |
| BUG-027 | fixer R1 | S5 | code | Approval Matrix แถวเก่าที่บันทึกชื่อ role เป็น alias อังกฤษ (เช่น "Manager") แก้ไขแล้วไม่ผ่าน validation ใหม่ — ฟอร์มขึ้น "(ไม่พบในระบบ — เลือกใหม่)" · ตอนอนุมัติจริงยังรับ alias | known — ข้อมูล UAT ใช้ชื่อไทยอยู่แล้ว |
| BUG-028 | R2.03/R2.06 | S4 | code | ส่งตรวจถูกปัดแล้ว toast ไม่บอกว่าขาดเอกสาร/ช่องไหน ทั้งที่ API ส่ง `missing`/`missingFields` มา | fixed `714a2f0` (merge 03/10/2569) |
| BUG-029 | R2.20/R2.30 | S5 | code | แจ้งเตือน `case.approved` ถึงธุรการพ่วงข้อความภายใน "snapshot ค่าบริการอัตโนมัติ… v2" | fixed `cefa71e` (merge 03/10/2569) |
| BUG-030 | R2.16/R2.28 | S4 | code | list เคสมีแต่ "สร้างเมื่อ" ไม่มีวันเวลาส่งตรวจ/รับเคส/ไม่รับเคส (ขัด Rule 05) | fixed `6d82386` (merge 03/10/2569) |
| BUG-031 | R2 | S4 | code | เปิดไฟล์จากหน้าต่างพิจารณาแล้วกด Esc → หน้าต่างพิจารณาด้านหลังปิด แต่หน้าดูไฟล์ค้าง (`components/ui/modal.tsx:46` — modal ซ้อนจัดการ Esc ผิดชั้น) | fixed `eb4fb52` (merge 03/10/2569) |
| BUG-032 | R2 | S5 | code | หน้า `/cases/submit` ของเจ้าหน้าที่อนุมัติเคสเรียก `GET /api/finance-companies?status=active` ได้ 403 สองครั้งทุกครั้ง ⇒ ตัวกรองไฟแนนซ์เหลือแค่ "ทั้งหมด" | fixed `3bd7037` (merge 03/10/2569) |
| BUG-033 | R2.18 | S5 | code | ผู้ใช้บริษัท `GET /api/cases/:id` ซ่อนข้อมูลไม่สม่ำเสมอ — เห็น `serviceFeeTemplateId`/`serviceFeeModelSnapshot`/`serviceFeeChargeOnFail`/`reviewedAt` แต่ base/rate เป็น null · ❓ บริษัทควรเห็นโมเดลค่าบริการของเคสตัวเองไหม | fixed `c078792` (มติ PO Q10) |
| BUG-034 | R2 | S5 | code | กล่องประมาณการรายได้แสดง `projected_revenue_source` ดิบ (มี UUID ของ template) | fixed `efbcad7` (merge 03/10/2569) |
| BUG-035 | R2.15/R2.25 | S3 | code-risk | เปลี่ยนสถานะเคสใช้ `tx.case.update({where:{id}})` ไม่เช็คสถานะเดิม (`lib/cases/status-queries.ts:308`) — race ใน UAT ได้ผลถูก (200 + 400) เพราะ guard อื่นจับไว้ แต่ยังเป็นแพตเทิร์นเสี่ยง (เทียบแพตเทิร์น optimistic ที่แก้ใน 8.3) | fixed `83c9d85` (merge 03/10/2569) · race เกิดจริง (เทสต์กับโค้ดเดิม: สำเร็จทั้งคู่) |
| BUG-036 | R2.08 | S4 | data | ตาราง lookup รหัสไปรษณีย์เป็น placeholder 5 รหัส ⇒ กรอกรหัสอื่นไม่เติมจังหวัด/อำเภอ/ตำบลให้ | fixed `f1aa197` (มติ PO Q19 — 966 รหัส/7,436 ตำบล, MIT) · ข้อจำกัด: datalist อำเภอ/ตำบลยังเป็นข้อมูลตัวอย่าง 4 จังหวัด (`38` §22 ข้อ 5) |
| BUG-037 | R2-A | S3 | spec-gap | `POST /api/cases/:id/documents` เชื่อ path + SHA-256 ที่ browser ส่งมา (server ไม่คำนวณ hash/ไม่ตรวจว่าไฟล์มีจริง) ⇒ hash หลักฐานปลอมได้ · ใน UAT ข้อมูลจริงตรงทุกแถว (24/24) · เกี่ยวกับหนี้ #1 (เอกสารล็อต) | fixed `fa7cfb3` (มติ PO Q13 — server ตรวจ path/มีจริง/ชนิด/ขนาด + คำนวณ SHA-256 เอง) |
| BUG-038 | R3-sheet | S2 | code-risk | `assignCase` เช็ค assignment เดิมนอก transaction + DB ไม่มี unique index ของ assignment ที่ active ⇒ race อาจได้ 2 แถว | ไม่เกิดใน R3.13 (race 2 รอบ: {201,400 ALREADY_EXISTS} / {400,400}, active 1 แถว) · ความเสี่ยงในโค้ดยังอยู่ (ไม่มี unique index) — open (code-risk) |
| BUG-039 | R3-sheet | S3 | code | API มอบหมายตรวจแค่ว่าอยู่ทีมเดียวกับเคส ไม่ตรวจ role ⇒ มอบหมายให้หัวหน้า/ผู้จัดการได้ (UI กรองถูก) | fixed `6353de7` |
| BUG-040 | R3-sheet | S3 | spec-gap | ไม่มีแจ้งเตือนตอนมอบหมาย/รับงาน/ยินยอม-ปฏิเสธ ตาม `40` §15 · แต่ `90` §6.3 ระบุแค่ event เปลี่ยนผู้รับผิดชอบ | fixed `250bd88` (มติ PO Q17) |
| BUG-041 | R3-sheet | S4 | code | แจ้งเตือนคำขอเปลี่ยนผู้รับผิดชอบแสดงแค่วันที่ ไม่มีเวลา | fixed `250bd88` |
| BUG-042 | R3-sheet | S5 | spec-gap | เหตุผลว่าง/สั้นได้ `REQUIRED_MISSING` แทน `ASSIGNMENT_REASON_REQUIRED` (`40` §12) · UI disable ปุ่มเฉพาะตอนว่าง · error code ของงานมอบหมายนิยามใน `40` §12 ไม่ใช่ `24` | fixed `f997af4` (มติ PO Q18) |
| BUG-043 | R3-sheet | S4 | code | timeout แล้ว `reassignment_history.reassigned_by` บันทึกคนที่มอบหมายครั้งแรก แทนคนที่ขอเปลี่ยน | fixed `6353de7` |
| BUG-044 | R3-sheet | S5 | spec-gap | คนที่ไม่ใช่เจ้าของงานตอบคำขอ ได้ 404 `CASE_NOT_FOUND` แต่ spec ว่า `PERMISSION_DENIED` (ไม่ leak — ยอมรับได้?) | closed — มติ PO Q18 คง 404 (แก้ `40` ให้ตรง) `f997af4` |
| BUG-045 | R4-sheet | S2 | code | เจ้าหน้าที่อนุมัติเคสไม่มีหน้าจอตีกลับหลักฐาน (`reject_evidence`) และไม่มีหน้าใดนอก /field แสดงหลักฐานปิดงานเลย — มีแต่ API | fixed `02b7ccd` (merge 03/10/2569) · R4a: พนักงานเองก็เปิดดูรูป/วิดีโอที่ส่งแล้วไม่ได้ |
| BUG-046 | R4-sheet | S2 | code | พนักงานภาคสนามไม่มีหน้าจอขอเงินทดรอง (ปุ่มอยู่ใน /finance ที่พนักงานเข้าไม่ได้) | fixed `3f63c5b` (merge 03/10/2569) |
| BUG-047 | R4-sheet | S2 | code/seed | ไม่มี role ใดได้ capability `approve_advance` ⇒ ฝ่ายการเงินอนุมัติ/ปฏิเสธเงินทดรองไม่ได้ (Superadmin ได้คนเดียว) | fixed `27f84f8` (merge 03/10/2569) |
| BUG-048 | R4-sheet | S4 | code | ช่อง "บันทึกเพิ่มเติม" ในฟอร์มปิดงานไม่ถูกบันทึก | fixed `47d6ac1` (มติ PO Q15 — `case_evidences.note`) |
| BUG-049 | R4-sheet | S4 | code | แจ้งเตือน "หลักฐานถูกตีกลับ" ลิงก์ไป `/field/cases/<id>` ซึ่งเป็น 404 | fixed `a38f561` (merge 03/10/2569) |
| BUG-050 | R4-sheet | S4 | spec-gap | server รับ path หลักฐานเป็นข้อความอะไรก็ได้ + ไม่ตรวจเนื้อไฟล์ · ฝั่ง browser ตรวจแค่ MIME prefix (คู่กับ BUG-037) | fixed `fa7cfb3` (มติ PO Q13) |
| BUG-051 | R4-sheet | S4 | code | ลิงก์ superseded ของ expense แถวเก่าชี้แถวทดแทนผิดตัว | fixed `188ce65` (merge 03/10/2569) |
| BUG-052 | R4-sheet | S3 | code | resubmit คิดราคา expense ใหม่ด้วยแผน/วันที่ ณ ตอน resubmit (ควรยึด snapshot เดิม — `92` §7.1) | fixed `0ef5543` (มติ PO Q7) |
| BUG-053 | R4-sheet | S5 | code | ปุ่มบันทึกร่างโชว์ toast สำเร็จแม้บันทึกล้ม | fixed `d6ae4c6` (merge 03/10/2569) · R4a ยืนยันว่ายังเกิดบนโค้ด staging ก่อน merge | 
| BUG-054 | R4-sheet | S4 | spec-gap | การ์ดเคสและหน้ารายได้ของพนักงานโชว์ค่าคอมมิชชัน ฿500/฿1,000 ที่ระบบไม่เคยจ่ายจริง (ผลกระทบของ BUG-010) | fixed `7c34edb` (มติ PO Q2 — income อ่าน expense จริง) |
| BUG-055 | R4-sheet | S4 | spec-gap | ไม่มีกระบวนการอนุมัติหลักฐานปิดงาน — `case_evidences` ค้าง `pending` ตลอด (ใครอนุมัติ เมื่อไร?) | fixed `1a5a07c` (มติ PO Q14) · ข้อสังเกต: เคสไม่สำเร็จที่ไม่มี expense เลยจะค้าง pending |
| BUG-056 | R4-sheet | S3 | spec-gap | เพื่อนร่วมทีมเปิดเคสของคนอื่นแบบอ่านอย่างเดียวได้ เห็นเบอร์/ที่อยู่ลูกหนี้ (คล้าย BUG-022 PDPA) | closed — มติ PO Q9: เห็นได้ตามเดิม (accepted risk) |
| BUG-057 | R4-sheet | S5 | spec-gap | ปิดงานไม่สำเร็จไม่มีช่องเหตุผลที่บังคับแยก | fixed `c9ad1ce` (มติ PO Q16 — `CLOSE_FAIL_REASON_REQUIRED`) |
| BUG-058 | R4-sheet | S5 | spec-gap | สร้างเงินทดรองด้วยวันครบกำหนดเคลียร์ในอดีตได้ (schema ตรวจแค่รูปแบบ) — UAT ใช้ทำ ADV3 overdue | fixed `56d6b1c` (มติ PO Q8) |
| BUG-059 | R3 | S4 | code | แจ้งเตือน timeout ที่ส่งถึงพนักงานลิงก์ไป `/cases/assign` → เด้งไป `/dashboard` · ข้อความเหมือนกันทั้ง 3 คน พนักงานใหม่ไม่รู้ว่าได้เคสเพิ่ม | fixed `250bd88` |
| BUG-060 | R3 | S5 | spec-gap | อัตราสำเร็จก่อนมีเคสปิด: บางจุดแสดง "0.00%" บางจุด "N/A" แอปพนักงาน "-" · ตัวหารควรเป็นเคสที่ปิดแล้วหรือเคสที่ได้รับมอบหมาย + สัญลักษณ์ควรเหมือนกัน (Rule 01: หารศูนย์ = N/A) | fixed `52b3209` (มติ PO Q20) |
| BUG-061 | R3 | S5 | code | ตอนโอนเคส `case_assignments.reassign_reason` ของแถวเดิมถูกเขียนทับด้วยเหตุผลที่ถูกโอนออก (`reassignment_history` ยังครบ) | fixed `6353de7` |
| BUG-062 | R4.08 | S4 | code | แผนที่เล็กตอนเช็คอินเป็นรูปเสียทุกครั้ง — โหลดจาก `staticmap.openstreetmap.de` ซึ่ง DNS ไม่มีแล้ว (NXDOMAIN) `lib/field/map-pan.ts:82` | fixed `93b1515` (merge 03/10/2569) · เลิกโหลดแผนที่ภายนอก แสดงพิกัด + ลิงก์ Google Maps · ภาพแผนที่จริงต้องมีมติเลือกผู้ให้บริการ |
| BUG-063 | R4a | S2 | spec-gap/seed | **ไม่มี role ใดถือ capability คลังเลย** (`intake_asset` และอีก 3 ตัว) ⇒ ปิดงานสำเร็จแล้วไม่มีแจ้งเตือนถึงใคร · งานคลังทำได้แค่ Superadmin · **บล็อก R5** | fixed `c326f38` (มติ PO Q1 — ธุรการถือสิทธิ์คลัง 4 ตัว + เมนู /warehouse) |
| BUG-064 | R4a | S3 | code | แจ้งเตือน "ปิดงานไม่สำเร็จ"/"มีรายการเบิกใหม่" ส่งถึงทุกคนในองค์กรที่ถือ capability ไม่กรองทีม (mgr.out ได้ของ C3 ทีม A) | fixed `250bd88` (กรองผู้รับตาม scope) |
| BUG-065 | R4a | S5 | code | กดรับงานแล้ว toast ไม่มีเลขเคส · "มอบหมายเมื่อ" ใน modal ไม่มีเวลา | fixed `74907a9` (merge 03/10/2569) |
| BUG-066 | R4a | S4 | code | การ์ด "รับงานแล้ว" ไม่แสดงเวลารับงาน · การ์ด "กำลังติดตาม" ไม่มีเลขเคส (Rule 05) | fixed `ce1d77b` (merge 03/10/2569) |
| BUG-067 | R4a | S5 | code | ไฟล์แนบในฟอร์มปิดงานแสดงเป็นไอคอน ไม่มีภาพย่อ/ชื่อไฟล์ | fixed `e7c79c3` (merge 03/10/2569) |
| BUG-068 | R4a | S5 | code | ป้ายวันแสดง "วันส 03/10/2569" (ตัดชื่อวันผิด) | fixed `17914b3` (merge 03/10/2569) |
| BUG-069 | R4a v2 | S5 | code | toast หลังปิดงานยังเขียน "ระบบสร้างรายการเบิกค่าน้ำมัน/เบี้ยเลี้ยงให้อัตโนมัติ" ไม่พูดถึงคอมมิชชัน/ค่าเสี่ยงที่สร้างแล้ว (Q2) | fixed `24977f5` (merge 03/10/2569) |
| BUG-070 | R4a v2 | S5 | code | server ปัดไฟล์ปลอมแล้ว ฟอร์มปิดงานยังถือไฟล์นั้นไว้ → autosave ได้ 400 `UPLOAD_FILE_TYPE_INVALID` ซ้ำทุกครั้งจนกว่าจะลบไฟล์เอง (ข้อความไม่หาย) | fixed `f712337` (merge 03/10/2569) |
| BUG-071 | R4b v2 | S5 | code | ส่งหลักฐานใหม่แล้วธุรการได้แจ้งเตือน "ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง" ของเคสเดิมซ้ำ (ข้อความเหมือนกันทุกตัว) | fixed `de3abc4` (merge 03/10/2569) |
| BUG-072 | R4b v2 | S4 | code | ใบเสร็จค่าที่พักไม่ผ่านการตรวจไฟล์ฝั่ง server (ไม่เก็บ hash) และไม่ตรวจเพดานต่อคืน (`hotel_max_per_night` ฿800) — ขยายมติ Q13 ให้ครอบคลุมใบเสร็จ | fixed `37b41e0` ส่วนตรวจไฟล์ใบเสร็จ (merge 03/10/2569, migration `20261003150000`) · เพดานต่อคืน needs-decision |
| BUG-073 | R4b v2 | S5 | code | ฟอร์มค่าที่พัก: ยอด 0/ติดลบ ขึ้น "กรุณากรอกวันที่และจำนวนเงิน" ทำให้เข้าใจว่าวันที่ว่าง | fixed `facaa0c` (merge 03/10/2569) |
| BUG-074 | R5-sheet | S3 | code | รับเข้าคลังได้โดยไม่กรอก IMEI ที่พบจริง (schema รับ null, หน้าจอไม่เตือน) | ✅ ยืนยันใน R5 (ช่อง IMEI ว่างไม่เตือน, API รับ null) — open |
| BUG-075 | R5-sheet | S4 | code | ตีกลับการรับเข้าไม่บันทึก IMEI ที่พบจริงลง audit (`44` §14 กำหนด) | ✅ ยืนยันใน R5 (`imei_actual` NULL หลังตีกลับ) — open |
| BUG-076 | R5-sheet | S3 | code/seed | ผู้จัดการ/หัวหน้าทีมเห็นเมนูคลังแต่ไม่มีสิทธิ์ → API 403 · `06` §7.2 ให้อ่านอย่างเดียว (เกี่ยวกับข้อสังเกต Q1 ว่าผู้จัดการรับเข้าได้ไหม) | ✅ ยืนยันใน R5 (เห็นเมนู แต่ทุกแท็บ "ไม่มีสิทธิ์ใช้งาน") — needs-decision: อ่านคลังของทีมตัวเอง หรือซ่อนเมนู |
| BUG-077 | R5-sheet | S5 | code | คอลัมน์ "วันที่รับเข้า" แสดงแค่วันที่ ไม่มีเวลา (Rule 05) | ✅ ยืนยันใน R5 — open |
| BUG-078 | R5-sheet | S5 | spec-gap | `44` §10 ห้าม trim IMEI แต่โค้ด trim ช่องว่างก่อนตรวจ | ✅ ยืนยันใน R5 (ช่องว่างหน้า IMEI ถูก trim) — needs-decision |
| BUG-079 | R5.13 | S4 | code | PDF ใบส่งมอบตัดตัวอักษรท้ายชื่อบริษัทตัวหนา ("…จำกั" — "ด" หาย) | open |
| BUG-080 | R5.13 | S5 | code | PDF ใบส่งมอบไม่แสดงวันนัดรับ (หน้า "ดูตัวอย่างใบส่งมอบ" แสดง) | open |
| BUG-081 | R5 | S5 | code | หน้า `/warehouse` เรียก `/api/finance-companies`, `/api/teams`, `/api/users` เติมตัวกรอง → 403 สำหรับผู้ใช้บริษัท/การเงิน/บัญชี (console error + ตัวกรองว่าง) | open |
| BUG-082 | R5.15 | S5 | code | modal "เอกสารที่แนบ" แสดง path ภายใน Storage แทนชื่อเอกสาร | open |
| BUG-083 | R5.04 | S5 | code | IMEI รูปแบบผิดขึ้นข้อความ "ระบบบันทึกค่าที่ตรวจจริงไว้แล้วและรับเข้าคลังต่อได้" ขัดกับ "รูปแบบ IMEI ไม่ถูกต้อง" | open |
| BUG-084 | R5 | S5 | spec-gap | บริหาร Export ใบส่งมอบได้ — `44` §13 ระบุแค่ธุรการ/การเงิน/บัญชี | needs-decision |
| BUG-085 | R6-sheet | S2 | spec-gap | ผู้จัดการทีมไม่มีหน้าจออนุมัติค่าตอบแทนขั้น 1 (`16` vs `06`) | fixed `2b0e9d9` (มติ PO R6-A — เมนูการเงิน → แท็บ "ค่าตอบแทน" เฉพาะผู้ถือ `approve_expense_manager`) |
| BUG-086 | R6-sheet | S2 | code | รายการเบิกไม่ผูกเคสไม่มีผู้จัดการทีมคนไหนเห็นในขั้น 1 | fixed `c0a0d21` (มติ PO R6-B — ทีมของผู้เบิก) |
| BUG-087 | R6-sheet | S3 | code | การเงินเปิดหน้าผู้รับเงินไม่ได้ (ลิงก์ไป `/settings/finance` แล้ว redirect) | fixed `220a495` (`/finance?tab=payee`) |
| BUG-088 | R6-sheet | S4 | code | ตีกลับ/ปฏิเสธไม่มีเหตุผลได้ `REQUIRED_MISSING` แทน `REJECT_REASON_REQUIRED`/`REJECTION_REASON_REQUIRED` | fixed `dfbddfc` |
| BUG-089 | R6-sheet | S2 | code | **อนุมัติ expense ตัวสุดท้ายของเคสพร้อมกัน → รายได้ไม่เกิดเลย** (ไม่มี row lock / ไม่มี unique) — เทสต์ถอดล็อกแล้วได้ 0 แถวจริง | fixed `005b170` (FOR UPDATE + partial unique `uniq_revenues_active_case_round`, migration `20261003160000`) · ⚠️ ก่อน deploy staging ตรวจรายได้ซ้ำก่อน — migration ล้มโดยตั้งใจถ้ามี |
| BUG-090 | R6-sheet | S4 | code | บริหารได้ 403 บน payout/advances แต่แท็บโชว์ "0" | fixed `fa778b2` (บัญชี/บริหารดูรอบจ่ายตาม `17` §12 · เงินทดรองซ่อนแท็บ) · ❓ `25` §7.2 ยังไม่ให้ — ต้องปรับ `25` ให้ตรง `17` |
| BUG-091 | R6-sheet | S5 | code | modal สร้างรอบจ่ายเขียนว่า WHT คิดต่อรายการ (ขัด Q5) | fixed `9ca8427` |
| BUG-092 | fixer H | S4 | code | job รายวัน settle วันที่มีเคสยังเปิดอยู่ → แถวรายวันของเคสนั้นเป็น `pending_approval` ทันที ถ้าภายหลังเคสปิดสำเร็จ แถวนั้นจะไม่รอคลัง (ควร `pending_warehouse_confirm`) — เกตรายได้ยังบังคับ lot confirmed อยู่ ไม่กระทบรายได้ แต่การอนุมัติค่าตอบแทนก่อนผ่านคลังไม่ตรงหลัก | open |
| BUG-093 | fixer H | S5 | spec-gap | วันที่อยู่ในงวดบัญชีที่ปิดแล้ว job จะข้าม ไม่ settle ⇒ เคสของวันนั้นติดเกตรายได้ จนกว่าจะทำ Adjustment · หลัง deploy เคสเดิมบน staging จะรอรายได้จนถึงรอบ job คืนแรก | needs-decision |
| BUG-094 | R4a-v3 R4.01 | S2 | env | snapshot `R3-end-v3` มีตาราง `field_day_settlements` ว่างแต่ `_prisma_migrations` ไม่มี 170000 → `restore.sh` ซ่อน error ของ `db:deploy` ⇒ ฐาน dev ขาด 3 migration · `/api/field/expenses` 500 (`expenses.receipt_file_hash` ไม่มี) | fixed (04/10/2569 orchestrator: drop ตารางว่าง + `migrate resolve --rolled-back` + deploy · snapshot `R3-end-v3b` · `restore.sh` ไม่ซ่อน error + หยุดถ้า migrate status ไม่สะอาด) |
| BUG-095 | R4a-v3 R4.23b | S4 | code | หน้าอนุมัติ (`/finance?tab=comp`) คอลัมน์ "สูตร/ฐานคิด" ของแถวรายวันแสดงอัตราเต็ม ("1 วัน × 150.00 บาท/วัน", "เหมาจ่ายรายวัน 200.00 บาท/วัน") คู่ยอดที่หารแล้ว ฿75/฿100 ไม่บอกว่าหารกี่เคส ⇒ ดูเหมือนยอดผิด | fixed `8e66f91` (merge `2faed64` 04/10/2569) |
| BUG-096 | R4a-v3 R4.12 | S4 | code | แจ้งเตือน `expense.case_bound_created` ลิงก์ไป `/finance/approvals` (`lib/notifications/messages.ts:307`) → หน้าไม่พบ · คิวจริงอยู่ `/finance?tab=comp` | fixed `bb5f635` (merge `46b31d4` 04/10/2569) |
| BUG-097 | R4b-v3 R4.30 | S5 | code | audit ของ commission เดิมที่ถูกแทน (resubmit_close) ไม่มี `supersededByExpenseId` และ events `[]` — ลิงก์ไปใบใหม่อยู่แค่คอลัมน์ `expenses.superseded_by_expense_id` | fixed `06704ee` (merge `46b31d4` 04/10/2569) |
| BUG-098 | R4b-v3 R4.38b | S4 | code | ส่งรายการเบิกใหม่หลังถูกตีกลับ → ข้อความชี้แจงเขียนทับหมายเหตุตอนเบิก (ใช้ฟิลด์ `revision_note` ร่วม) · audit ไม่เก็บค่าเดิม ⇒ หมายเหตุเดิมหาย · หน้าเบิกแสดงข้อความชี้แจงแทนชื่อรายการ | fixed `b0f4b02` (merge `46b31d4` 04/10/2569) |
| BUG-099 | R4b-v3 R4.38b | S5 | code | แจ้งเตือน "รายการเบิกถูกตีกลับ" ลิงก์ไป `/field/income` แทนหน้าเบิก | fixed `bb5f635` (merge `46b31d4` 04/10/2569) |
| BUG-100 | R4b-v3 R4.31 | S5 | spec-gap | resubmit ปิดงานเขียนทับ `cases.completed_at` → หน้าจบงาน/สรุปรายได้แสดงเวลาปิดล่าสุด (00:56 แทน 00:45) · ถ้าข้ามเดือนจะย้ายเคสไปเดือนใหม่ในตัวกรองรายได้ | needs-decision · ข้อเสนอ orchestrator: คงเวลาปิดครั้งแรกไว้แสดง + แสดง "ส่งหลักฐานใหม่เมื่อ" แยก (โยงคำถามค้าง "วันที่รายได้หลัง resubmit ข้ามเดือน") |
| BUG-101 | R4b-v3 R4.33 | S5 | spec-gap | หน้าเบิกของพนักงาน กล่อง "รอดำเนินการ" แสดงยอดแยกต่อแท็บ (ผูกเคส ฿1,350 / เบิกแยก ฿600) ไม่มียอดรวม ฿1,950 | needs-decision · ข้อเสนอ orchestrator: เพิ่มยอดรวมทุกแท็บ |
| BUG-102 | R4b-v3 R4.34 | S5 | spec-gap | ช่อง "พักร่วมกับ" ของค่าที่พักให้เลือกผู้จัดการ/หัวหน้าทีมได้ | needs-decision · ข้อเสนอ orchestrator: จำกัดเฉพาะพนักงานภาคสนาม |
| BUG-103 | R5-v2 R5.11 | S5 | env | `restore.sh` (`pg_restore --clean`) ไม่ลบ sequence เลขเอกสารตามปีที่เกิดหลัง dump → ล็อตรอบนี้ได้ LOT/DLV-2569-003/004 แทน 001/002 (แอปไม่ข้ามเลข) | fixed (04/10/2569 restore.sh ลบ `seq_%` ก่อน restore) · มติ orchestrator: ใช้ 003/004 ต่อ ไม่เล่น R5 ใหม่ |
| BUG-104 | R5-v2 R5.16 | S5 | code | audit `lot.confirmed` ไม่เก็บเหตุผลที่ข้ามการสร้างรายได้ต่อเคส (`expense_not_approved`/`field_days_not_settled`) — ตรวจย้อนหลังไม่ได้ว่าทำไมไม่เกิดรายได้ | fixed `6b7c949` (merge `46b31d4` 04/10/2569) |
| BUG-105 | R6a-v3 | S4 | code | ผู้อนุมัติกดปุ่มจากหน้าที่ค้างหลังรายการผ่านขั้นนั้นไปแล้ว → toast "อนุมัติข้ามขั้น — รายการนี้ยังไม่ถึงขั้นอนุมัติของคุณ" ผิดทิศ (`APPROVAL_STEP_OUT_OF_ORDER` requestedStep 1 < currentStep 2 ควรบอกว่า "รายการนี้ผ่านขั้นของคุณแล้ว") · ไม่กระทบข้อมูล | fixed `13ea344` (merge `2faed64` 04/10/2569) |
| BUG-106 | R6a-v3 R6.01 | S5 | spec-gap | ไม่มีแจ้งเตือนถึงผู้อนุมัติเมื่อมีรายการเข้าคิว (ค่าที่พัก/แถวรายวัน/หลังล็อตปลดล็อก/C5 ถึงขั้น 3 ของบริหาร) — มีแค่แจ้งเตือนปิดงาน C3 · `90` ไม่ได้กำหนด (R6-N1) | needs-decision · ข้อเสนอ orchestrator (O5): แจ้งเตือนสรุปรายวันต่อผู้อนุมัติ |
| BUG-107 | R6b-v3 R6.39 | S3 | code | modal เคลียร์เงินทดรอง: พิมพ์ `abc` ในช่อง "ยอดที่ใช้จริง (บาท)" → ทั้งหน้าล่ม "ระบบขัดข้อง" (`MoneyFormatError NaN`) — `components/finance/settle-advance-modal.tsx:92` ส่ง NaN เข้า `fmtSatangSymbol` (เช็คแค่ `!== null`) · ใช้ร่วมหน้ามือถือ + หน้าการเงิน · ข้อมูลไม่เสีย | fixed `2ac5fb9` (merge `2faed64` 04/10/2569) |
| BUG-108 | R6b-v3 | S4 | code | คำอธิบายตารางรายได้แสดง markdown ดิบ `**และ**` (`components/finance/revenue-tab.tsx:290`) | fixed `c02cc2e` (merge `2faed64` 04/10/2569) |
| BUG-109 | R6b-v3 R6.39 | S5 | spec-gap | เงินคืนจากเงินทดรอง (ADV1 ฿550) ระบบบันทึกยอดคืนแต่ไม่มีการรับเงินคืน/หักกลบ | needs-decision · มติ orchestrator A6: บันทึกเป็นลูกหนี้พนักงาน + หักกลบในรอบจ่ายถัดไปของผู้รับ |
| BUG-110 | R6b-v3 R6.35 | S5 | code | toast `UNVERIFIED_PAYEE_IN_PAYOUT` ไม่บอกว่าผู้รับคนไหนยังไม่ยืนยัน | fixed `11fff87` (merge `2faed64` 04/10/2569) |

## รายละเอียด
<!-- ### BUG-001 …  reproduce / คาดหวัง (อ้าง §spec) / เกิดจริง / snapshot / ภาพ -->

## ไม่ใช่บั๊กของแอป (บันทึกไว้กันสับสน)
- R0: `pnpm add` ระหว่าง dev server รัน → Turbopack ถือ module graph เก่า ทุก API ตอบ 500 (`next/headers … instantiated because it was required from…`) — แก้ด้วย `~/bin/dev restart asset` · **กฎ: ติดตั้งแพ็กเกจแล้วต้อง restart dev server เสมอ**

## ข้อสังเกตที่ต้องตรวจต่อ (ยังไม่ใช่บั๊ก)
- R6b v3 (W1): แถวเงินทดรองใน `payout_batch_items` เก็บ tax profile id ของผู้รับ แต่ WHT 0%/0 — ยอดถูก · **R7/R9 ตรวจว่ารายงาน ภ.ง.ด.3 ไม่นับเงินทดรอง**
- R6b v3 (W3): บัญชีเปิดหน้ารอบจ่ายไม่ได้ (เด้ง dashboard) แต่ GET API ได้ — ตรง `06` (บัญชีไม่มีเมนูการเงิน) · step sheet R6.41 คาดผิด
- R6b v3: อนุมัติ expense/advance ไม่มีเหตุผลใน audit — ตรงกติกา (reason บังคับเฉพาะ reject/ตีกลับ) · มติ orchestrator O8
- R6a v3: step sheet R6.09 นับการเงินเห็น 14 แถว — จริง 15 (13 ทีม A + C5 2) ถูกแล้ว · หน้าจอสะกด "คอมมิชชั่น" · เห็นซ้ำ BUG-095/096/099/103
- R5 v2: ยืนยัน BUG-071 แก้แล้ว · BUG-074…084 ยังอยู่ (ไม่บล็อก) · step sheet R5 §0.6 asset id เก่า + สคริปต์ s07/s15 เป็นเวอร์ชันต่อรอบ ("b") — ผลเทียบเท่า (probe รูปปลอมทำบน C5 แทน C4 · เอกสารล็อต CO1 มี v2 แรกเพิ่ม 1 ไฟล์)
- R4b v3: ยืนยัน BUG-071/072/073 แก้แล้ว · step sheet R4.36 ยังคาด `closed_success` 5 แถว — ค่าจริงถูก: 4 แถว + `case.close_resubmitted` 1 แถว (แก้ step sheet รอบหน้า)
- R4b v3: เบิกค่าที่พัก/ส่งใหม่ ไม่มีแจ้งเตือนถึงผู้จัดการทีม · ค่าที่พัก/เงินทดรองไม่มีแจ้งเตือน — ให้ R6 ดูต่อ
- R4b v3 R4.38b: PO เผลอใช้ admin อนุมัติขั้น 1 ค่าที่พัก 01:24 → ตีกลับผ่านหน้าจอ + in1 ส่งใหม่ (ไม่ใช่บั๊ก — approval_history มี approve+reject ค้างเป็นร่องรอย)
- R4a v3 (R4v3-A): เช็คอินหลัง job รายวัน settle แล้ว — ไม่มีคำเตือนใน response (ทดสอบสดไม่ได้ เพราะกติการอบห้ามเช็คอินหลัง settle) · S4 ข้อสังเกต
- R4a v3 (R4v3-B ยืนยัน): job รายวันไม่ส่งแจ้งเตือน (29 → 29) · แจ้งเตือนปิดงาน C3 เขียน "1 รายการ" แต่คิวมี 3 แถวหลัง settle
- R4a v3 (R4v3-C ยืนยัน): หน้ารายได้/ยอดคอมมิชชันบนแดชบอร์ดของพนักงานไม่เปลี่ยนหลัง settle (ไม่รวมค่าน้ำมัน/เบี้ยเลี้ยง)
- R4a v3: BUG-065/BUG-068 ไม่เกิดซ้ำ (ยืนยันแก้แล้ว)
- R1.43: ผู้ใช้กลุ่มบริษัทไฟแนนซ์เข้า `/dashboard`, `/cases`, `/warehouse` ในแอปภายในได้ และ `/api/cases`, `/api/assets`, `/api/handover-lots` ตอบ 200 — **ตรง `06` §7.2** (Company User เห็นแดชบอร์ด/จัดการเคส/คลัง read company scope) ⇒ R2 และ R5 ต้องพิสูจน์ว่าเห็นเฉพาะข้อมูลบริษัทตัวเอง (`uat.co2.admin` ห้ามเห็นเคส CO1)
