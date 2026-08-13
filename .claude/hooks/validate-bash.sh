#!/bin/bash
# PreToolUse hook (matcher: Bash) — กันคำสั่งอันตรายใน session อัตโนมัติของ AssetRecovery
# input: JSON ทาง stdin ตามรูปแบบ Claude Code hooks · exit 2 = block พร้อมข้อความถึงโมเดล
set -u

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

block() { echo "$1" >&2; exit 2; }

# 1) ห้าม git push ทุกรูปแบบ (เส้นแบ่ง production = คนกดเอง — ดู .claude/rules/06-git-workflow.md)
if printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+([-[:alnum:]=. ]+[[:space:]])?push([[:space:]]|$)'; then
  block "BLOCKED: ห้าม git push จาก session อัตโนมัติ — ให้คนตรวจแล้ว push เอง (rules/06)"
fi

# 3) ห้ามลบแบบกว้าง
if printf '%s' "$CMD" | grep -qE 'rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)[[:space:]]+(/|~|\.\.|\$HOME)([[:space:]]|$)'; then
  block "BLOCKED: rm -rf บน path กว้างเกินไป"
fi

# 4) ห้ามแก้ database production ตรงจาก shell (คำใบ้จาก env ชื่อ production)
if printf '%s' "$CMD" | grep -qiE '(drop[[:space:]]+(database|schema)|truncate[[:space:]])' ; then
  block "BLOCKED: คำสั่งทำลายข้อมูลระดับ database — ถ้าจำเป็นจริงให้ถามคนก่อน ([[NEEDS_DECISION]])"
fi

exit 0
