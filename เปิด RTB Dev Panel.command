#!/bin/zsh
# ดับเบิลคลิกไฟล์นี้เพื่อเปิด RTB Dev Panel (แผงควบคุม dev แบบกดปุ่ม)
# - โหลด PATH จาก shell (nvm/pnpm/node/docker) ให้ครบ
# - cd เข้าโฟลเดอร์โปรเจคเอง
# - เปิดเบราว์เซอร์ไปที่แผงควบคุมให้อัตโนมัติ
# ปิดหน้าต่าง Terminal นี้ = ปิดแผง + ปิดบริการที่แผงเปิดไว้ทั้งหมด

# โหลดค่าคอนฟิก shell เพื่อให้เจอ nvm/pnpm (GUI ดับเบิลคลิกไม่โหลด .zshrc ให้เอง)
source "$HOME/.zshrc" 2>/dev/null
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" 2>/dev/null

cd "$(dirname "$0")" || exit 1

PORT="${PANEL_PORT:-4599}"
echo "กำลังเปิด RTB Dev Panel ที่ http://localhost:$PORT …"

# เปิดเบราว์เซอร์หลังเซิร์ฟเวอร์บูตสักครู่
( sleep 1.5; open "http://localhost:$PORT" ) &

exec node tools/devpanel/server.mjs
