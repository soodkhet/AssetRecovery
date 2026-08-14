import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

/**
 * ปุ่มมาตรฐาน — คลาสตาม `04` §8.1 (Component Class Reference) + mockup `reference/*.html`
 * ⚠️ คำบนปุ่มต้องตรงกับ action จริง (`04` §10) · ปุ่ม destructive ต้องผ่าน `<ConfirmModal>` เสมอ
 */

export type ButtonVariant = 'primary' | 'success' | 'info' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

const VARIANT_CLASS: Readonly<Record<ButtonVariant, string>> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800',
  success: 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100',
  info: 'bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100',
  secondary: 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50',
  danger: 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100',
  ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
}

const SIZE_CLASS: Readonly<Record<ButtonSize, string>> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** แสดง spinner + disable ปุ่ม (ใช้ตอนกำลังยิง API) */
  loading?: boolean
  fullWidth?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'sm',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled === true || loading}
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4 animate-spin', className)} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
