#!/bin/bash
# Claude Code statusline hook — ดัก JSON ที่ Claude Code ส่งเข้ามา (รวม rate_limits ถ้ามี)
# เก็บลงไฟล์ให้ dashboard อ่าน แล้วพิมพ์ status line สั้น ๆ กลับไป
# ตั้งใน ~/.claude/settings.json:  "statusLine": { "type": "command", "command": "<path นี้>" }
DIR="$(cd "$(dirname "$0")/.." && pwd)"   # = orchestrator/
mkdir -p "$DIR/logs"
input=$(cat)
printf '%s' "$input" > "$DIR/logs/statusline.json"

# status line ที่จะโชว์ใน Claude Code (ดึงชื่อ model + % 5 ชม.ถ้ามี)
python3 - "$DIR/logs/statusline.json" <<'PY' 2>/dev/null || printf 'RTB'
import json,sys
d=json.load(open(sys.argv[1]))
model=(d.get('model') or {}).get('display_name','claude')
rl=d.get('rate_limits') or {}
fh=(rl.get('five_hour') or {}).get('used_percentage')
tail=f" · 5h {fh}%" if fh is not None else ""
print(f"RTB · {model}{tail}")
PY
