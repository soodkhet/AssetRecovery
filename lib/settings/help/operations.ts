import { assertWithinAdvanceMax } from '@/lib/advances/advance'
import { advanceSettlement } from '@/lib/finance/advance-calc'
import { agingBucketIndex, resolveBankFeeWriteOff } from '@/lib/finance/ar-calc'
import { resolveApprovalFlow, type ApprovalMatrixCandidate } from '@/lib/finance/approval-flow-resolver'
import { fmtDateTime } from '@/lib/format/datetime'
import { describeAgingBuckets, isAgingBucketsValid } from '@/lib/settings/finance-policy'
import {
  WHO_HOLIDAYS,
  WHO_SETTINGS,
  line,
  money,
} from '@/lib/settings/help/common'
import type { SettingHelpContent, SettingHelpExample } from '@/lib/settings/help/types'
import { filingDueExample } from '@/lib/settings/help/wht'
import { PERIOD_LOCK_POLICY } from '@/lib/settings/period-lock'
import { describeSlaThreshold } from '@/lib/settings/sla-policy'
import {
  substituteReceiptLimitMessage,
  substituteReceiptLimitProblem,
} from '@/lib/substitute-receipts/substitute-receipt'

/**
 * คำอธิบายค่าตั้งด้านปฏิบัติการการเงิน (U108) — สายอนุมัติ · นโยบายการเงิน · ล็อกรอบ · บัญชีธนาคาร ·
 * ไฟล์โอน · ศูนย์ต้นทุน · วันหยุด · SLA — ตัวอย่างใช้ resolver/สูตรตัวเดียวกับระบบจริง
 */

/** ยอดตัวอย่างของสายอนุมัติ (สตางค์) */
export const SAMPLE_APPROVAL_AMOUNTS_SATANG: readonly number[] = [50_000, 500_000, 5_000_000]

export function approvalMatrixHelp(matrices: readonly ApprovalMatrixCandidate[]): SettingHelpContent {
  const active = matrices.filter((matrix) => matrix.approvalFlow.length > 0)
  const examples: SettingHelpExample[] =
    active.length === 0
      ? []
      : [
          {
            title: 'รายการเบิกแต่ละยอดจะเข้าสายไหน (ตามสายที่ตั้งไว้ตอนนี้)',
            lines: SAMPLE_APPROVAL_AMOUNTS_SATANG.map((amount) => {
              try {
                const flow = resolveApprovalFlow(amount, active)
                return line(money(amount), `${flow.condition} · ${flow.steps.map((step) => step.role).join(' → ')}`)
              } catch {
                return line(money(amount), 'ไม่มีสายที่ครอบยอดนี้ — ส่งอนุมัติไม่ได้จนกว่าจะเพิ่มสาย')
              }
            }),
          },
        ]
  return {
    title: 'สายการอนุมัติทำงานอย่างไร',
    what:
      'กำหนดว่ารายการเบิกต้องผ่านใครอนุมัติตามลำดับ ระบบเลือกสายที่ "เพดานเงินต่ำสุดที่ยังครอบยอด" ให้อัตโนมัติ สายที่ไม่ระบุเพดานใช้กับยอดที่เกินทุกเพดาน',
    options: [
      { label: 'เพดานเงิน', effect: 'ยอดไม่เกินเพดานใช้สายนี้ · เว้นว่าง = ไม่จำกัด (สายสุดท้าย)' },
      { label: 'ลำดับขั้นอนุมัติ', effect: 'อนุมัติทีละขั้นตามลำดับ ตีกลับเมื่อไรเริ่มขั้นแรกใหม่' },
      { label: 'แยกหน้าที่ (SoD)', effect: 'คนเดียวกันอนุมัติซ้ำหลายขั้นในรายการเดียวไม่ได้' },
    ],
    examples,
    who: WHO_SETTINGS,
    when: 'มีผลกับรายการที่ส่งเข้าคิวอนุมัติหลังบันทึก — รายการที่อยู่ระหว่างอนุมัติใช้สายเดิมจนจบ',
  }
}

