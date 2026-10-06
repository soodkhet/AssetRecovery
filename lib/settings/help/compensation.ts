import { commissionSatang, fieldDayTotalsSatang, fuelPerKmSatang, planFieldDayExpenses } from '@/lib/finance/compensation-calc'
import { calculateServiceFeeRevenue } from '@/lib/finance/service-fee-calc'
import { sumSatang } from '@/lib/finance/satang'
import { hotelCapExceededMessage, hotelClaimCapSatang } from '@/lib/field/hotel-claim'
import type { FuelMode, ServiceFeeBasis, ServiceFeeModel } from '@/lib/generated/prisma/enums'
import { SERVICE_FEE_MODEL_LABEL } from '@/lib/service-fee/template'
import { WHO_COMPENSATION, WHO_SUPERADMIN_ONLY, line, money, pct } from '@/lib/settings/help/common'
import type { SettingHelpContent, SettingHelpExample } from '@/lib/settings/help/types'

/**
 * คำอธิบายค่าตั้งที่กระทบเงินนอกหน้าตั้งค่า (U108) — แผนค่าตอบแทน (น้ำมัน/เบี้ยเลี้ยง/คอมมิชชัน/ที่พัก) และ
 * เทมเพลตค่าบริการ — ตัวเลขจาก `lib/field/expense-calc.ts` / `lib/field/hotel-claim.ts` /
 * `lib/finance/service-fee-calc.ts` (สูตรเดียวกับตอนปิดงาน/สร้างรายได้จริง)
 */

const WHEN_PLAN =
  'บันทึกเป็นเวอร์ชันใหม่ตามวันที่เริ่มมีผล — รายการเบิกที่สร้างไปแล้วเก็บเวอร์ชันเดิมไว้ ไม่คิดใหม่ย้อนหลัง'

/** ระยะทางตัวอย่าง 120 กม. (หน่วยร้อยของกิโลเมตร) */
export const SAMPLE_DISTANCE_KM_HUNDREDTHS = 12_000
export const SAMPLE_FIELD_DAYS = 3

export function fuelHelp(input: {
  fuelMode: FuelMode
  ratePerKmSatang: number | null
  maxPerCaseSatang: number | null
  dailyFlatSatang: number | null
}): SettingHelpContent {
  const examples: SettingHelpExample[] = []
  if (input.fuelMode === 'PER_KM' && input.ratePerKmSatang !== null) {
    const raw = fuelPerKmSatang({
      distanceKmHundredths: SAMPLE_DISTANCE_KM_HUNDREDTHS,
      ratePerKmSatang: input.ratePerKmSatang,
      maxPerCaseSatang: null,
    })
    const paid = fuelPerKmSatang({
      distanceKmHundredths: SAMPLE_DISTANCE_KM_HUNDREDTHS,
      ratePerKmSatang: input.ratePerKmSatang,
      maxPerCaseSatang: input.maxPerCaseSatang,
    })
    examples.push({
      title: `เคสหนึ่งเดินทาง ${SAMPLE_DISTANCE_KM_HUNDREDTHS / 100} กม. × ${money(input.ratePerKmSatang)}/กม.`,
      lines: [
        line('คิดตามระยะทาง', money(raw)),
        line('เพดานต่อเคส', input.maxPerCaseSatang === null ? 'ไม่จำกัด' : money(input.maxPerCaseSatang)),
        line('จ่ายจริง', money(paid), true),
      ],
    })
  }
  if (input.fuelMode === 'DAILY_FLAT' && input.dailyFlatSatang !== null) {
    const perDay = fieldDayTotalsSatang({ fuelMode: 'DAILY_FLAT', fuelDailyFlatSatang: input.dailyFlatSatang, allowanceSatang: 0 })
    const total = sumSatang(Array.from({ length: SAMPLE_FIELD_DAYS }, () => perDay.fuelSatang), 'ค่าน้ำมันรวม')
    examples.push({
      title: `ลงพื้นที่ ${SAMPLE_FIELD_DAYS} วัน (วันละกี่เคสก็ได้)`,
      lines: [line('ต่อวัน', money(perDay.fuelSatang)), line(`รวม ${SAMPLE_FIELD_DAYS} วัน`, money(total), true)],
    })
  }
  return {
    title: 'ค่าน้ำมันคิดอย่างไร',
    what: 'ระบบสร้างรายการเบิกค่าน้ำมันให้อัตโนมัติตอนปิดงาน ตามโหมดของแผน',
    options: [
      { label: 'ตามระยะทาง', effect: 'ระยะทางจริง × อัตราต่อกม. ไม่เกินเพดานต่อเคส (เว้นว่าง = ไม่จำกัด)' },
      { label: 'เหมาจ่ายรายวัน', effect: 'วันละก้อนเดียวต่อคนต่อวันที่มีเช็คอิน ไม่ว่าวันนั้นไปกี่เคส' },
    ],
    examples,
    who: WHO_COMPENSATION,
    when: WHEN_PLAN,
  }
}

