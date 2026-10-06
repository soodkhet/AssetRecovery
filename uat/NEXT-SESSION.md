> **อัปเดต 06/10/2569 ค่ำ (HANDOFF → Final Test)** — prompt สำหรับ session ใหม่:
>
> ```
> ทำงาน AssetRecovery (~/AssetRecovery) ต่อ — เตรียมและรัน Final Test รอบสุดท้ายตามมติ U119
> 1. อ่านก่อน (ห้ามอ่านไฟล์ใหญ่ทั้งไฟล์): uat/STATE.md ส่วน "▶️ HANDOFF — 06/10/2569 (ค่ำ)" + Log 10 บรรทัดแรก · uat/PO-DECISIONS-2569-10-04.md แถว U110–U119 · PROGRESS.md ส่วน "งานถัดไป" + หนี้ค้าง · orchestrator/final-tests/*.md
> 2. ตรวจ dev server (curl /login = 200, ไม่ได้ใช้ ~/bin/dev asset) · pnpm prisma migrate status สะอาด
> 3. ทำตามลำดับใน HANDOFF ข้อ 1–5 · ขั้น 3 (ตารางความครอบคลุม+golden) ให้ผมดูก่อน seed · คำถามใช้ AskUserQuestion ภาษาไทย ตัวเลือกแนะนำอยู่ตัวแรก
> 4. ห้าม git push (ผม push เอง) · ห้ามแตะ Supabase dashboard/Vercel โดยไม่ถาม · ห้ามพิมพ์รหัสผ่านจาก uat/personas.json
> 5. งบ context ตาม CLAUDE.md: เก็บงานที่ 600K · 800K commit แล้วเขียน HANDOFF
> ```

> **อัปเดต 06/10/2569 (HANDOFF)** — อ่าน `uat/STATE.md` ส่วน "▶️ HANDOFF — 06/10/2569" ก่อน: งานค้างคือ merge fixer BO (U109) + ถามผู้ใช้เรื่องรอบยืนยัน R15 · มติล่าสุด U109 / O70 · migration ใหม่ 41 ตัว · ชุดคำถามด้านล่างบางชุดปิดแล้ว (O48–O70 รีวิวครบ)

# Prompt สำหรับ session ใหม่ (เขียน 06/10/2569 ~02:15)

> คัดลอกบล็อกด้านล่างไปวางใน session ใหม่ได้ทันที
> สถานะตอนเขียน: มติ U22–U92 ทำครบ · R13 regression จบครบ (R13a/b/c) · บั๊ก UAT open = 0 · migration ใหม่ที่ยังไม่ขึ้น staging **29 ตัว** · ยังไม่ push (U92)

```
ทำงาน AssetRecovery ต่อจาก session ก่อน (UAT + มติ U22–U92 ครบ · R13 regression ผ่าน · บั๊ก UAT open = 0 · ยังไม่ push)

1. อ่านก่อน (ห้ามอ่านไฟล์ใหญ่ทั้งไฟล์):
   - uat/STATE.md (ตารางบนสุด + Log 15 บรรทัดแรก — ตารางบนอาจยังเป็นสถานะ R12 ให้ยึด Log)
   - uat/NEXT-SESSION.md (ไฟล์นี้ — ชุดคำถามด้านล่าง)
   - uat/PO-DECISIONS-2569-10-04.md (มติ U1–U92 ของผู้ใช้ + O1–O53 ที่ orchestrator ตัดสินแทน + มติเชิงบัญชี A1–A7)
   - uat/report/final/OPEN-ITEMS.md (ส่วนท้าย "อัปเดต 06/10/2569")
2. ตรวจ dev server: curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login ต้องได้ 200 (ถ้าไม่ได้ ใช้ ~/bin/dev asset)
   และ pnpm prisma migrate status ต้องสะอาด
3. งานค้าง (ทำตามลำดับ):
   ก. ตรวจ O4 — ตั้งแต่ 06/10/2569 14:02 เป็นต้นไป: รายงาน O4 คาด 2 แถว ยอด 849000 satang
      ใช้ agent อ่านอย่างเดียว (uat/bin/q.sh / หน้ารายงาน) แล้วบันทึกผลใน uat/STATE.md (Log) · ถ้า STATE บันทึกว่าตรวจแล้วให้ข้าม
   ข. ถามผู้ใช้ "ชุดคำถาม" ด้านล่างทีละชุดด้วย AskUserQuestion (ภาษาไทย ตัวเลือกพร้อมตัวอย่างตัวเลข ข้อแนะนำอยู่ตัวแรก)
      จดคำตอบเป็นมติ U93… ลง uat/PO-DECISIONS-2569-10-04.md แล้ว commit ทุกชุด
   ค. ถ้ามติให้แก้โค้ด: fixer ใน worktree (isolation: worktree · ฐานทดสอบ assetrecovery_test2…test7 · git merge staging + pnpm install --frozen-lockfile + pnpm db:generate ก่อน)
      merge ทีละตัว → ถ้ามี migration: pnpm db:generate → pnpm db:deploy → PRISMA_USE_TEST_DB=1 pnpm db:deploy:test → pnpm db:seed → ~/bin/dev restart asset
      → pnpm typecheck && pnpm lint && pnpm test ต้องเขียว → อัปเดต uat/BUGS.md + uat/STATE.md (Log) → commit (ลงท้าย Co-Authored-By)
   ง. ถ้าผู้ใช้ตัดสินให้ push: เตรียมเช็คลิสต์ "ก่อน push staging" ด้านล่างให้ผู้ใช้รันเอง (คำสั่งครบ) — ห้าม push เอง
4. ห้าม git push (ผู้ใช้ push เอง) · ห้ามแตะ Supabase dashboard/Vercel โดยไม่ถามก่อน · ห้ามพิมพ์รหัสผ่าน (uat/personas.json)
```

