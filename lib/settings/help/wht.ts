import type { PeriodKey } from '@/lib/accounting/period'
import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import {
  calculatePayeeBatchWht,
  calculateWht,
  calculateWhtForPayee,
  whtGrossUp,
  type PayeeTaxProfileValues,
} from '@/lib/finance/wht-calc'
import type { ExpenseType, PayeeType, WhtCondition } from '@/lib/generated/prisma/enums'
import { WHT_CONDITION_LABEL, WHT_CONDITIONS } from '@/lib/payees/payee'
import {
  SAMPLE_ABOVE_THRESHOLD_SATANG,
  SAMPLE_BELOW_THRESHOLD_SATANG,
  SAMPLE_HOTEL_SATANG,
  SAMPLE_INCOME_SATANG,
  WHO_PAYEE,
  WHO_COMPENSATION,
  WHO_SUPERADMIN_EXECUTIVE,
  WHO_SUPERADMIN_ONLY,
  line,
  money,
  pct,
} from '@/lib/settings/help/common'
import type { SettingHelpContent, SettingHelpExample } from '@/lib/settings/help/types'
import {
  TAX_PROFILE_DEFAULT_SLOTS,
  TAX_PROFILE_DEFAULT_SLOT_LABEL,
  type TaxProfileDefaults,
} from '@/lib/settings/tax-profile-defaults'
import {
  DEFAULT_WHT_MIN_THRESHOLD_SATANG,
  DEFAULT_WHT_PCT,
  type WhtBasis,
} from '@/lib/settings/tax-profile'
import {
  WHT_CERTIFICATE_MODES,
  WHT_CERTIFICATE_MODE_LABEL,
  WHT_FILING_METHODS,
  WHT_FILING_METHOD_LABEL,
  WHT_INCOME_CATEGORY_LABEL,
  isInWhtBase,
  resolveIncomeCategory,
  usesPerPayeeWhtRate,
  type WhtCertificateMode,
  type WhtFilingMethod,
  type WhtIncomeCategory,
  type WhtIncomeTypeMode,
} from '@/lib/settings/wht-policy'
import {
  filingDueDateOf,
  filingDueDateText,
  filingFormOf,
  filingNominalDueDateOf,
  groupCertificateSources,
  shouldIssueZeroRate402Certificate,
  WHT_FILING_FORM_SHORT_LABEL,
} from '@/lib/wht/wht'

/**
 * คำอธิบายค่าตั้งภาษีหัก ณ ที่จ่าย (U108) — ค่าตั้งภาษีขององค์กร · Tax Profile · ผู้รับเงิน · แผนค่าตอบแทน
 * ตัวเลขทุกตัวคำนวณจาก `lib/finance/wht-calc.ts` / `lib/wht/wht.ts` (สูตรเดียวกับรอบจ่ายจริง)
 */

const DEFAULT_PROFILE: PayeeTaxProfileValues = {
  whtPct: DEFAULT_WHT_PCT,
  whtBasis: 'before_vat',
  whtMinThresholdSatang: DEFAULT_WHT_MIN_THRESHOLD_SATANG,
}

const WHEN_WHT_POLICY =
  'ตามวันที่มีผลที่เลือก — ใช้กับรอบจ่ายที่สร้างตั้งแต่วันนั้น รอบจ่ายที่สร้างไปแล้วใช้ค่าเดิมที่บันทึกไว้กับรอบเสมอ'

/** ตัวอย่างงวดที่ใช้อธิบายกำหนดยื่น — งวด ต.ค. 2569 */
export const SAMPLE_FILING_PERIOD: PeriodKey = { yearBe: 2569, month: 10 }

// ── ค่าตั้งภาษีหัก ณ ที่จ่ายขององค์กร ─────────────────────────────────────────

