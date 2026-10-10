---
name: mytester
description: ล้างข้อมูล staging ทั้งหมดแล้วทดสอบใช้งานจริงแบบ "บริษัทเปิดใช้ระบบวันแรก" — ตั้งค่าจาก 0 ผ่านหน้าจอ แล้วให้ persona ทุก role ทำงานต่อกันครบทุกโมดูลทุก flow (รับเคส → อนุมัติ → มอบหมาย → ภาคสนามมือถือ → คลัง/ล็อต → รายได้/วางบิล/รับชำระ → เบิก/เงินทดรอง/รอบจ่าย → บัญชี/ภาษี/ปิดงวด → พอร์ทัล → รายงาน) · ผู้ใช้รันคำสั่งเขียนฐาน/login เอง · Claude ขับเบราว์เซอร์ด้วย session ที่เก็บไว้ · จดปัญหา ไม่แก้โค้ด · รายงาน .claude/preship/mytester-<YYYYMMDD>/ · เรียกด้วย /mytester (ใส่ขอบเขตต่อท้ายได้ เช่น /mytester ต่อ, /mytester เฉพาะการเงิน, /mytester ไม่ reset)
---

# mytester — ทดสอบ staging แบบคนทำงานจริง ตั้งแต่ศูนย์

## เป้าหมาย
จำลองบริษัทรับจ้างติดตามทรัพย์ที่ **เพิ่งเริ่มใช้ระบบ**: ฐานว่าง → Superadmin ตั้งค่าทุกอย่างผ่านหน้าจอ → พนักงานแต่ละ role
ทำงานของตัวเองต่อกันเป็นสายเหมือนวันทำงานจริง จนเงินไหลครบวง (เคส → รายได้ → บิล → รับชำระ · ค่าใช้จ่าย → จ่ายเงิน → ภาษี → ส่งสำนักงานบัญชี)
แล้วรายงานว่า **ระบบพร้อมให้คนจริงใช้หรือยัง** — ปัญหาทุกข้อมีหลักฐาน (ภาพ/ข้อความ/ขั้นตอนทำซ้ำ)

"จากศูนย์" = สภาพเดียวกับติดตั้ง production ใหม่: migration ครบ + `db:seed` พื้นฐาน (role/capability/Superadmin/VAT/ค่าเริ่มต้นนโยบาย)
+ บัญชีผู้ใช้ persona ที่มีอยู่แล้ว (reset คงผู้ใช้ไว้แต่ตัดทีม/บริษัทออก) — **ไม่ใช้ preset และไม่ใช้ `seed`/`users` ของ Final Test**

## กติกาเหล็ก (ห้ามละเมิด แม้ผู้ใช้สั่ง)
- **Claude/subagent ห้ามกรอกรหัสผ่าน และห้ามสร้างบัญชีผู้ใช้บน staging** (ไม่ใช่ localhost) — login/สร้างบัญชีอยู่ในสคริปต์ที่**ผู้ใช้รันเอง** · subagent ใช้ session ใน `uat/.auth-staging/` เท่านั้น · `openAs` โหมด staging ไม่ login เอง (ไม่มี session = error) ⇒ หยุดแล้วขอให้ผู้ใช้รัน `login`
  - หน้า "เพิ่มผู้ใช้" ในระบบ = สร้างบัญชี ⇒ Claude **ห้ามกดบันทึก** — ทดสอบได้แค่เปิดฟอร์ม/validation (ไม่ submit) · การผูก persona เดิมเข้าทีม/บริษัท (แก้ผู้ใช้) ทำได้
