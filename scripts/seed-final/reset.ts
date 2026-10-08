import type { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * `--reset` — ล้างข้อมูลธุรกิจทั้งหมด**ขององค์กรเดียว** (WHERE organization_id = …) แล้วคงไว้:
 * organizations · users (+ role ของแต่ละคน) · roles · capabilities · role_capabilities · push_subscriptions
 *
 * ตารางที่มี trigger immutable (`02` §13 — audit_logs · tax_invoices · wht_certificates · credit_notes ·
 * export_records · handover_lots confirmed · substitute_receipts · payout ฯลฯ) ลบตรงไม่ได้โดยออกแบบ
 * ⇒ สคริปต์ **ไม่ปิด trigger เงียบ ๆ**: ต้องสั่ง `--allow-immutable-reset` ชัดเจน แล้วจะ
 *   `ALTER TABLE … DISABLE TRIGGER USER` → DELETE ตามลำดับ FK → `ENABLE TRIGGER USER` ใน **ทรานแซกชันเดียว**
 *   (ล้มกลางทาง = rollback ทั้งหมด trigger กลับมาเปิดเอง) · ต้องใช้สิทธิ์ **เจ้าของตาราง** (owner) — ไม่ต้อง superuser
 * ถ้า role ที่ต่อไม่ใช่เจ้าของตาราง ⇒ `--print-reset-sql` พิมพ์ SQL ชุดเดียวกันให้ผู้มีสิทธิ์รันเอง
 */

export const KEEP_TABLES = new Set([
  '_prisma_migrations',
  'organizations',
  'users',
  'roles',
  'capabilities',
  'role_capabilities',
  'push_subscriptions',
])

interface FkRow {
  child: string
  parent: string
  column: string
}

interface ResetPlan {
  statements: string[]
  tables: string[]
  triggerTables: string[]
}

function q(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

export async function buildResetPlan(db: PrismaClient, organizationId: string): Promise<ResetPlan> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error('organizationId ไม่ถูกรูปแบบ')
  const tables = (
    await db.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT table_name AS name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    )
  )
    .map((row) => row.name)
    .filter((name) => !KEEP_TABLES.has(name))
  const fks = await db.$queryRawUnsafe<FkRow[]>(`
    SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent, a.attname AS column
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace`)
  const triggerTables = (
    await db.$queryRawUnsafe<Array<{ name: string }>>(`
      SELECT DISTINCT tgrelid::regclass::text AS name FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1`)
  )
    .map((row) => row.name)
    .filter((name) => tables.includes(name))
  const orgColumn = new Set(
    (
      await db.$queryRawUnsafe<Array<{ name: string }>>(`
        SELECT table_name AS name FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name = 'organization_id'`)
    ).map((row) => row.name),
  )

  const org = `'${organizationId}'::uuid`
  const scope = (table: string): string => {
    if (orgColumn.has(table)) return `organization_id = ${org}`
    if (table === 'team_managers') return `team_id IN (SELECT id FROM teams WHERE organization_id = ${org})`
    throw new Error(`ตาราง ${table} ไม่มี organization_id และไม่รู้วิธีจำกัดขอบเขต — เพิ่มกติกาใน reset.ts ก่อน`)
  }

  // ตารางที่ไม่มีใครอ้างถึง (ไม่มี FK ชี้เข้า) และไม่มีแถวขององค์กรอื่น ⇒ TRUNCATE แทน DELETE
  // เหตุผล: DELETE ทิ้ง dead tuple ไว้จนจบทรานแซกชัน — ตารางพ่อที่ลบต่อจากนั้นต้องตรวจ FK (ON DELETE SET NULL) ด้วย seq scan
  // ทุกแถว (device_tacs.device_model_id ไม่มี index) ⇒ ฐาน TAC จริงบน staging (2.5 แสน × 1.3 แสน) ไม่จบ · TRUNCATE ยัง rollback ได้
  const referenced = new Set(fks.filter((row) => row.child !== row.parent).map((row) => row.parent))
  const truncatable = new Set<string>()
  for (const table of tables) {
    if (referenced.has(table) || !orgColumn.has(table)) continue
    const [other] = await db.$queryRawUnsafe<Array<{ found: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM ${q(table)} WHERE organization_id <> ${org}) AS found`,
    )
    if (other?.found === false) truncatable.add(table)
  }

  const statements: string[] = []
  for (const table of triggerTables) statements.push(`ALTER TABLE ${q(table)} DISABLE TRIGGER USER;`)
  // ผู้ใช้คงอยู่ แต่ปลดสังกัดทีม/บริษัท (ตารางปลายทางถูกล้าง) — seed ผูกใหม่เอง
  statements.push(`UPDATE users SET team_id = NULL, company_id = NULL WHERE organization_id = ${org};`)
  // self-reference (ใบแทน/ถูกแทน ฯลฯ) ตัดก่อน — FK แบบ RESTRICT ตรวจทีละแถว
  for (const fk of fks.filter((row) => row.child === row.parent && tables.includes(row.child))) {
    statements.push(`UPDATE ${q(fk.child)} SET ${q(fk.column)} = NULL WHERE ${scope(fk.child)} AND ${q(fk.column)} IS NOT NULL;`)
  }
  // ลบลูกก่อนพ่อ (กราฟ FK ของตารางธุรกิจเป็น DAG — ตรวจตอนสร้างแผน)
  let remaining = new Set(tables)
  const edges = fks.filter((row) => row.child !== row.parent && remaining.has(row.child) && remaining.has(row.parent))
  while (remaining.size > 0) {
    const ready = [...remaining].filter(
      (table) => !edges.some((edge) => edge.parent === table && remaining.has(edge.child)),
    )
    if (ready.length === 0) throw new Error(`กราฟ FK มีวงวน: ${[...remaining].join(', ')}`)
    for (const table of ready) {
      statements.push(truncatable.has(table) ? `TRUNCATE ${q(table)};` : `DELETE FROM ${q(table)} WHERE ${scope(table)};`)
    }
    remaining = new Set([...remaining].filter((table) => !ready.includes(table)))
  }
  for (const table of triggerTables) statements.push(`ALTER TABLE ${q(table)} ENABLE TRIGGER USER;`)
  return { statements, tables, triggerTables }
}

export function renderResetSql(plan: ResetPlan): string {
  return ['BEGIN;', ...plan.statements, 'COMMIT;'].join('\n')
}

export async function executeReset(db: PrismaClient, plan: ResetPlan): Promise<void> {
  await db.$transaction(
    async (tx) => {
      // Supabase ตั้ง statement_timeout ของ role ไว้ (ค่าเริ่มต้นสั้น) — ฐาน TAC จริงหลายแสนแถวลบไม่ทัน ⇒ ปลดเฉพาะทรานแซกชันนี้
      await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 0')
      for (const statement of plan.statements) await tx.$executeRawUnsafe(statement)
    },
    { timeout: 600_000, maxWait: 60_000 },
  )
}
