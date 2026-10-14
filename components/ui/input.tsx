'use client'

import { createContext, useContext, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/components/ui/cn'

/**
 * ฟอร์ม input มาตรฐาน (`04` §8.1) — `w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus-ring`
 * error ของฟิลด์แสดงแบบ inline (`REQUIRED_MISSING` — `04` §11) · validate ด้วย Zod schema เดียวร่วม FE/BE
 *
 * ⚠️ `<input type="date">` เป็นข้อยกเว้นเดียวที่ใช้ ค.ศ. — แปลงค่าด้วย `toInputDate()` / `fromInputDate()`
 * ⚠️ ช่องกรอกเงินต้องเก็บค่าเป็น satang (จำนวนเต็ม) ก่อนส่ง API เสมอ
 */

// จอสัมผัสใช้ 16px — iOS Safari ซูมทั้งหน้าทุกครั้งที่ focus ช่องที่เล็กกว่า 16px (preship PS-019)
// + สูงอย่างน้อย 44px ให้แตะได้แม่นบนมือถือ (mytester DI-04/PT-05) — ใช้ pointer-coarse ⇒ desktop ที่ใช้เมาส์หน้าตาเดิม
const FIELD_CLASS =
  'focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm pointer-coarse:min-h-11 pointer-coarse:text-base disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'
const ERROR_CLASS = 'border-red-300 bg-red-50'

export function Label({
  htmlFor,
  children,
  required = false,
  className,
}: {
  htmlFor?: string
  children: ReactNode
  required?: boolean
  className?: string
}) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1 block text-xs font-bold text-slate-700', className)}>
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  )
}

/**
 * เลื่อนไปข้อความผิดพลาดของช่องแรก (`[data-field-error]` ภายใน root) แล้วย้าย focus ไปช่องกรอกของมัน
 * — ฟอร์มยาวใน modal: error อยู่นอกจอแล้วผู้ใช้เห็นว่ากดแล้วไม่มีอะไรเกิดขึ้น (staging S-003)
 * ข้อความที่ระบุช่องเอง (`data-field-error-for="<id>"` — เช่นแถวในตารางรายการ) ⇒ โฟกัสช่องนั้นตรง ๆ
 * แทนช่องแรกในกล่อง (ตรวจซ้ำ staging SV5-R4-01) · เลื่อนช่องมากลางจอ (`block: 'center'`) ให้พ้นหัว modal ที่ติดจอ
 * @returns false เมื่อไม่พบข้อความผิดพลาดที่แสดงอยู่ (ผู้เรียกควรแจ้งทางอื่น เช่น toast)
 */
export function revealFirstFieldError(root: HTMLElement | null): boolean {
  const message = root?.querySelector<HTMLElement>('[data-field-error]')
  if (!message) return false
  const control = fieldErrorControl(root, message)
  // ช่องที่ระบุตรง ๆ อาจห่างจากข้อความ (ข้อความอยู่ท้ายแถว) ⇒ เลื่อนตามช่อง · ไม่งั้นเลื่อนตามข้อความ (อยู่ใต้ช่องพอดี)
  ;(message.dataset.fieldErrorFor !== undefined && control !== null ? control : message).scrollIntoView({
    block: 'center',
    behavior: 'smooth',
  })
  control?.focus({ preventScroll: true })
  return true
}

const CONTROL_SELECTOR = 'input:not([type=hidden]):not([type=file]), select, textarea'

/**
 * ช่องที่ควรโฟกัสของข้อความผิดพลาด — `data-field-error-for` ชี้ช่องกรอกตรง ๆ ⇒ ช่องนั้น
 * · ชี้กล่อง (เช่น `<Field id>` ที่ id อยู่บน div ของกลุ่มช่อง) ⇒ ช่องกรอก/ปุ่มแรกในกล่องนั้น
 * · ไม่มี/หาไม่เจอ ⇒ ช่องกรอกแรกในกล่องของข้อความ · ไม่มีช่องกรอกที่ focus ได้ (เช่นปุ่มเลือกไฟล์) ⇒ ปุ่ม (SV5-R3-01)
 * · ค้น id ภายในฟอร์มก่อน แล้วจึงทั้งหน้า (id ค่าคงที่อาจซ้ำกับฟอร์มอื่นที่เปิดค้าง) — ตรวจซ้ำ staging SV5-R7-01
 */
export function fieldErrorControl(root: HTMLElement | null, message: HTMLElement): HTMLElement | null {
  const controlId = message.dataset.fieldErrorFor
  const target =
    controlId === undefined || controlId === ''
      ? null
      : (Array.from(root?.querySelectorAll<HTMLElement>('[id]') ?? []).find((element) => element.id === controlId) ??
        message.ownerDocument.getElementById(controlId))
  if (target !== null) {
    if (target.matches(`${CONTROL_SELECTOR}, button`)) return target
    const inner = target.querySelector<HTMLElement>(CONTROL_SELECTOR) ?? target.querySelector<HTMLElement>('button')
    if (inner !== null) return inner
  }
  const scope = message.parentElement
  return scope?.querySelector<HTMLElement>(CONTROL_SELECTOR) ?? scope?.querySelector<HTMLElement>('button') ?? null
}

/**
 * ข้อความผิดพลาดตอนกดส่งฟอร์ม — วางใน footer ของ modal (ติดจออยู่เสมอ) เหนือปุ่มส่ง
 * ⇒ ผู้ใช้เห็นทันทีแม้ช่องที่ผิดอยู่นอกจอ (ตรวจซ้ำ staging SV5-R3-01) · ใช้คู่กับ `revealFirstFieldError()`
 */