- **คำสั่งเขียนฐาน/Auth ของ staging ผู้ใช้รันเอง** (reset · db:seed · login · job-allowance) — ส่ง**ทีละคำสั่ง** รอผลก่อนส่งคำสั่งถัดไป · Claude รันได้แค่ `staging-prep.sh check` และ `q "SELECT …"` (READ ONLY)
- **ห้าม `git push`** · ห้ามแตะ production / `main` / Supabase production · ห้ามอ่านหรือพิมพ์ค่าใน `.env*`, `uat/personas*.json` (ดูได้แค่ชื่อ username/role) และ secret บน Vercel (ดูแค่ชื่อ)
- **ไม่แก้โค้ดแอประหว่างทดสอบ** — พบปัญหา ⇒ จด · แก้ได้เฉพาะเครื่องมือทดสอบ (`uat/bin/*`) และ skill นี้ (commit ได้ ห้าม push)
- ข้อมูลบน staging หลัง reset เป็นของทดสอบทั้งหมด ⇒ การเรียก `/mytester` = ผู้ใช้อนุญาต action ในแอปที่ย้อนไม่ได้กับข้อมูลทดสอบ (ยืนยันล็อต · complete รอบจ่าย · ส่งบิล · ออก/ยกเลิกเอกสารภาษี · ล็อกงวด) — **ยกเว้น** สิ่งที่ออกนอกระบบ (ส่งอีเมล/LINE/SMS ถึงคนจริง · เปลี่ยนค่า Vercel/GCP/Supabase) ต้องถามในแชทก่อน
- สคริปต์/agent ห้ามเขียนไฟล์ลง repo root — ภาพ/ขั้นตอนดิบอยู่ใน scratchpad · รายงานอยู่ `.claude/preship/mytester-<YYYYMMDD>/`
- ตรวจ `git status` หลัง subagent จบทุกตัว — มีไฟล์แอปถูกแก้ ⇒ `git diff` ดู แล้ว revert ส่วนที่ไม่ใช่ของ subagent ทดสอบ + จดเหตุ

## สภาพแวดล้อม
| อะไร | ค่า |
|---|---|
| URL | `https://asset-recovery-git-staging-prototype24.vercel.app` (Vercel Preview สาย `staging`) |
| Vercel Deployment Protection | ปิดอยู่ หรือ export `VERCEL_AUTOMATION_BYPASS_SECRET` (lib.mjs แนบ header ให้) — เปิดคืนตอนจบ |
| Supabase | `qgshdgzzajmoytzymsqe` — **Auth/Storage ใช้ร่วมกับ localhost** ⇒ persona staging ใช้อีเมล `@stg.uat.test` เท่านั้น |
| เครื่องมือหลัก | `uat/bin/staging-prep.sh check\|snapshot\|reset\|login\|q\|job-allowance` · `uat/bin/lib.mjs` (`UAT_TARGET=staging` → `openAs(username,{mobile})`, `shot()`) |
| Persona (ไฟล์ session) | `superadmin` · `uat.admin` ธุรการ · `uat.approver` อนุมัติเคส · `uat.finance` การเงิน · `uat.account` บัญชี · `uat.exec` บริหาร · ทีม Inhouse: `uat.mgr.in` `uat.sup.in` `uat.agent.in1` `uat.agent.in2` · ทีม Outsource: `uat.mgr.out` `uat.sup.out` `uat.agent.out1` `uat.agent.out2` · พอร์ทัล: `uat.co1.mgr` `uat.co1.sup` (บริษัท 1) `uat.co2.admin` (บริษัท 2) · `uat.temp1/2` = บัญชีระงับ (ต้อง login ไม่ได้) |
| Cron | Preview **ไม่มี cron** ⇒ job รายวันไม่เกิดเอง — แทนด้วย `staging-prep.sh job-allowance <YYYY-MM-DD>` (ผู้ใช้รัน) ไม่ใช่บั๊ก |
| Migration | Vercel ไม่ migrate ให้ — ค้าง ⇒ ผู้ใช้รัน `PRISMA_ENV_FILE=.env.staging pnpm db:deploy` |
| วันที่ | งวดเดือนปัจจุบันยังปิด/ล็อกไม่ได้จนกว่าจะขึ้นเดือนใหม่ — ทดสอบได้ถึงขั้นที่ระบบยอม แล้วจด "ทำไม่ได้เพราะวันที่" (ไม่ใช่บั๊ก) |

## ขั้นตอน

