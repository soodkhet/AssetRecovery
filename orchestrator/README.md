# RTB Orchestrator — auto-driver + dashboard

ระบบสั่ง Claude Code ให้ทำงานทีละก้อน (1 session = 1 task) อัตโนมัติตาม `PROGRESS.md` + verify เอง + หยุดถามเมื่อเจอจุดต้องตัดสินใจ พร้อมหน้า dashboard ดูสถานะสด

> เขียนด้วย Node ESM ล้วน **ไม่มี dependency** (ใช้ Node 24 ที่โปรเจกต์มีอยู่แล้ว) — ไม่ต้อง `pnpm install` เพิ่ม

---

## มันทำอะไร (วงจร 1 ก้อนงาน)

```
อ่าน PROGRESS.md → หา "🎯 งานถัดไป"
   → สร้าง branch auto/phase-<id> จาก main
   → สั่ง Claude Code headless ทำงาน (ตามวงจร WORKFLOW §3 + กติกา CLAUDE.md)
   → รัน verify: pnpm typecheck / test / lint
        แดง → ให้ agent แก้เอง 1 รอบ → ยังแดง → พักไว้รอคน
   → เขียว + มี commit → merge เข้า main (local เท่านั้น ไม่ push) → ทำงานถัดไปต่อ
```

**หยุดมาถามคุณเฉพาะเมื่อ** (ตรงกับกติกา CLAUDE.md ข้อ 26 "ไม่ชัด = หยุดถาม ห้ามเดา"):
- เอกสารขัดกัน / สเปคไม่ชัด / ต้องตัดสินใจเชิงธุรกิจ
- ต้องใช้ credential หรือไฟล์ที่ไม่มี
- verify ไม่ผ่านหลังให้ agent แก้เองแล้ว

รายการเหล่านี้จะโผล่ในหน้า dashboard ใต้ "⏳ รอการตัดสินใจ" — คุณพิมพ์คำตอบแล้วกด **Approve** ครั้งเดียว มันจะทำต่อให้เอง

---

## เริ่มใช้งาน

### 0. ต้องมีก่อน
- ติดตั้ง Claude Code CLI แล้ว login (`claude` เรียกได้จาก terminal)
- Docker Postgres (`rtb-postgres`) รันอยู่ + migrate/seed แล้ว (ตาม PROGRESS ข้อ 2a) — เพราะ `pnpm test` ต้องใช้
- โหลด `.env`: `set -a; . ./.env; set +a`

### 1. หน้า dashboard (แนะนำ)
```bash
node orchestrator/server.mjs
# เปิด http://localhost:4173/?token=<TOKEN ที่พิมพ์ออกมาตอนบูต>
```
> dashboard มี **token auth** — ครั้งแรก server จะสร้าง token ให้ (เก็บที่ `orchestrator/.token`) หรือตั้งเองผ่าน env `RTB_DASH_TOKEN` · **สั่งงานจากมือถือ → ดู [`REMOTE.md`](./REMOTE.md)** (Mac รัน + Tailscale)
บนหน้านี้:
- **▶ รันงานถัดไป** — สั่งทำ 1 ก้อน
- **Auto** (สวิตช์) — ทำต่อเนื่องทุกก้อนจนกว่าจะเจอจุดต้องถาม
- การ์ด **รอการตัดสินใจ** — พิมพ์คำตอบ + Approve

### 2. สั่งจาก terminal (ทางเลือก)
```bash
node orchestrator/orchestrate.mjs status              # ดูสถานะ + งานถัดไป + คิวรอ
node orchestrator/orchestrate.mjs next                # ดู prompt ที่จะส่ง (ไม่รันจริง)
node orchestrator/orchestrate.mjs run                 # ทำ 1 ก้อน
node orchestrator/orchestrate.mjs run --dry-run       # จำลอง ไม่เรียก claude
node orchestrator/orchestrate.mjs watch               # ทำต่อเนื่องจนเจอจุดถาม
node orchestrator/orchestrate.mjs resume <id> --answer "ตอบแบบนี้"
```

### 3. ตั้งให้รันเองตามเวลา (ทางเลือก)
cron (mac ใช้ launchd หรือ `crontab -e`) — รันงานถัดไปทุกเช้า 9 โมง:
```
0 9 * * *  cd /path/to/RTB-RUAMTABIEN && set -a && . ./.env && set +a && node orchestrator/orchestrate.mjs run >> orchestrator/logs/cron.log 2>&1
```

---

