import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  auditFieldLabel,
  auditValueDisplay,
  auditActionLabel,
  auditActorLabel,
  auditFieldChanges,
  auditValueTooltip,
  auditLoginFailureOf,
  auditReasonText,
  auditRowDisplay,
  auditTargetLabel,
  auditTargetLabelOf,
  auditValueText,
  AUDIT_ACTION_GROUP,
  AUDIT_ACTION_LABEL,
} from '@/lib/audit/log-display'
import { auditLogListQuerySchema, AUDIT_LOG_PAGE_SIZE_MAX } from '@/lib/audit/log-schemas'
import { STATUS_BADGE_CLASS } from '@/lib/ui/status-badge'

/**
 * หน้าบันทึกการใช้งาน (`90` §8/§14) — ล็อกไว้ว่า:
 * · ป้าย action ครบทั้ง 13 ค่าของ enum `audit_action` (`02` §3)
 * · สีมาจาก 10 กลุ่มของ `04` §8.1 เท่านั้น
 * · ตารางเทียบ before/after ทนกับข้อมูลรูปแบบแปลก ๆ (null / string ล้วน / array)
 */

describe('ป้ายของ audit log', () => {
  it('มี label ครบทุก action และสีอยู่ในกลุ่มสีมาตรฐาน', () => {
    const actions = Object.keys(AUDIT_ACTION_LABEL) as (keyof typeof AUDIT_ACTION_LABEL)[]
    // 16 = 13 เดิม + `access_denied` (มติ PO 05/10/2569 O43 D4) + `view_as` (มติ U59) + `view` (มติ U90)
    expect(actions).toHaveLength(16)
    for (const action of actions) {
      expect(auditActionLabel(action).length).toBeGreaterThan(0)
      expect(Object.hasOwn(STATUS_BADGE_CLASS, AUDIT_ACTION_GROUP[action])).toBe(true)
    }
  })

  it('ตารางที่ยังไม่ได้ตั้งชื่อไทยแสดง code ดิบ (หน้าจอไม่พัง)', () => {
    expect(auditTargetLabel('cases')).toBe('เคส')
    expect(auditTargetLabel('some_new_table')).toBe('some_new_table')
  })

  /** UAT BUG-131 — ตัวกรองต้องไม่โชว์ชื่อตารางดิบ: ทุกตารางใน schema ต้องมีป้ายไทย */
  it('ทุกตารางใน prisma schema มีป้ายไทย', () => {
    const schema = readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const tables = [...schema.matchAll(/^model \w+ \{[\s\S]*?@@map\("([a-z_]+)"\)/gm)].map((match) => match[1] ?? '')
    expect(tables.length).toBeGreaterThan(40)
    const missing = tables.filter((table) => auditTargetLabel(table) === table)
    expect(missing).toEqual([])
    expect(auditTargetLabel('cash_receipts')).toBe('รายการรับเงิน')
    expect(auditTargetLabel('jobs')).toBe('งานเบื้องหลังของระบบ')
  })

  /** mytester2 J2-02 — เป้าหมายที่ไม่ใช่ตาราง (เช่น `portal`) ก็ต้องมีป้ายไทยในตัวกรอง */
  it('ทุก targetType ที่โค้ดเขียนลง audit มีป้ายไทย', () => {
    const files = ['lib', 'app'].flatMap((dir) =>
      (readdirSync(path.join(process.cwd(), dir), { recursive: true }) as string[])
        .filter((file) => /\.ts$/.test(file) && !/\.test\.ts$/.test(file) && !file.includes('generated'))
        .map((file) => path.join(process.cwd(), dir, file)),
    )
    const targets = new Set(
      files.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/(?:targetType: |_AUDIT_TARGET = )'([a-z_]+)'/g)].map((m) => m[1] ?? '')),
    )
    expect(targets.has('portal')).toBe(true)
    const missing = [...targets]
      .filter((target) => target !== 'asc' && target !== 'desc') // orderBy: { targetType: 'asc' }
      .filter((target) => auditTargetLabel(target) === target)
    expect(missing).toEqual([])
    expect(auditTargetLabel('portal')).toBe('พอร์ทัลลูกค้า')
  })

  /** UAT BUG-127 — audit แยกของการอนุมัติ Adjustment งวดล็อก ไม่ใช่ "ปลดล็อกงวด" */
  it('unlock บน adjustments แสดงเป็นการอนุมัติปรับปรุงในงวดที่ล็อก', () => {
    expect(auditActionLabel('unlock', 'adjustments')).toBe('อนุมัติปรับปรุงในงวดที่ล็อก')
    expect(auditActionLabel('unlock', 'accounting_periods')).toBe('ปลดล็อกงวด')
    expect(auditActionLabel('unlock')).toBe('ปลดล็อกงวด')
  })

  it('งานอัตโนมัติของระบบ (actor = null) แสดงว่า "ระบบ"', () => {
    expect(auditActorLabel(null, null)).toBe('ระบบ (งานอัตโนมัติ)')
    expect(auditActorLabel('สมชาย', 'การเงิน')).toBe('สมชาย (การเงิน)')
    expect(auditActorLabel('สมชาย', null)).toBe('สมชาย')
  })
})