### ขั้น 0 — เตรียม (Claude ทำเอง อ่านอย่างเดียว)
1. `git fetch origin` · เทียบ `origin/staging` กับ HEAD — commit บน local ที่ยังไม่ push = **ไม่อยู่บน staging** (แจ้งผู้ใช้ ไม่ต้อง push ให้)
2. `vercel ls` — deployment ล่าสุดของสาย staging **Ready** และตรง `origin/staging`
3. `uat/bin/staging-prep.sh check` — migration up to date + จำนวนผู้ใช้/เคส
4. `ls uat/.auth-staging/` — มี session ครบตามตาราง persona ไหม
5. สร้าง `.claude/preship/mytester-<YYYYMMDD>/STATE.md` (ขั้นที่ทำแล้ว · ledger ของ record ที่สร้าง · คำสั่งที่ผู้ใช้รันแล้ว) — **อัปเดตทุกครั้งที่จบขั้น** เพื่อให้ `/mytester ต่อ` ทำต่อได้
6. ทำโฟลเดอร์ scratchpad `mytester/<ช่วง>/` สำหรับภาพ/ขั้นตอนดิบ

### ขั้น 1 — ล้างฐาน (ผู้ใช้รันทีละคำสั่ง · ข้ามได้ถ้าสั่ง "ไม่ reset" หรือ "ต่อ")
ส่งให้ผู้ใช้ทีละบรรทัด รอผลแต่ละบรรทัด (ล้ม ⇒ วิเคราะห์ output แก้สคริปต์ แล้วส่งคำสั่งเดิมซ้ำ):
1. `uat/bin/staging-prep.sh snapshot pre-mytester` — สำรองก่อนล้าง
2. `uat/bin/staging-prep.sh reset` — ล้างข้อมูลธุรกิจทั้งหมด (คง org/ผู้ใช้/role/capability)
3. `set -a && source .env.staging && set +a && DATABASE_URL="$DIRECT_URL" PRISMA_ENV_FILE=.env.staging pnpm db:seed` — ค่าพื้นฐานแบบติดตั้งใหม่ (upsert)
4. `uat/bin/staging-prep.sh check` — Claude ตรวจ: เคส 0 · ผู้ใช้ครบ · แล้วใช้ `q` ยืนยันว่าทีม/บริษัท/แผนค่าตอบแทน/ผู้รับเงิน = 0
5. **login ใหม่ทุก persona ทุกครั้งก่อนเริ่มช่วง A** (session มีอายุสูงสุด 24 ชม. นับจากเวลา login — ต่ออายุไม่ได้ · ของเก่าจะหมดกลางรอบ): `uat/bin/staging-prep.sh login` แล้ว `uat/bin/staging-prep.sh login --manual superadmin` · บัญชีพอร์ทัล 3 ตัว login ได้หลังช่วง A ผูกบริษัทแล้วเท่านั้น (ก่อนนั้นขึ้น "บริษัทถูกระงับ" — ข้ามได้) · รอบยาวเกิน 24 ชม. ⇒ login ซ้ำก่อนหมด
6. smoke: subagent เปิดหน้าแรกของทุก persona ด้วย session — ผ่านหมดจึงไปขั้น 2

