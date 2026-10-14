'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { revealFirstFieldError } from '@/components/ui/input'

/**
 * ผูก `revealFirstFieldError()` กับ "ครั้งที่กดส่งแล้วไม่ผ่าน" — เรียก `reveal()` หลัง set error แล้ว ระบบจะเลื่อน+โฟกัส
 * ช่องแรกที่ผิดภายใน `ref` หลัง render รอบถัดไป (ไม่ผูกกับ errors ตรง ๆ จึงไม่เด้งระหว่างพิมพ์ — แบบ team-form-modal)
 * · ตรวจซ้ำ staging SV5-R4-01
 */
export function useRevealFieldError<T extends HTMLElement = HTMLDivElement>(): {
  ref: RefObject<T | null>
  reveal: () => void
} {
  const ref = useRef<T>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (tick > 0) revealFirstFieldError(ref.current)
  }, [tick])
  return { ref, reveal: () => setTick((value) => value + 1) }
}
