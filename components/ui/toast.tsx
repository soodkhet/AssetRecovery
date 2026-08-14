'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

/**
 * Toast — ปลายทางของโครงหน้ามาตรฐาน Page → Header → Tabs → Table → Modal → **Toast** (`04` §9)
 * ใช้แจ้งผลลัพธ์ของ action (สำเร็จ/ล้มเหลว/เตือน) — ข้อความต้องเป็นภาษาไทยและตรงกับสิ่งที่เกิดจริง
 */

export type ToastTone = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

export interface ToastInput {
  tone?: ToastTone
  title: string
  description?: string
  /** มิลลิวินาทีก่อนหายเอง — `0` = ค้างไว้จนกดปิด */
  durationMs?: number
}

interface ToastContextValue {
  toasts: readonly Toast[]
  showToast: (input: ToastInput) => number
  dismissToast: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const nextId = useRef(1)

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    ({ tone = 'success', title, description, durationMs = DEFAULT_DURATION_MS }: ToastInput) => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, tone, title, description }])
      if (durationMs > 0) {
        window.setTimeout(() => dismissToast(id), durationMs)
      }
      return id
    },
    [dismissToast],
  )

  const value = useMemo(() => ({ toasts, showToast, dismissToast }), [toasts, showToast, dismissToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (context === null) {
    throw new Error('useToast ต้องอยู่ภายใน <ToastProvider> (อยู่ใน app shell แล้ว)')
  }
  return context
}

const TONE_CLASS: Readonly<Record<ToastTone, string>> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-orange-200 bg-orange-50 text-orange-800',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
}

function ToastViewport({ toasts, onDismiss }: { toasts: readonly Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cn(
            'fade-in pointer-events-auto flex items-start gap-3 rounded-lg border px-3 py-2.5 text-xs shadow-sm',
            TONE_CLASS[toast.tone],
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{toast.title}</div>
            {toast.description !== undefined && <div className="mt-0.5 opacity-90">{toast.description}</div>}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="ปิดการแจ้งเตือน"
            className="focus-ring rounded p-0.5 opacity-60 hover:opacity-100"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
