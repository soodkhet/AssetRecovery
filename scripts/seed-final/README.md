# seed-final — ข้อมูล scenario ของ Final Test (มติ U119 ข้อ 4 · U123 · U124)

SSOT ของข้อมูล = `uat/report/FINAL-coverage.md` (ส่วน A–J) · golden = `golden.json` (คัดจากส่วน H/D.4 — ห้ามแก้ให้ตรงโค้ด)

## โครง
| ไฟล์ | หน้าที่ |
|---|---|
| `index.ts` / `cli.ts` | ตัวเลือก + กันยิงผิดฐาน (ไม่โหลด `.env` เอง · ปฏิเสธ host นอกเครื่องเว้นแต่ `--target=staging`) |
| `runtime.ts` | นาฬิกาจำลอง (แทน `Date` — `new Date()`/`Date.now()` = เวลาจำลอง เดิน 1 ms ต่อการอ่าน) + stub Storage/Auth ระหว่างพัฒนา |
| `reset.ts` | ล้างข้อมูลธุรกิจขององค์กรตามลำดับ FK (คง org/users/roles/capabilities/role_capabilities/push_subscriptions) |
| `master.ts` / `users.ts` | ส่วน A/B/C — ค่าตั้ง 19 แท็บ · เทมเพลตครบทุกแบบ · ทีม/แผน/บริษัท/ผู้ใช้/ผู้รับเงิน |
| `timeline.ts` / `october.ts` | ส่วน D/E/G/I — ก.ย. → ต.ค. ทีละขั้นผ่าน service (`lib/**/queries.ts` ที่ route เรียก) actor = persona ตาม role |
| `verify.ts` + `golden.json` | ส่วน H (เงิน) + E (state ทุกตัว ≥ 1 แถว) + G (คิวแดชบอร์ด) → ตาราง ✅/❌ |

## ลำดับคำสั่งบน dev (ฐาน `assetrecovery_dev`)
สคริปต์ไม่อ่าน `.env*` เอง — ส่ง env จาก shell (`set -a; . ./.env.local; set +a`)

1. **snapshot** ก่อนเสมอ: `uat/bin/snap.sh` (หรือ `pg_dump`)
2. **reset**: `pnpm seed:final --reset --allow-immutable-reset`
   - ล้างตาราง immutable (audit_logs · tax_invoices · wht_certificates · credit_notes · export_records · handover_lots · substitute_receipts · payout_*) ด้วย `ALTER TABLE … DISABLE TRIGGER USER` → DELETE → `ENABLE` **ในทรานแซกชันเดียว** (ล้มกลางทาง = rollback ทั้งหมด trigger กลับมาเอง)
   - สิทธิ์ที่ต้องใช้: **เจ้าของตาราง** (owner — role `assetrecovery` บนเครื่องเป็น owner อยู่แล้ว) **ไม่ต้อง superuser**
   - role ไม่ใช่ owner → `pnpm seed:final --print-reset-sql > reset.sql` แล้วให้ owner รัน `psql -f reset.sql`