export function FormSubmitError({ message }: { message: string | null }) {
  if (message === null) return null
  return (
    <p role="alert" aria-live="assertive" className="w-full text-xs font-semibold text-red-600">
      {message}
    </p>
  )
}

/**
 * footer ของ modal ฟอร์มแบบปุ่มเรียงขวา + `<FormSubmitError>` เหนือปุ่ม — `tick` = ตัวนับครั้งที่กดส่ง (ใส่เป็น `key`
 * ให้ screen reader อ่านข้อความซ้ำแม้ข้อความเดิม) · ฟอร์มเบิกเอง/ออกใบใหม่แทน (ตรวจซ้ำ staging SV5-R5-01)
 */
export function FormSubmitFooter({ message, tick, children }: { message: string | null; tick: number; children: ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <FormSubmitError key={tick} message={message} />
      <div className="flex items-center justify-end gap-2">{children}</div>
    </div>
  )
}

/**
 * ข้อความ error ใต้ช่อง — `data-field-error` ให้ `revealFirstFieldError()` หาเจอ · ใช้ตรงเมื่อช่องไม่ได้ห่อด้วย `<Field>`
 * `controlId` = id ของช่องที่ผิด (ใส่เมื่อในกล่องเดียวกันมีหลายช่อง เช่นแถวในตารางรายการ) ⇒ โฟกัสช่องนั้นตรง ๆ
 */
export function FieldErrorText({ children, id, controlId }: { children: ReactNode; id?: string; controlId?: string }) {
  return (
    <p id={id} data-field-error data-field-error-for={controlId} className="mt-1 text-[11px] font-semibold text-red-600">
      {children}
    </p>
  )
}

/**
 * สิ่งที่ `<Field>` ส่งให้ช่องกรอกข้างใน (ตรวจซ้ำ staging SV5-R7-01) — ผูกเฉพาะช่องที่ `id` ตรงกับ `<Field id>`
 * (กล่องเดียวมีหลายช่องได้ ⇒ ไม่เดาเอาช่องแรก)
 */
interface FieldControlState {
  controlId: string
  invalid: boolean
  describedBy: string | undefined
}

const FieldControlContext = createContext<FieldControlState | null>(null)

/** รวม aria-invalid/aria-describedby ของช่องกรอก: ค่าที่ส่งตรง + ค่าจาก `<Field>` ที่ห่อ (เมื่อ id ตรงกัน) */
function useFieldControl(id: string | undefined, invalid: boolean, describedBy: string | undefined) {
  const field = useContext(FieldControlContext)
  const bound = field !== null && id !== undefined && field.controlId === id
  const isInvalid = invalid || (bound && field.invalid)
  const ids = [describedBy, bound ? field.describedBy : undefined].filter((value) => value !== undefined && value !== '')
  return {
    invalid: isInvalid,
    aria: {
      'aria-invalid': isInvalid || undefined,
      'aria-describedby': ids.length > 0 ? ids.join(' ') : undefined,
    },
  }
}

/**
 * ห่อ label + field + inline error ให้ครบชุดในที่เดียว
 * `id` = id ของช่องกรอกข้างใน (ส่ง `id` เดียวกันให้ `<Input>`/`<Select>`/`<Textarea>`) ⇒ label ผูกช่อง (`htmlFor`)
 * · ช่องได้ `aria-invalid` + `aria-describedby` ชี้ข้อความใต้ช่องเอง · `revealFirstFieldError()` โฟกัสช่องจาก id นี้
 * (ตรวจซ้ำ staging SV5-R7-01)
 */
export function Field({
  id,
  label,
  required = false,
  error,
  hint,
  children,
  className,
}: {
  id?: string
  label: ReactNode
  required?: boolean
  error?: string | null
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  const hasError = typeof error === 'string' && error !== ''
  const showHint = !hasError && hint !== undefined
  const errorId = id !== undefined && hasError ? `${id}-error` : undefined
  const hintId = id !== undefined && showHint ? `${id}-hint` : undefined
  const control: FieldControlState | null =
    id === undefined ? null : { controlId: id, invalid: hasError, describedBy: errorId ?? hintId }
  return (
    <div className={className}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <FieldControlContext.Provider value={control}>{children}</FieldControlContext.Provider>
      {hasError ? (
        <FieldErrorText id={errorId} controlId={id}>
          {error}
        </FieldErrorText>
      ) : (
        showHint && (
          <p id={hintId} className="mt-1 text-[11px] text-slate-400">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  /** จัดชิดขวา + font-mono สำหรับตัวเลข/เงิน */
  numeric?: boolean
}

export function Input({ invalid = false, numeric = false, className, 'aria-describedby': describedBy, ...rest }: InputProps) {
  const field = useFieldControl(rest.id, invalid, describedBy)
  return (
    <input
      {...field.aria}
      className={cn(FIELD_CLASS, field.invalid && ERROR_CLASS, numeric && 'text-right font-mono', className)}
      {...rest}
    />
  )
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export function Select({ invalid = false, className, children, 'aria-describedby': describedBy, ...rest }: SelectProps) {
  const field = useFieldControl(rest.id, invalid, describedBy)
  return (
    <select
      {...field.aria}
      className={cn(FIELD_CLASS, 'bg-white', field.invalid && ERROR_CLASS, className)}
      {...rest}
    >
      {children}
    </select>
  )
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export function Textarea({ invalid = false, className, rows = 3, 'aria-describedby': describedBy, ...rest }: TextareaProps) {
  const field = useFieldControl(rest.id, invalid, describedBy)
  return (
    <textarea
      rows={rows}
      {...field.aria}
      className={cn(FIELD_CLASS, field.invalid && ERROR_CLASS, className)}
      {...rest}
    />
  )
}
