import { describe, expect, it } from 'vitest'
import { bankAccountLine, pickReceivingAccount } from '@/lib/organization/bank-account-line'

/** บัญชีธนาคารของเราบนเอกสาร (มติ PO U100) — แถว "ช่องทางการชำระเงิน" */
describe('bankAccountLine / pickReceivingAccount', () => {
  it('พิมพ์ธนาคาร · เลขที่บัญชี · ชื่อบัญชี (ไม่มีชื่อ = ไม่พิมพ์ช่องนั้น)', () => {
    expect(bankAccountLine({ bankName: 'ธนาคารกสิกรไทย', accountNumber: '123-4-56789-0', accountName: 'บริษัท ก จำกัด' })).toBe(
      'ธนาคารกสิกรไทย · เลขที่บัญชี 123-4-56789-0 · ชื่อบัญชี บริษัท ก จำกัด',
    )
    expect(bankAccountLine({ bankName: 'ธนาคารกสิกรไทย', accountNumber: '123-4-56789-0', accountName: ' ' })).toBe(
      'ธนาคารกสิกรไทย · เลขที่บัญชี 123-4-56789-0',
    )
  })

  it('เลือกเฉพาะบัญชีรับเงิน (receive/both) · บัญชีหลักก่อน · ไม่มีเลย = null', () => {
    const pay = { id: 'pay', usage: 'pay' as const, isPrimary: true }
    const both = { id: 'both', usage: 'both' as const, isPrimary: false }
    const receive = { id: 'receive', usage: 'receive' as const, isPrimary: true }
    expect(pickReceivingAccount([pay, both, receive])?.id).toBe('receive')
    expect(pickReceivingAccount([pay, both])?.id).toBe('both')
    expect(pickReceivingAccount([pay])).toBeNull()
  })
})
