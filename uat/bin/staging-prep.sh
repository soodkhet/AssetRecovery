#!/usr/bin/env bash
# เตรียมฐาน staging ให้เป็นชุด Final Test + persona 18 คน — **ผู้ใช้รันเองทีละขั้น** (ห้าม Claude รัน: เขียนฐาน/Auth ระบบจริง)
#
#   uat/bin/staging-prep.sh check            อ่านอย่างเดียว: migration status + จำนวนผู้ใช้/เคส
#   uat/bin/staging-prep.sh snapshot <label> สำรองฐานเป็น JSON → uat/snapshots/staging-<label>-*.json
#   uat/bin/staging-prep.sh reset            ล้างข้อมูลธุรกิจ (คง org/users/roles/capabilities)
#   uat/bin/staging-prep.sh users            ค่าตั้ง/ทีม/บริษัท + สร้าง persona 18 คน (Auth จริง อีเมล @stg.uat.test)
#   uat/bin/staging-prep.sh seed             ข้อมูล Final Test + อัปโหลดไฟล์ตัวอย่างขึ้น Storage จริง (≈ 2–5 นาที)
#   uat/bin/staging-prep.sh verify           ตรวจยอดเงิน/สถานะเทียบ golden (exit 2 = มี ❌)
#   uat/bin/staging-prep.sh login [user…]    login ทุก persona เก็บ session → uat/.auth-staging/
#   uat/bin/staging-prep.sh login --manual superadmin   เปิด Chrome ให้ผู้ใช้ login เอง แล้วเก็บ session
#   uat/bin/staging-prep.sh q "SELECT …"     SQL อ่านอย่างเดียว (READ ONLY) — subagent ใช้ตรวจข้อมูลได้
#
# - ไม่พิมพ์ค่า connection/รหัส · ค่า env อ่านจาก .env.staging (DIRECT_URL) + .env.local (Supabase 3 ตัว — project เดียวกับ staging)
# - รหัส persona ของ staging อยู่ uat/personas-staging.json (แยกจาก localhost — Auth ใช้ร่วมกัน ห้ามใช้อีเมล @uat.test เดิม)
set -euo pipefail
cd "$(dirname "$0")/../.."

STAGING_REF=qgshdgzzajmoytzymsqe

load_env() {
  [[ -f .env.staging && -f .env.local ]] || { echo "❌ ต้องมี .env.staging และ .env.local"; exit 1; }
  # เลือกเฉพาะตัวที่ใช้ — ไม่ source ทั้งไฟล์ (.env.local มี DATABASE_URL ของเครื่อง/VERCEL_*)
  eval "$(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=' .env.local | sed 's/^/export /')"
  eval "$(grep -E '^DIRECT_URL=' .env.staging | sed 's/^/export /')"
  export DATABASE_URL="$DIRECT_URL"
  unset TEST_DATABASE_URL DEV_ADMIN_AUTH_PASSWORD VERCEL_ENV || true
  [[ "$DATABASE_URL" == *"$STAGING_REF"* ]] || { echo "❌ DIRECT_URL ใน .env.staging ไม่ใช่ project staging ($STAGING_REF)"; exit 1; }
  [[ "${NEXT_PUBLIC_SUPABASE_URL:-}" == *"$STAGING_REF"* ]] || { echo "❌ NEXT_PUBLIC_SUPABASE_URL ไม่ใช่ project staging"; exit 1; }
  [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] || { echo "❌ ไม่มี SUPABASE_SERVICE_ROLE_KEY"; exit 1; }
  echo "✓ env staging ($STAGING_REF) — ไม่แสดงค่า"
}

seed_final() { pnpm -s seed:final --target=staging "$@"; }

case "${1:-}" in
  check)
    load_env
    PRISMA_ENV_FILE=.env.staging pnpm -s prisma migrate status 2>&1 | grep -E 'migrations found|up to date|not yet been applied|following migration|^[0-9]{14}_' || true
    pnpm -s tsx uat/bin/staging-count.ts
    ;;
  snapshot)
    load_env
    pnpm -s tsx uat/bin/staging-snapshot.ts "${2:?ใส่ label เช่น pre-audit}"
    ;;
  reset)
    load_env
    seed_final --reset --allow-immutable-reset
    ;;
  users)
    load_env
    seed_final --create-auth-users --with-storage
    echo "→ รหัสอยู่ uat/personas-staging.json (ไม่แสดง) · ผู้ใช้ใหม่ต้องเปลี่ยนรหัสครั้งแรก — ขั้น login จัดการให้"
    ;;
  seed)
    load_env
    seed_final --seed --with-storage
    ;;
  verify)
    load_env
    seed_final --verify
    ;;
  q)
    load_env >/dev/null
    pnpm -s tsx uat/bin/staging-q.ts "${2:?ใส่ SQL (SELECT เท่านั้น — ทรานแซกชัน READ ONLY)}"
    ;;
  login)
    shift
    node uat/bin/staging-login.mjs "$@"
    ;;
  *)
    sed -n 2,16p "$0"; exit 1
    ;;
esac
