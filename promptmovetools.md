# งาน: ปรับ Orchestrator + Dev Panel (ย้ายมาจากโปรเจค RTB) ให้ทำงานกับโปรเจคนี้

ผมคัดลอกเครื่องมือ 2 ตัวจากโปรเจคเดิมมาไว้ใน repo นี้แล้ว:

1. `orchestrator/` — ตัวขับ Claude Code อัตโนมัติ: อ่าน `PROGRESS.md` → รัน 1 session ต่อ 1 งานบน branch `auto/phase-<id>` → verify (typecheck/test/lint) → auto-repair 1 รอบถ้าแดง → merge เข้า base ในเครื่อง (ไม่ push) พร้อม dashboard เว็บ port 4173 (token auth), แจ้งเตือนมือถือผ่าน ntfy, sentinel protocol (`[[TASK_DONE]]` / `[[NEEDS_DECISION]]` / `[[OPTIONS]]` / `[[HANDOFF]]`), auto-answer, auto-review จบ Phase, final test หลายด่าน, limit guard ที่พักเมื่อโควตาใกล้เต็มแล้ว resume เอง
2. `tools/devpanel/` — แผงควบคุม dev บนเว็บ port 4599: ปุ่มเปิด/ปิด dev servers ทีละตัวหรือทั้งชุดตามลำดับ, docker postgres, Drizzle Studio, migrate/seed/clear, typecheck/test/build, console log สด พร้อม launcher `.command` และ `.app` ที่ root

**เป้าหมาย: adapt ให้เข้ากับโปรเจคนี้ — ห้ามเขียนใหม่จากศูนย์เด็ดขาด** โค้ดทั้งสองตัวสะสมการแก้บั๊กจริงไว้ใน comment จำนวนมาก การเขียนใหม่คือการ regress กลับไปเป็นบั๊กเดิมทั้งชุด

**โปรเจคนี้ไม่เกี่ยวอะไรกับ RTB เลย** — ดังนั้น:
- เนื้อหาธุรกิจ RTB ทุกชิ้น (กติกาการเงิน, ป้ายทะเบียน, Order, docs/16 ฯลฯ) ต้องหายไปหมด แทนด้วยของโปรเจคนี้เท่านั้น
- **ห้ามสมมติว่า stack เหมือนกัน** (pnpm / monorepo / vitest / eslint / Drizzle / docker postgres) — ให้ดูของจริงในโปรเจคนี้ก่อน; เครื่องมือไหนโปรเจคนี้ไม่มี (เช่น ไม่มี docker DB, ไม่มี Studio) ให้**ถอดปุ่ม/ถอด gate นั้นออก** ไม่ใช่เก็บไว้ให้พังเงียบ ๆ
- สิ่งเดียวที่ยกมาทั้งดุ้นคือ "กลไก + บทเรียน" ในรายการห้าม regress ด้านล่าง

## กติกาการแก้

- แก้**เฉพาะ**จุด hardcode ที่ระบุด้านล่าง ห้ามแตะ logic ที่มี comment อธิบายบั๊กเดิม ห้าม "refactor ให้สวยขึ้น"
- ห้ามลบ/ย่อ comment ที่บันทึกบทเรียน
- อ่าน `orchestrator/ADAPT_GUIDE.md` ทั้งไฟล์ก่อนเริ่ม — เป็นคู่มือแปลงเอกสารโปรเจคให้ orchestrator อ่านได้ (หมายเหตุ: ในไฟล์เขียน baseBranch default = `master` ซึ่งล้าสมัย — โค้ดจริงใน `config.mjs` เป็น `main` แล้ว ให้ยึดโค้ด)
- ก่อนแก้ ให้สำรวจโปรเจคนี้ก่อน: package manager + workspace layout, ชื่อ scripts ใน package.json, port ของแต่ละ app, docker compose (ชื่อ service + container_name), test runner, lint — **ข้อมูลไม่พอให้ถาม ห้ามเดา**
- ถ้าโปรเจคนี้ยังไม่มี `PROGRESS.md` / `CLAUDE.md` / `WORKFLOW.md` ตามฟอร์แมตที่ orchestrator ต้องการ ให้ทำตามขั้นตอน 7 ข้อใน ADAPT_GUIDE ก่อน แล้วค่อยแก้ config
- **ฟอร์แมต `PROGRESS.md` ผูกกับ marker ภาษาไทยตรงตัว** ใน `lib/progress.mjs` — `## 🎯 งานถัดไป — ...` (มีได้อันเดียว), หัวตาราง `| # | งาน | สถานะ | หมายเหตุ |`, สถานะ ⬜/🔄/✅/⏸️ เท่านั้น, `## บันทึกการตัดสินใจ` เป็นจุดหยุด parser, ไฟล์ ≤50,000 ตัวอักษร (วัดด้วย python `len()` ไม่ใช่ `wc -c`) — ต่อให้โปรเจคใหม่ใช้ภาษาอื่นทั้งหมด **marker พวกนี้ต้องคงไทยไว้** ไม่งั้นต้องแก้ parser (แก้ parser = เสี่ยง regress บั๊กชุดที่ระบุใน A2 ให้เลือกคง marker ไทยแทน)