### ขั้น 2 — ทดสอบแบบวันทำงานจริง (Claude ส่ง subagent ทีละช่วง ตามลำดับ)
- ช่วงต้องพึ่งข้อมูลจากช่วงก่อน ⇒ **ทำต่อกันทีละช่วง** (ไม่ขนาน) · ช่วงที่อิสระ (เช่น พอร์ทัล/รายงาน/สิทธิ์ข้าม role) ขนานได้
- ใช้ subagent `general-purpose` ต่อช่วง (1 ช่วง ≈ 1 agent · รวม < 10 agent) · ส่ง brief ที่มี: BASE · persona ที่ใช้ · ledger (id/เลขเอกสารจากช่วงก่อน) · รายการ flow · รูปแบบผล · กติกาเหล็กด้านบนครบทุกข้อ
- agent ทำ **ผ่านหน้าจอเท่านั้น** (Playwright `openAs` — ภาคสนามใช้ `{mobile:true}`) · ห้ามยิง API/SQL เขียนข้อมูลแทนการกด · ตรวจผลด้วย `q` (SELECT) ได้
- ก่อนตัดสินว่า "ผิด" agent ต้องเช็คพฤติกรรมที่ถูกจาก spec ด้วย skill `spec-lookup` (ไม่เดาจาก mockup) · มติ PO ที่ตั้งใจแล้ว: `uat/PO-DECISIONS-*.md` + `.claude/preship/staging-e2e-20261010/DECISIONS.md` — ไม่จดซ้ำเป็นบั๊ก
- ข้อมูลที่กรอกต้องสมจริงแบบไทย (ชื่อ-ที่อยู่ไทย · เลขผู้เสียภาษี 13 หลัก · IMEI 15 หลัก · เลขบัญชีธนาคาร · จำนวนเงินมีสตางค์) · ทุก record ขึ้นต้น/ระบุ `MT-<MMDD>` ให้ค้นเจอ
- แต่ละขั้นจดลง `steps.json`: `{phase, step, persona, action, expected, actual, status: pass|fail|blocked|skip, evidence:[ภาพ], issue_id?}`
- หลังแต่ละช่วง: Claude ตรวจผล + `git status` · อัปเดต ledger/STATE.md · ช่วงไหน **blocked** เพราะบั๊ก ⇒ หาทางเลี่ยงผ่านหน้าจอ (ถ้ามี) แล้วไปต่อ ไม่มีทาง ⇒ จด + ข้ามส่วนที่ต้องพึ่ง

