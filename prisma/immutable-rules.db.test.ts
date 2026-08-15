import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB จริงของ **Immutable Rules ครบทุกตาราง** (`02` §13 — Phase 8.2)
 *
 * `02`:2057 สั่งว่า "Immutable Rules บังคับที่ระดับ table ไม่ใช่แค่ระดับ application" — ยามฝั่ง service
 * กันได้เฉพาะทางที่เดินผ่านโค้ด ส่วน raw SQL / psql / สคริปต์ซ่อม ยังลบเอกสารภาษีทิ้งได้ถ้าไม่มี trigger
 *
 * เทสต์นี้เช็ค 2 ชั้น:
 * ① **trigger มีอยู่จริงบนตารางจริง** (อ่านจาก `pg_trigger` ไม่ใช่จากไฟล์ SQL — migration ที่ยังไม่ deploy จะจับได้)
 * ② **ยิงจริงเมื่อชนกฎ** โดยยิงคำสั่งกับ `id` ที่ไม่มีอยู่จริง สำหรับ trigger ที่เป็น statement-level
 *    (row-level trigger ยิงต่อแถว — ทดสอบด้วยข้อมูลจริงในไฟล์ `*.db.test.ts` ของโมดูลนั้น ๆ)
 *
 * รันเมื่อมี `TEST_DATABASE_URL` เท่านั้น + ต้อง `pnpm db:deploy:test` มาก่อน (Rule 07)
 */

const url = process.env.TEST_DATABASE_URL

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  const isTestDb = parsed.pathname.includes('test')
  if (!isLocal || !isTestDb) {
    throw new Error(
      `TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname} db=${parsed.pathname}) — Rule 07`,
    )
  }
}