/** ฐาน WHT — ชนิดรายการที่นำมาคิดภาษี */
export function whtBaseHelp(baseExpenseTypes: readonly ExpenseType[]): SettingHelpContent {
  const policy = { baseExpenseTypes }
  const items: { type: ExpenseType; grossSatang: number }[] = [
    { type: 'commission', grossSatang: SAMPLE_INCOME_SATANG },
    { type: 'hotel', grossSatang: SAMPLE_HOTEL_SATANG },
  ]
  const result = calculatePayeeBatchWht(
    items.map((item) => ({
      grossSatang: item.grossSatang,
      source: { payeeTaxProfile: DEFAULT_PROFILE, planWhtPct: null },
      includedInBase: isInWhtBase(policy, item.type),
    })),
  )
  const net = result.lines.reduce((sum, each) => sum + each.netSatang, 0)
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'wht_base',
    title: 'ฐานภาษีหัก ณ ที่จ่ายคืออะไร',
    what:
      'เลือกว่ารายการจ่ายชนิดไหนถือเป็น "เงินได้" ของผู้รับ ต้องนำมาคิดภาษีหัก ณ ที่จ่าย ส่วนชนิดที่ไม่ติ๊กยังจ่ายเต็มตามปกติ แต่ไม่ถูกหักภาษีและไม่นับรวมเพื่อเทียบเกณฑ์ขั้นต่ำ',
    options: [
      { label: 'ติ๊ก (รวมในฐาน)', effect: 'นำยอดไปรวมกับรายการอื่นของผู้รับในรอบจ่าย แล้วหักภาษีตามอัตราของผู้รับ' },
      {
        label: 'ไม่ติ๊ก (ไม่รวม)',
        effect: 'จ่ายเต็มจำนวน ไม่หักภาษี — เหมาะกับค่าใช้จ่ายที่เบิกคืนตามใบเสร็จในนามบริษัท เช่น ค่าที่พัก',
      },
    ],
    examples: [
      {
        title: `ผู้รับ 1 คนในรอบจ่าย (อัตรา ${pct(DEFAULT_WHT_PCT)})`,
        lines: [
          ...items.map((item, index) =>
            line(
              `${EXPENSE_TYPE_LABEL[item.type]} ${money(item.grossSatang)}`,
              result.lines[index]!.includedInBase ? 'รวมในฐาน' : 'ไม่รวมในฐาน',
            ),
          ),
          line('ฐานภาษี', money(result.totalBaseSatang)),
          line('ภาษีที่หัก', money(result.totalWhtSatang)),
          line('ผู้รับได้รับ', money(net), true),
        ],
      },
    ],
    who: WHO_SUPERADMIN_EXECUTIVE,
    when: WHEN_WHT_POLICY,
  }
}

/** การออก 50 ทวิ ต่อรอบ/ต่อรายการ */
export function whtCertificateModeHelp(mode: WhtCertificateMode): SettingHelpContent {
  const types: ExpenseType[] = ['commission', 'fuel', 'allowance']
  const amounts = [SAMPLE_INCOME_SATANG, SAMPLE_BELOW_THRESHOLD_SATANG, SAMPLE_ABOVE_THRESHOLD_SATANG]
  const batch = calculatePayeeBatchWht(
    amounts.map((grossSatang) => ({ grossSatang, source: { payeeTaxProfile: DEFAULT_PROFILE, planWhtPct: null } })),
  )
  const sources = batch.lines.map((each, index) => ({
    id: `item-${index}`,
    payeeId: 'payee-a',
    grossSatang: amounts[index]!,
    whtSatang: each.whtSatang,
    whtBaseIncluded: true,
  }))
  const countOf = (each: WhtCertificateMode): number => groupCertificateSources(sources, each).length
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'wht_certificate_mode',
    title: 'ออกหนังสือรับรอง 50 ทวิ แบบไหน',
    what: 'กำหนดว่าระบบออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ให้ผู้รับเป็นกี่ใบ ยอดภาษีรวมเท่ากันทุกแบบ ต่างกันแค่จำนวนใบ',
    options: WHT_CERTIFICATE_MODES.map((each) => ({
      label: WHT_CERTIFICATE_MODE_LABEL[each],
      effect:
        each === 'per_payee_batch'
          ? 'ผู้รับได้ใบเดียวต่อการจ่ายหนึ่งครั้ง ตรงหลักการออกใบตามการจ่ายเงินแต่ละครั้ง (แนะนำ)'
          : 'ทุกรายการที่ถูกหักภาษีได้ใบของตัวเอง — จำนวนใบมากขึ้น',
    })),
    examples: [
      {
        title: `ผู้รับ 1 คน มี ${types.length} รายการในรอบจ่าย (${types.map((type, index) => `${EXPENSE_TYPE_LABEL[type]} ${money(amounts[index]!)}`).join(' · ')})`,
        lines: [
          ...WHT_CERTIFICATE_MODES.map((each) =>
            line(
              `${each === mode ? '▸ ' : ''}${each === 'per_payee_batch' ? 'ต่อผู้รับต่อรอบจ่าย' : 'ต่อรายการ'}`,
              `${countOf(each)} ใบ`,
              each === mode,
            ),
          ),
          line('ภาษีรวมบนใบทั้งหมด', money(batch.totalWhtSatang)),
        ],
      },
    ],
    who: WHO_SUPERADMIN_EXECUTIVE,
    when: WHEN_WHT_POLICY,
  }
}

