'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { SESSION_EXPIRED_EVENT } from '@/lib/api/session-expiry'

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

/**
 * session หมด ⇒ กล่อง "เซสชันหมดอายุ" บอกผู้ใช้อยู่แล้ว — toast error ของคำขอเดียวกันที่ผู้เรียกแสดงต่อ (เช่น
 * "ยังไม่ได้เข้าสู่ระบบ") ซ้ำซ้อนและคนละถ้อยคำ ⇒ ไม่แสดงในช่วงสั้น ๆ หลัง event (preship R9-006)
 */
const SESSION_LOST_TOAST_QUIET_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const nextId = useRef(1)
  const sessionLostAt = useRef<number | null>(null)

  useEffect(() => {
    const onSessionLost = () => {
      sessionLostAt.current = Date.now()
      // toast error ที่ขึ้นก่อน event (คำขอที่ตอบ 401 ก่อนหน้าเล็กน้อย) ก็เก็บออก
      setToasts((current) => current.filter((toast) => toast.tone !== 'error'))
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionLost)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionLost)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    ({ tone = 'success', title, description, durationMs = DEFAULT_DURATION_MS }: ToastInput) => {
      const id = nextId.current++
      const lostAt = sessionLostAt.current
      if (tone === 'error' && lostAt !== null && Date.now() - lostAt < SESSION_LOST_TOAST_QUIET_MS) return id
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
    // มือถือ: ยึดขอบซ้าย-ขวา 16px — เดิม `w-full` + `right-4` กว้างเท่าจอแล้วเลื่อนเข้ามา 16px ⇒ ขอบซ้ายถูกตัด (preship R9-008)
    <div className="pointer-events-none fixed right-4 bottom-4 left-4 z-[60] flex flex-col gap-2 sm:left-auto sm:w-full sm:max-w-sm">
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