## การ์ด "การใช้งาน AI"
dashboard มี panel สรุปการใช้งาน 3 ชั้น:
1. **orchestrator run totals** (เชื่อถือ 100%) — รันไปกี่ก้อน, merge กี่ครั้ง, cost รวม/วันนี้, turns — จาก `logs/runs.jsonl` เอง
2. **token/cost ข้าม session** — ผ่าน `ccusage` (อ่าน `~/.claude`). ติดตั้ง: มีอยู่แล้วถ้ารัน `npx ccusage` ได้ (server เรียกเบื้องหลังทุก 5 นาที) ถ้าเครื่องไม่มี/ออฟไลน์ ช่องนี้จะขึ้นข้อความว่ายังไม่พร้อม
3. **โควตา subscription จริง (session/weekly + % + reset)** — server รัน `claude -p "/usage"` เบื้องหลังทุก 5 นาที แล้ว parse ข้อความมาโชว์เป็นแถบ % (แดง ≥90 · ทอง ≥70 · น้ำเงิน <70) พร้อมเวลารีเซ็ต เหมือนหน้า `/usage` ใน Claude Code · หมายเหตุ: แต่ละครั้งที่ refresh นับเป็น request เล็ก ๆ ต่อโควตา (น้อยมาก)

> `cost` ทุกจุดเป็น **API-equivalent (เงินสมมติ)** ไม่ใช่เงินที่ถูกตัดจริงเมื่อใช้ subscription — ใช้ดูแนวโน้มการเผาโควตา

