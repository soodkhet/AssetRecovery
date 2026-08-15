import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEV_TRIGGER_JOB_TYPES,
  JOB_TYPES,
  JOB_TYPE_SPECS,
  SCHEDULED_JOB_TYPES,
  isKnownJobType,
  jobScheduleBucket,
  jobTypeLabel,
  scheduledIdempotencyKey,
} from '@/lib/jobs/job-types'
import { SWEEPER_JOB_TYPES } from '@/lib/jobs/registry'

/** ทะเบียน job_type ต้องตรงกับ `91` §6.1 เสมอ — เทสต์นี้แดง = โค้ดกับสเปคเริ่มไม่ตรงกัน */

function doc(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../../docs/${file}`, import.meta.url)), 'utf8')
}

describe('ทะเบียน job_type (`91` §6.1)', () => {
  it('job_type 5 ตัวของ §6.1 มีครบและเป็นชุดเดียวกับที่ dev trigger รับได้ (§14.1 · C8)', () => {
    expect([...DEV_TRIGGER_JOB_TYPES].sort()).toEqual([
      'advance_overdue',
      'bank_file',
      'export_pack',
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
    expect([...extra].sort()).toEqual(['fuel_distance_retry', 'report_export', 'wht_filing_reminder'])
    // `fuel_distance_retry` = มติ PO 14/08/2569 (D10) · `wht_filing_reminder` = `33` §6.2/§8 (Phase 5.2)
    // `report_export` = E13 ใน `02_OPEN_DECISIONS` + `96` §11 (Phase 6.1) — **ไม่เติมลงตาราง §6.1**
    // เพราะตารางนั้นผูกกับ §14.1 ที่ล็อก dev trigger ไว้ 5 ตัว และงานนี้ต้องมี payload ของรายงานจริง
    // กับผู้สั่งงานเสมอ (dev trigger ยิงเปล่า ๆ ไม่ได้)
    expect(doc('02_OPEN_DECISIONS.md').includes('fuel_distance_retry')).toBe(true)
    expect(doc('02_OPEN_DECISIONS.md').includes('report_export')).toBe(true)
    expect(JOB_TYPE_SPECS.wht_filing_reminder.source).toContain('33')
    expect(JOB_TYPE_SPECS.report_export.source).toContain('96')
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
