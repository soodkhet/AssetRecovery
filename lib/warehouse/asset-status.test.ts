import { describe, expect, it } from 'vitest'
import { ModuleError } from '@/lib/api/errors'
import {
  ASSET_STATUSES,
  ASSET_TRANSITIONS,
  assetTab,
  canAssetAction,
  isIntakeRetry,
  nextAssetStatus,
  statusesInAssetTab,
} from '@/lib/warehouse/asset-status'

/** `44` §9.1 — เส้นทางของเครื่องตั้งแต่ auto-create จนถึง terminal */

describe('nextAssetStatus', () => {
  it('รับเข้าคลังจากคิวรอรับ → in_custody', () => {
    expect(nextAssetStatus('pending_intake', 'intake')).toBe('in_custody')
  })

  it('รับใหม่หลังตีกลับ → in_custody ในขั้นตอนเดียว (§8.2 retry)', () => {
    expect(nextAssetStatus('intake_rejected', 'intake')).toBe('in_custody')
  })

  it('ตีกลับได้เฉพาะเครื่องที่ยังไม่ถูกรับเข้า', () => {
    expect(nextAssetStatus('pending_intake', 'reject_intake')).toBe('intake_rejected')
    expect(() => nextAssetStatus('in_custody', 'reject_intake')).toThrowError(ModuleError)
  })

  it('เข้าล็อตได้เฉพาะเครื่องในคลัง แล้วจบที่ handed_over', () => {
    expect(nextAssetStatus('in_custody', 'attach_to_lot')).toBe('handover_pending')
    expect(nextAssetStatus('handover_pending', 'hand_over')).toBe('handed_over')
  })

  it('เครื่องที่ส่งมอบแล้วขยับต่อไม่ได้ (terminal) — `ASSET_INVALID_STATUS`', () => {
    for (const action of ['intake', 'reject_intake', 'attach_to_lot', 'hand_over'] as const) {
      expect(() => nextAssetStatus('handed_over', action)).toThrowError(/ASSET_INVALID_STATUS/)
    }
  })

  it('ข้ามขั้นไม่ได้ — รับเข้าคลังตรงจาก in_custody/handover_pending ไม่ได้', () => {
    expect(() => nextAssetStatus('in_custody', 'intake')).toThrowError(/ASSET_INVALID_STATUS/)
    expect(() => nextAssetStatus('handover_pending', 'attach_to_lot')).toThrowError(/ASSET_INVALID_STATUS/)
  })

  it('error พก context บอกสถานะ/action ที่พยายามทำ', () => {
    try {
      nextAssetStatus('handed_over', 'intake')
      expect.unreachable('ต้อง throw')
    } catch (error) {
      expect(error).toBeInstanceOf(ModuleError)
      expect((error as ModuleError).status).toBe(400)
      expect((error as ModuleError).context).toEqual({ status: 'handed_over', action: 'intake' })
    }
  })
})

describe('canAssetAction', () => {
  it('ตอบตรงกับตาราง transition ทุกคู่ (ไม่มีทางลัดที่ทำได้แต่ตารางไม่รู้)', () => {
    for (const status of ASSET_STATUSES) {
      for (const [action, rule] of Object.entries(ASSET_TRANSITIONS)) {
        expect(canAssetAction(status, action as keyof typeof ASSET_TRANSITIONS)).toBe(rule.from.includes(status))
      }
    }
  })
})

describe('isIntakeRetry', () => {
  it('true เฉพาะเครื่องที่เคยถูกตีกลับ (ตัวตัดสินว่าต้องลง event `asset.intake_retry`)', () => {
    expect(isIntakeRetry('intake_rejected')).toBe(true)
    expect(isIntakeRetry('pending_intake')).toBe(false)
  })
})

describe('แท็บของหน้าคลัง (`44` §8.1)', () => {
  it('คิวรับเข้า/ตีกลับ อยู่แท็บเดียวกัน', () => {
    expect(assetTab('pending_intake')).toBe('intake')
    expect(assetTab('intake_rejected')).toBe('intake')
  })

  it('statusesInAssetTab คืนสถานะครบและไม่ปนแท็บอื่น', () => {
    expect(statusesInAssetTab('intake')).toEqual(['pending_intake', 'intake_rejected'])
    expect(statusesInAssetTab('in_custody')).toEqual(['in_custody'])
    expect(statusesInAssetTab('pending_handover')).toEqual(['handover_pending'])
    expect(statusesInAssetTab('handed_over')).toEqual(['handed_over'])
  })

  it('ทุกสถานะมีแท็บของตัวเอง — ไม่มีเครื่องหายจากหน้าจอ', () => {
    for (const status of ASSET_STATUSES) expect(assetTab(status)).toBeTruthy()
  })
})
