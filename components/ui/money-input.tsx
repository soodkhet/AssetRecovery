'use client'

import { useRef, type ChangeEvent, type ClipboardEvent, type CompositionEvent, type DragEvent, type InputEvent as ReactInputEvent } from 'react'
import { Input, type InputProps } from '@/components/ui/input'
import { applyMoneyPaste, isMoneyInputText, moneyChange, normalizePastedMoney } from '@/lib/format/money-input'

export interface MoneyInputProps
  extends Omit<
    InputProps,
    'type' | 'inputMode' | 'value' | 'defaultValue' | 'onChange' | 'onBeforeInput' | 'onPaste' | 'onDrop' | 'onCompositionStart' | 'onCompositionEnd'
  > {
  /** ข้อความบาทในช่อง (ไม่ใช่สตางค์) — แปลงเป็นสตางค์ด้วย `parseBahtInput()` ตอนส่งเหมือนเดิม */
  value: string
  /** เรียกเฉพาะเมื่อค่าใหม่ถูกรูปแล้ว (`event.target.value` = ค่าที่กรองแล้ว) */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

/** ใส่ค่าแล้วยิง input event ให้ React เรียก `onChange` ตามปกติ (ใช้ตอนวาง/จบ IME ที่ต้องกรองค่า) */
function setValueAsUserInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** วางเคอร์เซอร์หลัง React render ค่าใหม่ (ค่าที่ถูกกรอง/คืนค่าเดิมทำให้เคอร์เซอร์กระโดดไปท้ายช่อง) */
function placeCaret(input: HTMLInputElement, caret: number): void {
  requestAnimationFrame(() => {
    if (input.ownerDocument.activeElement !== input) return
    const at = Math.min(caret, input.value.length)
    input.setSelectionRange(at, at)
  })
}

/**
 * ช่องกรอกยอดเงิน (บาท) — รับเฉพาะตัวเลขและจุดทศนิยม 1 จุด ทศนิยมไม่เกิน 2 ตำแหน่ง ติดลบไม่ได้ (มติผู้ใช้ 15/10/2569)
 * กติกาอยู่ที่ `lib/format/money-input.ts` · ใช้แทน `<Input inputMode="decimal">` ทุกช่องเงิน
 * (กันถดถอยด้วย `money-input-coverage.test.tsx`) · ผูก `<Field id>`/aria ได้เหมือน `<Input>` (ห่อ `<Input>` ตรง ๆ)
 *
 * - พิมพ์: กันที่ beforeinput (อักขระอื่น/ทศนิยมเกิน ⇒ ไม่เข้าช่อง) + onChange กรองซ้ำ
 * - ค่าที่เข้าเป็นก้อน (autofill/เสนอคำ/เสียง) + วาง: ตัดคอมมา/ช่องว่าง · มีอักขระอื่นหรือผลรวมผิดรูป ⇒ ไม่รับทั้งก้อน
 * - IME (composition): ไม่กรองระหว่างประกอบคำ แล้วกรองทั้งก้อนตอน compositionend · ลากวาง ⇒ ไม่รับ
 * - ช่อง readOnly/disabled ไม่รับการวาง · คงตำแหน่งเคอร์เซอร์หลังวาง/กรอง
 * - ไม่ใช้ `type="number"` (รับ `e`/`-` และค่าว่างเมื่อผิดรูป) · `inputMode="decimal"` ให้มือถือขึ้นแป้นตัวเลข
 */
export function MoneyInput({ value, onChange, numeric = true, ...rest }: MoneyInputProps) {
  /** ค่าก่อนเริ่ม composition — `null` = ไม่ได้อยู่ระหว่าง IME */
  const composingFrom = useRef<string | null>(null)

  const handleBeforeInput = (event: ReactInputEvent<HTMLInputElement>) => {
    if (composingFrom.current !== null) return
    const data = event.data
    if (typeof data !== 'string' || data === '') return
    const input = event.currentTarget
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    if (!isMoneyInputText(input.value.slice(0, start) + data + input.value.slice(end))) event.preventDefault()
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    if (composingFrom.current !== null) {
      onChange(event)
      return
    }
    const next = input.value
    const caret = input.selectionStart ?? next.length
    const result = moneyChange(value, next, caret)
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
    const result = moneyChange(from, input.value, input.selectionStart ?? input.value.length)
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
    const next = applyMoneyPaste(input.value, start, end, pasted)
    if (next === null || next === input.value) return
    setValueAsUserInput(input, next)
    placeCaret(input, start + (normalizePastedMoney(pasted) ?? '').length)
  }

  const handleDrop = (event: DragEvent<HTMLInputElement>) => event.preventDefault()

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
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
