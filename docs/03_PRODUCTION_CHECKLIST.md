# 03_PRODUCTION_CHECKLIST.md — สิ่งที่ต้องทำครบ **ก่อนเปิด PR แรกจาก `staging` เข้า `main`**

> **ที่มา**: มติ PO 2026-08-12 — task 0.2 ทำเฉพาะฝั่ง staging ให้จบก่อน ส่วนฝั่ง production ยกมาไว้ที่ไฟล์นี้ทั้งหมด
> **กติกา**: ห้าม merge PR แรกเข้า `main` จนกว่าทุกข้อในไฟล์นี้ติ๊กครบ · `main` = production เท่านั้น เข้าได้ทางเดียวคือ PR จาก `staging` (`.claude/rules/06-git-workflow.md`)
> ติ๊ก `[x]` พร้อมวันที่กำกับเมื่อทำเสร็จ — ข้อที่ต้องใช้ค่า secret **PO เป็นคนใส่เองผ่าน UI เท่านั้น ห้ามวางในแชท/commit**

---

## A. Supabase Production Project

- [ ] สร้าง project ใหม่ชื่อ `assetrecovery-production` — **Pro plan ($25/เดือน) ตั้งแต่วันแรก** (Free tier pause เองเมื่อไม่มี traffic 7 วัน ใช้กับ production ไม่ได้ — `docs/tool-register.md`)
- [ ] Region เดียวกับ staging (ลด latency ที่ต่างกันตอนเทียบผล) + จด region ไว้ในไฟล์นี้
- [ ] ตั้ง database password ที่แข็งแรง เก็บใน password manager — **ห้ามใช้ค่าเดียวกับ staging**
- [ ] เปิด daily backup ที่มากับ Pro plan (RPO/RTO 24 ชม./24 ชม. ตาม `03` — ตัดสินใจแล้วว่าไม่ซื้อ PITR add-on)
- [ ] ตรวจว่า **ไม่ได้เปิด** Supabase Branching / GitHub migration sync / ไม่มีโฟลเดอร์ `supabase/migrations` ใน repo — Prisma เป็นเจ้าของ schema ทางเดียว (`.claude/rules/02-database.md`)
- [ ] Storage: สร้าง bucket ให้ตรงกับ staging (ชื่อ + policy เหมือนกัน) — evidence / เอกสารภาษี / export pack
- [ ] Auth: ตั้ง Site URL + Redirect URLs เป็นโดเมน production (ไม่ใช่ค่า staging)

## B. Vercel — Environment & Domain ฝั่ง Production

