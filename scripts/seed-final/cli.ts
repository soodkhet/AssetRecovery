import type { CliFlags } from './index'
import { ORG_ID, rawDb } from './context'
import { buildResetPlan, executeReset, renderResetSql } from './reset'

/** ลำดับขั้นตาม README: reset → bootstrap/auth → seed → verify (ขั้นที่ไม่ได้สั่ง = ข้าม) */
export async function runCli(flags: CliFlags): Promise<void> {
  const db = rawDb()
  try {
    if (flags.printResetSql || flags.reset) {
      const plan = await buildResetPlan(db, ORG_ID)
      if (flags.printResetSql) {
        console.log(renderResetSql(plan))
      }
      if (flags.reset) {
        if (!flags.allowImmutableReset) {
          throw new Error(
            '--reset ต้องคู่กับ --allow-immutable-reset (ล้างตาราง immutable: audit_logs/tax_invoices/wht_certificates/' +
              'credit_notes/export_records ฯลฯ ผ่าน DISABLE TRIGGER USER ชั่วคราวในทรานแซกชันเดียว — ต้องเป็นเจ้าของตาราง)',
          )
        }
        console.warn(
          `⚠️  [reset] จะลบข้อมูลธุรกิจทั้งหมดขององค์กร ${ORG_ID} ใน ${plan.tables.length} ตาราง ` +
            `รวมตาราง immutable ${plan.triggerTables.length} ตาราง (ปิด trigger ชั่วคราวในทรานแซกชันเดียว)`,
        )
        try {
          await executeReset(db, plan)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (/must be owner|permission denied/i.test(message)) {
            console.error('[reset] role นี้ไม่ใช่เจ้าของตาราง — ให้ผู้มีสิทธิ์รัน SQL จาก --print-reset-sql แทน')
          }
          throw error
        }
        console.log('[reset] เสร็จ')
      }
    }
    if (flags.seed || flags.bootstrapPersonas || flags.createAuthUsers) {
      // ผู้ใช้ทีมต้องมีทีมก่อน ⇒ ขั้นสร้างบัญชีรัน master (ทีม/แผน/บริษัท) ก่อนเสมอ — รันซ้ำได้
      const { runSeed } = await import('./scenario')
      await runSeed({
        withStorage: flags.withStorage,
        bootstrap: flags.bootstrapPersonas,
        createNew: flags.createAuthUsers || flags.bootstrapPersonas,
        realAuth: flags.createAuthUsers,
        createAllMissing: flags.createAuthUsers && flags.target === 'staging',
        full: flags.seed,
      })
    }
    if (flags.verify) {
      const { runVerify } = await import('./verify')
      const ok = await runVerify()
      if (!ok) process.exitCode = 2
    }
  } finally {
    await db.$disconnect()
  }
}
