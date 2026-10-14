import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
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
  const controlId = message.dataset.fieldErrorFor
  const target = controlId ? message.ownerDocument.getElementById(controlId) : null
  const scope = message.parentElement
  // ช่องกรอกก่อน · ไม่มีช่องกรอกที่ focus ได้ (เช่นปุ่มเลือกไฟล์ที่ซ่อน `<input type=file>` ไว้) ⇒ ปุ่มในช่องนั้น (SV5-R3-01)
  const control =
    target ??
    scope?.querySelector<HTMLElement>('input:not([type=hidden]):not([type=file]), select, textarea') ??
    scope?.querySelector<HTMLElement>('button')
  // ช่องที่ระบุตรง ๆ อาจห่างจากข้อความ (ข้อความอยู่ท้ายแถว) ⇒ เลื่อนตามช่อง · ไม่งั้นเลื่อนตามข้อความ (อยู่ใต้ช่องพอดี)
  ;(target ?? message).scrollIntoView({ block: 'center', behavior: 'smooth' })
  control?.focus({ preventScroll: true })
  return true
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

/** ห่อ label + field + inline error ให้ครบชุดในที่เดียว */
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
  return (
    <div className={className}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <FieldErrorText>{error}</FieldErrorText>
      ) : (
        hint !== undefined && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
      )}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  /** จัดชิดขวา + font-mono สำหรับตัวเลข/เงิน */
  numeric?: boolean
}

export function Input({ invalid = false, numeric = false, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(FIELD_CLASS, invalid && ERROR_CLASS, numeric && 'text-right font-mono', className)}
      {...rest}
    />
  )
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export function Select({ invalid = false, className, children, ...rest }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(FIELD_CLASS, 'bg-white', invalid && ERROR_CLASS, className)}
      {...rest}
    >
      {children}
    </select>
  )
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export function Textarea({ invalid = false, className, rows = 3, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(FIELD_CLASS, invalid && ERROR_CLASS, className)}
      {...rest}
    />
  )
}