function rateSourceText(category: WhtIncomeCategory): string {
  return usesPerPayeeWhtRate(category)
    ? 'อัตราต่อคนที่กรอกในข้อมูลผู้รับ (ไม่มีเกณฑ์ขั้นต่ำ)'
    : `อัตราตาม Tax Profile ของผู้รับ + เกณฑ์ขั้นต่ำ ${money(DEFAULT_WHT_MIN_THRESHOLD_SATANG)}`
}

/** โหมดประเภทเงินได้ + การจับคู่ Inhouse/Outsource */
export function whtIncomeTypeHelp(values: {
  incomeTypeMode: WhtIncomeTypeMode
  inhouseIncomeCategory: WhtIncomeCategory
  outsourceIncomeCategory: WhtIncomeCategory
}): SettingHelpContent {
  const people: { label: string; side: 'inhouse' | 'outsource'; payeeType: PayeeType }[] = [
    { label: 'พนักงานทีม Inhouse (บุคคลธรรมดา)', side: 'inhouse', payeeType: 'individual' },
    { label: 'ทีม Outsource (บุคคลธรรมดา)', side: 'outsource', payeeType: 'individual' },
    { label: 'ทีม Outsource (นิติบุคคล)', side: 'outsource', payeeType: 'corporate' },
  ]
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'wht_income_type',
    title: 'ประเภทเงินได้มีผลอย่างไร',
    what:
      'ประเภทเงินได้ตามประมวลรัษฎากรเป็นตัวกำหนดว่าใช้อัตราหักจากไหน และยื่นแบบ ภ.ง.ด. ใด — 40(1) เงินเดือน/ค่าจ้าง · 40(2) ค่าธรรมเนียม/ค่านายหน้า · 40(8) ค่าจ้างทำของ/รับจ้างอิสระ · ควรตั้งตามคำแนะนำของสำนักงานบัญชีและสัญญาจ้างจริง',
    options: [
      { label: 'มาตรา 40(8) ทั้งหมด', effect: 'ทุกคนหักตาม Tax Profile (เช่น 3%) ไม่หักเมื่อยอดต่อรอบต่ำกว่าเกณฑ์ ยื่น ภ.ง.ด.3/53' },
      { label: 'มาตรา 40(2) ทั้งหมด', effect: 'บุคคลธรรมดาทุกคนหักตามอัตราต่อคนที่สำนักงานบัญชีคำนวณให้ ยื่น ภ.ง.ด.1' },
      { label: 'แยกตามประเภททีม', effect: 'เลือกประเภทเงินได้ของทีม Inhouse และ Outsource แยกกัน' },
      { label: 'นิติบุคคล', effect: 'ไม่มีเงินได้ 40(1)/40(2) — หักตาม Tax Profile และยื่น ภ.ง.ด.53 เสมอ ไม่ว่าเลือกโหมดใด' },
    ],
    examples: [
      {
        title: 'ผลกับผู้รับแต่ละแบบตามค่าที่เลือก',
        lines: people.map((person) => {
          const category = resolveIncomeCategory(values, person.side, person.payeeType)
          const form = filingFormOf({ taxProfileFilingForm: null, payeeType: person.payeeType, incomeCategory: category })
          return line(
            person.label,
            `${WHT_INCOME_CATEGORY_LABEL[category]} · ${WHT_FILING_FORM_SHORT_LABEL[form]} · ${rateSourceText(category)}`,
          )
        }),
      },
    ],
    who: WHO_SUPERADMIN_EXECUTIVE,
    when: `${WHEN_WHT_POLICY} · ใช้ทีมของผู้รับ ณ วันสร้างรอบจ่าย`,
  }
}

