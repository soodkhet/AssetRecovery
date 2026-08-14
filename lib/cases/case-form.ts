import type { z } from 'zod'
import { EMPTY_ADDRESS, addressFromDto, type AddressValue } from '@/lib/address/address-value'
import { DEBTOR_NATIONALITIES, identityDocumentKind, type DebtorNationalityCode } from '@/lib/cases/case'
import type { CaseDetailDto } from '@/lib/cases/types'
import { parseBahtInput, toBahtInput } from '@/lib/format/money'

/**
 * ตรรกะ pure ของฟอร์มรับเคส (`38` §7.3) — แยกจาก component เพื่อให้มีเทสต์จริงได้
 * (component `components/cases/case-form-modal.tsx` เหลือแค่ JSX + การเรียก API)
 *
 * กติกาที่ผูกไว้ที่นี่
 * - เงินกรอกเป็น **บาท** → แปลงเป็น **สตางค์** ด้วย `parseBahtInput()` ก่อนส่งเสมอ (Rule 01)
 * - ช่องที่ไม่ได้ใช้ตามสัญชาติ (เลขบัตร ↔ passport) ส่ง `''` เพื่อให้ Zod แปลงเป็น `null` จริง
 *   ไม่ใช่ปล่อยค่าค้างข้ามสัญชาติ (กับดักเดียวกับฟอร์ม Users ใน Phase 1.9)
 * - ฟิลด์ "required" ของ §6 ยังเป็น optional ที่ schema — ฟอร์มบันทึกร่างได้แม้ข้อมูลไม่ครบ (`38` §11)
 */

export interface CaseFormState {
  financeCompanyId: string
  caseRef: string
  debtorName: string
  debtorNationality: DebtorNationalityCode | ''
  debtorNationalityOther: string
  debtorNationalId: string
  debtorPassportNo: string
  debtorPhoneMobile: string
  debtorPhoneWork: string
  debtorLineId: string
  debtorFacebook: string
  addressCurrent: AddressValue
  addressWork: AddressValue
  addressIdCard: AddressValue
  assetType: '' | 'smartphone' | 'tablet'
  assetBrandModel: string
  assetImeiSerial: string
  /** ค่าที่ผู้ใช้พิมพ์เป็น **บาท** (ยังไม่แปลง) */
  outstandingDebtBaht: string
  /** ผู้ติดต่ออื่น (`38` §6.1.3) — เพิ่ม/ลบแถวได้ไม่จำกัด */
  contacts: CaseContactForm[]
  /** หมายเหตุที่จะลง `case_edit_history` — ใช้เฉพาะโหมดแก้ไข (`38` §6.4) */
  editNote: string
}

/** แถวผู้ติดต่ออื่นบนฟอร์ม — `key` ใช้เป็น React key เท่านั้น ไม่ส่งขึ้น API */
export interface CaseContactForm {
  key: string
  contactName: string
  relationship: string
  contactPhone: string
}

export function emptyContact(key: string): CaseContactForm {
  return { key, contactName: '', relationship: '', contactPhone: '' }
}

/** แถวที่ยังไม่ได้กรอกอะไรเลย — ตัดทิ้งก่อนส่ง (§6.1.3 "อย่างน้อย 0 คนได้") */
export function isBlankContact(contact: CaseContactForm): boolean {
  return (
    contact.contactName.trim() === '' &&
    contact.relationship.trim() === '' &&
    contact.contactPhone.trim() === ''
  )
}

/**
 * แถวผู้ติดต่อ → payload — ตัดเฉพาะแถวที่ **ว่างทั้งแถว**
 * แถวที่กรอกมาบางส่วนส่งต่อให้ Zod ตีเป็น error รายช่อง (§6.1.3 "เพิ่มแถวแล้วต้องกรอกครบทั้ง 3")
 */
export function contactsPayload(
  contacts: readonly CaseContactForm[],
): Array<{ contactName: string; relationship: string; contactPhone: string }> {
  return contacts
    .filter((contact) => !isBlankContact(contact))
    .map((contact) => ({
      contactName: contact.contactName,
      relationship: contact.relationship,
      contactPhone: contact.contactPhone,
    }))
}

export const EMPTY_CASE_FORM: CaseFormState = {
  financeCompanyId: '',
  caseRef: '',
  debtorName: '',
  debtorNationality: 'TH',
  debtorNationalityOther: '',
  debtorNationalId: '',
  debtorPassportNo: '',
  debtorPhoneMobile: '',
  debtorPhoneWork: '',
  debtorLineId: '',
  debtorFacebook: '',
  addressCurrent: EMPTY_ADDRESS,
  addressWork: EMPTY_ADDRESS,
  addressIdCard: EMPTY_ADDRESS,
  assetType: 'smartphone',
  assetBrandModel: '',
  assetImeiSerial: '',
  outstandingDebtBaht: '',
  contacts: [],
  editNote: '',
}