describe('auditFieldChanges()', () => {
  it('รวมคีย์ทั้งสองฝั่งแล้วเรียงตามชื่อ', () => {
    const changes = auditFieldChanges({ status: 'draft', note: 'ก' }, { status: 'sent' })
    expect(changes.map((change) => change.field)).toEqual(['note', 'status'])
    expect(changes[1]).toEqual({ field: 'status', before: 'draft', after: 'sent' })
  })

  it('ฝั่งที่ไม่มีค่า = null ไม่ใช่ undefined (คอลัมน์ยังวาดได้)', () => {
    const changes = auditFieldChanges(null, { status: 'approved' })
    expect(changes).toEqual([{ field: 'status', before: null, after: 'approved' }])
  })

  it('ค่าที่ไม่ใช่ object ถูกห่อเป็นฟิลด์ `value`', () => {
    expect(auditFieldChanges('ก่อน', 'หลัง')).toEqual([{ field: 'value', before: 'ก่อน', after: 'หลัง' }])
  })

  it('ไม่มี before/after เลย (เช่น login) = ไม่มีแถว', () => {
    expect(auditFieldChanges(null, null)).toEqual([])
  })
})

describe('auditValueText()', () => {
  it('ค่าว่าง/null แสดงขีด · object แสดงเป็น JSON', () => {
    expect(auditValueText(null)).toBe('—')
    expect(auditValueText('')).toBe('—')
    expect(auditValueText(0)).toBe('0')
    expect(auditValueText(false)).toBe('false')
    expect(auditValueText({ a: 1 })).toBe('{"a":1}')
    expect(auditValueText(['x', 'y'])).toBe('["x","y"]')
  })

  it('ฟิลด์เงินแสดงเป็นบาทผ่าน util กลาง — ห้ามโชว์ satang ดิบ (Rule 01)', () => {
    // `1250000` satang = ฿12,500.00 · โชว์ดิบ = ผู้ตรวจอ่านผิด 100 เท่า
    expect(auditValueText(1250000, 'net_satang')).toBe('฿12,500.00')
    expect(auditValueText(1250000, 'netSatang')).toBe('฿12,500.00')
    expect(auditValueText(0, 'approved_satang')).toBe('฿0.00')
    // ฟิลด์ที่ไม่ใช่เงินต้องไม่ถูกหาร 100
    expect(auditValueText(1250000, 'retry_count')).toBe('1250000')
    expect(auditValueText(1250000)).toBe('1250000')
  })

  it('ค่าเวลาแสดงเป็น พ.ศ. — ค.ศ. บนหน้าจอ = bug (`DISPLAY_CE_YEAR`)', () => {
    const text = auditValueText('2026-08-15T07:30:00.000Z', 'sent_at')
    expect(text).toBe('15/08/2569 14:30')
    expect(text).not.toContain('2026')
    // ข้อความธรรมดาที่ไม่ใช่ ISO ต้องไม่ถูกแตะ
    expect(auditValueText('approved', 'status')).toBe('approved')
  })

  it('ทดสอบซ้ำ local LR5-04 — ฟิลด์วันที่ล้วนแสดง DD/MM/YYYY ไม่มีเวลา · timestamp ยังมีเวลา', () => {
    expect(auditValueText('2026-10-08T00:00:00.000Z', 'received_date')).toBe('08/10/2569')
    expect(auditValueText('2026-10-08T00:00:00.000Z', 'expenseDate')).toBe('08/10/2569')
    expect(auditValueText('2026-10-08T00:00:00.000Z', 'effective_from')).toBe('08/10/2569')
    expect(auditValueText('2026-10-08', 'transaction_date')).toBe('08/10/2569')
    expect(auditValueText('2026-10-08T00:00:00.000Z', 'matched_at')).toBe('08/10/2569 07:00')
    expect(auditValueText('2026-10-08T00:00:00.000Z', 'updated')).toBe('08/10/2569 07:00')
  })
})