/** ใบ 50 ทวิ อัตรา 0% ของ 40(1)/40(2) */
export function whtZeroRateHelp(issue: boolean): SettingHelpContent {
  const batch = calculatePayeeBatchWht(
    [{ grossSatang: SAMPLE_INCOME_SATANG, source: { payeeTaxProfile: DEFAULT_PROFILE, planWhtPct: null } }],
    { incomeCategory: 'sec_40_2', section402Pct: 0 },
  )
  const issued = (value: boolean): boolean =>
    shouldIssueZeroRate402Certificate({
      issueZeroRate402Certificate: value,
      incomeCategory: 'sec_40_2',
      whtSatang: batch.totalWhtSatang,
      grossSatang: SAMPLE_INCOME_SATANG,
    })
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'wht_zero_rate_certificate',
    title: 'ใบ 50 ทวิ ยอดภาษี 0 คืออะไร',
    what:
      'ผู้รับเงินได้ 40(1)/40(2) ที่สำนักงานบัญชีคำนวณแล้วอัตราหักเป็น 0% ไม่ถูกหักภาษี แต่ยังควรได้หนังสือรับรองแสดงเงินได้ไว้ยื่นภาษีประจำปีของตัวเอง',
    options: [
      { label: 'เปิด (ค่าเริ่มต้น)', effect: 'ออก 50 ทวิ ยอดภาษี 0 และนับรวมในสรุป ภ.ง.ด.1' },
      { label: 'ปิด', effect: 'ไม่ออกหนังสือรับรองให้ผู้ที่ภาษีเป็น 0' },
    ],
    examples: [
      {
        title: `ผู้รับเงินได้ 40(2) อัตรา ${pct(0)} ได้รับ ${money(SAMPLE_INCOME_SATANG)}`,
        lines: [
          line('ภาษีที่หัก', money(batch.totalWhtSatang)),
          line('ผลตามค่าที่เลือก', issued(issue) ? 'ออก 50 ทวิ (ภาษี 0)' : 'ไม่ออก 50 ทวิ', true),
        ],
        note: 'ไม่เกี่ยวกับเงินได้ 40(8) ที่ยอดต่ำกว่าเกณฑ์ — กรณีนั้นไม่ออกหนังสือรับรอง',
      },
    ],
    who: WHO_SUPERADMIN_EXECUTIVE,
    when: WHEN_WHT_POLICY,
  }
}

/** ตาราง (1)/(2)/(3) ของเงินได้ก้อนเดียว */
export function whtConditionTable(incomeSatang: number, whtPct: number): SettingHelpContent['table'] {
  return {
    headers: ['เงื่อนไข', 'ภาษีที่นำส่ง', 'เงินได้บนใบ 50 ทวิ', 'ผู้รับได้รับ', 'ต้นทุนบริษัท'],
    rows: WHT_CONDITIONS.map((condition) => {
      const result = whtGrossUp({ incomeSatang, whtPct, condition })
      return [
        WHT_CONDITION_LABEL[condition],
        money(result.whtSatang),
        money(result.certificateIncomeSatang),
        money(result.payeeReceivesSatang),
        money(result.companyCostSatang),
      ]
    }),
  }
}

/** อนุญาตเงื่อนไข (2)/(3) */
export function whtGrossUpHelp(allow: boolean): SettingHelpContent {
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'wht_gross_up',
    title: 'เงื่อนไขการหัก (1) (2) (3) ต่างกันอย่างไร',
    what:
      'เงื่อนไขบอกว่าใครรับภาระภาษี — (1) หัก ณ ที่จ่าย ผู้รับรับภาระเอง · (2) ออกให้ตลอดไป และ (3) ออกให้ครั้งเดียว บริษัทจ่ายภาษีแทน ผู้รับได้เงินเต็ม ภาษีที่ออกให้ถือเป็นเงินได้เพิ่มจึงพิมพ์รวมบนหนังสือรับรอง',
    options: [
      {
        label: 'ปิด (ค่าเริ่มต้น)',
        effect: 'ผู้รับเลือกได้เฉพาะ (1) — ถ้ายังมีผู้รับที่ตั้ง (2)/(3) ไว้ ระบบไม่ให้สร้างรอบจ่ายจนกว่าจะแก้',
      },
      { label: 'เปิด', effect: `ตั้ง (2)/(3) ให้ผู้รับรายคนได้ — ปัจจุบัน: ${allow ? 'เปิด' : 'ปิด'} · ควรยืนยันกับสำนักงานบัญชีก่อนเปิดใช้` },
    ],
    table: whtConditionTable(SAMPLE_INCOME_SATANG, DEFAULT_WHT_PCT),
    examples: [
      {
        title: `ตารางด้านบน: เงินได้ ${money(SAMPLE_INCOME_SATANG)} อัตรา ${pct(DEFAULT_WHT_PCT)}`,
        lines: [line('(2) คิดภาษีแบบทบยอด', 'เงินได้ × อัตรา ÷ (1 − อัตรา)')],
      },
    ],
    who: WHO_SUPERADMIN_EXECUTIVE,
    when: WHEN_WHT_POLICY,
  }
}