| ช่วง | ใคร | flow ที่ต้องครอบคลุม (ขั้นต่ำ) |
|---|---|---|
| A ตั้งค่าระบบจากศูนย์ | `superadmin` (+ `uat.exec` ส่วนที่ล็อกให้บริหาร) | ข้อมูลองค์กร/ที่อยู่/เลขผู้เสียภาษี · ตั้งค่าทุกแท็บ (VAT effective-dated · Tax Profile ต่อประเภทผู้รับ · เกณฑ์ WHT · นโยบายเงินทดรอง/เบี้ยเลี้ยง/ค่าน้ำมัน · SLA · เลขเอกสาร/ใบกำกับ · นโยบายล็อกงวด · บัญชีธนาคารบริษัท · เทมเพลตเอกสาร+ลายเซ็น · แคตตาล็อกรุ่นเครื่อง/TAC · ระยะเก็บข้อมูล) · บริษัทไฟแนนซ์ 3 แห่ง + ค่าบริการ (หลายรูปแบบ fee) + เอกสารบริษัท + ผูกผู้ใช้พอร์ทัล · ทีม Inhouse/Outsource + ผู้จัดการ/หัวหน้า/พนักงาน · แผนค่าตอบแทน (ต่อทีม/ประเภท) · ผู้รับเงิน+บัญชีธนาคาร+tax profile (บุคคล/นิติบุคคล) · ทบทวนสิทธิ์ role (ลอง 9 รายการ "✅ only" ต้องมอบให้ role อื่นไม่ได้) · ฟอร์มเพิ่มผู้ใช้ (validation เท่านั้น ไม่กดบันทึก) |
| B รับเคส + อนุมัติ | `uat.admin` → `uat.approver` | สร้างเคสทีละรายการ + นำเข้าหลายรายการ (ไฟล์ตัวอย่างใน `reference/samples/`) · แนบเอกสารจริงขึ้น Storage (PDF/รูป · ยกเลิกระหว่างอัปโหลด 1 ครั้ง) · case_ref ซ้ำ/IMEI ผิดรูป (มีตัวอักษร · 14/16 หลัก) ต้องปฏิเสธ · ขอข้อมูลเพิ่ม → ธุรการแก้ส่งใหม่ · ปฏิเสธพร้อมเหตุผล · อนุมัติ (snapshot ค่าบริการตอนอนุมัติ) · อนุมัติหลายรายการ · ≥ 10 เคสกระจาย 3 บริษัท |
| C มอบหมาย | `uat.mgr.in/out` · `uat.sup.in/out` | มอบหมายให้พนักงาน (ทีมตัวเองเท่านั้น — ข้ามทีมต้องไม่ได้) · มอบหมายใหม่ · หัวหน้ามอบหมายเมื่อค่าตั้งปิด = ปุ่มต้อง**ซ่อน** · พนักงานรับ/ปฏิเสธงาน · วันเวลาการมอบหมายเห็นบน list |
| D ภาคสนาม (มือถือ) | `uat.agent.in1/in2/out1/out2` `{mobile:true}` | เช็คอิน ≥ 2 จุด (ระยะทาง Google Maps จริง > 0 → ค่าน้ำมัน PER_KM) · ถ่าย/แนบภาพหลักฐาน · ขอเงินทดรอง (ห้ามซ้อนเมื่อมี approved/overdue) · บันทึกค่าใช้จ่าย/ค่าที่พัก · ปิดงานสำเร็จ (IMEI ตรง) / ไม่สำเร็จ · ส่งปิดใหม่หลังถูกตีกลับ (ของเดิม superseded ไม่ซ้ำไม่หาย) · offline/ช้า (throttle) ไม่เสียข้อมูล |
| E คลัง/ส่งมอบ | `uat.admin` (หรือ role คลังตามสิทธิ์) | รับเครื่องเข้าคลัง (IMEI ตรง/ไม่ตรง = เตือน) · สร้างล็อต (1 ล็อต = 1 บริษัท — ปนบริษัทต้องไม่ได้) · ยืนยันล็อต (เวลาส่งมอบอนาคตต้องไม่ได้) · ล็อตยืนยันแล้วแก้ไม่ได้ · เลข `LOT-<พ.ศ.>-XXX` · จากนั้นให้ผู้ใช้รัน `job-allowance <วันที่>` แทน cron |
| F การเงิน: ค่าใช้จ่าย/จ่ายเงิน | `uat.mgr.*` `uat.finance` `uat.approver` `uat.exec` | อนุมัติใบเบิก 2 ขั้น · ตีกลับ (reset ขั้น 1) · ปฏิเสธถาวรต้องมีเหตุผล · เงินทดรอง อนุมัติ/โอน/เคลียร์ (คืนเงิน ≥ 0) · รอบจ่าย: สร้าง → ตัวอย่าง → ไฟล์โอนธนาคาร → complete (กดซ้ำต้องไม่จ่ายซ้ำ) · WHT ผู้รับ (Payee ชนะ Plan · fallback มีคำเตือน · เกณฑ์ 1,000 สะสมต่อเดือน) · แจ้งเตือนถึงพนักงาน |
| G รายได้/วางบิล/รับชำระ | `uat.finance` `uat.account` | รายได้เกิดเมื่อ expense approved **และ** ล็อตยืนยัน (closed_fail ไม่เกิด · ไม่มี expense ก็ต้องผ่านคลัง) · VAT จาก history · ชุดวางบิล → ส่งบิล → ใบกำกับภาษี (เลขไม่ข้าม) · รับชำระบางส่วน/ครบ · กระทบยอดธนาคาร (นำเข้าไฟล์ statement) · ใบลดหนี้ · Adjustment (ต้องมีเหตุผล · งวดล็อกต้องไป Adjustment+บริหาร) · AR aging |
| H บัญชี/บริหาร | `uat.account` `uat.exec` | ตรวจความพร้อมปิดงวด · Exception (critical ต้อง block export) · ภ.ง.ด./หนังสือรับรอง 50 ทวิ (ยกเลิกต้องมีเหตุผล · ที่ยกเลิกไม่นับยอด) · Export pack ส่งสำนักงานบัญชี (มี version + SHA-256 · ไม่ทับของเดิม) · ส่ง/ล็อกงวด/ปลดล็อก (เท่าที่วันที่อนุญาต) · Dashboard บริหาร |
| I พอร์ทัลบริษัท | `uat.co1.mgr` `uat.co1.sup` `uat.co2.admin` | เห็นเฉพาะบริษัทตัวเอง (เปลี่ยน id ใน URL เป็นของบริษัทอื่น ⇒ 403 ไม่ leak) · ดูเคส/ล็อต/บิล/ใบกำกับ · ดาวน์โหลด PDF · ทุกอย่างอ่านอย่างเดียว |
| J รายงาน + สิทธิ์ข้าม role + ทั่วไป | ทุก persona | รายงานทั้ง 17 ตัว (ตัวเลขตรงกับข้อมูลที่ทำในช่วง A–H · ส่งออก Excel/PDF) · Finance เรียกรายงาน E1 ⇒ 403 · ลองเปิด URL เมนูที่ role ไม่มีสิทธิ์ ⇒ ปฏิเสธ · บัญชีระงับ login ไม่ได้ · กระดิ่ง/แจ้งเตือน · Back/refresh/ตัวกรองใน URL · วันที่ทุกหน้าเป็น พ.ศ. `DD/MM/YYYY` · เงินแสดงถูก · มือถือทุกหน้าที่ role ภาคสนามใช้ · ทุกหน้ามี loading/empty/error |