describe('auditLogListQuerySchema', () => {
  it('ไม่ส่งอะไรมาเลย = หน้าแรก 50 แถว', () => {
    const parsed = auditLogListQuerySchema.parse({})
    expect(parsed).toMatchObject({ limit: 50, offset: 0 })
  })

  it('limit เกินเพดานถูกปฏิเสธ (กันดึงทั้งตาราง)', () => {
    expect(auditLogListQuerySchema.safeParse({ limit: AUDIT_LOG_PAGE_SIZE_MAX + 1 }).success).toBe(false)
  })

  it('วันที่ต้องเป็น YYYY-MM-DD ตาม `<input type="date">` เท่านั้น', () => {
    expect(auditLogListQuerySchema.safeParse({ dateFrom: '2026-08-15' }).success).toBe(true)
    expect(auditLogListQuerySchema.safeParse({ dateFrom: '15/08/2569' }).success).toBe(false)
  })

  it('action นอก enum ของ `02` §3 ถูกปฏิเสธ', () => {
    expect(auditLogListQuerySchema.safeParse({ action: 'approve' }).success).toBe(true)
    expect(auditLogListQuerySchema.safeParse({ action: 'archive' }).success).toBe(false)
  })
})

describe('login ที่ล้มเหลวแยกจาก login สำเร็จ (preship R3-016)', () => {
  it('อ่านผลล้มเหลวจาก after · login สำเร็จ/แถวอื่น = null', () => {
    expect(auditLoginFailureOf('login', { result: 'failed', code: 'LOGIN_RATE_LIMITED', identifier: 'uat.finance' })).toEqual({
      code: 'LOGIN_RATE_LIMITED',
      identifier: 'uat.finance',
    })
    expect(auditLoginFailureOf('login', { result: 'success' })).toBeNull()
    expect(auditLoginFailureOf('create', { result: 'failed', code: 'X' })).toBeNull()
    expect(auditLoginFailureOf('login', null)).toBeNull()
  })

  it('ป้าย "เข้าสู่ระบบไม่สำเร็จ" สีเตือน/วิกฤต + เหตุผล · ผู้ดำเนินการไม่ใช่ "งานอัตโนมัติ"', () => {
    const failure = { code: 'INVALID_CREDENTIALS', identifier: 'ghost' }
    expect(auditRowDisplay({ action: 'login', targetType: 'users', reason: null, loginFailure: failure })).toEqual({
      label: 'เข้าสู่ระบบไม่สำเร็จ',
      group: 'warning',
      detail: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    })
    expect(
      auditRowDisplay({ action: 'login', targetType: 'users', reason: null, loginFailure: { code: 'LOGIN_RATE_LIMITED', identifier: null } }).group,
    ).toBe('critical')
    expect(auditActorLabel(null, null, failure)).toBe('ไม่ระบุตัวตน (ghost)')
    expect(auditActorLabel(null, null, { code: 'INVALID_CREDENTIALS', identifier: '<invalid>' })).toBe('ไม่ระบุตัวตน')
    expect(auditActorLabel(null, null)).toBe('ระบบ (งานอัตโนมัติ)')
    expect(auditRowDisplay({ action: 'login', targetType: 'users', reason: null, loginFailure: null }).label).toBe('เข้าสู่ระบบ')
  })
})