- [ ] ใส่ env ครบ 5 ตัวใน scope **Production** เท่านั้น (ค่าจาก Supabase **production**): `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] **ตรวจซ้ำว่าไม่มีค่า staging ปนใน scope Production แม้แต่ตัวเดียว** (เทียบ project-ref ในทุกค่าให้ตรงกัน)
- [ ] `DATABASE_URL` = Transaction pooler **6543** · `DIRECT_URL` = Session pooler **5432** (หรือ Direct 5432 ถ้าเครือข่ายรองรับ IPv6) — วิธีประกอบค่าเหมือนฝั่ง staging ทุกประการ
- [ ] ผูกโดเมน production (ชั่วคราวใช้ `*.vercel.app` ได้ — โดเมนจริงรอชื่อ Product ตาม `docs/tool-register.md` §5)
- [ ] ยืนยัน Production Branch = `main` และ deployment ของ `staging` ยังเป็น Preview เหมือนเดิม

## C. Database & Seed ฝั่ง Production

- [ ] รัน `pnpm db:deploy` (= `prisma migrate deploy`) ชี้ไป production **ครั้งแรกครั้งเดียว** — ห้ามใช้ `migrate dev` กับ production เด็ดขาด
- [ ] รัน seed master data (Phase 1.2): organization จริง, 15 roles, role_capabilities, settings ตั้งต้นตามไฟล์ `13`
- [ ] ใส่ข้อมูลจริงขององค์กร: ชื่อบริษัท / เลขประจำตัวผู้เสียภาษี / ที่อยู่ / โลโก้ — ค่าพวกนี้ขึ้นบนเอกสารภาษีทุกใบ **ห้ามปล่อยค่า dummy**
- [ ] ตั้ง `vat_rate_history` แถวแรกให้ถูกต้อง (effective date + อัตราจริง) — ห้าม hardcode 7% ในโค้ด (Rule 01)
- [ ] ตั้งเลขเริ่มต้นของ document numbering (ใบกำกับภาษี / LOT / DLV ฯลฯ) ตามที่บัญชีกำหนด — **เลขห้าม gap** (`31`)
- [ ] สร้างบัญชี Superadmin จริง + ปิด/ลบบัญชีทดสอบทั้งหมดที่หลุดมาจาก staging

## D. Verify การแยก Staging ↔ Production (ทำจริง ห้ามเชื่อว่าแยกแล้ว)

- [ ] สร้าง row ทดสอบใน staging DB → เช็คว่า production DB **ไม่มี** row นั้น แล้วลบทิ้ง
- [ ] อัปโหลดไฟล์ทดสอบเข้า Storage staging → เช็คว่าไม่โผล่ใน production แล้วลบทิ้ง
- [ ] เปิด production domain แล้ว login ด้วยบัญชี staging → **ต้อง login ไม่ได้** (คนละ Auth project)
- [ ] เทียบ `NEXT_PUBLIC_SUPABASE_URL` ที่ browser เห็นบน 2 โดเมน → project-ref ต้องคนละตัว

## E. Repo / CI / Branch Protection

- [ ] Branch ruleset บน `main`: require PR · block force push · restrict deletion · require status check **CI** ให้เขียวก่อน merge
- [ ] ยืนยันว่า merge เข้า `main` ได้เฉพาะ PR ที่ base มาจาก `staging` เท่านั้น (ไม่มี branch อื่นลัดเข้า)
- [ ] CI เขียวบน PR นั้นจริง (`lint` → `typecheck` → `test` → `build`)
- [ ] ไม่มี secret หลุดใน repo: `git log -p` หา `SUPABASE_SERVICE_ROLE_KEY` / password / `.env` ที่ไม่ใช่ `.env.example`

## F. ก่อน Go-Live จริง (ทำได้หลัง merge แต่ต้องก่อนใช้งานจริงกับเงิน)

- [ ] 🔶 นักบัญชีเซ็นรับรูปแบบเอกสาร/ค่าตั้งต้นที่ติดธงไว้ใน `docs/02_OPEN_DECISIONS.md` — **ก่อนออกเอกสารภาษีใบแรกและก่อนจ่ายเงินจริงครั้งแรก**
- [ ] ทดสอบไฟล์โอนเงินธนาคารกับไฟล์จริง 1 รอบ ก่อนปลดล็อก `BANK_FILE_NOT_TESTED` (`17`, PLAN §3.4)
- [ ] ตรวจว่า background job ทุกตัวชี้ production ถูกและ idempotent (`91`)
- [ ] Google Maps API key ของ production (คนละ key/quota กับ staging) — ต้องมีก่อน Field Tracker ใช้งานจริง (`41`)
- [ ] ตัดสินใจเรื่อง error monitoring (Sentry) + uptime monitor — optional ตาม `tool-register.md` §🔵 รอ PO confirm

---

## บันทึกค่าที่ยืนยันแล้ว (เติมเมื่อทำจริง — **ห้ามใส่ค่า secret**)

| รายการ | ค่า | วันที่ยืนยัน |
|---|---|---|
| Supabase production project ref | | |
| Region | | |
| Production domain | | |
| วันที่รัน `migrate deploy` ครั้งแรก | | |
| วันที่ merge PR แรกเข้า `main` | | |
