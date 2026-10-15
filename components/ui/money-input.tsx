'use client'

import { NumericInputBase, type NumericInputProps } from '@/components/ui/numeric-input'

export type MoneyInputProps = Omit<NumericInputProps, 'kind' | 'decimals' | 'maxDigits' | 'maxLength' | 'separators'>

/**
 * ช่องกรอกยอดเงิน (บาท) — รับเฉพาะตัวเลขและจุดทศนิยม 1 จุด ทศนิยมไม่เกิน 2 ตำแหน่ง ติดลบไม่ได้ (มติผู้ใช้ 15/10/2569)
 * กติกาอยู่ที่ `lib/format/money-input.ts` (ชนิด `money` ของ `lib/format/numeric-input.ts`) · ใช้แทน `<Input inputMode="decimal">` ทุกช่องเงิน
 * (กันถดถอยด้วย `money-input-coverage.test.tsx`) · ชิดขวา font-mono เป็นค่าเริ่ม (`numeric={false}` ปิดได้)
 * ค่ายังเป็นข้อความบาท แปลงเป็นสตางค์ด้วย `parseBahtInput()` ตอนส่งเหมือนเดิม — พฤติกรรมพิมพ์/วาง/IME ดู `<NumericInput>`
 */
export function MoneyInput(props: MoneyInputProps) {
  return <NumericInputBase {...props} ruleKind="money" />
}