export function allowanceHelp(allowanceSatang: number | null): SettingHelpContent {
  const examples: SettingHelpExample[] = []
  if (allowanceSatang !== null) {
    const plan = planFieldDayExpenses({
      plan: { fuelMode: 'PER_KM', fuelDailyFlatSatang: null, allowanceSatang },
      cases: ['A', 'B', 'C'].map((id, index) => ({
        caseId: `เคส ${id}`,
        assignmentId: id,
        firstCheckedInAt: new Date(Date.UTC(2026, 9, 6, 2 + index)),
      })),
    })
    examples.push({
      title: `วันเดียวไป 3 เคส · เบี้ยเลี้ยง ${money(allowanceSatang)}/วัน`,
      lines: [
        line('ได้รับรวมวันนั้น', money(plan.allowanceTotalSatang), true),
        line('แบ่งลงเคส (บันทึกต้นทุนต่อเคส)', plan.drafts.map((draft) => `${draft.caseId} ${money(draft.grossSatang)}`).join(' · ') || '—'),
      ],
    })
  }
  return {
    title: 'เบี้ยเลี้ยงคิดอย่างไร',
    what: 'จ่ายวันละ 1 ครั้งต่อคนต่อวันที่มีเช็คอินอย่างน้อย 1 เคส แล้วแบ่งยอดลงเคสของวันนั้นเพื่อคิดต้นทุนต่อเคส (ยอดรวมไม่เปลี่ยน)',
    examples,
    who: WHO_COMPENSATION,
    when: WHEN_PLAN,
  }
}

export function hotelCapHelp(maxPerNightSatang: number | null): SettingHelpContent {
  const nights = 2
  const examples: SettingHelpExample[] = []
  if (maxPerNightSatang !== null) {
    const cap = hotelClaimCapSatang(maxPerNightSatang, nights)
    const claim = cap === null ? null : cap + 10_000
    examples.push({
      title: `พัก ${nights} คืน · เพดาน ${money(maxPerNightSatang)}/คืน`,
      lines: [
        line(`เบิกได้ไม่เกิน (${nights} คืน × ${money(maxPerNightSatang)})`, cap === null ? 'ไม่จำกัด' : money(cap), true),
        ...(claim === null
          ? []
          : [line(`ถ้าเบิก ${money(claim)}`, hotelCapExceededMessage({ amountSatang: claim, maxPerNightSatang, nights }))]),
      ],
      note: 'พักร่วมห้องคิดเพดานต่อห้อง ไม่ใช่ต่อคน',
    })
  }
  return {
    title: 'เพดานค่าที่พักต่อคืน',
    what: 'ยอดสูงสุดที่ทีมงานเบิกค่าที่พักได้ต่อคืน ใช้เพดานของแผน ณ วันที่เข้าพัก เกินเพดานส่งใบเบิกไม่ได้ · เว้นว่าง = ไม่จำกัด',
    examples,
    who: WHO_COMPENSATION,
    when: WHEN_PLAN,
  }
}

export function commissionHelp(commission: number | null, noSuccessFee: number | null): SettingHelpContent {
  const examples: SettingHelpExample[] = []
  if (commission !== null && noSuccessFee !== null) {
    const plan = { commissionSatang: commission, noSuccessFeeSatang: noSuccessFee }
    const success = commissionSatang('closed_success', plan)
    const fail = commissionSatang('closed_fail', plan)
    examples.push({
      title: 'ต่อเคสตามผลการปิดงาน',
      lines: [
        line('ปิดสำเร็จ → คอมมิชชั่น', success.expenseType === null ? 'ไม่มีรายการ' : money(success.grossSatang)),
        line('ปิดไม่สำเร็จ → เบี้ยเสี่ยง', fail.expenseType === null ? 'ไม่มีรายการ' : money(fail.grossSatang)),
      ],
      note: 'เคสหนึ่งได้อย่างใดอย่างหนึ่งเท่านั้น · คอมมิชชั่นรอคลังยืนยันรับทรัพย์ก่อนเข้าคิวอนุมัติ',
    })
  }
  return {
    title: 'คอมมิชชั่นและเบี้ยเสี่ยง',
    what: 'ค่าตอบแทนตายตัวต่อเคส (ไม่ใช่เปอร์เซ็นต์ของหนี้) ระบบสร้างรายการเบิกให้ตอนปิดงาน · ยอด 0 ไม่สร้างรายการ',
    examples,
    who: WHO_COMPENSATION,
    when: WHEN_PLAN,
  }
}