## ส่วน A — Orchestrator: จุดที่ต้องแก้ (แก้เฉพาะรายการนี้)

1. `config.mjs`:
   - `verify[]` — คำสั่ง typecheck/test/lint ของโปรเจคนี้ โดยคงหลักการเดิม: **typecheck รันเต็มทั้ง repo เสมอ ห้ามย่อ** (เป็นด่านเดียวที่จับ "แก้ type ใน package แล้วพังที่ app ที่ไม่มีเทสต์คลุม") · test แบบ incremental (`vitest run --changed <base> --passWithNoTests` หรือเทียบเท่าของ runner ที่ใช้) · lint ส่งรายชื่อไฟล์ผ่าน `xargs` เสมอ ห้าม `eslint $f` เปล่า ๆ (zsh ไม่ word-split → exit 2 ทั้งที่โค้ดไม่ผิด) และมี `[ -z "$f" ] ||` กันเคสแก้แต่ docs
   - `baseBranch` — branch หลักของโปรเจคนี้
   - `models[]` — คงตาราง ctx ไว้: ทุกรุ่นปัจจุบัน 1M ยกเว้น Haiku 4.5 = 200k (ค่าเดาผิดเคยทำหลอด context อ่านเต็มเร็วกว่าจริง 5 เท่า)
   - `finalTestStages[]` — เขียนด่านทดสอบของโปรเจคนี้ หรือปล่อยว่าง + ปิด `RTB_AUTO_FINAL` ไว้ก่อน
   - `uiTaskPrefixes` — prefix งาน UI ของโปรเจคนี้ (หรือปล่อยว่าง)
   - `port` — **เปลี่ยนเป็น 4174 ให้แล้ว** (เลี่ยงชนกับ dashboard ของโปรเจคเก่าที่ใช้ 4173) ไม่ต้องแก้อีก เว้นแต่ต้องการค่าอื่น
2. `lib/prompt.mjs` — **จุดที่ต้องแก้เยอะที่สุด**: ค่าคงที่ `RULES` ฝังกติกาธุรกิจ RTB ทั้งดุ้น (เงินเป็นสตางค์, basis points, docs/16 ฯลฯ) ให้แทนด้วยกติกาจาก `CLAUDE.md` ของโปรเจคนี้ · ชื่อโปรเจค "RTB (pnpm monorepo)" · ชื่อผู้ใช้ใน `buildResumePrompt` · path เอกสารอ้างอิงทั้งหมด
3. `review-prompt.md`, `final-test-prompt.md`, `final-tests/*.md` — เนื้อหาเป็นธุรกิจ RTB ล้วน ให้เขียนใหม่ตามโปรเจคนี้ โดยใช้โครงเดิมเป็นแม่แบบ (review เฉพาะ diff ตั้งแต่ checkpoint, final test แยกด่าน)
4. `scripts/start.sh` + `scripts/statusline-capture.sh` — ตรวจ path เครื่องเดิมที่อาจ hardcode (**ไฟล์ plist ถูก rename เป็น `com.assetrecovery.orchestrator.plist` และแก้ label + path เป็น `/Users/zeegamemsg/AssetRecovery` ให้แล้ว — ไม่ต้องทำซ้ำ**)
5. env prefix `RTB_*` (~25 ตัว) — **แนะนำคงชื่อเดิมไว้** ลดจุดพัง; ถ้าจะเปลี่ยน ต้อง grep เปลี่ยนให้ครบทุกไฟล์รวม docs
6. ตรวจว่า **ไม่มี** state จากโปรเจคเดิมติดมา: `queue/*.json`, `logs/` (โดยเฉพาะ `review-checkpoint.json` — ติดมาจะข้าม review/final test ผิด), `.token`, `.run.lock` — ต้องปล่อยให้ระบบสร้างใหม่เอง
7. `README.md`, `REMOTE.md`, `ADAPT_GUIDE.md` ในโฟลเดอร์ — อัปเดต path/ชื่อโปรเจค