/** วิธียื่น ภ.ง.ด. → วันกำหนดยื่น (เลื่อนตามเสาร์-อาทิตย์/วันหยุด) */
export function filingDueExample(
  method: WhtFilingMethod | null,
  holidays: readonly string[] = [],
  period: PeriodKey = SAMPLE_FILING_PERIOD,
): SettingHelpExample {
  return {
    title: `ภาษีที่หักในงวด ${String(period.month).padStart(2, '0')}/${period.yearBe} ต้องยื่นภายใน`,
    lines: WHT_FILING_METHODS.map((each) =>
      line(
        `${each === method ? '▸ ' : ''}${each === 'online' ? 'ยื่นออนไลน์' : 'ยื่นแบบกระดาษ'}`,
        filingDueDateText(filingDueDateOf(period, each, holidays), filingNominalDueDateOf(period, each)),
        each === method,
      ),
    ),
    note: 'กำหนดยื่นที่ตรงเสาร์-อาทิตย์หรือวันหยุดในปฏิทินวันหยุดขององค์กร เลื่อนเป็นวันทำการถัดไปอัตโนมัติ',
  }
}

export function whtFilingMethodHelp(method: WhtFilingMethod, holidays: readonly string[] = []): SettingHelpContent {
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'wht_filing_method',
    title: 'วิธียื่น ภ.ง.ด. มีผลอะไร',
    what: 'ใช้คำนวณวันกำหนดยื่นแบบ ภ.ง.ด. ของแต่ละเดือนและวันแจ้งเตือนล่วงหน้า — ไม่กระทบยอดภาษี',
    options: WHT_FILING_METHODS.map((each) => ({ label: WHT_FILING_METHOD_LABEL[each], effect: each === 'online' ? 'ยื่นทางอินเทอร์เน็ต (e-Filing)' : 'ยื่นที่สำนักงานสรรพากร' })),
    examples: [filingDueExample(method, holidays)],
    who: WHO_SUPERADMIN_EXECUTIVE,
    when: 'มีผลกับกำหนดยื่นของเดือนที่ยื่นซึ่งเริ่มตั้งแต่วันที่มีผล — งวดที่เดือนยื่นเริ่มไปแล้วไม่เปลี่ยนย้อนหลัง',
  }
}

// ── Tax Profile ──────────────────────────────────────────────────────────────

export function taxProfileHelp(values: {
  whtPct: number | null
  whtBasis: WhtBasis
  thresholdSatang: number | null
}): SettingHelpContent {
  const whtPct = values.whtPct ?? DEFAULT_WHT_PCT
  const threshold = values.thresholdSatang ?? DEFAULT_WHT_MIN_THRESHOLD_SATANG
  const calc = (grossSatang: number) =>
    calculateWht({ grossSatang, whtPct, whtBasis: values.whtBasis, minThresholdSatang: threshold })
  const main = calc(SAMPLE_INCOME_SATANG)
  const below = calc(SAMPLE_BELOW_THRESHOLD_SATANG)
  const above = calc(SAMPLE_ABOVE_THRESHOLD_SATANG)
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'wht_threshold',
    title: 'กติกาภาษี (Tax Profile) ทำงานอย่างไร',
    what:
      'ชุดกติกาที่ผูกกับผู้รับเงิน ใช้คิดภาษีหัก ณ ที่จ่ายของเงินได้ 40(8) — อัตราหัก ฐานที่ใช้หัก และยอดขั้นต่ำ · อัตราของผู้รับเงินชนะอัตราของแผนค่าตอบแทนเสมอ',
    options: [
      { label: 'อัตราหัก (%)', effect: 'เปอร์เซ็นต์ที่หักจากฐาน — ปกติบุคคล/นิติบุคคลรับจ้างทำของ 3%' },
      { label: 'ฐาน: ยอดก่อน VAT (มาตรฐาน)', effect: 'คิดภาษีจากค่าบริการก่อนภาษีมูลค่าเพิ่ม' },
      { label: 'ฐาน: ยอดรวมทั้งสิ้น', effect: 'คิดจากยอดรวม VAT — ไม่ใช่วิธีปกติ ใช้เมื่อสำนักงานบัญชีสั่งเท่านั้น' },
      {
        label: 'ยอดขั้นต่ำที่ต้องหัก',
        effect: 'นับรวมทุกรายการของผู้รับคนเดียวในรอบจ่ายเดียว ถ้ารวมแล้วต่ำกว่าเกณฑ์จะไม่หักเลย',
      },
      { label: 'แบบนำส่ง', effect: 'ระบบเลือกตามชนิดผู้รับจริง — บุคคลธรรมดา ภ.ง.ด.3 · นิติบุคคล ภ.ง.ด.53 · 40(1)/40(2) ภ.ง.ด.1' },
    ],
    examples: [
      {
        title: `เงินได้ ${money(SAMPLE_INCOME_SATANG)} อัตรา ${pct(whtPct)}`,
        lines: [
          line('ฐานภาษี', money(main.baseSatang)),
          line('ภาษีที่หัก', money(main.whtSatang)),
          line('ผู้รับได้รับ', money(main.netSatang), true),
        ],
      },
      {
        title: `เกณฑ์ขั้นต่ำ ${money(threshold)} (ยอดรวมของผู้รับในรอบจ่าย)`,
        lines: [
          line(`ยอด ${money(SAMPLE_BELOW_THRESHOLD_SATANG)}`, below.belowThreshold ? 'ไม่หัก (ต่ำกว่าเกณฑ์)' : `หัก ${money(below.whtSatang)}`),
          line(`ยอด ${money(SAMPLE_ABOVE_THRESHOLD_SATANG)}`, above.belowThreshold ? 'ไม่หัก (ต่ำกว่าเกณฑ์)' : `หัก ${money(above.whtSatang)}`),
        ],
      },
    ],
    who: WHO_SUPERADMIN_ONLY,
    when: 'มีผลกับรอบจ่ายที่สร้างหลังบันทึก — รอบจ่ายที่สร้างแล้วเก็บอัตราเดิมไว้กับรายการ ไม่คิดใหม่ย้อนหลัง',
  }
}

