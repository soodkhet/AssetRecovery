import { describe, expect, it } from 'vitest'
import { assetActionCapability, assetRowActions } from '@/lib/warehouse/asset-actions'

const ALLOW_ALL = (): boolean => true
const DENY_ALL = (): boolean => false

describe('assetRowActions (`44` §8.2)', () => {
  it('pending_intake → [รับเข้าคลัง] [ตีกลับ]', () => {
    expect(assetRowActions('pending_intake', ALLOW_ALL).map((button) => button.label)).toEqual([
      'รับเข้าคลัง',
      'ตีกลับ',
    ])
  })

  it('intake_rejected → [ดูเหตุผล] [รับใหม่] และไม่มีปุ่มตีกลับซ้ำ', () => {
    const actions = assetRowActions('intake_rejected', ALLOW_ALL)
    expect(actions.map((button) => button.label)).toEqual(['ดูเหตุผล', 'รับใหม่'])
    expect(actions.map((button) => button.action)).toEqual(['view_reject', 'intake'])
  })

  it('สถานะที่พ้นการรับเข้าแล้วไม่มีปุ่ม action', () => {
    expect(assetRowActions('in_custody', ALLOW_ALL)).toEqual([])
    expect(assetRowActions('handover_pending', ALLOW_ALL)).toEqual([])
    expect(assetRowActions('handed_over', ALLOW_ALL)).toEqual([])
  })

  it('ไม่มีสิทธิ์ = ซ่อนปุ่มที่กระทำ แต่ยังดูเหตุผลตีกลับได้ (อ่านอย่างเดียว)', () => {
    expect(assetRowActions('pending_intake', DENY_ALL)).toEqual([])
    expect(assetRowActions('intake_rejected', DENY_ALL).map((button) => button.action)).toEqual(['view_reject'])
  })

  it('สิทธิ์รับเข้าและตีกลับแยกกัน (`02` §12 คนละ capability)', () => {
    const onlyIntake = assetRowActions('pending_intake', (capability) => capability === 'intake_asset')
    expect(onlyIntake.map((button) => button.action)).toEqual(['intake'])

    const onlyReject = assetRowActions('pending_intake', (capability) => capability === 'reject_asset_intake')
    expect(onlyReject.map((button) => button.action)).toEqual(['reject_intake'])
  })

  it('มีปุ่มหลักได้ไม่เกิน 1 ปุ่มต่อแถว', () => {
    for (const status of ['pending_intake', 'intake_rejected'] as const) {
      expect(assetRowActions(status, ALLOW_ALL).filter((button) => button.primary)).toHaveLength(1)
    }
  })
})

describe('assetActionCapability', () => {
  it('map ตรงกับ capability ของ `44` §13', () => {
    expect(assetActionCapability('intake')).toBe('intake_asset')
    expect(assetActionCapability('reject_intake')).toBe('reject_asset_intake')
    expect(assetActionCapability('view_reject')).toBeNull()
  })
})