---

## เช็คลิสต์ก่อน push staging (ผู้ใช้ทำเอง — มติ U92 ยังไม่ push รอทดสอบเพิ่ม)

1. **verify เต็มบนเครื่อง**: `pnpm typecheck && pnpm lint && pnpm test` เขียว
2. **ตรวจรายได้ซ้ำใน staging ก่อน deploy** (BUG-089 · จดใน STATE 03/10/2569) — ต้องว่าง:
   `select case_id, tracking_round, count(*) from revenues where deleted_at is null group by 1,2 having count(*)>1`
3. **migration ใหม่ 41 ตัว** (`20261003113300_revenue_vat_mode_snapshot` … `20261006212000_substitute_receipt_cancel`) · **ก่อนออกเอกสารภาษีฉบับแรกบน production: ตั้งรูปแบบเลข INV/WHT ในแท็บ "เลขที่เอกสาร" (ล็อกหลังออกฉบับแรก)** · **ก่อน go-live: Superadmin กรอกหน้า "ข้อมูลองค์กร" (ชื่อ/เลขผู้เสียภาษี/ที่อยู่/โทร/โลโก้) — ตอนนี้เป็นค่าตัวอย่าง dev**:
   `PRISMA_ENV_FILE=.env.staging pnpm prisma migrate status` → `PRISMA_ENV_FILE=.env.staging pnpm db:deploy`
4. **`db:seed` บน staging** (สิทธิ์ใหม่: `manage_wht_policy`, portal 5 หมวด, `view_client_portal_as`, `manage_customer_wht`, แถวคลัง/รอบจ่ายของบัญชี-บริหาร ฯลฯ — คำสั่งใน memory `staging-migrations-manual`)
5. **Vercel**: ยืนยัน `CRON_SECRET` ตั้งบน staging/production (มติ O40)
6. **Supabase**: "Upload file size limit" ของ project ≥ **100 MB** (วิดีโอ) และ ≥ 25 MB (เอกสารชุด)
7. `git push origin staging` → Vercel Staging deploy
8. **แจ้งสำนักงานบัญชี** (ก่อนส่ง Export Pack ชุดแรกจาก staging/production):
   - Export Pack เป็น **14 ไฟล์** — ไฟล์ใหม่ `09_Credit_Notes` · `10_Customer_WHT` · `11_Suspense_Receipts` · `12_Tax_Invoices` · `13_Advance_Returns` · `14_Unbilled_Revenue` + โฟลเดอร์ `tax_invoices/` (PDF) + `00_Cover_Sheet.pdf`
   - คอลัมน์ใหม่ในไฟล์ 04/05/06/07/09/10/11/12 (เช่น `filing_form`, `advance_offset`/`transfer`, `billing_batch_number`, สาขาผู้ซื้อ/ผู้ขาย)
   - ส่ง `docs/QUESTIONS-FOR-ACCOUNTANT.md` (ปรับโครงใหม่ 06/10/2569 — ส่วนที่ 1 คำถาม Q1–Q11 ที่ต้องยืนยันจริง · ส่วนที่ 2 ค่าที่ต้องกรอกตอนเริ่มใช้)
9. **ทดสอบบน staging** ด้วยมือถือจริง: Field Tracker (เช็คอิน GPS · ปิดงานแนบรูป/วิดีโอ · เบิกค่าที่พัก+จำนวนคืน) · portal มือถือ (BUG-146)
10. **ก่อน go-live**: ลบข้อมูลตัวอย่างใน Supabase (บัญชี Auth + ไฟล์ Storage UAT ทั้งหมด — รายการใน OPEN-ITEMS (จ) + STATE) · **ปิด public signup** เมื่อสร้าง project production