// ── นโยบายการเงินระดับองค์กร ──────────────────────────────────────────────────

const WHEN_FINANCE_POLICY = 'มีผลทันทีกับรายการใหม่ — เอกสารและงวดที่ปิดไปแล้วยังอ้างค่าเดิม'

export function advancePolicyHelp(input: { maxSatang: number | null }): SettingHelpContent {
  const request = 500_000
  const used = 420_000
  const settle = advanceSettlement({ requestedSatang: request, approvedSatang: request, usedSatang: used })
  let withinMax = true
  try {
    assertWithinAdvanceMax(request, input.maxSatang)
  } catch {
    withinMax = false
  }
  return {
    title: 'เงินทดรองจ่ายคืออะไร',
    what:
      'เงินที่บริษัทให้ทีมงานยืมไปใช้ก่อน (เช่น ค่าเดินทางลงพื้นที่) แล้วต้องเคลียร์ด้วยใบเสร็จภายหลัง ส่วนที่ใช้ไม่หมดต้องคืน',
    options: [
      { label: 'เพดานต่อครั้ง', effect: 'ขอเบิกเกินเพดานไม่ได้ · เว้นว่าง = ไม่จำกัด' },
      // มติ PO U145 — ไม่มีสวิตช์ "ตั้งเป็นลูกหนี้พนักงาน" แล้ว: เงินทดรองค้างถูกหักคืนในรอบจ่ายถัดไปเสมอ
      {
        label: 'ยังไม่เคลียร์',
        effect: 'ยอดที่ยังไม่เคลียร์ถูกหักคืนจากค่าตอบแทนในรอบจ่ายถัดไปของผู้รับคนนั้นโดยอัตโนมัติ',
      },
    ],
    examples: [
      {
        title: `ขอเบิก ${money(request)} · เพดาน ${input.maxSatang === null ? 'ไม่จำกัด' : money(input.maxSatang)}`,
        lines: [
          line(
            'ผลการขอเบิก',
            withinMax ? 'ขอได้' : 'เกินเพดาน — ส่งคำขอไม่ได้',
            true,
          ),
          line(`ใช้จริง ${money(used)}`, `ต้องคืน ${money(settle.returnSatang)}`),
        ],
      },
    ],
    who: WHO_SETTINGS,
    when: WHEN_FINANCE_POLICY,
  }
}

export function substituteReceiptHelp(maxPerDocSatang: number | null, maxPerMonthSatang: number | null): SettingHelpContent {
  const examples: SettingHelpExample[] = []
  if (maxPerDocSatang !== null && maxPerMonthSatang !== null) {
    const limits = { maxPerDocSatang, maxPerMonthSatang }
    const cases = [
      { label: `ใบละ ${money(45_000)} (เดือนนี้ยังไม่เคยใช้)`, totalSatang: 45_000, monthUsedSatang: 0 },
      { label: `ใบละ ${money(60_000)}`, totalSatang: 60_000, monthUsedSatang: 0 },
      { label: `ใบละ ${money(45_000)} (เดือนนี้ใช้ไปแล้ว ${money(280_000)})`, totalSatang: 45_000, monthUsedSatang: 280_000 },
    ]
    examples.push({
      title: `เพดานต่อใบ ${money(maxPerDocSatang)} · ต่อคนต่อเดือน ${money(maxPerMonthSatang)}`,
      lines: cases.map((each) => {
        const problem = substituteReceiptLimitProblem({ ...limits, totalSatang: each.totalSatang, monthUsedSatang: each.monthUsedSatang })
        return line(each.label, problem === null ? 'ออกได้' : `ออกไม่ได้ — ${substituteReceiptLimitMessage(problem)}`)
      }),
    })
  }
  return {
    title: 'ใบรับรองแทนใบเสร็จรับเงินคืออะไร',
    what:
      'เอกสารที่ทีมงานรับรองรายจ่ายเองเมื่อเรียกใบเสร็จไม่ได้ (เช่น ค่าวินมอเตอร์ไซค์ ค่าที่จอดรถ) สรรพากรยอมรับเป็นหลักฐานรายจ่ายได้ในวงเงินที่เหมาะสม ระบบจึงจำกัดยอดต่อใบและต่อคนต่อเดือน',
    examples,
    who: WHO_SETTINGS,
    when: `${WHEN_FINANCE_POLICY} · นับยอดต่อเดือนตามเดือนของวันที่ออกใบ`,
  }
}

