import { prisma } from '@/lib/prisma'

/**
 * Seed master data — ของจริงลงใน Phase 1.2 (organizations, 15 roles, role_capabilities 37 รายการ,
 * settings ตั้งต้นตามไฟล์ 13) · seed ต้อง **idempotent** รันซ้ำได้ไม่พัง (ใช้ upsert เสมอ)
 * ⚠️ seed `roles` ห้ามลบ/เปลี่ยนชื่อภายหลัง (Rule 02 — Immutable Rules)
 */
async function main() {
  console.log('[seed] ยังไม่มี master data ให้ seed — ตารางจริงเริ่มที่ Phase 1.1/1.2')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error('[seed] ล้มเหลว:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