/**
 * Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (มติ PO 06/10/2569 U121) — ตัวอย่างคิดสดจากอัตราของ profile ที่เลือกในแต่ละช่อง
 * ด้วย `calculatePayeeBatchWht()` ตัวเดียวกับรอบจ่าย
 */
export function taxProfileDefaultsHelp(
  slots: TaxProfileDefaults<{ name: string; profile: PayeeTaxProfileValues }>,
): SettingHelpContent {
  const examples: SettingHelpExample[] = []
  for (const slot of TAX_PROFILE_DEFAULT_SLOTS) {
    const chosen = slots[slot]
    if (chosen === null) continue
    const result = calculatePayeeBatchWht([
      {
        grossSatang: SAMPLE_INCOME_SATANG,
        source: { payeeTaxProfile: null, typeDefaultTaxProfile: chosen.profile, planWhtPct: null },
      },
    ])
    examples.push({
      title: `${TAX_PROFILE_DEFAULT_SLOT_LABEL[slot]} ที่ยังไม่ผูก Tax Profile ได้รับ ${money(SAMPLE_INCOME_SATANG)}`,
      lines: [
        line(`ใช้ "${chosen.name}" ${pct(chosen.profile.whtPct)}`, `หัก ${money(result.totalWhtSatang)}`),
        line('ผู้รับได้รับ', money(result.lines[0]!.netSatang), true),
      ],
    })
  }
  if (examples.length === 0) {
    examples.push({
      title: 'ยังไม่ได้ตั้งค่าเริ่มต้นช่องใดเลย',
      lines: [
        line('ผู้รับที่ไม่ได้ผูก Tax Profile', 'ใช้อัตราจากแผนค่าตอบแทนพร้อมคำเตือน'),
        line('รายการที่ไม่มีแผน (เบิกเอง/ค่าที่พัก) และอยู่ในฐานภาษี', 'สร้างรอบจ่ายไม่ได้จนกว่าจะกำหนดอัตรา', true),
      ],
    })
  }
  return {
    title: 'Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ ทำงานอย่างไร',
    what:
      'กำหนดกติกาภาษีให้ผู้รับที่ยังไม่ได้ผูก Tax Profile รายคน แยกตามทีม (Inhouse/Outsource) และชนิดผู้รับ (บุคคลธรรมดา/นิติบุคคล) — การตั้งรายคนในข้อมูลผู้รับเงินเป็นข้อยกเว้นที่ชนะค่าเริ่มต้นเสมอ',
    options: [
      { label: '1. Tax Profile รายคน', effect: 'ผูกไว้ในข้อมูลผู้รับเงิน — ใช้ก่อนเสมอ' },
      { label: '2. ค่าเริ่มต้นตามประเภทผู้รับ', effect: 'ใช้เมื่อผู้รับไม่ได้ผูกรายคน (ไม่มีคำเตือน)' },
      { label: '3. อัตราของแผนค่าตอบแทน', effect: 'ใช้ชั่วคราวเมื่อไม่มีทั้งสองข้อแรก พร้อมคำเตือนให้ผูก Tax Profile' },
      {
        label: 'ไม่มีอัตราเลย',
        effect: 'คิวอนุมัติแสดงคำเตือนที่รายการ และสร้างรอบจ่ายไม่ได้จนกว่าจะกำหนดอัตรา — ระบบไม่เดาอัตรา',
      },
      {
        label: 'ช่องว่าง',
        effect: 'ไม่มีค่าเริ่มต้นสำหรับประเภทนั้น · เงินได้ 40(1)/40(2) ยังใช้อัตราต่อคนในข้อมูลผู้รับเงินเหมือนเดิม',
      },
    ],
    examples,
    who: WHO_SUPERADMIN_ONLY,
    when: 'มีผลทันทีกับคิวอนุมัติและรอบจ่ายที่สร้างหลังบันทึก — รอบจ่ายที่สร้างแล้วเก็บ Tax Profile ที่ใช้จริงไว้กับรายการ ไม่คิดใหม่ย้อนหลัง',
  }
}

