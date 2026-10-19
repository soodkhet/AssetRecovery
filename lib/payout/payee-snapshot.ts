/**
 * มติ D7-07 (mytester7 FX3) — ข้อมูลผู้รับเงินบนเอกสารการจ่าย (ใบสำคัญจ่าย · สลิปค่าตอบแทน · สรุปรอบจ่าย)
 * = ค่า **ณ ตอนออกเอกสาร** (snapshot ลง `payout_batch_items.payee_*_snapshot` ตอนสร้างไฟล์โอนครั้งแรก
 * จังหวะเดียวกับเลขใบสำคัญจ่าย) · รอบที่ยังไม่มี snapshot (ก่อนสร้างไฟล์/ก่อนมติ) ⇒ ค่าปัจจุบันตามเดิม
 * โครงข้อมูลเดียวกับ snapshot ผู้ถูกหักของใบ 50 ทวิ (`wht_certificates.payee_*`) — pure ทั้งไฟล์
 */
import type { PayeeType } from '@/lib/generated/prisma/enums'
import { formatBranch, HEAD_OFFICE_BRANCH_CODE } from '@/lib/format/branch'
import { payeeAddressLine, payeeDisplayName, payeeLegalName } from '@/lib/payees/payee'
import type { PayoutPayeeDocInfo, PayslipStats } from '@/lib/payout/payout-doc'

/** ตัวตนผู้รับที่พิมพ์บนเอกสาร — ชื่อตามกฎหมาย (ไม่รวมคำนำหน้า) · เลข 13 หลัก · ที่อยู่บรรทัดเดียว · สาขา */
export interface PayeeDocIdentity {
  payeeType: PayeeType
  name: string
  nameTitle: string | null
  taxId: string | null
  address: string | null
  branchCode: string | null
}

/** โปรไฟล์ผู้รับ (ค่าปัจจุบัน) ตามที่ query โหลดมา */
export interface PayeeProfileForDoc {
  payeeType: PayeeType
  nameTitle: string | null
  legalName: string | null
  nationalId: string | null
  /** NOT NULL ในฐาน (ค่าเริ่มต้น `00000`) */
  branchCode: string
  addressDetail: string | null
  addressSubdistrict: string | null
  addressDistrict: string | null
  addressProvince: string | null
  addressPostalCode: string | null
  user: { fullName: string }
}

/** คอลัมน์ snapshot ของรายการในรอบจ่าย */
export interface PayeeSnapshotColumns {
  payeeSnapshotAt: Date | null
  payeeNameSnapshot: string | null
  payeeNameTitleSnapshot: string | null
  payeeTypeSnapshot: PayeeType | null
  payeeTaxIdSnapshot: string | null
  payeeAddressSnapshot: string | null
  payeeBranchCodeSnapshot: string | null
}

/** ตัวตนจากโปรไฟล์ปัจจุบัน — กติกาเดียวกับตอนออกใบ 50 ทวิ (คำนำหน้า/สาขาเฉพาะประเภทที่ใช้) */
export function payeeIdentityFromProfile(profile: PayeeProfileForDoc): PayeeDocIdentity {
  const isCorporate = profile.payeeType === 'corporate'
  return {
    payeeType: profile.payeeType,
    name: payeeLegalName({ payeeType: profile.payeeType, legalName: profile.legalName, userFullName: profile.user.fullName }),
    nameTitle: isCorporate ? null : profile.nameTitle,
    taxId: profile.nationalId,
    address: payeeAddressLine(profile),
    branchCode: isCorporate ? profile.branchCode : null,
  }
}

/** ตัวตนจาก snapshot ของรายการ — ยังไม่มี snapshot (`payee_snapshot_at` NULL) = `null` */
export function payeeIdentityFromSnapshot(row: PayeeSnapshotColumns): PayeeDocIdentity | null {
  if (row.payeeSnapshotAt === null || row.payeeNameSnapshot === null || row.payeeTypeSnapshot === null) return null
  return {
    payeeType: row.payeeTypeSnapshot,
    name: row.payeeNameSnapshot,
    nameTitle: row.payeeNameTitleSnapshot,
    taxId: row.payeeTaxIdSnapshot,
    address: row.payeeAddressSnapshot,
    branchCode: row.payeeBranchCodeSnapshot,
  }
}

/** ค่าที่จะเขียนลงคอลัมน์ snapshot ตอนออกเอกสาร */
export function payeeSnapshotData(identity: PayeeDocIdentity, at: Date): PayeeSnapshotColumns {
  return {
    payeeSnapshotAt: at,
    payeeNameSnapshot: identity.name,
    payeeNameTitleSnapshot: identity.nameTitle,
    payeeTypeSnapshot: identity.payeeType,
    payeeTaxIdSnapshot: identity.taxId,
    payeeAddressSnapshot: identity.address,
    payeeBranchCodeSnapshot: identity.branchCode,
  }
}

/**
 * snapshot ชนะเสมอ · ไม่มี snapshot ⇒ ค่าปัจจุบัน (รอบเก่า/ยังไม่สร้างไฟล์โอน)
 * ไม่ผสมรายช่อง — snapshot ที่เลข/ที่อยู่ว่าง = ตอนออกโปรไฟล์ยังไม่กรอก ต้องพิมพ์ว่างตามจริง
 */
export function resolvePayeeDocIdentity(
  snapshot: PayeeDocIdentity | null,
  current: PayeeDocIdentity | null,
): PayeeDocIdentity | null {
  return snapshot ?? current
}

/** แปลงตัวตนเป็นข้อมูลผู้รับบนเอกสาร (ชื่อพร้อมคำนำหน้า · สาขานิติบุคคล) */
export function payeeDocInfoOf(identity: PayeeDocIdentity, stats: PayslipStats): PayoutPayeeDocInfo {
  const isCorporate = identity.payeeType === 'corporate'
  return {
    displayName: payeeDisplayName({ name: identity.name, nameTitle: identity.nameTitle, payeeType: identity.payeeType }),
    taxId: identity.taxId,
    isCorporate,
    address: identity.address,
    branchLabel: isCorporate ? formatBranch(identity.branchCode ?? HEAD_OFFICE_BRANCH_CODE) : null,
    stats,
  }
}
