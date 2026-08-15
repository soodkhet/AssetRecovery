import { describe, expect, it } from 'vitest'

/**
 * ยามระดับ DB ของตัวเดินเลขเอกสารคลัง (`44` §6.2/§10 "ออกอัตโนมัติ ไม่ซ้ำ ไม่ recycle")
 *
 * เคสที่ทำให้เขียนไฟล์นี้ (พบระหว่าง Phase 3.5): `next_handover_number()` เดิมปิดท้ายด้วย
 * `lpad(v_next::text, 3, '0')` ซึ่ง **ตัดปลายทิ้ง** เมื่อลำดับเกิน 999 ⇒ ล็อตที่ 1000 ของปีได้เลข
 * `LOT-2569-100` ชนกับล็อตที่ 100 ⇒ เลขเอกสารซ้ำ (migration `20260815090000`)
 *
 * ⚠️ ใช้ปี พ.ศ. สมมติ (2599) + sequence ของตัวเอง เพื่อไม่แตะลำดับจริงของปีปัจจุบันในฐานทดสอบ
 */

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip
if (!url) {
  console.warn('[handover-numbering.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')
}

const TEST_BE_YEAR = 2599

suite('เลขเอกสารคลัง — next_handover_number()', () => {
  it('เกิน 999 แล้วเลขต้องยาวขึ้นเอง ไม่ตัดปลายจนซ้ำ', async () => {
    process.env.DATABASE_URL = url
    const { prisma } = await import('@/lib/prisma')

    // เตรียม sequence ของปีสมมติให้อยู่ที่ 999 พอดี (สร้างครั้งแรกด้วยการเรียกฟังก์ชัน 1 ครั้ง)
    await prisma.$queryRawUnsafe(`SELECT next_handover_number('LOT', ${TEST_BE_YEAR}::int)`)
    await prisma.$executeRawUnsafe(`SELECT setval('seq_handover_lot_${TEST_BE_YEAR}', 999)`)

    const next = async (): Promise<string> => {
      const rows = await prisma.$queryRawUnsafe<{ value: string }[]>(
        `SELECT next_handover_number('LOT', ${TEST_BE_YEAR}::int) AS value`,
      )
      return rows[0]?.value ?? ''
    }

    expect(await next()).toBe(`LOT-${TEST_BE_YEAR}-1000`)
    expect(await next()).toBe(`LOT-${TEST_BE_YEAR}-1001`)
  })

  it('ต่ำกว่า 1000 ยังเติมศูนย์ครบ 3 หลักเหมือนเดิม', async () => {
    process.env.DATABASE_URL = url
    const { prisma } = await import('@/lib/prisma')

    await prisma.$queryRawUnsafe(`SELECT next_handover_number('DLV', ${TEST_BE_YEAR}::int)`)
    await prisma.$executeRawUnsafe(`SELECT setval('seq_handover_dlv_${TEST_BE_YEAR}', 6)`)

    const rows = await prisma.$queryRawUnsafe<{ value: string }[]>(
      `SELECT next_handover_number('DLV', ${TEST_BE_YEAR}::int) AS value`,
    )
    expect(rows[0]?.value).toBe(`DLV-${TEST_BE_YEAR}-007`)
  })
})
