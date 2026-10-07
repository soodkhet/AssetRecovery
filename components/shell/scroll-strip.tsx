'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/components/ui/cn'

/**
 * แถบเมนูที่ **จอเล็ก (< sm) เป็นแถวเดียวเลื่อนแนวนอน** ส่วนจอ sm ขึ้นไปขึ้นบรรทัดใหม่ตามปกติ (`className` ของผู้เรียก)
 *
 * ทำไม: แท็บแตะได้ 44px บนจอสัมผัส (preship R2-030/R3) ทำให้เมนูที่ขึ้นบรรทัดใหม่บนมือถือสูงหลายร้อย px
 * ดันเนื้อหาจริงลงไปครึ่งจอ (preship R4-021: /settings/roles ที่ 360px เนื้อหาเริ่ม y≈514)
 * — แถวเดียวเลื่อนได้ยังคงจุดแตะ 44px ไว้ และมี **ขอบจาง** ซ้าย/ขวาบอกว่ายังมีเมนูต่อ (ไม่ซ่อนเงียบแบบ R2-013)
 * แท็บปัจจุบัน (`aria-current="page"`) ถูกเลื่อนมาไว้กลางแถบอัตโนมัติ
 */
export function ScrollStrip({
  label,
  className,
  fadeClassName,
  activeKey,
  children,
}: {
  label: string
  /** คลาสของ `<nav>` สำหรับจอ sm ขึ้นไป (flex-wrap / gap / padding) */
  className?: string
  /** สีพื้นของขอบจาง ต้องตรงกับพื้นหลังแถบ เช่น `from-slate-50` */
  fadeClassName: string
  /** เปลี่ยนเมื่อแท็บปัจจุบันเปลี่ยน ⇒ เลื่อนแท็บนั้นมาให้เห็น */
  activeKey: string | null
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const next = { start: el.scrollLeft > 1, end: max - el.scrollLeft > 1 }
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const current = el.querySelector<HTMLElement>('[aria-current="page"]')
    if (current && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = current.offsetLeft - el.offsetLeft - (el.clientWidth - current.offsetWidth) / 2
    }
    update()
  }, [activeKey, update])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [update])

  return (
    <div className="relative">
      <nav
        ref={ref}
        aria-label={label}
        className={cn(className, 'no-scrollbar max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:*:shrink-0')}
      >
        {children}
      </nav>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r to-transparent transition-opacity sm:hidden',
          fadeClassName,
          edges.start ? 'opacity-100' : 'opacity-0',
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l to-transparent transition-opacity sm:hidden',
          fadeClassName,
          edges.end ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}