export function writeOffToleranceHelp(toleranceSatang: number | null): SettingHelpContent {
  const billed = 1_070_000
  const received = 1_067_500
  const diff = billed - received
  // มติ PO U144 — ตัวอย่างใช้สูตรเดียวกับตอนรับเงินจริง (`resolveBankFeeWriteOff`)
  const fee =
    toleranceSatang === null || toleranceSatang < 0 || !Number.isInteger(toleranceSatang)
      ? 0
      : resolveBankFeeWriteOff({ totalSatang: billed, receivedSatang: received, whtWithheldByCustomerSatang: 0, toleranceSatang })
  return {
    title: 'เพดานตัดส่วนต่างค่าธรรมเนียมคืออะไร',
    what:
      'เวลาลูกค้าโอนเงินมาขาดเล็กน้อยเพราะธนาคารหักค่าธรรมเนียมโอน ส่วนต่างที่ไม่เกินเพดานนี้ระบบบันทึกเป็นค่าธรรมเนียมธนาคารให้อัตโนมัติตอนจับคู่เงินรับ บิลปิดเป็นชำระครบ และรายการไปอยู่ในชุดเอกสารส่งสำนักงานบัญชี (ไฟล์ค่าธรรมเนียมธนาคาร) · ตั้ง 0 = ไม่ตัดส่วนต่าง',
    options: [
      { label: 'ขาดไม่เกินเพดาน', effect: 'ส่วนต่างเป็นค่าธรรมเนียมธนาคาร · บิลชำระครบ · ไม่มียอดค้าง' },
      { label: 'ขาดเกินเพดาน', effect: 'บิลค้างชำระบางส่วนตามเดิม — ต้องตามเก็บหรือทำรายการปรับปรุง' },
    ],
    examples:
      toleranceSatang === null
        ? []
        : [
            {
              title: `บิล ${money(billed)} · เงินเข้า ${money(received)}`,
              lines: [
                line('ส่วนต่าง', money(diff)),
                line(
                  `เทียบเพดาน ${money(toleranceSatang)}`,
                  fee > 0 ? 'ตัดเป็นค่าธรรมเนียมได้' : 'เกินเพดาน — ต้องตามเก็บหรือทำรายการปรับปรุง',
                  true,
                ),
                line('ค่าธรรมเนียมธนาคารที่บันทึก', money(fee)),
              ],
            },
          ],
    who: WHO_SETTINGS,
    when: `${WHEN_FINANCE_POLICY} · ใช้เพดาน ณ ตอนจับคู่เงินรับ`,
    assumption: 'bank_fee_write_off',
  }
}

export function agingBucketsHelp(buckets: readonly number[]): SettingHelpContent {
  const valid = isAgingBucketsValid(buckets)
  const sorted = [...new Set(buckets)].sort((a, b) => a - b)
  const labels = valid ? describeAgingBuckets(sorted) : []
  const samples = [10, 45, 120]
  return {
    title: 'ช่วงอายุหนี้คืออะไร',
    what: 'แบ่งยอดค้างรับจากบริษัทไฟแนนซ์ตามจำนวนวันที่เลยกำหนดชำระ ใช้เป็นหัวคอลัมน์ของรายงานอายุลูกหนี้ เพื่อดูว่าหนี้ก้อนไหนค้างนาน',
    examples: valid
      ? [
          {
            title: `ช่วงที่ตั้ง: ${labels.join(' · ')}`,
            lines: samples.map((days) => line(`เลยกำหนด ${days} วัน`, labels[agingBucketIndex(days, sorted)] ?? '—')),
          },
        ]
      : [],
    who: WHO_SETTINGS,
    when: 'มีผลทันทีกับรายงานที่เปิดหลังบันทึก — ไม่เปลี่ยนตัวเลขหนี้',
  }
}