เน้นสิ่งที่ localhost ตรวจไม่ได้ตลอดทุกช่วง: อัปโหลด/เปิดไฟล์ Supabase Storage จริง · Google Maps จริง · ความเร็ว/timeout บน Vercel + Supabase · `vercel logs` ช่วงที่ทดสอบ (ดูแค่ error — ไม่คัดลอก header/secret)

### ขั้น 3 — ตรวจยอดเงินปลายทาง (Claude · READ ONLY)
ใช้ `q` เทียบยอดที่หน้าจอแสดง กับสูตรใน `docs/22` คำนวณมือจาก ledger: รายได้/VAT/ค่าบริการต่อเคส · ค่าใช้จ่าย+WHT ต่อผู้รับ · ยอดรอบจ่าย · AR คงค้าง · ยอดในรายงานบริหาร — ต่างแม้ 1 สตางค์ = issue

### ขั้น 4 — รายงาน
`.claude/preship/mytester-<YYYYMMDD>/` (ภาษาไทย):
- `issues.json` — id `T-001…` · `{id, severity: critical|high|medium|low, phase, persona, title, steps_to_reproduce, expected (+อ้าง spec), actual, evidence, suspected_cause?}`
- `steps.json` — รวมทุกช่วง
- `summary.md` — commit/deployment ที่ทดสอบ · ตารางผลต่อช่วง (ขั้น/ผ่าน/ติด/ระดับปัญหา) · Top ปัญหาที่ควรแก้ก่อน production · เรื่องที่ต้องให้ PO/นักบัญชีตัดสิน · สิ่งที่ทดสอบไม่ได้ (+ เหตุผล: วันที่ · ไม่มี cron · ต้องมือถือจริง) · **ข้อมูลที่สร้างบน staging** (record + path ใน Storage) · คำตัดสิน **พร้อมให้คนใช้จริง / ยังไม่พร้อม**
- ส่ง `summary.md` ให้ผู้ใช้ด้วย SendUserFile + สรุปสั้นในแชท
- เตือนผู้ใช้: เปิด Vercel Deployment Protection คืน · สิ่งที่ต้องทำเองบนมือถือจริง (Web Push · แอปบนหน้าจอโฮม + session หมดอายุ) · จะ reset กลับเป็นชุด Final Test หรือเก็บข้อมูลนี้ไว้ดู

## วิธีเรียก
- `/mytester` — เต็มวง: reset → ตั้งค่าจากศูนย์ → ช่วง A–J → ตรวจยอด → รายงาน
- `/mytester ต่อ` — อ่าน `STATE.md` ล่าสุด ทำช่วงที่ค้างต่อ (ไม่ reset)
- `/mytester ไม่ reset` — ใช้ข้อมูลที่มีอยู่ เริ่มช่วง A ใหม่ (ค่าตั้งที่มีแล้วตรวจ/แก้แทนการสร้าง)
- `/mytester เฉพาะ <ช่วง/โมดูล>` — เช่น `เฉพาะการเงิน` (F+G) · `เฉพาะภาคสนาม` (C+D) — ถ้าช่วงที่พึ่งยังไม่มีข้อมูล ให้ทำช่วงก่อนหน้าเท่าที่จำเป็นก่อน