// ── ผู้รับเงิน ───────────────────────────────────────────────────────────────

export function payeeTaxProfileHelp(profile: PayeeTaxProfileValues | null): SettingHelpContent {
  const examples: SettingHelpExample[] = []
  const result =
    profile === null
      ? null
      : calculateWhtForPayee({
          grossSatang: SAMPLE_INCOME_SATANG,
          source: { payeeTaxProfile: profile, planWhtPct: null },
        })
  if (profile !== null && result !== null) {
    examples.push({
      title: `ได้รับ ${money(SAMPLE_INCOME_SATANG)} ในรอบจ่าย (Tax Profile ที่เลือก ${pct(profile.whtPct)})`,
      lines: [
        line('ภาษีที่หัก', money(result.whtSatang)),
        line('ผู้รับได้รับ', money(result.netSatang), true),
      ],
    })
  }
  return {
    title: 'กติกาภาษีของผู้รับรายนี้',
    what: 'ผูกผู้รับกับกติกาภาษี (Tax Profile) เพื่อกำหนดอัตราหัก ณ ที่จ่ายของเงินได้ 40(8)',
    options: [
      { label: 'เลือก Tax Profile', effect: 'ใช้อัตรา/ฐาน/เกณฑ์ขั้นต่ำของ Profile นั้น (ชนะอัตราของแผนค่าตอบแทนเสมอ)' },
      {
        label: 'ยังไม่ผูก',
        effect:
          'ใช้ Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (ถ้าตั้งไว้) · ไม่มีค่าเริ่มต้น ⇒ ใช้อัตราจากแผนค่าตอบแทนชั่วคราวพร้อมคำเตือน · ไม่มีทั้งสองอย่าง ⇒ สร้างรอบจ่ายไม่ได้',
      },
    ],
    examples,
    who: WHO_PAYEE,
    when: 'มีผลกับรอบจ่ายที่สร้างหลังบันทึก · แก้ข้อมูลภาษี/ธนาคารของผู้รับที่ยืนยันแล้วต้องยืนยันใหม่',
  }
}

export function payeeWht402Help(wht402Pct: number | null): SettingHelpContent {
  const examples: SettingHelpExample[] = []
  if (wht402Pct !== null) {
    const result = calculatePayeeBatchWht(
      [{ grossSatang: SAMPLE_INCOME_SATANG, source: { payeeTaxProfile: DEFAULT_PROFILE, planWhtPct: null } }],
      { incomeCategory: 'sec_40_2', section402Pct: wht402Pct },
    )
    examples.push({
      title: `ได้รับ ${money(SAMPLE_INCOME_SATANG)} อัตรา ${pct(wht402Pct)}`,
      lines: [
        line('ภาษีที่หัก', money(result.totalWhtSatang)),
        line('ผู้รับได้รับ', money(result.lines[0]!.netSatang), true),
      ],
      note: 'ไม่มีเกณฑ์ขั้นต่ำ — หักทุกยอด',
    })
  }
  return {
    title: 'อัตราหัก 40(1)/40(2) ต่อคน',
    what:
      'ใช้เฉพาะเมื่อค่าตั้งภาษีขององค์กรจัดผู้รับรายนี้เป็นเงินได้ 40(1)/40(2) — สำนักงานบัญชีคำนวณอัตราจากรายได้ทั้งปีให้ ระบบไม่คิดอัตราก้าวหน้าเอง',
    options: [
      { label: 'กรอกอัตรา (0.00 ได้)', effect: 'หักตามอัตรานี้ ยื่น ภ.ง.ด.1' },
      { label: 'เว้นว่าง', effect: 'ถ้าผู้รับเป็นเงินได้ 40(1)/40(2) ระบบไม่ให้สร้างรอบจ่ายจนกว่าจะกรอก' },
    ],
    examples,
    who: WHO_PAYEE,
    when: 'มีผลกับรอบจ่ายที่สร้างหลังบันทึก',
  }
}