describe('mytester6 T-024 — ป้ายชนิดเป้าหมายของใบเพิ่มหนี้', () => {
  it('credit_notes แยกตาม note_type ใน after/before · ไม่มีข้อมูล ⇒ ป้ายรวมของตาราง', () => {
    expect(auditTargetLabelOf('credit_notes', { note_type: 'debit', credit_note_number: 'DN-MT6-2569-0001' })).toBe('ใบเพิ่มหนี้')
    expect(auditTargetLabelOf('credit_notes', { note_type: 'credit' })).toBe('ใบลดหนี้')
    expect(auditTargetLabelOf('credit_notes', { status: 'cancelled' }, { note_type: 'debit' })).toBe('ใบเพิ่มหนี้')
    expect(auditTargetLabelOf('credit_notes', null)).toBe('ใบลดหนี้/ใบเพิ่มหนี้')
    expect(auditTargetLabelOf('cases', { note_type: 'debit' })).toBe('เคส')
  })
})

describe('mytester H-06 — ชื่อฟิลด์/ค่าในรายละเอียดบันทึกการใช้งาน', () => {
  it('ฟิลด์ที่รู้จักเป็นไทย · ไม่รู้จักคงชื่อเดิม', () => {
    expect(auditFieldLabel('authorize_note')).toBe('เหตุผลที่อนุมัติยกเว้น')
    expect(auditFieldLabel('period_id')).toBe('รอบบัญชี')
    expect(auditFieldLabel('custom_x')).toBe('custom_x')
  })

  it('สถานะ/ระดับของข้อยกเว้นเป็นไทย · ค่าที่ไม่รู้จักคงค่าเดิม', () => {
    expect(auditValueDisplay('authorized', 'status', 'exceptions')).toBe('อนุมัติยกเว้นแล้ว')
    expect(auditValueDisplay('critical', 'level', 'exceptions')).toBe('ต้องแก้ก่อนปิดงวด')
    // mytester6 T-026 — สถานะของเป้าหมายอื่นก็แปลแล้ว · ค่าที่ไม่รู้จักยังแสดงดิบ (ไม่พัง)
    expect(auditValueDisplay('weird_state', 'status', 'cases')).toBe('weird_state')
    expect(auditValueDisplay(150_000, 'amount_satang', 'exceptions')).toBe('฿1,500.00')
  })
})

describe('ตรวจซ้ำ staging SV5-R-02/R-03 — auditValueDisplay กับค่าซ้อนและอ้างอิงรายการเดินบัญชี', () => {
  const CASE = '0a1b2c3d-0000-4000-8000-0000000000c1'
  const TX = '0a1b2c3d-0000-4000-8000-0000000000c2'
  const labels = { [CASE]: 'CS-2569-0001', [TX]: '13/10/2569 · ฿1,000.00 · กสิกรไทย' }

  it('object ซ้อน ⇒ ข้อความที่แทน id และข้อความอ้างอิงแล้ว (SV6-R-03) · id ที่หาไม่พบแสดงย่อ', () => {
    const unknown = '0a1b2c3d-0000-4000-8000-0000000000ff'
    expect(
      auditValueDisplay(
        { revenueByCase: [{ caseId: CASE }, { caseId: unknown }], reason: `จาก bank_transaction:${TX}` },
        'payload',
        'jobs',
        labels,
      ),
    ).toBe('ผลการสร้างรายได้รายเคส: 2 รายการ\nเหตุผล: จาก รายการเดินบัญชี 13/10/2569 · ฿1,000.00 · กสิกรไทย')
    expect(auditValueDisplay([{ caseId: CASE }, { caseId: unknown }], 'revenueByCase', 'handover_lots', labels)).toBe(
      'เคส: CS-2569-0001\nเคส: 0a1b2c3d',
    )
  })

  it('source_ref ปกติ / rematch / หาไม่พบ', () => {
    expect(auditValueDisplay(`bank_transaction:${TX}`, 'source_ref', 'billing_batches', labels)).toBe(
      'รายการเดินบัญชี 13/10/2569 · ฿1,000.00 · กสิกรไทย',
    )
    expect(auditValueDisplay(`bank_transaction:${TX}:rematch`, 'source_ref', 'billing_batches', labels)).toContain(
      'เปลี่ยนการจับคู่',
    )
    const missing = 'bank_transaction:0a1b2c3d-0000-4000-8000-0000000000ee'
    expect(auditValueDisplay(missing, 'source_ref', 'billing_batches', labels)).toBe(missing)
  })
})

