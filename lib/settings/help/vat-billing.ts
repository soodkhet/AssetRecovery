import { calculateVat } from '@/lib/finance/vat-calc'
import { estimateCustomerWhtForBilling } from '@/lib/finance/wht-calc'
import { fmtDate } from '@/lib/format/datetime'
import type { CutoffRuleType, DueRuleType, VatMode } from '@/lib/generated/prisma/enums'
import {
  describeCutoffRule,
  describeDueRule,
  isDueRuleShapeValid,
  resolveDueDate,
  suggestCutoffDate,
} from '@/lib/settings/cycles'
import {
  SAMPLE_SERVICE_FEE_SATANG,
  WHO_SETTINGS,
  WHO_SUPERADMIN_ONLY,
  line,
  money,
  pct,
} from '@/lib/settings/help/common'
import type { SettingHelpContent, SettingHelpExample, SettingHelpTable } from '@/lib/settings/help/types'

/**
 * คำอธิบายค่าตั้ง VAT / การวางบิล / รายได้ (U108) — อัตรา VAT · โหมด VAT ของบริษัทไฟแนนซ์ · ภาษีที่ลูกค้าหัก ·
 * สาขา · รอบวางบิล/เครดิตเทอม · รอบบิล/รอบจ่าย — ตัวเลขจาก `calculateVat()` / `estimateCustomerWhtForBilling()` /
 * `resolveDueDate()` (สูตรเดียวกับการสร้างรายได้/รอบวางบิลจริง)
 */

export const VAT_MODES: readonly VatMode[] = ['include_vat', 'exclude_vat', 'no_vat']

export const VAT_MODE_HELP_LABEL: Readonly<Record<VatMode, string>> = {
  include_vat: 'ราคารวม VAT แล้ว',
  exclude_vat: 'ราคายังไม่รวม VAT (บวกเพิ่ม)',
  no_vat: 'ไม่คิด VAT',
}

const VAT_MODE_EFFECT: Readonly<Record<VatMode, string>> = {
  include_vat: 'ค่าบริการที่ตกลงคือยอดที่เรียกเก็บจริง ระบบถอด VAT ออกมาแสดงแยก',
  exclude_vat: 'ระบบบวก VAT เพิ่มจากค่าบริการ ลูกค้าจ่ายมากกว่าค่าบริการ',
  no_vat: 'ไม่มี VAT ยอดเรียกเก็บเท่ากับค่าบริการ',
}

/** ตาราง 3 โหมด ของค่าบริการตัวอย่าง — `ratePct = null` แสดงได้เฉพาะ no_vat */
export function vatModeTable(ratePct: number | null, amountSatang = SAMPLE_SERVICE_FEE_SATANG): SettingHelpTable {
  return {
    headers: ['รูปแบบ', 'ยอดก่อน VAT', 'VAT', 'ยอดเรียกเก็บรวม'],
    rows: VAT_MODES.map((vatMode) => {
      if (vatMode !== 'no_vat' && ratePct === null) return [VAT_MODE_HELP_LABEL[vatMode], '—', '—', '—']
      const result = calculateVat({ amountSatang, vatMode, vatRatePct: ratePct })
      return [VAT_MODE_HELP_LABEL[vatMode], money(result.grossSatang), money(result.vatSatang), money(result.totalSatang)]
    }),
  }
}

export function vatRateHelp(ratePct: number | null): SettingHelpContent {
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'vat_rounding',
    title: 'อัตรา VAT ใช้ทำอะไร',
    what:
      'อัตราภาษีมูลค่าเพิ่มที่ใช้คิดรายได้ค่าบริการและใบกำกับภาษี ระบบเลือกอัตราตามวันที่เกิดรายได้ จึงต้องตั้งช่วงวันที่ไม่ทับกัน เมื่อรัฐเปลี่ยนอัตราให้เพิ่มช่วงใหม่ ไม่แก้ช่วงเดิม',
    table: vatModeTable(ratePct),
    examples: [
      {
        title:
          ratePct === null
            ? `ค่าบริการ ${money(SAMPLE_SERVICE_FEE_SATANG)} — กรอกอัตราเพื่อดูตัวอย่าง`
            : `ค่าบริการ ${money(SAMPLE_SERVICE_FEE_SATANG)} ที่อัตรา ${pct(ratePct)} ตามรูปแบบราคาของบริษัทไฟแนนซ์`,
        lines: [],
        note: 'ถ้าวันที่ของรายได้ไม่มีอัตราครอบคลุม ระบบจะไม่สร้างรายได้และแจ้งให้ตั้งอัตราก่อน (ไม่เดาอัตราให้)',
      },
    ],
    who: WHO_SUPERADMIN_ONLY,
    when: 'ตามช่วงวันที่มีผล — รายได้ที่สร้างไปแล้วเก็บอัตราที่ใช้ไว้ในรายการ ไม่คิดใหม่ย้อนหลัง',
  }
}

