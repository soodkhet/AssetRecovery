import { ServiceFeeError } from '@/lib/service-fee/errors'

/**
 * Logic ล้วนของเทมเพลตค่าบริการ (ไฟล์ 12) — **ห้าม import อะไรที่แตะ Prisma/DB ในไฟล์นี้**
 *
 * ขอบเขต: normalize ค่าตาม model · diff เพื่อขึ้นเวอร์ชันใหม่ · resolver สำหรับ snapshot ·
 * และ **คำอธิบายสูตร 2 กรณี** (สำเร็จ/ไม่สำเร็จ) ที่การ์ดใน UI ใช้แสดง (DEC-008)
 *
 * ⚠️ **ไม่มีการคำนวณเงินในไฟล์นี้** — สูตร revenue ตาม `22` §6.5–6.7 เป็น pure module ของ Phase 3.1
 * ที่นี่คืนเฉพาะ "องค์ประกอบของสูตร" ให้ชั้น display จัดรูปเอง (Rule 01)
 */

export type ServiceFeeModel = 'SUCCESS_FEE' | 'FLAT' | 'HYBRID'
export type ServiceFeeBasis = 'debt_amount' | 'asset_value'

/** ค่าที่ผู้ใช้ตั้งได้ต่อเทมเพลต 1 เวอร์ชัน — ตรงกับคอลัมน์ `service_fee_templates` (`02` §5) */
export interface ServiceFeeTemplateValues {
  name: string
  model: ServiceFeeModel
  baseSatang: number
  ratePct: number
  basis: ServiceFeeBasis | null
  chargeOnFail: boolean
  chargePerTrackingRound: boolean
}

export interface ServiceFeeTemplateVersion extends ServiceFeeTemplateValues {
  id: string
  version: number
  isCurrent: boolean
}

const VALUE_FIELDS = [
  'name',
  'model',
  'baseSatang',
  'ratePct',
  'basis',
  'chargeOnFail',
  'chargePerTrackingRound',
] as const satisfies readonly (keyof ServiceFeeTemplateValues)[]

/** ช่วง `rate` ตาม `12` §11 — ใช้ code เฉพาะ `INVALID_RATE_RANGE` ไม่ใช่ `REQUIRED_MISSING` */
export function assertRateRange(ratePct: number): void {
  if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
    throw new ServiceFeeError('INVALID_RATE_RANGE', { detail: `rate=${ratePct}` })
  }
}

/**
 * บังคับความสอดคล้องของฟิลด์ตาม model ในระดับข้อมูล (`12` §7.1)
 * schema ปฏิเสธค่าที่ขัดกันอยู่แล้ว — ตัวนี้กันค่าที่มาจากทางอื่นไม่ให้ค้างใน DB
 */
export function normalizeTemplateValues(values: ServiceFeeTemplateValues): ServiceFeeTemplateValues {
  if (values.model === 'SUCCESS_FEE') {
    return { ...values, baseSatang: 0, chargeOnFail: false }
  }
  if (values.model === 'FLAT') {
    return { ...values, ratePct: 0, basis: null }
  }
  return values
}

/** ชื่อฟิลด์ที่ค่าต่างกันจริง — ว่าง = ไม่มีอะไรเปลี่ยน ไม่ต้องขึ้นเวอร์ชันใหม่ */
export function diffTemplateValues(
  current: ServiceFeeTemplateValues,
  next: ServiceFeeTemplateValues,
): (keyof ServiceFeeTemplateValues)[] {
  const before = normalizeTemplateValues(current)
  const after = normalizeTemplateValues(next)
  return VALUE_FIELDS.filter((field) => before[field] !== after[field])
}

export interface NextTemplateVersion {
  values: ServiceFeeTemplateValues
  version: number
  changedFields: (keyof ServiceFeeTemplateValues)[]
}

/**
 * วางแผนการขึ้นเวอร์ชันจาก PATCH (`12` §9 — เคส approved ใช้ snapshot ไม่กระทบ,
 * เคสที่ยังไม่ approved เห็นค่าใหม่ทันทีเพราะบริษัทถูกย้ายมาผูกเวอร์ชันปัจจุบัน)
 * คืน `null` เมื่อไม่มีฟิลด์ไหนเปลี่ยน (กันเวอร์ชันขยะจากการกดบันทึกซ้ำ)
 */
