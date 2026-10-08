import { ORG_ID, rawDb } from './context'
import { enableRealStorage } from './files'
import { seedMaster } from './master'

export interface SeedOptions {
  withStorage: boolean
  bootstrap: boolean
  createNew: boolean
  realAuth: boolean
  /** staging: สร้าง persona ที่ขาดทั้งหมด (ไม่ใช่แค่บัญชีใหม่ U123) */
  createAllMissing: boolean
  /** false = ขั้น --create-auth-users อย่างเดียว (master + ผู้ใช้ ไม่สร้างข้อมูลทดสอบ) */
  full: boolean
}

export async function runSeed(options: SeedOptions): Promise<void> {
  enableRealStorage(options.withStorage)
  const db = rawDb()
  if (options.full && (await db.case.count({ where: { organizationId: ORG_ID } })) > 0) {
    throw new Error('องค์กรมีข้อมูลธุรกิจอยู่แล้ว — รัน --reset --allow-immutable-reset ก่อน (seed ต้องเริ่มจากฐานว่าง)')
  }
  const hasSettings = (await db.vatRateHistory.count({ where: { organizationId: ORG_ID } })) > 0
  await seedMaster({ ...options, settings: !hasSettings })
  if (!options.full) return
  const { runTimeline } = await import('./timeline')
  await runTimeline()
}