/** มูลหนี้/มูลค่าทรัพย์ตัวอย่างของเคส (สตางค์) */
export const SAMPLE_DEBT_SATANG = 5_000_000
export const SAMPLE_ASSET_VALUE_SATANG = 3_000_000

const MODEL_EFFECT: Readonly<Record<ServiceFeeModel, string>> = {
  SUCCESS_FEE: 'คิดเป็น % ของฐาน (มูลหนี้หรือมูลค่าทรัพย์) เฉพาะเคสสำเร็จ — ไม่สำเร็จได้ 0',
  FLAT: 'ค่าคงที่ต่อเคส — เลือกได้ว่าเคสไม่สำเร็จคิดเงินด้วยหรือไม่',
  HYBRID: 'ค่าคงที่ + % ของฐาน (ส่วน % ได้เฉพาะเคสสำเร็จ)',
}

export function serviceFeeHelp(input: {
  model: ServiceFeeModel
  baseSatang: number | null
  ratePct: number | null
  basis: ServiceFeeBasis
  chargeOnFail: boolean
}): SettingHelpContent {
  const examples: SettingHelpExample[] = []
  const usesBase = input.model !== 'SUCCESS_FEE'
  const usesRate = input.model !== 'FLAT'
  const ready = (!usesBase || input.baseSatang !== null) && (!usesRate || input.ratePct !== null)
  if (ready) {
    const snapshot = {
      model: input.model,
      baseSatang: usesBase ? (input.baseSatang ?? 0) : 0,
      ratePct: usesRate ? (input.ratePct ?? 0) : 0,
      basis: usesRate ? input.basis : null,
      chargeOnFail: usesBase && input.chargeOnFail,
    }
    const values = { debtAmountSatang: SAMPLE_DEBT_SATANG, assetValueSatang: SAMPLE_ASSET_VALUE_SATANG }
    const success = calculateServiceFeeRevenue(snapshot, 'closed_success', values)
    const fail = calculateServiceFeeRevenue(snapshot, 'closed_fail', values)
    examples.push({
      title: `เคสมูลหนี้ ${money(SAMPLE_DEBT_SATANG)} · มูลค่าทรัพย์ ${money(SAMPLE_ASSET_VALUE_SATANG)}${usesRate ? ` · อัตรา ${pct(snapshot.ratePct)}` : ''}`,
      lines: [
        line('ปิดสำเร็จ → ค่าบริการ (ก่อน VAT)', money(success.grossSatang ?? 0), true),
        line('ปิดไม่สำเร็จ → ค่าบริการ (ก่อน VAT)', money(fail.grossSatang ?? 0)),
      ],
      note: 'VAT คิดเพิ่มตามรูปแบบราคาของบริษัทไฟแนนซ์',
    })
  }
  return {
    title: 'เทมเพลตค่าบริการคิดรายได้อย่างไร',
    what: 'สูตรรายได้ที่เรียกเก็บจากบริษัทไฟแนนซ์ต่อเคส ผูกกับบริษัทไฟแนนซ์ และถูกบันทึกลงเคสตอนรับเคส (อนุมัติเคส)',
    options: (['SUCCESS_FEE', 'FLAT', 'HYBRID'] as const).map((model) => ({
      label: `${model === input.model ? '▸ ' : ''}${SERVICE_FEE_MODEL_LABEL[model]}`,
      effect: MODEL_EFFECT[model],
    })),
    examples,
    who: WHO_SUPERADMIN_ONLY,
    when: 'มีผลกับเคสที่อนุมัติหลังบันทึก — เคสที่อนุมัติแล้วใช้ค่าที่บันทึกไว้ในเคสเสมอ',
  }
}