---

## ชุดคำถาม (ถามทีละชุด — แต่ละชุด ≤ 4 ข้อ)

### ชุด 1 — ✅ ปิดแล้ว: ผู้ใช้ยอมรับ O48–O53 ทั้งหมด (06/10/2569) — ไม่ต้องถามซ้ำ
<!-- เดิม: รีวิวมติที่ orchestrator ตัดสินแทนระหว่างผู้ใช้นอน (O48–O53 · U91) -->
1. **O48** ไฟล์ `14_Unbilled_Revenue` แสดงรายได้ค้างรับทั้งหมด ณ สิ้นงวด (รวมที่ค้างจากงวดก่อน — สำนักงานบัญชีบันทึกค้างรับแล้วกลับรายการต้นงวดถัดไป)
   - ก. (แนะนำ) ยอมรับตามที่ทำ + ยืนยันกับนักบัญชีใน G3
   - ข. แสดงเฉพาะรายได้ที่เกิดในงวดนั้น
2. **O49** บริหารไม่เห็นแท็บ "ส่งมอบ"/ประวัติ Export (matrix ตั้งต้นไม่มี `export_accounting_pack`)
   - ก. (แนะนำ) คงตาม matrix — Superadmin มอบสิทธิ์ภายหลังได้
   - ข. ให้บริหารเห็นแบบอ่านอย่างเดียวเป็นค่าเริ่มต้น
3. **O50** ใบเบิกค่าที่พักมีช่อง "จำนวนคืน" (ค่าเริ่มต้น 1) → เพดาน = อัตรา/คืน × จำนวนคืน (เช่น แผน ฿800/คืน × 2 คืน = เบิกได้ถึง ฿1,600 ด้วยใบเสร็จใบเดียว)
   - ก. (แนะนำ) ยอมรับ
   - ข. บังคับ 1 ใบเบิกต่อ 1 คืน
4. **O51–O53** (ยอมรับรวดได้): O51 audit action ใหม่ `view` สำหรับเปิดไฟล์ข้อมูลส่วนบุคคล · O52 เอกสารเคส `other_doc` นับเป็นข้อมูลส่วนบุคคล · O53 ค่าที่พักที่ผูกแผนแล้ว ถ้าตั้งให้อยู่ในฐาน WHT ผู้รับที่ไม่มี Tax Profile จะ fallback อัตราแผนพร้อมคำเตือน
   - ก. (แนะนำ) ยอมรับทั้งสามข้อ
   - ข. ขอดูทีละข้อ

### ชุด 2 — ก่อน push / go-live
1. **push staging** (U92 ตอบ "ยังไม่ push รอทดสอบเพิ่ม") — ทดสอบอะไรเพิ่มก่อน
   - ก. (แนะนำ) push ได้แล้ว — ช่วยเตรียมเช็คลิสต์ + คำสั่งให้ผมรันเอง แล้วทดสอบมือถือจริงบน staging
   - ข. เล่น UAT รอบยืนยันเพิ่มบน dev ก่อน (ระบุส่วน)
   - ค. ยังไม่ push
2. **แจ้งสำนักงานบัญชี** เรื่อง Export Pack 14 ไฟล์ + คอลัมน์ใหม่ + คำถามค้าง
   - ก. (แนะนำ) ให้ร่างอีเมล/เอกสารสรุปให้ผมส่งเอง
   - ข. ผมแจ้งเอง
3. **ทดสอบมือถือจริง** (Field Tracker + portal BUG-146) บน staging
   - ก. (แนะนำ) ให้เตรียม checklist ทีละหน้าจอให้ผมเล่นบนมือถือ
   - ข. ข้ามไปก่อน

### ชุด 3 — เรื่องรอนักบัญชี (ไม่บล็อก push — บล็อก go-live)
- ไม่ต้องถามผู้ใช้ซ้ำ: คำถามทั้งหมดรวมอยู่ใน `docs/QUESTIONS-FOR-ACCOUNTANT.md` (มติ U93 — ส่วนที่ 1 Q1–Q11 ต้องยืนยัน · ส่วนที่ 2 ค่าตั้งที่ต้องกรอก · ส่วนที่ 3 ฟีเจอร์เพิ่ม) · ถามผู้ใช้เพียงว่า "ได้คำตอบจากนักบัญชีแล้วหรือยัง" แล้วนำคำตอบไปตั้งค่า/แก้ตามข้อ

> หมายเหตุ: ไฟล์ขยะ Storage จาก R13 +1 (ใบเสร็จจาก probe หลังล็อกงวด ~00:43 ใน `case-documents/expenses/88cb577d…/receipts/`) — รวมในรายการลบก่อน go-live