3. **บัญชีใหม่ U123** (`uat.agent.out2` · `uat.sup.out` · `uat.temp1` · `uat.temp2`):
   `SEED_FINAL_ALLOW_LOCAL_AUTH=1 pnpm seed:final --create-auth-users`
   - สร้าง master (ทีม/บริษัท — ผู้ใช้ทีมต้องมีทีมก่อน) แล้วเรียก `createUser` (สร้างบัญชี Supabase Auth จริง) · รหัสผ่านสุ่มเขียนลง `uat/personas.json` (ไม่พิมพ์ออกจอ) · ต้องมี `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
   - จบขั้นนี้ temp1 = ระงับ · temp2 = ลบ (soft) · ผู้ใช้ใหม่ทุกคน `must_change_password = true` (พฤติกรรมของ `createUser`)
4. **seed + ไฟล์จริง**: `pnpm seed:final --seed --with-storage` (≈ 1–2 นาที)
   - `--with-storage` อัปโหลดไฟล์ตัวอย่าง (โลโก้/ลายเซ็น/เอกสารเคส/หลักฐาน/ใบเซ็นรับ/สลิป) ขึ้น bucket `case-documents` และไฟล์ export/โอนเงินขึ้น bucket จริง — ไม่ใส่ = ไฟล์อยู่ในหน่วยความจำ (เปิดดูในแอปไม่ได้)
5. **verify**: `pnpm seed:final --verify` (exit code 2 เมื่อมี ❌)

รันซ้ำ: กลับไปข้อ 2 (ผู้ใช้ U123 คงอยู่ ไม่ต้องทำข้อ 3 ซ้ำ) · ผลเท่าเดิมทุกรอบ (ตรวจด้วย fingerprint จำนวนแถว/ยอดเงินแล้ว)

staging: เพิ่ม `--target=staging` ทุกคำสั่ง (ปฏิเสธ URL ที่มีคำว่า prod / `VERCEL_ENV=production`)

### ฐานทดสอบบนเครื่อง (ไม่มี persona)
`pnpm db:seed` แล้ว `pnpm seed:final --reset --allow-immutable-reset --bootstrap-personas --seed --verify`
— `--bootstrap-personas` สร้าง persona ทั้ง 18 คนด้วยบัญชี Auth **จำลอง** (stub `lib/users/provisioning` · ไม่ยิง Supabase) · localhost เท่านั้น

## นาฬิกาจำลอง (U124) — ผล spike
- ทุก service อ่านเวลาจาก `new Date()` / พารามิเตอร์ `now` ⇒ แทน `Date` ทั้ง process พอ · job (daily allowance · reassign timeout · advance overdue · WHT summary) เรียก handler ตรงพร้อม `now` จำลอง
- Prisma เติม `@default(now())` ฝั่ง JS ⇒ `created_at` / `available_at` ของ outbox ตามเวลาจำลอง · ตรวจหลังรัน: แถวธุรกิจทุกตารางไม่มี `created_at` เป็นเวลาจริง ยกเว้น `document_number_series` (ฟังก์ชัน SQL ใช้ `now()` แต่เป็นตัวนับ ไม่เข้าตัวกรองงวด — ปีเลขเอกสารใช้ `at` ที่ส่งมา)
- อ่านค่า "วันนี้" ตอน `--verify` แยก process = เวลาจริง (เช่น aging bucket) — ยอดรวมไม่เปลี่ยน

## สิ่งที่สร้างผ่าน service ไม่ได้ / เบี่ยงจากเอกสาร
| เรื่อง | ทำอย่างไร |
|---|---|
| bootstrap Superadmin บนฐานเปล่า | `--bootstrap-personas` เขียน `users.username/supabase_uid` ของผู้ใช้ seed ตรง (เครื่องเท่านั้น) |
| X-01/X-02 สร้างโดยผู้ใช้บริษัทไฟแนนซ์ | สร้างไม่ได้ (`POST /api/cases` ต้อง `record_admin_data` · พอร์ทัล GET อย่างเดียว) → สร้างโดย `uat.admin` |
| ผู้รับเงินใช้ "ช่องตามประเภท" (Tax Profile รายคน = ว่าง) | ยืนยันผู้รับไม่ได้ (BUG-SF1) → ผูก Tax Profile เท่าค่าช่อง (TP-1/TP-2) ยอดภาษีเท่าเดิม |
| ทดรองต้องจ่ายจริงก่อนเคลียร์ (U83) | เพิ่มรอบจ่ายเงินทดรอง `PB-S-ADV-IN/OUT` (completed 22/09) — ไม่อยู่ใน golden H.4 |
| BL-001…003 | สร้างร่าง 18/09 (ระบบเลือกรายได้เข้ารอบตามวันตัดเท่านั้น — ต้องออก CO3 ก่อนรายได้ FT-17 เกิด) ส่ง 25/09 |
| FT-13 r1 | อนุมัติรายการรอบ 1 ก่อนอนุมัติรีไซเคิล (BUG-SF2) |
| outbox `failed` · payout `draft` · job `cancelled` · bank matched→unmatched | ตาม J.0 (ไม่สร้าง) |
| Probe P-01…P-19 | ไม่อยู่ในสคริปต์นี้ (ด่าน 2 รันหลัง seed · ไม่คงในข้อมูล) |
| ร่างบิล CO2 | ได้เลข BL-2569-009 (ร่างได้เลขตอนสร้าง) |

## BUG ระบบที่พบระหว่างเขียน (ไม่แก้ lib/ ในงานนี้)
- **BUG-SF1** `verifyPayee` บังคับ `taxProfileId` (`REQUIRED_FOR_VERIFY`) ขัดกับ U121 ที่ให้ผู้รับใช้ "ค่าเริ่มต้นตามประเภท" ได้ — ผู้รับที่ไม่มี Tax Profile รายคนยืนยันไม่ได้ ⇒ เข้ารอบจ่ายไม่ได้
- **BUG-SF2** `tryCreateRevenue` ประเมินเฉพาะ `cases.tracking_round` ปัจจุบัน — เคส cof=true ที่ไม่สำเร็จรอบ 1 ถ้าอนุมัติรายการหลังอนุมัติรีไซเคิล รายได้รอบ 1 หายถาวร (ขัด U125 "คิดทุกรอบอิสระ") และรายการรอบ 1 ที่ค้างอนุมัติยังบล็อกรายได้รอบ 2
