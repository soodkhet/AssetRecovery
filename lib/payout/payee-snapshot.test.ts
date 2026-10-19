import { describe, expect, it } from 'vitest'
import {
  payeeDocInfoOf,
  payeeIdentityFromProfile,
  payeeIdentityFromSnapshot,
  payeeSnapshotData,
  resolvePayeeDocIdentity,
  type PayeeProfileForDoc,
  type PayeeSnapshotColumns,
} from '@/lib/payout/payee-snapshot'

/** มติ D7-07 (mytester7 FX3) — เลือก snapshot ตอนออกเอกสาร vs ค่าปัจจุบัน */

const STATS = { successCases: 2, fieldDays: 3, hotelNights: 1 }

const individual: PayeeProfileForDoc = {
  payeeType: 'individual',
  nameTitle: 'นาย',
  legalName: null,
  nationalId: '1234567890123',
  branchCode: '00000',
  addressDetail: '1 ถนนเดิม',
  addressSubdistrict: null,
  addressDistrict: null,
  addressProvince: null,
  addressPostalCode: null,
  user: { fullName: 'สมชาย ใจดี' },
}

const corporate: PayeeProfileForDoc = {
  ...individual,
  payeeType: 'corporate',
  nameTitle: 'นาย',
  legalName: 'บริษัท ตามทะเบียน จำกัด',
  nationalId: '0105555555555',
  branchCode: '00002',
}

const NO_SNAPSHOT: PayeeSnapshotColumns = {
  payeeSnapshotAt: null,
  payeeNameSnapshot: null,
  payeeNameTitleSnapshot: null,
  payeeTypeSnapshot: null,
  payeeTaxIdSnapshot: null,
  payeeAddressSnapshot: null,
  payeeBranchCodeSnapshot: null,
}

describe('payeeIdentityFromProfile', () => {
  it('บุคคลธรรมดา: ชื่อผู้ใช้ + คำนำหน้า · ไม่มีสาขา', () => {
    expect(payeeIdentityFromProfile(individual)).toEqual({
      payeeType: 'individual',
      name: 'สมชาย ใจดี',
      nameTitle: 'นาย',
      taxId: '1234567890123',
      address: '1 ถนนเดิม',
      branchCode: null,
    })
  })

  it('นิติบุคคล: ชื่อตามทะเบียน · ไม่มีคำนำหน้า · เก็บสาขา', () => {
    expect(payeeIdentityFromProfile(corporate)).toMatchObject({
      name: 'บริษัท ตามทะเบียน จำกัด',
      nameTitle: null,
      branchCode: '00002',
    })
  })
})

describe('payeeIdentityFromSnapshot', () => {
  it('ยังไม่มี snapshot (payee_snapshot_at NULL) ⇒ null', () => {
    expect(payeeIdentityFromSnapshot(NO_SNAPSHOT)).toBeNull()
  })

  it('เขียนแล้วอ่านกลับได้ค่าเดิมทุกช่อง', () => {
    const identity = payeeIdentityFromProfile(corporate)
    const at = new Date('2026-10-19T03:00:00Z')
    const columns = payeeSnapshotData(identity, at)
    expect(columns.payeeSnapshotAt).toBe(at)
    expect(payeeIdentityFromSnapshot(columns)).toEqual(identity)
  })
})

describe('resolvePayeeDocIdentity', () => {
  it('มี snapshot ⇒ ใช้ snapshot แม้โปรไฟล์ปัจจุบันเปลี่ยนชื่อ/เลข/ที่อยู่แล้ว', () => {
    const snapshot = payeeIdentityFromProfile(individual)
    const current = payeeIdentityFromProfile({
      ...individual,
      nameTitle: 'นางสาว',
      nationalId: '3100000000000',
      addressDetail: '99 ถนนใหม่',
      user: { fullName: 'สมหญิง ชื่อใหม่' },
    })
    expect(resolvePayeeDocIdentity(snapshot, current)).toBe(snapshot)
  })

  it('ไม่มี snapshot (รอบเก่า/ยังไม่สร้างไฟล์) ⇒ ค่าปัจจุบัน', () => {
    const current = payeeIdentityFromProfile(individual)
    expect(resolvePayeeDocIdentity(null, current)).toBe(current)
  })

  it('snapshot ที่เลข/ที่อยู่ว่าง ⇒ พิมพ์ว่างตามจริง ไม่เติมจากค่าปัจจุบัน', () => {
    const snapshot = { ...payeeIdentityFromProfile(individual), taxId: null, address: null }
    const resolved = resolvePayeeDocIdentity(snapshot, payeeIdentityFromProfile(individual))
    expect(resolved?.taxId).toBeNull()
    expect(resolved?.address).toBeNull()
  })

  it('ไม่มีทั้งสองแหล่ง ⇒ null (ผู้เรียกใช้ค่าสำรองของรายการ)', () => {
    expect(resolvePayeeDocIdentity(null, null)).toBeNull()
  })
})

describe('payeeDocInfoOf', () => {
  it('บุคคลธรรมดา: ชื่อพร้อมคำนำหน้า · ไม่มีป้ายสาขา', () => {
    expect(payeeDocInfoOf(payeeIdentityFromProfile(individual), STATS)).toEqual({
      displayName: 'นายสมชาย ใจดี',
      taxId: '1234567890123',
      isCorporate: false,
      address: '1 ถนนเดิม',
      branchLabel: null,
      stats: STATS,
    })
  })

  it('นิติบุคคล: ป้ายสาขา · สาขาว่างใน snapshot = สำนักงานใหญ่', () => {
    const identity = payeeIdentityFromProfile(corporate)
    expect(payeeDocInfoOf(identity, STATS)).toMatchObject({ isCorporate: true, branchLabel: 'สาขาที่ 00002' })
    expect(payeeDocInfoOf({ ...identity, branchCode: null }, STATS).branchLabel).toBe('สำนักงานใหญ่')
  })
})