export function payeeIdDocumentHelp(required: boolean): SettingHelpContent {
  return {
    title: 'บังคับแนบเอกสารยืนยันตัวตนผู้รับเงิน',
    what: 'ป้องกันการโอนเงินผิดคน — ต้องมีสำเนาบัตรประชาชน/หนังสือรับรองบริษัทก่อนยืนยันข้อมูลผู้รับเงินได้',
    options: [
      { label: 'เปิด', effect: 'ยืนยันผู้รับเงินที่ยังไม่แนบเอกสารไม่ได้ จึงจ่ายเงินไม่ได้' },
      { label: 'ปิด', effect: `ยืนยันได้โดยไม่ต้องแนบ · ปัจจุบัน ${required ? 'เปิด' : 'ปิด'}` },
    ],
    who: WHO_SETTINGS,
    when: 'มีผลทันทีกับการยืนยันผู้รับเงินครั้งถัดไป',
  }
}

// ── ค่าตั้งอื่น ──────────────────────────────────────────────────────────────

export function periodLockHelp(): SettingHelpContent {
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'adjustment_after_close',
    title: 'การล็อกรอบบัญชีคืออะไร',
    what:
      'เมื่อส่งตัวเลขของเดือนให้สำนักงานบัญชีหรือปิดงวดแล้ว ตัวเลขต้องไม่ถูกแก้เงียบ ๆ การแก้หลังปิดต้องทำเป็นรายการปรับปรุง (Adjustment) ที่มีผู้อนุมัติและประวัติชัดเจน',
    table: {
      headers: ['สถานะงวด', 'แก้รายการเดิม', 'ต้องทำ Adjustment', 'ผู้อนุมัติปลดล็อก'],
      rows: PERIOD_LOCK_POLICY.map((row) => [
        row.statusLabel,
        row.directEditLabel,
        row.adjustmentLabel,
        row.unlockApprovers.join(' / '),
      ]),
    },
    who: 'นโยบายตายตัวขององค์กร — ไม่มีใครแก้จากหน้าจอนี้ได้ (การปลดล็อกงวดทำที่หน้าปิดงวด)',
    when: 'บังคับใช้ทุกครั้งที่มีการแก้รายการที่อยู่ในงวดนั้น',
  }
}

export function bankAccountsHelp(): SettingHelpContent {
  return {
    title: 'บัญชีธนาคารบริษัทใช้ทำอะไร',
    what:
      'บัญชีที่ใช้รับเงินจากบริษัทไฟแนนซ์ (พิมพ์บนใบแจ้งหนี้ และใช้กระทบยอดกับ statement) และบัญชีที่ใช้โอนจ่ายทีมงาน (สร้างไฟล์โอนเงิน)',
    options: [
      { label: 'รับเงิน', effect: 'ใช้กระทบยอดเงินเข้าและพิมพ์บนใบแจ้งหนี้' },
      { label: 'จ่ายเงิน', effect: 'ใช้เป็นบัญชีต้นทางของไฟล์โอนจ่าย' },
      { label: 'รับและจ่าย', effect: 'ใช้ได้ทั้งสองทาง' },
    ],
    who: WHO_SETTINGS,
    when: 'มีผลทันทีกับไฟล์โอนและการกระทบยอดครั้งถัดไป — ไฟล์ที่สร้างแล้วไม่เปลี่ยน',
  }
}