export function payeeConditionHelp(input: {
  condition: WhtCondition
  allowGrossUp: boolean
  whtPct: number | null
}): SettingHelpContent {
  const whtPct = input.whtPct ?? DEFAULT_WHT_PCT
  const result = whtGrossUp({ incomeSatang: SAMPLE_INCOME_SATANG, whtPct, condition: input.condition })
  return {
    title: 'เงื่อนไขการหักภาษีของผู้รับ',
    what: 'บอกว่าใครรับภาระภาษีหัก ณ ที่จ่าย และพิมพ์ในช่อง "ผู้จ่ายเงิน" บนหนังสือรับรอง 50 ทวิ',
    options: WHT_CONDITIONS.map((condition) => ({
      label: WHT_CONDITION_LABEL[condition],
      effect:
        condition === 'withhold'
          ? 'หักภาษีจากเงินที่จ่าย ผู้รับได้เงินหลังหัก'
          : condition === 'pay_always'
            ? 'บริษัทจ่ายภาษีแทนทุกครั้ง ภาษีคิดแบบทบยอด (เงินได้ × อัตรา ÷ (1 − อัตรา))'
            : 'บริษัทจ่ายภาษีแทนครั้งเดียว ภาษี = เงินได้ × อัตรา',
    })),
    examples: [
      {
        title: `${WHT_CONDITION_LABEL[input.condition]} · เงินได้ ${money(SAMPLE_INCOME_SATANG)} อัตรา ${pct(whtPct)}`,
        lines: [
          line('ภาษีที่นำส่ง', money(result.whtSatang)),
          line('เงินได้บนใบ 50 ทวิ', money(result.certificateIncomeSatang)),
          line('ผู้รับได้รับ', money(result.payeeReceivesSatang), true),
          line('ต้นทุนบริษัท', money(result.companyCostSatang)),
        ],
        note: input.allowGrossUp
          ? undefined
          : 'ค่าตั้งภาษีขององค์กรยังไม่อนุญาต (2)/(3) — ใช้ได้เฉพาะ (1) หัก ณ ที่จ่าย',
      },
    ],
    who: WHO_PAYEE,
    when: 'มีผลกับรอบจ่ายที่สร้างหลังบันทึก (บันทึกเงื่อนไขไว้กับรายการในรอบ)',
  }
}

// ── แผนค่าตอบแทน ────────────────────────────────────────────────────────────

export function planWhtHelp(planWhtPct: number | null): SettingHelpContent {
  const examples: SettingHelpExample[] = []
  const fallback =
    planWhtPct === null
      ? null
      : calculateWhtForPayee({
          grossSatang: SAMPLE_INCOME_SATANG,
          source: { payeeTaxProfile: null, planWhtPct },
        })
  if (planWhtPct !== null && fallback !== null) {
    examples.push({
      title: `ผู้รับที่ยังไม่ผูก Tax Profile ได้รับ ${money(SAMPLE_INCOME_SATANG)}`,
      lines: [
        line(`ใช้อัตราของแผน ${pct(planWhtPct)}`, `หัก ${money(fallback.whtSatang)}`),
        line('ผู้รับได้รับ', money(fallback.netSatang), true),
      ],
      note: 'ผู้รับที่ผูก Tax Profile แล้วใช้อัตราของ Tax Profile แทนเสมอ',
    })
  }
  return {
    title: 'อัตราหัก ณ ที่จ่ายของแผน',
    what: 'อัตราสำรองสำหรับผู้รับที่ยังไม่ได้ผูกกติกาภาษี (Tax Profile) — ระบบแสดงคำเตือนทุกครั้งที่ใช้อัตรานี้',
    examples,
    who: WHO_COMPENSATION,
    when: 'บันทึกเป็นเวอร์ชันใหม่ตามวันที่เริ่มมีผล — รายการเบิกที่สร้างแล้วเก็บเวอร์ชันเดิมไว้',
  }
}
