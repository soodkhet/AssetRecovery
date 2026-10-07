'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/components/ui/cn'

/** เงาซ้าย/ขวา — เข้มพอเห็นบนพื้นขาว/slate-50/แถวมีสี (preship R5-003) */
const SHADOW_START = 'linear-gradient(to right, rgba(15,23,42,0.22), rgba(15,23,42,0.08) 40%, rgba(15,23,42,0))'
const SHADOW_END = 'linear-gradient(to left, rgba(15,23,42,0.22), rgba(15,23,42,0.08) 40%, rgba(15,23,42,0))'

/**
 * กล่องเลื่อนแนวนอนของ `<Table>` + **เงา overlay** ที่ขอบฝั่งที่ยังมีคอลัมน์ซ่อนอยู่
 *
 * ทำไม overlay: รอบ 4 ใช้ background ของกล่องเลื่อน (CSS ล้วน) แต่พื้น `thead bg-slate-50` และแถวที่มีพื้นทึบ
 * วาดทับเงา ⇒ แถวหัวตารางไม่มีสัญญาณเลย (preship R5-003) — overlay ลอยเหนือทั้ง thead/tbody เสมอ
 * · เป็น client component เล็กๆ ⇒ `<Table>` ยังเรียกจาก server component ได้เหมือนเดิม
 */
export function TableScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
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
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    // ตารางกว้างขึ้นเมื่อข้อมูลโหลดเสร็จ (กล่องเลื่อนไม่เปลี่ยนขนาด) ⇒ ดูตัวตารางด้วย
    const table = el.firstElementChild
    if (table) observer?.observe(table)
    return () => {
      el.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [update])

  return (
    // `isolate` — z-index ของเงาไม่หลุดไปทับ dropdown/popover นอกตาราง
    <div className="relative isolate">
      <div ref={ref} className="overflow-x-auto">
        {children}
      </div>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 z-10 w-6 transition-opacity',
          edges.start ? 'opacity-100' : 'opacity-0',
        )}
        style={{ background: SHADOW_START }}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-10 w-6 transition-opacity',
          edges.end ? 'opacity-100' : 'opacity-0',
        )}
        style={{ background: SHADOW_END }}
      />
    </div>
  )
}