export function companyVatModeHelp(vatMode: VatMode, ratePct: number | null): SettingHelpContent {
  return {
    title: 'รูปแบบราคา/VAT ของบริษัทนี้',
    what: 'บอกว่าค่าบริการที่ตกลงกับบริษัทไฟแนนซ์รวม VAT แล้วหรือยัง ใช้คิดยอดเรียกเก็บและใบกำกับภาษีของบริษัทนี้',
    options: VAT_MODES.map((mode) => ({
      label: `${mode === vatMode ? '▸ ' : ''}${VAT_MODE_HELP_LABEL[mode]}`,
      effect: VAT_MODE_EFFECT[mode],
    })),
    table: vatModeTable(ratePct),
    examples: [
      {
        title:
          ratePct === null
            ? 'ยังไม่มีอัตรา VAT ที่มีผลวันนี้ — ตั้งที่แท็บอัตรา VAT'
            : `ค่าบริการ ${money(SAMPLE_SERVICE_FEE_SATANG)} ที่อัตรา VAT ปัจจุบัน ${pct(ratePct)}`,
        lines: [],
      },
    ],
    who: WHO_SUPERADMIN_ONLY,
    when: 'มีผลกับรายได้ที่สร้างหลังบันทึก — รายได้เดิมเก็บรูปแบบ VAT ที่ใช้ไว้แล้ว',
  }
}

export function customerWhtHelp(input: {
  whtPct: number | null
  vatMode: VatMode
  vatRatePct: number | null
}): SettingHelpContent {
  const examples: SettingHelpExample[] = []
  if (input.vatMode === 'no_vat' || input.vatRatePct !== null) {
    const vat = calculateVat({
      amountSatang: SAMPLE_SERVICE_FEE_SATANG,
      vatMode: input.vatMode,
      vatRatePct: input.vatMode === 'no_vat' ? null : input.vatRatePct,
    })
    const estimate = estimateCustomerWhtForBilling({
      amountBeforeVatSatang: vat.grossSatang,
      totalSatang: vat.totalSatang,
      recordedWhtSatang: 0,
      whtPct: input.whtPct,
    })
    examples.push({
      title: `บิลค่าบริการ ${money(SAMPLE_SERVICE_FEE_SATANG)} (${VAT_MODE_HELP_LABEL[input.vatMode]}) · ลูกค้าหัก ${input.whtPct === null ? 'ไม่หัก' : pct(input.whtPct)}`,
      lines: [
        line('ยอดเรียกเก็บรวม', money(vat.totalSatang)),
        line('ภาษีที่ลูกค้าหัก (คิดจากยอดก่อน VAT)', money(estimate.whtSatang)),
        line('ยอดที่คาดว่าจะได้รับโอน', money(estimate.expectedReceiptSatang), true),
      ],
      note: 'ภาษีที่ถูกหักเป็นเครดิตภาษีของบริษัท ต้องขอหนังสือรับรอง 50 ทวิ จากลูกค้าเก็บไว้',
    })
  }
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'customer_wht',
    title: 'ลูกค้าหักภาษี ณ ที่จ่ายคืออะไร',
    what:
      'บริษัทไฟแนนซ์บางรายหักภาษี ณ ที่จ่ายจากค่าบริการก่อนโอนเงินให้เรา ระบบใช้อัตรานี้ประมาณยอดที่จะได้รับจริง เพื่อจับคู่เงินเข้ากับบิลได้ถูกต้อง',
    options: [
      { label: 'กรอกอัตรา (เช่น 3)', effect: 'แสดงภาษีที่คาดว่าจะถูกหักและยอดคาดรับบนรอบวางบิล' },
      { label: 'เว้นว่าง', effect: 'ลูกค้าโอนเต็มยอด' },
    ],
    examples,
    who: WHO_SUPERADMIN_ONLY,
    when: 'มีผลทันทีกับการประมาณยอดของรอบวางบิล — ยอดหักจริงบันทึกตอนจับคู่เงินรับ',
  }
}

export function companyBranchHelp(): SettingHelpContent {
  return {
    title: 'สำนักงานใหญ่/สาขา ใช้ทำอะไร',
    what:
      'ใบกำกับภาษีต้องระบุสถานประกอบการของผู้ซื้อ — สำนักงานใหญ่ หรือเลขที่สาขา 5 หลักตามที่บริษัทจดทะเบียนกับกรมสรรพากร พิมพ์ต่อจากเลขประจำตัวผู้เสียภาษี',
    options: [
      { label: 'สำนักงานใหญ่', effect: 'พิมพ์ "สำนักงานใหญ่" บนใบกำกับภาษี' },
      { label: 'สาขา', effect: 'พิมพ์ "สาขาที่ 00001" ตามเลขที่กรอก — ต้องตรงกับที่ลูกค้าแจ้ง ไม่งั้นลูกค้าใช้ใบกำกับขอคืนภาษีไม่ได้' },
    ],
    who: WHO_SUPERADMIN_ONLY,
    when: 'มีผลกับเอกสารที่ออกหลังบันทึก — ใบที่ออกแล้วไม่เปลี่ยน',
  }
}