### A2 — สิ่งที่ห้าม regress (บทเรียนจากบั๊กจริง — ถ้าเห็นโค้ดแปลกให้เข้าใจว่าตั้งใจ)

- **orchestrator ไม่มีคำสั่ง `git push` เลย โดยตั้งใจ** — auto-merge แตะแค่ base ในเครื่องซึ่ง reset กลับได้; เส้นแบ่ง production คือคนกด push เอง **ห้ามเพิ่ม push**
- ทุกคำสั่ง git ต้อง exclude โฟลเดอร์ `orchestrator` (`:(exclude)orchestrator`) — ไม่งั้น queue/log ที่เขียนตลอดเวลาจะบล็อกตัวเอง
- `git diff <ref>` จุดเดียว ไม่ใช่ `<ref>...HEAD` — verify ต้องเห็นไฟล์ที่ยังไม่ commit
- parser `PROGRESS.md`: รับ id ยาว/มีตัวคั่น `- – — /` (pattern แคบเคยทิ้ง 38 แถวเงียบ ๆ จน dashboard โชว์ 100% ปลอม) · **ห้ามสังเคราะห์ task จาก id ในหัวข้อ 🎯 ที่ไม่มีแถวจริงในตาราง** (เคยทำ engine วนหยิบงานเดิม ~2 ชม. เผา Opus 3 session) · next task ต้องสถานะ todo/doing เท่านั้น
- `runLoop` จำ `lastDoneId` — งานเดิมขึ้น "เสร็จอยู่แล้ว" 2 รอบติด → park ให้คนแก้ ไม่วนต่อ
- verify เขียวแต่**ไม่มี commit ใหม่** → สร้างการ์ด decision จากข้อความสุดท้ายของ agent เสมอ ห้าม merge ของว่าง
- auto-commit WIP เมื่อ session ถูกตัด **ห้ามทำ** ถ้ามี `MERGE_HEAD` หรือไฟล์ UU/AA/DD ค้าง
- merge conflict → `merge --abort` ทันที ไม่ทิ้ง UU บล็อกงานถัดไป
- `claude -p --output-format stream-json` **ต้องคู่กับ `--verbose`** เสมอ · ตรวจ sentinel จากทั้ง `result` และ assistantText สะสม
- ntfy: `priority` ต้องเป็น**ตัวเลข** 1–5 (string ถูกเมิน → ไม่มีเสียง) · ปุ่ม action สูงสุด 3 ปุ่ม
- `state.auto` default = **ปิด** ทุกครั้งที่ restart โดยตั้งใจ
- `/api/approve` ตอบ 202 ทันทีไม่ await (merge อาจหลายนาที)
- `.run.lock` เก็บ pid + เช็คด้วย `process.kill(pid, 0)` + ล้าง dead lock ตอนบูต
- `setCheckpoint` ต้อง preserve `finalDone`
- ความปลอดภัย: dashboard สั่งรันโค้ดได้ → **ห้ามเปิดออกอินเทอร์เน็ต/Tailscale Funnel** ใช้ Tailscale + token เท่านั้น · `RTB_PERMISSION=bypass` ใช้เฉพาะเครื่อง dev ที่ backup แล้ว · เริ่มใช้งานแรก ๆ ให้ตั้ง `RTB_AUTO_MERGE=false`

## ส่วน B — Dev Panel: จุดที่ต้องแก้

1. `tools/devpanel/server.mjs` (จุด hardcode กระจุกช่วงบรรทัด ~61–77):
   - `SERVICES` — key/label/script/port ให้ตรง scripts ใน package.json โปรเจคนี้
   - `TASKS` — คำสั่ง migrate/seed/typecheck/test/build ของโปรเจคนี้ (เดิมผูก `pnpm --filter @rtb/*`)
   - `startStudio()` — คำสั่งเปิด DB Studio หรือถอดออกถ้าไม่ใช้
   - `dockerRunning()` — ชื่อ container + service ใน docker compose ของโปรเจคนี้
   - `REPO_ROOT` — ถ้ายังวางที่ `tools/devpanel/` ไม่ต้องแก้
   - ถ้าไม่ใช่ macOS: `/bin/zsh -lc` → bash, `spawn("open")` → `xdg-open`