export function planNextTemplateVersion(
  current: ServiceFeeTemplateVersion,
  next: ServiceFeeTemplateValues,
): NextTemplateVersion | null {
  const changedFields = diffTemplateValues(current, next)
  if (changedFields.length === 0) return null
  return { values: normalizeTemplateValues(next), version: current.version + 1, changedFields }
}

export function pickCurrentTemplateVersion(
  versions: readonly ServiceFeeTemplateVersion[],
): ServiceFeeTemplateVersion | null {
  return versions.find((version) => version.isCurrent) ?? null
}

/** ค่าที่ต้อง snapshot ลงเคสตอน `approved` (`10` §9.2 · `12` §9 — งานจริงอยู่ Phase 2.3) */
export interface ServiceFeeSnapshot {
  serviceFeeTemplateId: string
  serviceFeeTemplateVersion: number
  model: ServiceFeeModel
  baseSatang: number
  ratePct: number
  basis: ServiceFeeBasis | null
  chargeOnFail: boolean
  chargePerTrackingRound: boolean
}

export function toServiceFeeSnapshot(template: ServiceFeeTemplateVersion): ServiceFeeSnapshot {
  const values = normalizeTemplateValues(template)
  return {
    serviceFeeTemplateId: template.id,
    serviceFeeTemplateVersion: template.version,
    model: values.model,
    baseSatang: values.baseSatang,
    ratePct: values.ratePct,
    basis: values.basis,
    chargeOnFail: values.chargeOnFail,
    chargePerTrackingRound: values.chargePerTrackingRound,
  }
}

/**
 * องค์ประกอบของยอดที่เรียกเก็บ 1 กรณี — ไม่ใช่ยอดเงินที่คำนวณแล้ว
 * (ต้องรู้ `debt_amount`/`asset_value` ของเคสก่อนถึงจะได้ตัวเลขจริง — `22` §6.5–6.7)
 */
export type ServiceFeeCharge =
  | { kind: 'none' }
  | { kind: 'flat'; baseSatang: number }
  | { kind: 'rate'; ratePct: number; basis: ServiceFeeBasis }
  | { kind: 'hybrid'; baseSatang: number; ratePct: number; basis: ServiceFeeBasis }

export interface ServiceFeeFormula {
  /** เคสปิดสำเร็จ (`closed_success`) */
  onSuccess: ServiceFeeCharge
  /** เคสปิดไม่สำเร็จ (`closed_fail`) */
  onFail: ServiceFeeCharge
}

/**
 * สูตร 2 กรณีที่การ์ดใน UI ต้องแสดง (DEC-008 · mockup `settings.html` `renderServiceFeeContent`)
 * ตรงกับ `22` §6.5 (SUCCESS_FEE), §6.6 (FLAT), §6.7 (HYBRID)
 */
export function describeServiceFeeFormula(template: ServiceFeeTemplateValues): ServiceFeeFormula {
  const values = normalizeTemplateValues(template)

  if (values.model === 'SUCCESS_FEE') {
    return {
      onSuccess: { kind: 'rate', ratePct: values.ratePct, basis: values.basis ?? 'debt_amount' },
      onFail: { kind: 'none' },
    }
  }

  const failCharge: ServiceFeeCharge = values.chargeOnFail
    ? { kind: 'flat', baseSatang: values.baseSatang }
    : { kind: 'none' }

  if (values.model === 'FLAT') {
    return { onSuccess: { kind: 'flat', baseSatang: values.baseSatang }, onFail: failCharge }
  }

  return {
    onSuccess: {
      kind: 'hybrid',
      baseSatang: values.baseSatang,
      ratePct: values.ratePct,
      basis: values.basis ?? 'debt_amount',
    },
    onFail: failCharge,
  }
}

export const SERVICE_FEE_BASIS_LABEL: Record<ServiceFeeBasis, string> = {
  debt_amount: 'มูลค่าหนี้คงเหลือ',
  asset_value: 'มูลค่าเครื่อง',
}

export const SERVICE_FEE_MODEL_LABEL: Record<ServiceFeeModel, string> = {
  SUCCESS_FEE: 'Success Fee (% ความสำเร็จ)',
  FLAT: 'Flat Rate (เหมาจ่ายรายเคส)',
  HYBRID: 'Hybrid (ผสม)',
}