const suite = url ? describe : describe.skip
if (!url) {
  console.warn('[immutable-rules.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

let client: PrismaClient | null = null

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

afterAll(async () => {
  await client?.$disconnect()
})

/** UUID ที่ไม่มีอยู่จริง — statement-level trigger ต้องยิงแม้คำสั่งไม่ match แถวไหนเลย */
const ABSENT_ID = '00000000-0000-0000-0000-0000000000fe'

/** ทุกตารางที่ `02` §13 สั่งไว้ → trigger ที่ต้องมีอยู่บนตารางนั้นจริง */
const EXPECTED_TRIGGERS: readonly { table: string; triggers: readonly string[] }[] = [
  { table: 'audit_logs', triggers: ['trg_audit_logs_no_delete', 'trg_audit_logs_no_truncate', 'trg_audit_logs_no_update'] },
  {
    table: 'handover_lots',
    triggers: ['trg_handover_lots_confirmed_no_delete', 'trg_handover_lots_confirmed_no_update'],
  },
  { table: 'tax_invoices', triggers: ['trg_tax_invoices_no_delete', 'trg_tax_invoices_no_update'] },
  // ── Phase 8.2 — 7 ตารางที่เหลือ ──
  { table: 'export_records', triggers: ['trg_export_records_no_delete', 'trg_export_records_no_truncate'] },
  { table: 'wht_certificates', triggers: ['trg_wht_certificates_no_delete', 'trg_wht_certificates_no_update'] },
  { table: 'case_evidences', triggers: ['trg_case_evidences_approved_no_update'] },
  { table: 'payout_batches', triggers: ['trg_payout_batches_completed_amounts'] },
  { table: 'bank_transactions', triggers: ['trg_bank_transactions_no_silent_unmatch'] },
  { table: 'accounting_periods', triggers: ['trg_accounting_periods_locked'] },
  { table: 'roles', triggers: ['trg_roles_seed_no_delete', 'trg_roles_seed_no_update'] },
]

async function triggersOf(table: string): Promise<string[]> {
  const rows = await db().$queryRawUnsafe<{ tgname: string }[]>(
    `SELECT tgname FROM pg_trigger WHERE tgrelid = '${table}'::regclass AND NOT tgisinternal ORDER BY tgname`,
  )
  return rows.map((row) => row.tgname)
}

suite('Immutable Rules ระดับ DB — ครบทุกตารางของ `02` §13 (Phase 8.2)', () => {
  it.each(EXPECTED_TRIGGERS)('ตาราง `$table` มี trigger ครบตามสเปค', async ({ table, triggers }) => {
    const actual = await triggersOf(table)
    for (const trigger of triggers) {
      expect(actual, `${table} ต้องมี trigger ${trigger} (มีอยู่: ${actual.join(', ') || 'ไม่มีเลย'})`).toContain(trigger)
    }
  })

  /**
   * `export_records` — "any / ห้าม DELETE, ต้องสร้าง version ใหม่แทน"
   * statement-level ⇒ ต้องยิงแม้ `WHERE` ไม่โดนแถวไหน (ไม่งั้น `DELETE ... WHERE false` ผ่านเงียบ ๆ)
   */
  it('export_records: DELETE ถูกปฏิเสธแม้ไม่ match แถวไหนเลย + TRUNCATE ถูกปฏิเสธ', async () => {
    await expect(
      db().$executeRawUnsafe(`DELETE FROM export_records WHERE id = '${ABSENT_ID}'`),
    ).rejects.toThrow(/EXPORT_RECORD_IMMUTABLE/)

    await expect(db().$executeRawUnsafe('TRUNCATE TABLE export_records')).rejects.toThrow(
      /EXPORT_RECORD_IMMUTABLE/,
    )
  })

  /**
   * `wht_certificates` — "ห้าม DELETE, ห้าม reverse cancel"
   * ทำแบบเดียวกับ `tax_invoices`: ลบไม่ได้ทุกสถานะ เพราะ `certificate_number` เดินตามลำดับ
   * (ลบใบไหนออก = เลขขาดช่วง อธิบายกับสรรพากรไม่ได้)
   */
  it('wht_certificates: DELETE ถูกปฏิเสธ (row-level — ต้องมีแถวจริงจึงยิง)', async () => {
    const rows = await db().$queryRaw<{ id: string }[]>`SELECT id FROM wht_certificates LIMIT 1`
    const target = rows[0]
    if (target === undefined) {
      // ไม่มีข้อมูลใน DB ทดสอบรอบนี้ — ชั้น ① ข้างบนยืนยัน trigger ติดตั้งแล้ว
      // (การลบจริงถูกทดสอบด้วยข้อมูลจริงที่ `lib/wht/wht.db.test.ts`)
      return
    }
    await expect(
      db().$executeRawUnsafe(`DELETE FROM wht_certificates WHERE id = '${target.id}'`),
    ).rejects.toThrow(/WHT_CERTIFICATE_IMMUTABLE/)
  })

  /**
   * `roles` — "is_seed = true / ห้าม DELETE, ห้าม UPDATE name/role_group"
   *
   * สร้างบทบาท seed ของตัวเองแทนการพึ่ง `pnpm db:seed` (DB ทดสอบไม่ได้ seed เสมอไป) —
   * ล้างทิ้งได้โดยไม่ต้องปิด trigger: ปลด `is_seed` ก่อน (ยามยอมเพราะไม่แตะชื่อ/กลุ่ม)
   * แล้วค่อยลบ ⇒ พิสูจน์ตรง ๆ ว่ายามล็อกเฉพาะ 2 คอลัมน์ที่สเปคระบุ ไม่ได้แช่แข็งทั้งแถว
   */
  it('roles: บทบาท seed ลบไม่ได้ และเปลี่ยนชื่อ/กลุ่มไม่ได้ — แต่แก้คอลัมน์อื่นได้', async () => {
    const orgId = '00000000-0000-4000-8000-0000000082a0'
    const roleId = '00000000-0000-4000-8000-0000000082a1'
    const tx = db()

    await tx.$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address)
      VALUES ('${orgId}', 'ทดสอบ Immutable 8.2', '9999999998200', 'ที่อยู่ทดสอบ 8.2')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed)
      VALUES ('${roleId}', '${orgId}', 'บทบาท seed ทดสอบ 8.2', 'system', true)
      ON CONFLICT (id) DO NOTHING
    `)

    try {
      await expect(tx.$executeRawUnsafe(`DELETE FROM roles WHERE id = '${roleId}'`)).rejects.toThrow(
        /SEED_ROLE_IMMUTABLE/,
      )
      await expect(
        tx.$executeRawUnsafe(`UPDATE roles SET name = 'HACKED' WHERE id = '${roleId}'`),
      ).rejects.toThrow(/SEED_ROLE_IMMUTABLE/)
      await expect(
        tx.$executeRawUnsafe(`UPDATE roles SET role_group = 'inhouse' WHERE id = '${roleId}'`),
      ).rejects.toThrow(/SEED_ROLE_IMMUTABLE/)

      // soft delete + แก้สิทธิ์ยังต้องทำได้ — ยามล็อกแค่ชื่อ/กลุ่ม (`02` §13)
      await expect(
        tx.$executeRawUnsafe(`UPDATE roles SET is_editable = true WHERE id = '${roleId}'`),
      ).resolves.toBeDefined()
    } finally {
      await tx.$executeRawUnsafe(`UPDATE roles SET is_seed = false WHERE id = '${roleId}'`)
      await tx.$executeRawUnsafe(`DELETE FROM roles WHERE id = '${roleId}'`)
      await tx.$executeRawUnsafe(`DELETE FROM organizations WHERE id = '${orgId}'`)
    }
  })
})
