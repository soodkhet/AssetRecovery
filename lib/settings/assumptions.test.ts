import { describe, expect, it } from 'vitest'
import {
  SETTING_ASSUMPTION_KEYS,
  SETTING_ASSUMPTIONS,
  settingAssumptionConfirmSchema,
  settingAssumptionKeySchema,
  settingAssumptionStatuses,
} from '@/lib/settings/assumptions'
import * as help from '@/lib/settings/help'
import { supplementaryFilingDiff } from '@/lib/wht/wht'
import { billingInvoiceDetailSnapshotJson, parseBillingInvoiceDetailSnapshot } from '@/lib/revenue/billing-invoice'

/** ข้อความที่ผู้ใช้เห็นห้ามมีเลขอ้างอิงสเปค (Rule 05) */
const SPEC_REF = /§|ไฟล์ \d|`\d{2}`|\bU\d{2,3}\b|\bQ\d{1,2}\b/

describe('U140 — ทะเบียนค่าตั้งที่เป็นสมมติฐาน', () => {
  it('ทุกรายการมีป้าย/คำถาม · ข้อความไม่มีเลขอ้างอิงสเปค (อ้างอิงอยู่ใน source เท่านั้น)', () => {
    for (const key of SETTING_ASSUMPTION_KEYS) {
      const item = SETTING_ASSUMPTIONS[key]
      expect(item.key).toBe(key)
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.question.length).toBeGreaterThan(0)
      expect(item.label).not.toMatch(SPEC_REF)
      expect(item.question).not.toMatch(SPEC_REF)
      expect(item.source.length).toBeGreaterThan(0)
    }
  })

  it('สถานะ: ไม่มีแถว = ยังไม่ยืนยัน (แสดงป้าย) · มีแถว = ยืนยันแล้ว · ลำดับตามทะเบียน', () => {
    const statuses = settingAssumptionStatuses([
      { assumptionKey: 'wht_base', confirmedAt: new Date('2026-10-07T03:00:00Z'), confirmedByName: 'บัญชี', reason: 'ยืนยันทางอีเมล' },
      { assumptionKey: 'unknown_key', confirmedAt: new Date(), confirmedByName: null, reason: 'x' },
    ])
    expect(statuses.map((row) => row.key)).toEqual([...SETTING_ASSUMPTION_KEYS])
    expect(statuses.find((row) => row.key === 'wht_base')).toMatchObject({
      confirmed: true,
      confirmedAt: '2026-10-07T03:00:00.000Z',
      confirmedByName: 'บัญชี',
      reason: 'ยืนยันทางอีเมล',
    })
    expect(statuses.filter((row) => !row.confirmed)).toHaveLength(SETTING_ASSUMPTION_KEYS.length - 1)
  })

  it('key นอกทะเบียน/เหตุผลว่าง ⇒ schema ปฏิเสธ', () => {
    expect(settingAssumptionKeySchema.safeParse('wht_base').success).toBe(true)
    expect(settingAssumptionKeySchema.safeParse('nope').success).toBe(false)
    expect(settingAssumptionConfirmSchema.safeParse({ reason: '   ' }).success).toBe(false)
    expect(settingAssumptionConfirmSchema.safeParse({ reason: 'ยืนยันแล้ว' }).success).toBe(true)
  })

  it('กล่องคำอธิบายของค่าตั้งที่เป็นสมมติฐานผูกรหัสไว้ (ป้ายขึ้นข้างค่าตั้งนั้น)', () => {
    expect(help.whtBaseHelp([]).assumption).toBe('wht_base')
    expect(help.whtCertificateModeHelp('per_payee_batch').assumption).toBe('wht_certificate_mode')
    expect(help.whtFilingMethodHelp('online').assumption).toBe('wht_filing_method')
    expect(help.exportFormatsHelp().assumption).toBe('export_pack')
    expect(help.costCentersHelp().assumption).toBe('cost_centers')
    // ค่าตั้งที่ไม่ใช่สมมติฐาน = ไม่มีป้าย
    expect(help.slaPolicyHelp(24).assumption).toBeUndefined()
  })
})

describe('U127 — ยอดต่างจากที่ยื่น (สตางค์ล้วน)', () => {
  it('ยกเลิกใบ ⇒ ติดลบ · ออกใบเพิ่ม ⇒ บวก · รวมทุกแบบ', () => {
    expect(
      supplementaryFilingDiff(
        { pnd1Satang: 0, pnd3Satang: 90_000, pnd53Satang: 33_000 },
        { pnd1Satang: 1_000, pnd3Satang: 60_000, pnd53Satang: 33_000 },
      ),
    ).toEqual({ pnd1Satang: 1_000, pnd3Satang: -30_000, pnd53Satang: 0, totalSatang: -29_000 })
  })
})

describe('U130 — snapshot รายละเอียดใบแจ้งหนี้', () => {
  it('JSON ไป-กลับครบ · % เก็บเป็นข้อความ · ไม่มี snapshot/รูปผิด = null (ใช้ค่าปัจจุบัน)', () => {
    const json = billingInvoiceDetailSnapshotJson({
      customerWhtPct: '3.00',
      receivingAccount: { bankName: 'กสิกรไทย', accountNumber: '123-4-56789-0', accountName: null },
      lines: [{ revenueId: 'r1', assetDescription: 'iPhone 15', handoverDocRef: 'DLV-2569-001' }],
    })
    expect(json.customer_wht_pct).toBe('3.00')
    const parsed = parseBillingInvoiceDetailSnapshot(JSON.parse(JSON.stringify(json)))
    expect(parsed?.customerWhtPct).toBe(3)
    expect(parsed?.receivingAccount).toEqual({ bankName: 'กสิกรไทย', accountNumber: '123-4-56789-0', accountName: null })
    expect(parsed?.lines.get('r1')).toEqual({ assetDescription: 'iPhone 15', handoverDocRef: 'DLV-2569-001' })

    const none = parseBillingInvoiceDetailSnapshot(
      billingInvoiceDetailSnapshotJson({ customerWhtPct: null, receivingAccount: null, lines: [] }),
    )
    expect(none).toEqual({ customerWhtPct: null, receivingAccount: null, lines: new Map() })
    expect(parseBillingInvoiceDetailSnapshot(null)).toBeNull()
    expect(parseBillingInvoiceDetailSnapshot({ customer_wht_pct: 'abc', lines: [] })).toBeNull()
  })
})
