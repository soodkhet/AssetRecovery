'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, type MouseEvent, type RefObject } from 'react'
import { afterModalHistorySettled, guardModalHistory } from '@/components/ui/modal-history'
import { isTopModal, registerModal, unregisterModal } from '@/components/ui/modal-stack'

/**
 * staging E-075 — พฤติกรรมกลางของเมนู/ลิ้นชักที่ทับหน้า (แบบเดียวกับเมนู Field Tracker):
 * Esc ปิด · ปุ่ม Back ของมือถือปิดแทนการออกจากหน้า · ล็อกการเลื่อนหน้าข้างหลัง · โฟกัสเข้าแผง และคืนโฟกัสเมื่อปิด
 * · กดลิงก์ในเมนู ⇒ ปิดก่อนแล้วค่อยนำทาง (ไม่งั้น sentinel ของ Back ค้าง ต้องกด Back สองครั้ง)
 *
 * เรียกใน component ที่ mount เฉพาะตอนเปิดเท่านั้น
 */
export function useOverlayDismiss(onClose: () => void): {
  panelRef: RefObject<HTMLDivElement | null>
  navigateFromMenu: (event: MouseEvent<HTMLAnchorElement>, href: string) => void
} {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  const navigateToRef = useRef<string | null>(null)

  useEffect(() => {
    const token = registerModal()
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && isTopModal(token)) onCloseRef.current()
    }
    const releaseHistory = guardModalHistory({
      onBack: () => (isTopModal(token) ? 'close' : 'stay'),
      onClose: () => onCloseRef.current(),
    })
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKey)
    panelRef.current?.focus()
    return () => {
      unregisterModal(token)
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
      releaseHistory()
      previousFocus?.focus()
      const href = navigateToRef.current
      if (href !== null) afterModalHistorySettled(() => router.push(href))
    }
  }, [router])

  const navigateFromMenu = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string) => {
    // เปิดแท็บใหม่ (ctrl/cmd/shift/ปุ่มกลาง) ให้ browser ทำตามปกติ
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigateToRef.current = href
    onCloseRef.current()
  }, [])

  return { panelRef, navigateFromMenu }
}
