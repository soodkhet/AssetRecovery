'use client'

import { useRef, type KeyboardEvent } from 'react'

/**
 * กลุ่มปุ่มเลือกแบบ radio (`role="radiogroup"` + ปุ่ม `role="radio"`) ให้ใช้คีย์บอร์ดตามแบบ WAI-ARIA APG
 * (ตรวจซ้ำ staging SV5-A11Y-A2-03 รอบรีวิว): **roving tabindex** — Tab เข้ากลุ่มได้ครั้งเดียวที่ตัวที่เลือก
 * (ยังไม่เลือก ⇒ ตัวแรก) · ลูกศรขึ้น/ลง/ซ้าย/ขวา ย้ายโฟกัสพร้อมเลือก (วนรอบ) · Home/End = ตัวแรก/ตัวสุดท้าย
 */

/** tabIndex ของตัวเลือกลำดับ `index` — `selectedIndex` < 0 = ยังไม่เลือก ⇒ ตัวแรกรับ Tab */
export function rovingTabIndex(index: number, selectedIndex: number): 0 | -1 {
  const active = selectedIndex >= 0 ? selectedIndex : 0
  return index === active ? 0 : -1
}

/** ลำดับตัวเลือกปลายทางเมื่อกดปุ่ม `key` ที่ตัวลำดับ `index` (จากทั้งหมด `count`) — `null` = ไม่ใช่ปุ่มของกลุ่ม */
export function rovingRadioTarget(key: string, index: number, count: number): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/**
 * hook ของกลุ่ม radio แบบปุ่ม — กระจาย `radioProps(option, index)` ลงปุ่มแต่ละตัว (ได้ role/aria-checked/tabIndex/
 * onClick/onKeyDown/ref ครบ) · `disabled` = กลุ่มล็อก (ไม่เปลี่ยนค่าด้วยลูกศร)
 */
export function useRovingRadio<T>({
  options,
  value,
  onSelect,
  disabled = false,
}: {
  options: readonly T[]
  value: T | null
  onSelect: (option: T) => void
  disabled?: boolean
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = value === null ? -1 : options.indexOf(value)
  return {
    radioProps: (option: T, index: number) => ({
      role: 'radio' as const,
      'aria-checked': option === value,
      tabIndex: rovingTabIndex(index, selectedIndex),
      ref: (element: HTMLButtonElement | null) => {
        refs.current[index] = element
      },
      onClick: () => onSelect(option),
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return
        const target = rovingRadioTarget(event.key, index, options.length)
        if (target === null) return
        event.preventDefault()
        const next = options[target]
        if (next === undefined) return
        onSelect(next)
        refs.current[target]?.focus()
      },
    }),
  }
}
