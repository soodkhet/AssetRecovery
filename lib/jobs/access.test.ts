import { describe, expect, it } from 'vitest'
import type { CapabilityHolder } from '@/lib/auth/permission'
import { EXPORT_ACCOUNTING_PACK } from '@/lib/exports/pack'
import { JOB_REQUIRED_CAPABILITY, MANAGE_JOBS, canTriggerJobType, jobRequiredCapability } from '@/lib/jobs/access'
import { JOB_TYPES } from '@/lib/jobs/job-types'
import { GENERATE_PAYMENT_FILE } from '@/lib/payout/payout'

/**
 * `manage_jobs` เปิดให้ "สั่งงานเบื้องหลัง" ได้ แต่ต้องไม่กลายเป็นทางลัดข้ามสิทธิ์ของงานปลายทาง
 * (DEC-002) — `export_pack`/`bank_file` รัน service ที่บังคับสิทธิ์ไว้ที่ route เจ้าของเท่านั้น
 */

function holder(capabilities: Record<string, 'view' | 'manage'>): CapabilityHolder {
  return { isSuperadmin: false, capabilities }
}

describe('สิทธิ์การสั่งงานเบื้องหลังตามชนิดงาน (`91` §12 · DEC-002)', () => {
  it('งานที่ทำแทนคนต้องมี capability ของงานปลายทางกำกับไว้', () => {
    expect(jobRequiredCapability('export_pack')).toBe(EXPORT_ACCOUNTING_PACK)
    expect(jobRequiredCapability('bank_file')).toBe(GENERATE_PAYMENT_FILE)
  })

  it('งานกวาดคิวที่ระบบทำเองไม่ต้องมี capability เพิ่ม', () => {
    for (const code of JOB_TYPES) {
      if (code === 'export_pack' || code === 'bank_file') continue
      expect(jobRequiredCapability(code), code).toBeNull()
    }
  })

  it('`manage_jobs` อย่างเดียวสั่งงานที่กระทบเงิน/ภาษีไม่ได้', () => {
    const jobsOnly = holder({ [MANAGE_JOBS]: 'manage' })

    expect(canTriggerJobType(jobsOnly, 'advance_overdue')).toBe(true)
    expect(canTriggerJobType(jobsOnly, 'export_pack')).toBe(false)
    expect(canTriggerJobType(jobsOnly, 'bank_file')).toBe(false)
  })

  it('มี capability ปลายทางระดับ manage แล้วจึงสั่งได้', () => {
    const full = holder({
      [MANAGE_JOBS]: 'manage',
      [EXPORT_ACCOUNTING_PACK]: 'manage',
      [GENERATE_PAYMENT_FILE]: 'manage',
    })
    expect(canTriggerJobType(full, 'export_pack')).toBe(true)
    expect(canTriggerJobType(full, 'bank_file')).toBe(true)

    // ระดับ `view` ของงานปลายทางยังไม่พอ (DEC-009 — view ⊄ manage)
    const viewOnly = holder({ [MANAGE_JOBS]: 'manage', [EXPORT_ACCOUNTING_PACK]: 'view' })
    expect(canTriggerJobType(viewOnly, 'export_pack')).toBe(false)
  })

  it('ไม่มี `manage_jobs` ก็สั่งอะไรไม่ได้เลยแม้ถือสิทธิ์ปลายทาง', () => {
    const noJobs = holder({ [EXPORT_ACCOUNTING_PACK]: 'manage' })
    expect(canTriggerJobType(noJobs, 'export_pack')).toBe(false)
  })

  it('Superadmin สั่งได้ทุกชนิด (นิยามของ DEC-009 — ไม่เก็บ record)', () => {
    const superadmin: CapabilityHolder = { isSuperadmin: true, capabilities: {} }
    for (const code of JOB_TYPES) {
      expect(canTriggerJobType(superadmin, code), code).toBe(true)
    }
  })

  it('ตารางที่ประกาศไว้ไม่มี job_type แปลกปลอม', () => {
    for (const code of Object.keys(JOB_REQUIRED_CAPABILITY)) {
      expect(JOB_TYPES as readonly string[]).toContain(code)
    }
  })
})
