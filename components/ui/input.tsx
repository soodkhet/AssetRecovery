import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/components/ui/cn'

/**
 * ฟอร์ม input มาตรฐาน (`04` §8.1) — `w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus-ring`
 * error ของฟิลด์แสดงแบบ inline (`REQUIRED_MISSING` — `04` §11) · validate ด้วย Zod schema เดียวร่วม FE/BE
 *
 * ⚠️ `<input type="date">` เป็นข้อยกเว้นเดียวที่ใช้ ค.ศ. — แปลงค่าด้วย `toInputDate()` / `fromInputDate()`
 * ⚠️ ช่องกรอกเงินต้องเก็บค่าเป็น satang (จำนวนเต็ม) ก่อนส่ง API เสมอ
 */

const FIELD_CLASS =
  'focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'
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
        <p className="mt-1 text-[11px] font-semibold text-red-600">{error}</p>
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
