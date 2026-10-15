'use client'

import {
  useMemo,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type CompositionEvent,
  type DragEvent,
  type InputEvent as ReactInputEvent,
} from 'react'
import { Input, type InputProps } from '@/components/ui/input'
import { applyNumericPaste, normalizeNumericPaste, numericChange, numericRule, type NumericInputKind } from '@/lib/format/numeric-input'

export interface NumericInputProps
  extends Omit<
    InputProps,
    | 'type'
    | 'inputMode'
    | 'value'
    | 'defaultValue'
    | 'onChange'
    | 'onBeforeInput'
    | 'onPaste'
    | 'onDrop'
    | 'onCompositionStart'
    | 'onCompositionEnd'
    | 'maxLength'
  > {
  /** ชนิดช่อง — ดู `lib/format/numeric-input.ts` */
  kind: Exclude<NumericInputKind, 'money'>
  /** `decimal` — ทศนิยมสูงสุด (ค่าเริ่ม 2 = NUMERIC(5,2)) */
  decimals?: number
  /** `integer`/`digits` — จำนวนตัวเลขสูงสุด (ไม่นับอักขระคั่น) · เกิน ⇒ ไม่รับ (ไม่ตัดเงียบ) */
  maxDigits?: number
  /** `digits` — ความยาวข้อความสูงสุดรวมอักขระคั่น (กรองเอง ไม่ใช้ maxlength ของ browser ที่ตัดค่าที่วางเงียบ ๆ) */
  maxLength?: number
  /** `digits` — อักขระคั่นที่ spec ยอมรับและคงไว้ในข้อความ (เช่น `'- '`) */
  separators?: string
  /** ข้อความในช่อง (เก็บเป็น string — 0 นำหน้าไม่หาย) */
  value: string
  /** เรียกเฉพาะเมื่อค่าใหม่ถูกรูปแล้ว (`event.target.value` = ค่าที่กรองแล้ว) */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

/** ใส่ค่าแล้วยิง input event ให้ React เรียก `onChange` ตามปกติ (ใช้ตอนวาง/จบ IME ที่ต้องกรองค่า) */
function setValueAsUserInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * วางเคอร์เซอร์หลัง React render ค่าใหม่ (ค่าที่ถูกกรอง/คืนค่าเดิมทำให้เคอร์เซอร์กระโดดไปท้ายช่อง)
 * `expected` = ค่าที่ตำแหน่งนี้อ้างถึง — ถ้าผู้ใช้คอมโพเนนต์แปลงค่าต่อ (เช่นช่องเบอร์ตัดตัวคั่น) ให้ตัวแปลงนั้นวางเคอร์เซอร์เอง
 */
function placeCaret(input: HTMLInputElement, caret: number, expected?: string): void {
  requestAnimationFrame(() => {
    if (input.ownerDocument.activeElement !== input) return
    if (expected !== undefined && input.value !== expected) return
    const at = Math.min(caret, input.value.length)
    input.setSelectionRange(at, at)
  })
}

/**
 * ช่องกรอกตัวเลขกลาง (มติผู้ใช้ 15/10/2569) — กติกาอยู่ที่ `lib/format/numeric-input.ts`
 * ใช้แทน `<Input inputMode="numeric|decimal">`/`type="number"` ทุกช่องตัวเลขที่ไม่ใช่เงิน (ช่องเงินใช้ `<MoneyInput>`)
 * กันถดถอยด้วย `money-input-coverage.test.tsx` · ผูก `<Field id>`/aria ได้เหมือน `<Input>` (ห่อ `<Input>` ตรง ๆ)
 *
 * - พิมพ์: กันที่ beforeinput (อักขระอื่น/ทศนิยมเกิน/หลักเกิน ⇒ ไม่เข้าช่อง) + onChange กรองซ้ำ
 * - ค่าที่เข้าเป็นก้อน (autofill/เสนอคำ/เสียง) + วาง: ตัดได้แค่ตัวคั่นที่กำหนด · มีอักขระอื่นหรือผลรวมผิดรูป ⇒ ไม่รับทั้งก้อน
 * - IME (composition): ไม่กรองระหว่างประกอบคำ แล้วกรองทั้งก้อนตอน compositionend · ลากวาง ⇒ ไม่รับ
 * - ช่อง readOnly/disabled ไม่รับการวาง · คงตำแหน่งเคอร์เซอร์หลังวาง/กรอง
 * - ไม่ใช้ `type="number"` (รับ `e`/`-` และค่าว่างเมื่อผิดรูป) · `inputMode` decimal/numeric ให้มือถือขึ้นแป้นตัวเลข
 */
export function NumericInput(props: NumericInputProps) {
  const { kind, decimals, maxDigits, maxLength, separators, ...rest } = props
  return <NumericInputBase {...rest} ruleKind={kind} decimals={decimals} maxDigits={maxDigits} maxChars={maxLength} separators={separators} />
}

interface NumericInputBaseProps extends Omit<NumericInputProps, 'kind' | 'maxLength'> {
  ruleKind: NumericInputKind
  maxChars?: number
}

/** ตัวจริงของ `<NumericInput>` / `<MoneyInput>` — ใช้ภายใน UI Kit เท่านั้น */
export function NumericInputBase({
  ruleKind,
  decimals,
  maxDigits,
  maxChars,
  separators,
  value,
  onChange,
  numeric = ruleKind === 'money',
  ...rest
}: NumericInputBaseProps) {
  const rule = useMemo(
    () => numericRule({ kind: ruleKind, decimals, maxDigits, maxLength: maxChars, separators }),
    [ruleKind, decimals, maxDigits, maxChars, separators],
  )
  /** ค่าก่อนเริ่ม composition — `null` = ไม่ได้อยู่ระหว่าง IME */
  const composingFrom = useRef<string | null>(null)

  const handleBeforeInput = (event: ReactInputEvent<HTMLInputElement>) => {
    if (composingFrom.current !== null) return
    const data = event.data
    if (typeof data !== 'string' || data === '') return
    const input = event.currentTarget
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    if (!rule.accepts(rule.mapChars(input.value.slice(0, start) + data + input.value.slice(end)))) event.preventDefault()
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    if (composingFrom.current !== null) {
      onChange(event)
      return
    }
    const next = input.value
    const caret = input.selectionStart ?? next.length
    const result = numericChange(rule, value, next, caret)
    if (result.value === value) {
      // ไม่รับ ⇒ ไม่เรียก onChange ⇒ React คืนค่าเดิมให้ช่อง (controlled input) แล้วคืนเคอร์เซอร์
      if (next !== value) placeCaret(input, result.caret)
      return
    }
    if (result.value !== next) {
      input.value = result.value
      placeCaret(input, result.caret)
    }
    onChange(event)
  }

  const handleCompositionStart = () => {
    composingFrom.current = value
  }

  const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    const from = composingFrom.current ?? value
    composingFrom.current = null
    const input = event.currentTarget
    const result = numericChange(rule, from, input.value, input.selectionStart ?? input.value.length)
    if (result.value === input.value) return
    setValueAsUserInput(input, result.value)
    placeCaret(input, result.caret)
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const input = event.currentTarget
    if (input.readOnly || input.disabled) return
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    const pasted = event.clipboardData.getData('text')
    const next = applyNumericPaste(rule, input.value, start, end, pasted)
    if (next === null || next === input.value) return
    setValueAsUserInput(input, next)
    placeCaret(input, start + (normalizeNumericPaste(rule, pasted) ?? '').length, next)
  }

  const handleDrop = (event: DragEvent<HTMLInputElement>) => event.preventDefault()

  return (
    <Input
      {...rest}
      type="text"
      inputMode={ruleKind === 'money' || ruleKind === 'decimal' ? 'decimal' : 'numeric'}
      numeric={numeric}
      value={value}
      onBeforeInput={handleBeforeInput}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onPaste={handlePaste}
      onDrop={handleDrop}
    />
  )
}
