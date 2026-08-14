import { describe, expect, it } from 'vitest'
import { REDACTED_MARKER, diffRecords, normalizeFieldName, toAuditJson, toAuditJsonRecord } from '@/lib/audit/diff'

/** ของปลอมที่มีพฤติกรรมเหมือน Prisma Decimal (มี toString ของตัวเอง) */
class FakeDecimal {
  constructor(private readonly value: string) {}
  toString(): string {
    return this.value
  }
}

describe('toAuditJson — แปลงค่าให้ JSONB เก็บได้ (Rule 01)', () => {
  it('Date → ISO 8601 UTC (ห้ามเก็บเป็น object เปล่า)', () => {
    expect(toAuditJson(new Date('2026-08-14T07:30:00.000Z'))).toBe('2026-08-14T07:30:00.000Z')
  })

  it('Decimal (rate_pct) → string ไม่ให้ความละเอียดหาย', () => {
    expect(toAuditJson({ ratePct: new FakeDecimal('12.50') })).toEqual({ ratePct: '12.50' })
  })

  it('bigint → string · จำนวน satang ที่เป็น number คงค่าเดิม', () => {
    expect(toAuditJson({ big: 10n, amountSatang: 10050 })).toEqual({ big: '10', amountSatang: 10050 })
  })

  it('ปิดบังค่าอ่อนไหวทุกชั้น (`90` §6.2 PDPA)', () => {
    const json = toAuditJson({
      email: 'a@b.co',
      password: 'plain-text',
      nested: { access_token: 'xyz', apiKey: 'k' },
    })
    expect(json).toEqual({
      email: 'a@b.co',
      password: REDACTED_MARKER,
      nested: { access_token: REDACTED_MARKER, apiKey: REDACTED_MARKER },
    })
  })

  it('undefined → ตัดทิ้งทั้ง key · null คงไว้ · binary ไม่เก็บของจริง', () => {
    expect(toAuditJson({ a: undefined, b: null, c: new Uint8Array([1, 2]) })).toEqual({ b: null, c: '[binary]' })
  })

  it('ไม่ตายเมื่อเจอ object วนกลับหาตัวเอง', () => {
    const node: Record<string, unknown> = { name: 'x' }
    node.self = node
    expect(toAuditJson(node)).toEqual({ name: 'x', self: '[circular]' })
  })

  it('toAuditJsonRecord คืน null เมื่อค่าไม่ใช่ object', () => {
    expect(toAuditJsonRecord('ไม่ใช่ record')).toBeNull()
    expect(toAuditJsonRecord(null)).toBeNull()
  })
})

describe('normalizeFieldName — snake_case (DB) ต้องเทียบกับ camelCase (โค้ด) ได้', () => {
  it.each([
    ['role_id', 'roleid'],
    ['roleId', 'roleid'],
    ['service_fee_base_satang', 'servicefeebasesatang'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeFieldName(input)).toBe(expected)
  })
})

describe('diffRecords — เก็บเฉพาะฟิลด์ที่เปลี่ยนจริง (`90` §16)', () => {
  it('คืนเฉพาะฟิลด์ที่ต่างกัน พร้อมรายชื่อฟิลด์เรียง A→Z', () => {
    const diff = diffRecords(
      { id: '1', status: 'active', fullName: 'ก', phone: '08' },
      { id: '1', status: 'inactive', fullName: 'ข', phone: '08' },
    )
    expect(diff.changedFields).toEqual(['fullName', 'status'])
    expect(diff.before).toEqual({ fullName: 'ก', status: 'active' })
    expect(diff.after).toEqual({ fullName: 'ข', status: 'inactive' })
  })

  it('ไม่นับ updated_at / updatedAt ว่าเป็นการเปลี่ยนแปลง (เปลี่ยนทุกครั้งอยู่แล้ว)', () => {
    const diff = diffRecords(
      { id: '1', updatedAt: new Date('2026-08-14T00:00:00Z'), updated_at: '2026-08-14' },
      { id: '1', updatedAt: new Date('2026-08-14T01:00:00Z'), updated_at: '2026-08-15' },
    )
    expect(diff.changedFields).toEqual([])
  })

  it('ฟิลด์ที่เพิ่ม/หายไป ถือว่าเปลี่ยน และเก็บฝั่งที่ไม่มีเป็น null', () => {
    const diff = diffRecords({ a: 1 }, { a: 1, b: 2 })
    expect(diff.changedFields).toEqual(['b'])
    expect(diff.before).toEqual({ b: null })
    expect(diff.after).toEqual({ b: 2 })
  })

  it('เทียบค่าซ้อนชั้นด้วยเนื้อหา ไม่ใช่ reference', () => {
    expect(diffRecords({ meta: { a: [1, 2] } }, { meta: { a: [1, 2] } }).changedFields).toEqual([])
    expect(diffRecords({ meta: { a: [1, 2] } }, { meta: { a: [1, 3] } }).changedFields).toEqual(['meta'])
  })

  it('create (ไม่มี before) เก็บ after เต็ม · delete (ไม่มี after) เก็บ before เต็ม', () => {
    expect(diffRecords(undefined, { a: 1, b: 2 })).toEqual({
      before: null,
      after: { a: 1, b: 2 },
      changedFields: ['a', 'b'],
    })
    expect(diffRecords({ a: 1 }, undefined)).toEqual({ before: { a: 1 }, after: null, changedFields: ['a'] })
  })

  it('Date ที่ค่าเท่ากันแต่คนละ object ไม่นับว่าเปลี่ยน', () => {
    const diff = diffRecords(
      { closedAt: new Date('2026-08-14T07:30:00Z') },
      { closedAt: new Date('2026-08-14T07:30:00Z') },
    )
    expect(diff.changedFields).toEqual([])
  })
})
