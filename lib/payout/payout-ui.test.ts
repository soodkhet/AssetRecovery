import { describe, expect, it } from 'vitest'
import type { PayoutBatchDto } from '@/lib/payout/types'
import {
  canCompletePayout,
  canDownloadPaymentFile,
  canGeneratePaymentFile,
  countPendingPayoutBatches,
  isDuplicatePaymentFile,
  payoutStatusBadgeGroup,
  pendingPayoutNetSatang,
  PAYOUT_STATUS_FILTERS,
} from '@/lib/payout/payout-ui'

function batch(overrides: Partial<PayoutBatchDto> = {}): PayoutBatchDto {
  return {
    id: 'batch-1',
    name: 'รอบจ่าย Outsource ตัดรอบ 30/06/2569',
    side: 'outsource',
    status: 'checking',
    grossSatang: 1_880_000,
    whtSatang: 56_400,
    netSatang: 1_823_600,
    itemCount: 3,
    bankAccountId: null,
    bankAccountLabel: null,
    idempotencyKey: null,
    paymentFileUrl: null,
    paymentFileGeneratedAt: null,
    createdAt: '2026-06-30T02:00:00.000Z',
    createdByName: 'การเงิน ทดสอบ',
    updatedAt: '2026-06-30T02:00:00.000Z',
    ...overrides,
  }
}

describe('payout-ui — ปุ่มมาจาก state machine เดียวกับ API (`23` §6.6)', () => {
  it('สร้างไฟล์โอนได้ที่ checking และสร้างซ้ำได้ที่ file_generated เท่านั้น', () => {
    expect(canGeneratePaymentFile('draft')).toBe(false)
    expect(canGeneratePaymentFile('checking')).toBe(true)
    expect(canGeneratePaymentFile('file_generated')).toBe(true)
    expect(canGeneratePaymentFile('completed')).toBe(false)
  })

  it('ยืนยันจ่ายแล้วทำได้เฉพาะรอบที่มีไฟล์โอนแล้ว', () => {
    expect(canCompletePayout('checking')).toBe(false)
    expect(canCompletePayout('file_generated')).toBe(true)
    expect(canCompletePayout('completed')).toBe(false)
  })

  it('ปุ่มดาวน์โหลดไฟล์โอนโผล่เมื่อมีไฟล์จริง · เตือนซ้ำเมื่อเคยสร้างแล้ว', () => {
    expect(canDownloadPaymentFile(batch())).toBe(false)
    expect(canDownloadPaymentFile(batch({ paymentFileUrl: 'payout-batches/x/f-v1.csv' }))).toBe(true)
    expect(isDuplicatePaymentFile(batch())).toBe(false)
    expect(isDuplicatePaymentFile(batch({ paymentFileGeneratedAt: '2026-07-05T00:00:00.000Z' }))).toBe(true)
  })

  it('สีสถานะมาจาก 10 กลุ่มของ `04` §8.1', () => {
    expect(payoutStatusBadgeGroup('draft')).toBe('neutral')
    expect(payoutStatusBadgeGroup('checking')).toBe('pending')
    expect(payoutStatusBadgeGroup('file_generated')).toBe('sent')
    expect(payoutStatusBadgeGroup('completed')).toBe('success')
  })

  it('KPI เงินรอจ่าย นับเฉพาะรอบที่ยังไม่ completed', () => {
    const batches = [batch(), batch({ id: 'b2', status: 'file_generated', netSatang: 500_000 }), batch({ id: 'b3', status: 'completed', netSatang: 900_000 })]
    expect(pendingPayoutNetSatang(batches)).toBe(2_323_600)
    expect(countPendingPayoutBatches(batches)).toBe(2)
  })

  it('ตัวกรองสถานะทุกค่าเป็นค่าที่ API รับจริง', () => {
    const accepted = new Set(['all', 'draft', 'checking', 'file_generated', 'completed'])
    for (const filter of PAYOUT_STATUS_FILTERS) expect(accepted.has(filter.value)).toBe(true)
  })
})