export function bankFileFormatsHelp(): SettingHelpContent {
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'bank_file_formats',
    title: 'รูปแบบไฟล์ธนาคารคืออะไร',
    what:
      'กำหนดคอลัมน์และการเข้ารหัสของไฟล์โอนเงินที่อัปโหลดเข้าระบบธนาคาร ต้องตรงกับที่ธนาคารกำหนด ไม่งั้นธนาคารปฏิเสธไฟล์',
    options: [
      { label: 'ทดสอบผ่าน', effect: 'ใช้สร้างไฟล์โอนจริงได้' },
      { label: 'ยังไม่ทดสอบ/ไม่ผ่าน', effect: 'ควรทดสอบกับธนาคารก่อนใช้จ่ายจริง · แก้รูปแบบแล้วสถานะทดสอบกลับเป็นยังไม่ทดสอบ' },
    ],
    who: WHO_SETTINGS,
    when: 'มีผลกับไฟล์โอนที่สร้างหลังบันทึก',
  }
}

export function costCentersHelp(): SettingHelpContent {
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'cost_centers',
    title: 'ศูนย์ต้นทุนคืออะไร',
    what:
      'รหัสจัดกลุ่มค่าใช้จ่าย/รายได้ตามหน่วยงาน (เช่น ทีม ภาค) เพื่อให้สำนักงานบัญชีแยกต้นทุนในรายงาน — ไม่เปลี่ยนยอดเงิน',
    options: [
      { label: 'ใช้งาน', effect: 'เลือกได้ในรายการใหม่' },
      { label: 'ปิดใช้งาน', effect: 'เลือกเพิ่มไม่ได้ แต่รายการเดิมยังอ้างอิงอยู่' },
    ],
    who: WHO_SETTINGS,
    when: 'มีผลทันทีกับรายการใหม่',
  }
}

export function holidaysHelp(holidayKeys: readonly string[]): SettingHelpContent {
  return {
    // มติ PO U140 — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน
    assumption: 'holidays',
    title: 'ปฏิทินวันหยุดใช้ทำอะไร',
    what:
      'กำหนดยื่นภาษีหัก ณ ที่จ่ายที่ตรงเสาร์-อาทิตย์หรือวันหยุดในปฏิทินนี้ เลื่อนเป็นวันทำการถัดไปอัตโนมัติ — กรอกวันหยุดราชการปีละครั้ง',
    examples: [filingDueExample(null, holidayKeys)],
    who: WHO_HOLIDAYS,
    when: 'มีผลทันทีกับการคำนวณกำหนดยื่นและการแจ้งเตือนครั้งถัดไป',
  }
}

/** เคสตัวอย่างสร้าง 06/10/2569 09:00 น. (เวลาไทย) */
export const SAMPLE_CASE_CREATED_AT = new Date('2026-10-06T02:00:00Z')

export function slaPolicyHelp(hours: number | null): SettingHelpContent {
  const valid = hours !== null && Number.isInteger(hours) && hours > 0
  return {
    title: 'เกณฑ์ SLA ใช้ทำอะไร',
    what: 'ระยะเวลาเป้าหมายในการปิดงานติดตามนับจากวันที่สร้างเคส ใช้ทำรายงานเคสที่เกินเวลาเท่านั้น — ไม่บล็อกงาน ไม่ย้ายงาน ไม่มีค่าปรับ',
    examples: valid
      ? [
          {
            title: `เกณฑ์ ${describeSlaThreshold(hours)}`,
            lines: [
              line('เคสสร้าง', fmtDateTime(SAMPLE_CASE_CREATED_AT)),
              line('ขึ้นรายงานเกิน SLA ถ้ายังไม่ปิดหลัง', fmtDateTime(new Date(SAMPLE_CASE_CREATED_AT.getTime() + hours * 3_600_000)), true),
            ],
          },
        ]
      : [],
    who: WHO_SETTINGS,
    when: 'มีผลทันทีกับรายงานที่เปิดหลังบันทึก',
  }
}

