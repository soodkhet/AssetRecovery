import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  DEV_TRIGGER_JOB_TYPES,
  ADVANCE_OVERDUE_AS_OF_MAX_DAYS,
  parseSettleDate,
  parseSimulatedAsOf,
  simulatedAsOfInstant,
  JOB_TYPES,
  JOB_TYPE_SPECS,
  SCHEDULED_JOB_TYPES,
  isKnownJobType,
  jobScheduleBucket,
  jobTypeLabel,
  scheduledIdempotencyKey,
} from '@/lib/jobs/job-types'
import { SWEEPER_JOB_TYPES, devSimulatedNowOf } from '@/lib/jobs/registry'

/** ทะเบียน job_type ต้องตรงกับ `91` §6.1 เสมอ — เทสต์นี้แดง = โค้ดกับสเปคเริ่มไม่ตรงกัน */

function doc(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../../docs/${file}`, import.meta.url)), 'utf8')
}

describe('ทะเบียน job_type (`91` §6.1)', () => {
  it('job_type 8 ตัวของ §6.1 มีครบและเป็นชุดเดียวกับที่ dev trigger รับได้ (§14.1 · C8 · UAT Q21 · U97 · U157)', () => {
    expect([...DEV_TRIGGER_JOB_TYPES].sort()).toEqual([
      'advance_overdue',
      'bank_file',
      'daily_field_allowance',
      'device_tac_sync',
      'export_pack',
      'purge_debtor_documents',
      'reassign_timeout',
      'wht_summary',
    ])
  })

  it('job_type ที่ติดธง "อยู่ในสเปค" ต้องมีชื่อจริงในตาราง §6.1 ของ `91`', () => {
    // อ่านเฉพาะตาราง §6.1 — ส่วนอื่นของไฟล์พูดถึง job_type ของโมดูลอื่นด้วย (§17)
    const source = doc('91-platform-api-integration-jobs.md')
    const table = source.slice(source.indexOf('### 6.1'), source.indexOf('### 6.2'))
    expect(table.length).toBeGreaterThan(0)
    for (const code of JOB_TYPES) {
      expect(table.includes(code), code).toBe(JOB_TYPE_SPECS[code].inSpecCatalog)
    }
  })

  it('job_type ที่เกิดนอก §6.1 ต้องอ้างที่มาของตัวเองไว้ (มติ/สเปคของโมดูล)', () => {
    const extra = JOB_TYPES.filter((code) => !JOB_TYPE_SPECS[code].inSpecCatalog)
    expect([...extra].sort()).toEqual([
      'fuel_distance_retry',
      'payout_completion_repair',
      'report_export',
      'wht_filing_reminder',
    ])
    // `fuel_distance_retry` = มติ PO 14/08/2569 (D10) · `wht_filing_reminder` = `33` §6.2/§8 (Phase 5.2)
    // `report_export` = E13 ใน `02_OPEN_DECISIONS` + `96` §11 (Phase 6.1) — **ไม่เติมลงตาราง §6.1**
    // เพราะตารางนั้นผูกกับ §14.1 ที่ล็อก dev trigger ไว้ 5 ตัว และงานนี้ต้องมี payload ของรายงานจริง
    // กับผู้สั่งงานเสมอ (dev trigger ยิงเปล่า ๆ ไม่ได้)
    expect(doc('02_OPEN_DECISIONS.md').includes('fuel_distance_retry')).toBe(true)
    expect(doc('02_OPEN_DECISIONS.md').includes('report_export')).toBe(true)
    expect(JOB_TYPE_SPECS.wht_filing_reminder.source).toContain('33')
    expect(JOB_TYPE_SPECS.report_export.source).toContain('96')
    // `payout_completion_repair` = มติ PO U134 — ตัวกวาดตั้งงานต่อรอบจ่ายที่ขั้นหลัง commit ยังไม่ครบ
    expect(JOB_TYPE_SPECS.payout_completion_repair.source).toContain('U134')
  })

  it('มีคำอธิบาย/ป้ายชื่อไทยครบทุกตัว และ code ที่ไม่รู้จักคืนค่าดิบไม่โยน error', () => {
    for (const code of JOB_TYPES) {
      expect(JOB_TYPE_SPECS[code].label, code).toBeTruthy()
      expect(JOB_TYPE_SPECS[code].source, code).toBeTruthy()
      expect(isKnownJobType(code)).toBe(true)
    }
    expect(isKnownJobType('ไม่มีจริง')).toBe(false)
    expect(jobTypeLabel('legacy_job')).toBe('legacy_job')
  })

  it('งานที่ดูแลคิวของตัวเองไม่ถูกตั้งเวลาซ้ำอีกชั้น (กัน claim สองชั้น)', () => {
    for (const code of SWEEPER_JOB_TYPES) {
      expect(JOB_TYPE_SPECS[code].schedule, code).toBeNull()
      expect(SCHEDULED_JOB_TYPES.includes(code), code).toBe(false)
    }
  })

  it('งานที่ผู้ใช้สั่งเอง (export/bank file) ไม่มีตารางเวลา', () => {
    expect(JOB_TYPE_SPECS.export_pack.schedule).toBeNull()
    expect(JOB_TYPE_SPECS.bank_file.schedule).toBeNull()
  })
})

describe('ช่องเวลาและคีย์กันซ้ำของงานตามตารางเวลา (`91` §17)', () => {
  it('งานรายวันใช้ "วันไทย" ไม่ใช่ UTC (Rule 01)', () => {
    // 15/08/2569 23:30Z = 16/08/2569 06:30 น. เวลาไทย ⇒ ต้องเป็นวันที่ 16 ไม่ใช่ 15
    expect(jobScheduleBucket({ kind: 'daily' }, new Date('2026-08-15T23:30:00Z'))).toBe('2026-08-16')
    expect(jobScheduleBucket({ kind: 'daily' }, new Date('2026-08-15T16:59:00Z'))).toBe('2026-08-15')
  })

  it('งานรายช่วงปัดลงเป็นช่องเวลาเดียวกัน — ยิงกี่ครั้งในช่องเดิมก็ได้คีย์เดิม', () => {
    const schedule = { kind: 'interval', minutes: 10 } as const
    expect(jobScheduleBucket(schedule, new Date('2026-08-15T10:00:00Z'))).toBe('2026-08-15T10:00')
    expect(jobScheduleBucket(schedule, new Date('2026-08-15T10:09:59Z'))).toBe('2026-08-15T10:00')
    expect(jobScheduleBucket(schedule, new Date('2026-08-15T10:10:00Z'))).toBe('2026-08-15T10:10')
  })

  it('คีย์กันซ้ำผูกกับ job_type + ช่องเวลา · งานที่ไม่มีตารางเวลาไม่มีคีย์', () => {
    const at = new Date('2026-08-15T10:03:00Z')
    expect(scheduledIdempotencyKey('reassign_timeout', at)).toBe('cron:reassign_timeout:2026-08-15T10:00')
    expect(scheduledIdempotencyKey('reassign_timeout', new Date('2026-08-15T10:07:00Z'))).toBe(
      'cron:reassign_timeout:2026-08-15T10:00',
    )
    expect(scheduledIdempotencyKey('advance_overdue', at)).toBe('cron:advance_overdue:2026-08-15')
    expect(scheduledIdempotencyKey('export_pack', at)).toBeNull()
  })
})

describe('parseSettleDate — วันที่ settle ของ daily_field_allowance ผ่าน dev trigger (UAT Q21)', () => {
  // 03/10/2569 23:30 ไทย = 16:30Z
  const now = new Date('2026-10-03T16:30:00.000Z')

  it('วันที่ผ่านมาแล้ว/วันนี้ (ตามเวลาไทย) ผ่าน · คืนเที่ยงคืน UTC ของวันนั้น', () => {
    expect(parseSettleDate('2026-10-02', now)?.toISOString()).toBe('2026-10-02T00:00:00.000Z')
    expect(parseSettleDate('2026-10-03', now)?.toISOString()).toBe('2026-10-03T00:00:00.000Z')
  })

  it('วันอนาคต / วันไม่มีจริง / รูปแบบผิด = null', () => {
    expect(parseSettleDate('2026-10-04', now)).toBeNull()
    expect(parseSettleDate('2026-02-30', now)).toBeNull()
    expect(parseSettleDate('03/10/2569', now)).toBeNull()
  })

  it('หลังเที่ยงคืนไทย (17:00Z) "วันนี้" ขยับเป็นวันถัดไปแล้ว', () => {
    expect(parseSettleDate('2026-10-04', new Date('2026-10-03T17:00:00.000Z'))).not.toBeNull()
  })
})

describe('parseSimulatedAsOf — วันที่จำลองของ advance_overdue ผ่าน dev trigger (มติผู้ใช้ 04/10/2569)', () => {
  // 04/10/2569 23:30 ไทย = 16:30Z
  const now = new Date('2026-10-04T16:30:00.000Z')

  it('วันนี้ถึง +31 วัน (ตามเวลาไทย) ผ่าน · คืนเที่ยงวันไทย (05:00Z) ของวันนั้น', () => {
    expect(ADVANCE_OVERDUE_AS_OF_MAX_DAYS).toBe(31)
    expect(parseSimulatedAsOf('2026-10-04', now)?.toISOString()).toBe('2026-10-04T05:00:00.000Z')
    expect(parseSimulatedAsOf('2026-10-05', now)?.toISOString()).toBe('2026-10-05T05:00:00.000Z')
    expect(parseSimulatedAsOf('2026-11-04', now)?.toISOString()).toBe('2026-11-04T05:00:00.000Z')
  })

  it('อดีต / เกิน 31 วัน / วันไม่มีจริง / รูปแบบผิด = null', () => {
    expect(parseSimulatedAsOf('2026-10-03', now)).toBeNull()
    expect(parseSimulatedAsOf('2026-11-05', now)).toBeNull()
    expect(parseSimulatedAsOf('2026-02-30', now)).toBeNull()
    expect(parseSimulatedAsOf('05/10/2569', now)).toBeNull()
  })

  it('หลังเที่ยงคืนไทย (17:00Z) "วันนี้" ขยับเป็นวันถัดไป ⇒ วันก่อนหน้ากลายเป็นอดีต', () => {
    const afterMidnight = new Date('2026-10-04T17:00:00.000Z')
    expect(parseSimulatedAsOf('2026-10-04', afterMidnight)).toBeNull()
    expect(parseSimulatedAsOf('2026-11-05', afterMidnight)).not.toBeNull()
  })

  it('simulatedAsOfInstant ตรวจแค่รูปแบบ/วันจริง', () => {
    expect(simulatedAsOfInstant('2020-01-01')?.toISOString()).toBe('2020-01-01T05:00:00.000Z')
    expect(simulatedAsOfInstant('2026-13-01')).toBeNull()
  })
})

describe('devSimulatedNowOf — ตัวรันงานอ่าน asOf เฉพาะงานจาก dev trigger นอก production', () => {
  it('มีธง dev trigger → เที่ยงวันไทยของ asOf', () => {
    expect(devSimulatedNowOf({ payload: { devTrigger: true, asOf: '2026-10-05' } })?.toISOString()).toBe(
      '2026-10-05T05:00:00.000Z',
    )
  })

  it('ไม่มีธง (cron / POST /api/jobs) หรือไม่มี asOf / asOf ผิดรูป → null (ใช้เวลาจริง)', () => {
    expect(devSimulatedNowOf({ payload: { asOf: '2026-10-05' } })).toBeNull()
    expect(devSimulatedNowOf({ payload: { devTrigger: true } })).toBeNull()
    expect(devSimulatedNowOf({ payload: { devTrigger: true, asOf: 'x' } })).toBeNull()
    expect(devSimulatedNowOf({ payload: null })).toBeNull()
  })

  it('production → null เสมอ แม้มีธง dev trigger', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(devSimulatedNowOf({ payload: { devTrigger: true, asOf: '2026-10-05' } })).toBeNull()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