describe('ตรวจซ้ำ staging SV6-R-04 — วันที่ ISO ในเหตุผลเดิมแสดงเป็น พ.ศ.', () => {
  it('วันที่ล้วน ⇒ DD/MM/YYYY พ.ศ. · เลขอ้างอิง/ชื่อไฟล์ที่มีตัวเลขติดกันไม่ถูกแตะ', () => {
    expect(auditReasonText('[job:x] คำนวณค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยงรายวันของวันที่ 2026-10-17 — กระจาย')).toBe(
      'คำนวณค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยงรายวันของวันที่ 17/10/2569 — กระจาย (งานเบื้องหลัง #x)',
    )
    expect(auditReasonText('คีย์ PB-IN-25691004-CB4FD7202879')).toBe('คีย์ PB-IN-25691004-CB4FD7202879')
    expect(auditReasonText('ไฟล์ AccountingPack_2569-10_v1.0.zip')).toBe('ไฟล์ AccountingPack_2569-10_v1.0.zip')
    expect(auditReasonText('id 0a1b2c3d-0000-4000-8000-0000000000c1')).toBe('id 0a1b2c3d-0000-4000-8000-0000000000c1')
  })
})

describe('ตรวจซ้ำ staging SV6-R-03 — รายการ/อ็อบเจกต์ไม่แสดง JSON ดิบ', () => {
  const noRawJson = (text: string): void => {
    expect(text).not.toMatch(/[[\]{}"]/)
  }

  it('รายชื่อเหตุการณ์ ⇒ ป้ายไทยคั่นด้วย " · "', () => {
    expect(auditValueDisplay(['case.status_changed', 'case.approved'], 'events', 'cases')).toBe(
      'เปลี่ยนสถานะเคส · อนุมัติเคส',
    )
    expect(auditValueDisplay(['case.close_draft_saved'], 'events', 'close_case_drafts')).toBe('บันทึกร่างปิดงาน')
  })

  it('รายการข้อความ (จังหวัด/ชื่อไฟล์) ⇒ คั่นด้วย " · " · ยาวเกินย่อ "+n รายการ"', () => {
    expect(auditValueDisplay(['กรุงเทพมหานคร', 'นครปฐม', 'สมุทรสาคร'], 'provinces', 'teams')).toBe(
      'กรุงเทพมหานคร · นครปฐม · สมุทรสาคร',
    )
    const files = Array.from({ length: 35 }, (_, index) => `f${index}.pdf`)
    const text = auditValueDisplay(files, 'file_names', 'export_records')
    expect(text.startsWith('f0.pdf · f1.pdf')).toBe(true)
    expect(text.endsWith('+5 รายการ')).toBe(true)
  })

  it('ผลงานเบื้องหลัง/ข้อมูลแนบ ⇒ บรรทัดละคีย์ "ป้าย: ค่า" ที่แปลแล้ว (วันที่ พ.ศ.)', () => {
    const result = auditValueDisplay({ settled: 4, periodLocked: 0, revenueIdsCreated: [] }, 'result', 'jobs')
    expect(result).toBe('คำนวณแล้ว: 4\nงวดปิดแล้ว (รอสร้างย้อนหลัง): 0\nรายได้ที่สร้าง: ไม่มี')
    const payload = auditValueDisplay({ date: '2026-10-17', devTrigger: true }, 'payload', 'jobs')
    expect(payload).toBe('วันที่: 17/10/2569\nสั่งจากเครื่องมือทดสอบ: ใช่')
  })

  it('เอกสารแนบของชุดส่งบัญชี ⇒ ชนิดเอกสารละบรรทัด + จำนวนในบรรทัดเดียว', () => {
    const text = auditValueDisplay(
      {
        vouchers: { attached: 8, not_attached: [] },
        tax_invoices: { attached: 4, not_attached: ['INV-0009'] },
      },
      'attachments',
      'export_records',
    )
    expect(text).toBe(
      'ใบสำคัญจ่าย: แนบแล้ว 8, ยังไม่ได้แนบ ไม่มี\nใบกำกับภาษี: แนบแล้ว 4, ยังไม่ได้แนบ INV-0009',
    )
    noRawJson(text)
  })

  it('ซ้อนลึกเกินชั้นที่แสดง ⇒ สรุปจำนวน · อ็อบเจกต์ว่าง ⇒ ไม่มี', () => {
    const text = auditValueDisplay({ a_deep: { inner: { x: 1, y: 2 } } }, 'payload', 'jobs')
    expect(text).toContain('2 รายการ')
    noRawJson(text)
    expect(auditValueDisplay({}, 'payload', 'jobs')).toBe('ไม่มี')
  })
})

describe('ตรวจซ้ำ staging SV6-R3-01 — ค่าที่ระบบสร้างในรายละเอียดบันทึกการใช้งาน', () => {
  const CASE_ID = 'c5af5ab9-fb40-4d26-8e1c-a7f2443d09b9'
  const PATH = `cases/${CASE_ID}/national_id_doc/b00d2446-e9b2-4289-a5d9-ce330daa1c71-idcard8.jpg`

  it('ช่องไฟล์ ⇒ ชนิดเอกสาร · ชื่อไฟล์ (ไม่โชว์ path เต็ม) · tooltip ยังเป็น path เต็ม', () => {
    expect(auditValueDisplay(PATH, 'path', 'cases')).toBe('บัตรประชาชน/Passport ลูกหนี้ · idcard8.jpg')
    expect(auditValueDisplay(PATH, 'fileUrl', 'case_documents')).toBe('บัตรประชาชน/Passport ลูกหนี้ · idcard8.jpg')
    expect(auditValueTooltip(PATH, 'path', {})).toBe(PATH)
    expect(auditValueTooltip('ข้อความ', 'note', {})).toBeUndefined()
  })

  it('path เป็นคีย์ของอ็อบเจกต์ (ค่าตรวจสอบไฟล์ต่อไฟล์) ⇒ ชื่อไฟล์แทน path', () => {
    expect(auditValueDisplay({ [PATH]: 'abc' }, 'file_hashes', 'case_evidences')).toBe(
      'บัตรประชาชน/Passport ลูกหนี้ · idcard8.jpg: abc',
    )
  })

  it('กุญแจจำกัดจำนวนครั้ง ⇒ "จำกัดจำนวนครั้งตาม" — ชื่อผู้ใช้ …', () => {
    expect(auditFieldLabel('throttle_key')).toBe('จำกัดจำนวนครั้งตาม')
    expect(auditValueDisplay('identifier:uat.temp2', 'throttle_key', 'users')).toBe('ชื่อผู้ใช้ uat.temp2')
  })

  it('คอลัมน์ของรูปแบบไฟล์โอน ⇒ ป้ายของหน้าตั้งค่า', () => {
    expect(
      auditValueDisplay(
        'receiving_bank_code,receiving_account_no,receiving_account_name,amount,reference_no',
        'column_mapping',
        'bank_file_formats',
      ),
    ).toBe('รหัสธนาคารผู้รับ, เลขบัญชีผู้รับ, ชื่อบัญชีผู้รับ, จำนวนเงิน, เลขที่อ้างอิง')
  })

  it('ที่อยู่ที่ถูกปฏิเสธการเข้าถึง ⇒ คง path จริง (บันทึกความปลอดภัย) ป้ายบอกว่าเป็นค่าของระบบ', () => {
    expect(auditFieldLabel('endpoint')).toBe('ที่อยู่ที่เรียก (ระบบ)')
    expect(auditValueDisplay('GET /api/portal/cases', 'endpoint', 'cases')).toBe('GET /api/portal/cases')
  })

  it('เหตุผลอนุมัติเคส/งานเบื้องหลังแบบเดิม ⇒ ข้อความไทย (ผ่าน auditReasonText)', () => {
    expect(auditReasonText('snapshot ค่าบริการอัตโนมัติตอนอนุมัติเคส — เทมเพลต "A" v1')).toBe(
      'บันทึกค่าบริการอัตโนมัติตอนอนุมัติเคส — เทมเพลต "A" เวอร์ชัน 1',
    )
    const text = auditReasonText('งานเบื้องหลัง "X" ทำงานสำเร็จ (job id 58536284-a2c3-4178-b9f4-4e8bc91fd0d7)')
    expect(text).toBe('งานเบื้องหลัง "X" ทำงานสำเร็จ (งานเบื้องหลัง #58536284)')
    expect(text).not.toMatch(/job/)
  })
})
