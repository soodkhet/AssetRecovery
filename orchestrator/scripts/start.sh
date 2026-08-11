#!/bin/bash
# รัน orchestrator dashboard + กัน Mac หลับระหว่างทำงาน (caffeinate)
# ใช้โดย launchd (com.rtb.orchestrator.plist) หรือรันมือ: bash orchestrator/scripts/start.sh
set -euo pipefail

# ไป repo root (สคริปต์อยู่ที่ orchestrator/scripts/)
cd "$(cd "$(dirname "$0")/../.." && pwd)"

# หา node/claude ให้เจอ (launchd มี PATH น้อย) — ปรับเพิ่มได้ถ้าใช้ nvm
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(cat .nvmrc 2>/dev/null || echo '')/bin:$PATH"
NODE_BIN="${NODE_BIN:-$(command -v node || echo node)}"

# โหลด .env (มี DB creds ฯลฯ ที่ pnpm test ต้องใช้)
if [ -f ./.env ]; then set -a; . ./.env; set +a; fi

echo "[$(date '+%F %T')] starting orchestrator server ($NODE_BIN)"

# caffeinate -is = กัน idle sleep + system sleep ตลอดที่ server รัน
# ถ้าไม่อยากกัน Mac หลับถาวร ให้ลบ 'caffeinate -is' ออก แล้วรัน server เฉพาะตอนต้องการทำงาน
exec caffeinate -is "$NODE_BIN" orchestrator/server.mjs