/** วันตัดรอบบิลของเดือนตัวอย่าง (ต.ค. 2569) — วันเกินจำนวนวันในเดือนใช้วันสุดท้าย */
function sampleCutoffDate(day: number): Date {
  const lastDay = new Date(Date.UTC(2026, 10, 0)).getUTCDate()
  return new Date(Date.UTC(2026, 9, Math.min(Math.max(day, 1), lastDay)))
}

/** รอบบิลที่บริษัทใช้ (มติ PO U146) — รูปที่กล่องคำอธิบายของหน้าบริษัทต้องการ */
export interface CompanyBillingCycleSample {
  name: string
  cutoffRuleType: CutoffRuleType
  cutoffDates: number[]
  dueRuleType: DueRuleType
  dueRuleValue: number | null
}

/**
 * มติ PO U146 — วันตัดรอบ + เครดิตเทอมมาจาก**รอบบิลที่บริษัทใช้**ที่เดียว (หน้าบริษัทเลือกรอบ ไม่กรอกตัวเลขเอง)
 * ตัวอย่างใช้สูตรเดียวกับตอนสร้างรอบวางบิลจริง (`suggestCutoffDate` + `resolveDueDate`)
 */
export function companyBillingHelp(cycle: CompanyBillingCycleSample | null): SettingHelpContent {
  const examples: SettingHelpExample[] = []
  if (cycle !== null) {
    // วันที่ตัวอย่าง: สิ้นเดือน ต.ค. 2569 ⇒ วันตัดรอบล่าสุดของเดือนนั้น
    const cutoff = suggestCutoffDate(cycle, new Date(Date.UTC(2026, 9, 31)))
    const due = resolveDueDate(cutoff, cycle)
    examples.push({
      title: `${cycle.name} — ${describeCutoffRule(cycle)} · ${describeDueRule(cycle)}`,
      lines: [line('วันตัดรอบ (เดือนตัวอย่าง)', fmtDate(cutoff)), line('ครบกำหนดชำระ', fmtDate(due), true)],
    })
  }
  return {
    title: 'รอบบิลที่ใช้',
    what:
      'รอบบิลกำหนดวันตัดรอบและเครดิตเทอมของบริษัทนี้ — ใช้เสนอวันตัดรอบและคิดวันครบกำหนดชำระตอนสร้างรอบวางบิล และนับอายุหนี้ค้างชำระ · แก้กติกาของรอบได้ที่ ตั้งค่า → รอบบิล/รอบจ่าย',
    options: [
      { label: 'รอบที่ใช้กับบริษัทไฟแนนซ์ทุกราย', effect: 'บริษัทนี้ใช้รอบนั้นโดยอัตโนมัติ (เปลี่ยนรายบริษัทไม่ได้จนกว่าจะแก้ขอบเขตของรอบ)' },
      { label: 'รอบที่เลือกรายบริษัท', effect: 'บริษัทนี้ถูกเพิ่มเข้ารายชื่อของรอบนั้น และออกจากรอบรายบริษัทเดิม' },
      { label: 'ยังไม่เลือก', effect: 'สร้างรอบวางบิลของบริษัทนี้ไม่ได้จนกว่าจะเลือกรอบบิล' },
    ],
    examples,
    who: WHO_SUPERADMIN_ONLY,
    when: 'มีผลกับรอบวางบิลที่สร้างหลังบันทึก — รอบวางบิลเดิมคงวันครบกำหนดเดิม',
  }
}

export function cycleDueHelp(input: {
  dueRuleType: DueRuleType
  dueRuleValue: number | null
  cutoffDay: number | null
}): SettingHelpContent {
  const cutoff = sampleCutoffDate(input.cutoffDay ?? 31)
  const valid = isDueRuleShapeValid(input)
  return {
    title: 'รอบบิล/รอบจ่ายใช้ทำอะไร',
    what:
      'กำหนดวันตัดยอดเพื่อรวมรายการเข้ารอบ และวันครบกำหนดชำระ — รอบบิล (AR) ใช้กับการวางบิลบริษัทไฟแนนซ์ · รอบจ่าย (AP) ใช้กับการจ่ายทีมงาน',
    options: [
      { label: 'Net N วัน', effect: 'ครบกำหนด = วันตัดรอบ + N วัน' },
      { label: 'วันที่ N ของเดือนถัดไป', effect: 'ครบกำหนดวันที่ N ของเดือนถัดจากวันตัดรอบ (เดือนสั้นใช้วันสุดท้าย)' },
      { label: 'สิ้นเดือน', effect: 'ครบกำหนดวันสุดท้ายของเดือนที่ตัดรอบ' },
    ],
    examples: valid
      ? [
          {
            title: `ตัดรอบ ${fmtDate(cutoff)} · ${describeDueRule(input)}`,
            lines: [line('ครบกำหนดชำระ', fmtDate(resolveDueDate(cutoff, input)), true)],
          },
        ]
      : [],
    who: WHO_SETTINGS,
    when: 'มีผลกับรอบที่สร้างหลังบันทึกและงวดที่ยังไม่ปิด — งวดที่ปิดแล้วไม่เปลี่ยน',
  }
}