/** เคสเดิม → ค่าเริ่มต้นของฟอร์ม (`38` §8 `edit_case` = pre-fill ทุก field รวม `case_ref`) */
export function caseFormFromDetail(detail: CaseDetailDto | null): CaseFormState {
  if (detail === null) return EMPTY_CASE_FORM
  const nationality = DEBTOR_NATIONALITIES.find((code) => code === detail.debtorNationality)
  return {
    financeCompanyId: detail.financeCompanyId,
    caseRef: detail.caseRef,
    debtorName: detail.debtorName ?? '',
    debtorNationality: nationality ?? '',
    debtorNationalityOther: detail.debtorNationalityOther ?? '',
    debtorNationalId: detail.debtorNationalId ?? '',
    debtorPassportNo: detail.debtorPassportNo ?? '',
    debtorPhoneMobile: detail.debtorPhoneMobile ?? '',
    debtorPhoneWork: detail.debtorPhoneWork ?? '',
    debtorLineId: detail.debtorLineId ?? '',
    debtorFacebook: detail.debtorFacebook ?? '',
    addressCurrent: addressFromDto(detail.addressCurrent),
    addressWork: addressFromDto(detail.addressWork),
    addressIdCard: addressFromDto(detail.addressIdCard),
    assetType: detail.assetType === 'smartphone' || detail.assetType === 'tablet' ? detail.assetType : '',
    assetBrandModel: detail.assetBrandModel ?? '',
    assetImeiSerial: detail.assetImeiSerial ?? '',
    outstandingDebtBaht: toBahtInput(detail.outstandingDebtSatang),
    contacts: detail.contacts.map((contact) => ({
      key: contact.id,
      contactName: contact.contactName,
      relationship: contact.relationship,
      contactPhone: contact.contactPhone ?? '',
    })),
    editNote: '',
  }
}

/** ช่องเอกสารยืนยันตัวตนที่ต้องแสดง ณ สัญชาติที่เลือก (`38` §6.1.1) — ยังไม่เลือก = ช่องเลขบัตรไทย */
export function identityFieldOf(nationality: DebtorNationalityCode | ''): 'national_id' | 'passport' {
  return nationality === '' ? 'national_id' : identityDocumentKind(nationality)
}

/**
 * ค่าฟอร์ม → payload ของ `POST /api/cases` (`mode: 'create'`) หรือ `PATCH /api/cases/:id` (`'edit'`)
 * มูลหนี้ที่พิมพ์ผิดรูป (แปลงแล้วได้ `NaN`) ส่งค่าดิบกลับไปให้ Zod ตีเป็น error ของช่องนั้น
 */
export function buildCasePayload(
  form: CaseFormState,
  mode: 'create' | 'edit',
): Record<string, unknown> {
  const identityKind = identityFieldOf(form.debtorNationality)
  const debt = parseBahtInput(form.outstandingDebtBaht)

  return {
    caseRef: form.caseRef,
    financeCompanyId: form.financeCompanyId,
    ...(mode === 'create' ? { sourceChannel: 'manual' as const } : {}),
    debtorName: form.debtorName,
    debtorNationality: form.debtorNationality === '' ? null : form.debtorNationality,
    debtorNationalityOther: form.debtorNationality === 'OTHER' ? form.debtorNationalityOther : '',
    debtorNationalId: identityKind === 'national_id' ? form.debtorNationalId : '',
    debtorPassportNo: identityKind === 'passport' ? form.debtorPassportNo : '',
    debtorPhoneMobile: form.debtorPhoneMobile,
    debtorPhoneWork: form.debtorPhoneWork,
    debtorLineId: form.debtorLineId,
    debtorFacebook: form.debtorFacebook,
    addressCurrent: form.addressCurrent,
    addressWork: form.addressWork,
    addressIdCard: form.addressIdCard,
    contacts: contactsPayload(form.contacts),
    assetType: form.assetType === '' ? null : form.assetType,
    assetBrandModel: form.assetBrandModel,
    assetImeiSerial: form.assetImeiSerial,
    outstandingDebtSatang: Number.isNaN(debt) ? form.outstandingDebtBaht : debt,
    ...(mode === 'edit' ? { editNote: form.editNote } : {}),
  }
}

/** `ZodError` → error รายช่อง (คีย์เป็น path แบบจุด) — รูปแบบเดียวกับ `toFieldErrors()` ฝั่ง API */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_'
    if (fields[path] === undefined) fields[path] = issue.message
  }
  return fields
}

/** ชื่อ field ใน `CaseError.context` (snake_case ฝั่ง API) → ชื่อช่องบนฟอร์ม */
export const CASE_ERROR_FIELD_MAP: Readonly<Record<string, string>> = {
  debtor_national_id: 'debtorNationalId',
  debtor_phone_mobile: 'debtorPhoneMobile',
  debtor_phone_work: 'debtorPhoneWork',
}

/**
 * ชื่อ field จาก `CaseError.context` → ชื่อช่องบนฟอร์ม (รวมแถวผู้ติดต่อที่ API ส่งเป็น
 * `contacts.<index>.phone` แต่ฟอร์มเก็บเป็น `contacts.<index>.contactPhone`)
 */
export function mapCaseErrorField(field: string): string {
  const contact = /^contacts\.(\d+)\.phone$/.exec(field)
  if (contact !== null) return `contacts.${contact[1]}.contactPhone`
  return CASE_ERROR_FIELD_MAP[field] ?? '_'
}

/** เคสเดิมที่ backend แนบมากับ `CASE_REF_DUPLICATE` เพื่อทำลิงก์ "เปิดเคสเดิม" (`38` §7.3/§11) */
export interface DuplicateCaseInfo {
  id: string
  caseRef: string
  status: string
  trackingRound: number
}

export function readDuplicateCase(error: { code?: string; payload?: Record<string, unknown> } | null | undefined): DuplicateCaseInfo | null {
  if (error?.code !== 'CASE_REF_DUPLICATE') return null
  const existing = error.payload?.existingCase
  if (existing === null || typeof existing !== 'object') return null
  const value = existing as Partial<DuplicateCaseInfo>
  if (typeof value.id !== 'string' || typeof value.caseRef !== 'string') return null
  return {
    id: value.id,
    caseRef: value.caseRef,
    status: typeof value.status === 'string' ? value.status : '',
    trackingRound: typeof value.trackingRound === 'number' ? value.trackingRound : 1,
  }
}