2. `tools/devpanel/index.html` — ชื่อ header, ชุดสี, คำอธิบายปุ่ม, URL ปุ่ม "เปิดเว็บ" ให้ตรง port ใหม่
3. Launcher — **ทำให้แล้วทั้งหมด ไม่ต้องทำซ้ำ**: rename เป็น `AssetRecovery Dev Panel.app` / `เปิด AssetRecovery Dev Panel.command`, แก้ข้อความ + bundle id (`com.assetrecovery.devpanel`) + log path (`/tmp/assetrecovery-devpanel.log`) + port default **4600** (ทั้ง launcher และ `server.mjs` — เลี่ยงชนกับแผงโปรเจคเก่าที่ 4599) และ executable bit ยังอยู่ครบ — จำไว้ว่า `.app` หา repo root จากตำแหน่งที่มันวางอยู่ **ต้องวางที่ root ของ repo เท่านั้น** และมันเช็ค `curl /api/status` ก่อน spawn กันเปิดซ้ำ · **สิ่งที่เหลือของข้อนี้**: แก้ชื่อ/ข้อความใน `index.html` (header ยังเป็น "RTB Dev Panel") + desc ปุ่มต่าง ๆ

### B2 — สิ่งที่ห้าม regress

- `portOpen` ต้องเช็ค**ทั้ง** `127.0.0.1` และ `::1` แล้ว `.some(Boolean)` — Vite ผูก `localhost` ที่ macOS resolve เป็น IPv6 ก่อน; เช็คแค่ IPv4 จะโชว์ "ปิดอยู่" ตลอดกาลจนผู้ใช้กดเปิดซ้ำแล้ว process ชนพอร์ตกันตาย
- สถานะ service มี 2 มิติ: `managed` (panel เปิดเอง) + `listening` (พอร์ตตอบ) และมีสถานะที่สาม "กำลังเปิด…" (`managed && port && !listening`) — ขาดอันไหน ผู้ใช้จะกดซ้ำจนได้ process ซ้ำ
- server กัน spawn ซ้ำเอง: `children.has(key)` → return `already:true` ไม่ spawn
- ปุ่มเปิด/ปิดเป็น**ปุ่มเดียวสลับตามสถานะ** · long-running ทุกตัว (รวม Studio) ต้องมีทางปิดจากแผง · จุดสถานะ "ปิด" เป็นสีแดง ไม่ใช่เทา
- spawn ด้วย login shell + `detached: true` แล้ว kill ด้วย `process.kill(-pid, "SIGTERM")` (ทั้ง process group — pnpm มีลูกหลานหลายชั้น) + fallback + try/catch เงียบ
- นำหน้าคำสั่ง service ด้วย `exec` ลดชั้น process
- โหลด `.env` เองใส่ทุก child (parser รองรับ `export `, comment, quotes) · `ulimit -n 10240` ก่อน build ถ้าโปรเจคเจอ EMFILE
- one-shot task รันได้ทีละงาน (`runningTask` guard)
- cleanup ผูก SIGINT/SIGTERM/SIGHUP + delay 300ms ก่อน exit
- bind `127.0.0.1` เท่านั้น (ไม่มี auth) · `Cache-Control: no-store` ทุก response · log ใส่ DOM ด้วย `textContent` (กัน HTML injection จาก log ของ child)
- ช่องว่างที่รู้อยู่แล้ว (ยังไม่ต้องทำ เว้นแต่ผมสั่ง): ไม่มีปุ่ม kill process ภายนอกที่ค้างพอร์ต

## Definition of Done

1. `node --check` ผ่านทุกไฟล์ `.mjs` ที่แก้
2. `node orchestrator/orchestrate.mjs status` แสดง % และงานถัดไปของโปรเจคนี้ถูกต้อง
3. `node orchestrator/orchestrate.mjs run --dry-run` ได้ prompt ที่อ้างเอกสารโปรเจคนี้
4. เปิด dashboard → login ด้วย token ใหม่ (generate เอง) → เห็นสถานะถูกต้อง
5. เปิด dev panel → เปิด/ปิดทุก service ได้จริง สถานะ 3 สีขึ้นถูก ปุ่ม "เปิดเว็บ" enable เมื่อ listening จริง
6. `grep -ri "RTB\|Boonphone\|zeegamemsg" orchestrator/ tools/devpanel/` — เหลือเฉพาะจุดที่ตั้งใจคงไว้ (เช่น env prefix) และรายงานรายการที่เหลือให้ผมดู
7. รายงานทุกจุดที่ตัดสินใจเองระหว่างทาง + คำถามที่ค้าง