## แจ้งเตือนมือถือ (ntfy)
แจ้งเตือนตอน task เสร็จ/ต้องตัดสินใจ/รอ approve/ชน limit — ผ่าน [ntfy](https://ntfy.sh) (ฟรี ไม่ต้องสมัคร)

ตั้งครั้งเดียว:
1. ลงแอป **ntfy** บนมือถือ → **Subscribe** ตั้งชื่อ topic ลับ ๆ เช่น `rtb-boonphone-7h3k9`
2. ใส่ใน `.env` ของโปรเจกต์:
   ```
   RTB_NTFY_TOPIC=rtb-boonphone-7h3k9
   RTB_API_BASE=http://<ชื่อ-Mac-tailscale>:4173
   ```
   (`RTB_API_BASE` ทำให้ปุ่ม "เปิด Dashboard" และ "✓ Approve" ในแจ้งเตือนทำงาน — เปิดจากมือถือผ่าน Tailscale)
3. restart server → กดปุ่ม 🔔 บน dashboard (หรือ `node orchestrator/orchestrate.mjs notify-test`) เพื่อทดสอบ

การแจ้งเตือน:
- ✅ **task เสร็จ + merged** · ⏸️ **รอโควตา reset** (แจ้งเบา)
- 🤔 **ต้องตัดสินใจ** / ❌ **verify แดง** — แตะเปิด dashboard ไปพิมพ์คำตอบ/ดู
- 🟡 **รอ approve merge** — มีปุ่ม **✓ Approve** ในตัวแจ้งเตือน กดจบเลยไม่ต้องเปิด dashboard

> topic เป็นแบบสาธารณะบน ntfy.sh — ตั้งชื่อสุ่มยาว ๆ (ใครเดา topic ได้จะเห็นแจ้งเตือน) หรือ self-host ntfy แล้วตั้ง `RTB_NTFY_SERVER`

## ตั้งค่า (ผ่าน env var หรือ `config.mjs`)

| ตัวแปร | ค่า default | ความหมาย |
|---|---|---|
| `RTB_AUTO_MERGE` | `true` | เขียวแล้ว merge เข้า `main` **ในเครื่อง** เอง (ไม่ push) · ตั้ง `false` = **หยุดรอกด Approve ก่อน merge ทุกก้อน** (เพิ่ม checkpoint คน) |
| `RTB_AUTO_NEXT` | `true` | ทำ task ถัดไปต่อเองหลังจบ |
| `RTB_PERMISSION` | `bypass` | `bypass` = autonomous เต็ม (`--dangerously-skip-permissions`) · `acceptEdits` = ปลอดภัยกว่าแต่บาง action จะถาม |
| `RTB_MODEL` | `claude-opus-5` | โมเดล default ทุกงาน (มติ 2026-07-30) — ตั้ง `''` เพื่อใช้ default ของ Claude Code |
| `RTB_MODEL_UI` | `claude-fable-5` | โมเดลสำหรับ **task UI หน้าบ้าน** — ชนะ dropdown/RTB_MODEL_CODE เฉพาะ task ที่แมตช์; ตั้ง `''` เพื่อปิด rule |
| `RTB_UI_TASKS` | `V.,V2.2b,V2.3b,V2.4` | prefix ของ task id ที่นับเป็น UI หน้าบ้าน (คั่น `,`) |
| `RTB_CLAUDE_TIMEOUT_MS` | `2700000` | timeout ต่อ session (45 นาที) |
| `RTB_AUTO_REPAIR` | `1` | ให้ agent แก้เองกี่รอบเมื่อ verify แดง |
| `RTB_BASE_BRANCH` | `main` | branch หลักที่ merge เข้า (เดิม `master` — เส้นตายที่ไม่มี merge-base ร่วมกับ `main`) |
| `RTB_PORT` | `4173` | port ของ dashboard |

---

## ⚠️ ความปลอดภัย — อ่านก่อนเปิด autonomous

1. **ทำงานบน branch เสมอ** (`auto/phase-*`) ไม่แตะ `main` จนกว่าจะ verify ผ่าน — `main` ปลอดภัยเสมอ และ revert ได้
2. **verify เป็นด่านกันของจริง** — ต้องเขียวก่อน merge งานการเงินต้องมี test ในก้อนเดียว (กติกา 16) ถ้าอยากเข้มกว่านี้ เพิ่ม gate ใน `config.mjs` เช่น `pnpm build`
   **ตั้งแต่ 2026-08-09 เทสต์/lint คิดเฉพาะสิ่งที่ก้อนงานนั้นแตะ** (มติ Boonphone): `vitest --changed <base>` + eslint เฉพาะไฟล์ที่เปลี่ยน — วัดจริงเหลือ **30 วินาที** (เดิมรันเต็ม 327 ไฟล์ทุกก้อน). ไม่ใช่การกรองตามโฟลเดอร์ — vitest ไล่ตาม import graph ⇒ ยังจับ regression ข้ามไฟล์ได้ · **`typecheck` ยังเต็ม ห้ามย่อ** (ด่านเดียวที่จับ type พังข้ามแพ็กเกจที่ไม่มีเทสต์คลุม)
   ⚠️ **แก้คำเตือนเดิม (2026-08-09):** ตอนย่อ gate เคยเขียนไว้ว่า "ความปลอดภัยขึ้นกับ `RTB_AUTO_MERGE=false` — จะเปิด auto-merge ต้องเอา gate กลับเป็นชุดเต็มก่อน" **ซึ่งวางเส้นแบ่งผิดจุด** · ตรวจ `lib/git.mjs` แล้วยืนยันว่า **orchestrator ไม่มีคำสั่ง `git push` เลย** ⇒ auto-merge แตะได้แค่ `main` ในเครื่อง ซึ่ง `git reset` กลับได้
   **ด่านที่กั้น production จริงคือตอนคุณ `git push origin main`** — Render ตั้ง `autoDeployTrigger: commit` ⇒ push แล้ว deploy ทันที และ GitHub CI รัน **หลัง** จากนั้น บล็อกอะไรไม่ได้
   ⇒ กติกาที่ถูกคือ **ก่อน push `main` ให้รัน `pnpm typecheck && pnpm test` เต็มหนึ่งรอบ** (หรือดีกว่านั้น: อย่า push `main` ตรง ๆ — push เป็น branch แล้วเปิด PR ให้ CI รันเต็มก่อน merge)
3. **`RTB_PERMISSION=bypass` = ให้ agent รัน bash/แก้ไฟล์ได้เองไม่ถาม** — ควรใช้บนเครื่อง dev ที่ backup/commit ไว้แล้วเท่านั้น ถ้ากังวลให้เริ่มด้วย `RTB_AUTO_MERGE=false` เพื่อดูผลทุกก้อนก่อน merge สักช่วง แล้วค่อยเปิด full-auto
4. **อยากได้ checkpoint คนทุกก้อน** (แม้ verify เขียว) → ตั้ง `RTB_AUTO_MERGE=false` แล้วกด Approve merge เองในหน้า dashboard
5. Orchestrator **ไม่แตะโค้ดโปรเจกต์เอง** — มันแค่เรียก Claude Code; ตรรกะพัฒนาทั้งหมดยังผ่านกติกาใน `CLAUDE.md`/`WORKFLOW.md` ตามปกติ

---

## โครงไฟล์
```
orchestrator/
  config.mjs            ตั้งค่าทั้งหมด
  orchestrate.mjs       CLI
  server.mjs            dashboard server + API
  public/dashboard.html หน้าเว็บสถานะ
  lib/
    progress.mjs        parse PROGRESS.md → phases/tasks/next/stats
    prompt.mjs          สร้าง prompt ต่อ session (WORKFLOW §3)
    claude.mjs          เรียก claude -p --output-format json
    verify.mjs          รัน typecheck/test/lint
    git.mjs             branch/commit/merge + git-lock workaround
    queue.mjs           คิวรอคน + run log
    engine.mjs          วงจร orchestration หลัก
  queue/  logs/         runtime (gitignored)
```

## ข้อจำกัดที่ควรรู้
- ผูกกับรูปแบบ `PROGRESS.md` ปัจจุบัน (ตาราง 4 คอลัมน์ + emoji สถานะ + `## 🎯 งานถัดไป`) — ถ้าเปลี่ยน format ต้องปรับ `lib/progress.mjs`
- **orchestrator ไม่มีคำสั่ง `git push` เลย** (ตรวจ `lib/git.mjs` แล้ว) — merge เข้า `main` **ในเครื่อง** อย่างเดียว ⇒ **ด่านที่กั้น production คือตอนคุณ `git push` ไม่ใช่ตอนมัน merge**
- คุณภาพงานขึ้นกับ Claude Code — verify + human-in-loop คือตัวกันความเสี่ยง ไม่ใช่ปล่อยแล้วลืม
