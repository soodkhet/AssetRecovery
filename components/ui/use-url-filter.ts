'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { initialUrlParam, pickParam, replaceUrlParams } from '@/components/ui/url-state'
import { useSearchQueryChange } from '@/components/ui/use-search-param-change'

/**
 * ตัวกรองย่อยในแท็บ (เช่น สถานะรอบวางบิล) ที่ผูกกับ `?key=` — refresh/Back กลับมายังกรองเหมือนเดิม (preship R6-008)
 *
 * - ค่าเริ่มต้นอ่านจาก URL จริงของ browser (`initialUrlParam` — Back กลับมา searchParams ของ Next อาจเป็นของเก่า R6-004)
 *   ฝั่ง server ใช้ `useSearchParams()` ⇒ ตอน hydrate ได้ค่าเดียวกัน
 * - ค่าไม่อยู่ใน `options` = `fallback` · ค่า `fallback` ไม่ใส่ใน URL (URL สั้น)
 * - URL เปลี่ยนจากการนำทาง (กดแจ้งเตือนที่พามาแท็บเดิม) ⇒ ตัวกรองตาม URL (R7-004 — เดิมจอยังกรองแต่ URL ไม่มีตัวกรอง)
 */
export function useUrlFilter<T extends string>(
  key: string,
  // ชุดตัวเลือกของ FilterGroup/Select เดิมของแท็บ (บางแท็บประกาศ value เป็น string) — ค่าที่รับได้มีแค่ในชุดนี้
  options: readonly { readonly value: string }[],
  fallback: T,
): [T, Dispatch<SetStateAction<T>>] {
  const pathname = usePathname()
  const serverValue = useSearchParams().get(key)
  const pick = (raw: string | null): T =>
    pickParam(
      raw ?? undefined,
      options.map((option) => option.value as T),
      fallback,
    )
  const [value, setValue] = useState<T>(() => pick(initialUrlParam(key, serverValue, pathname)))
  useSearchQueryChange((params) => setValue(pick(params.get(key))))
  useEffect(() => {
    replaceUrlParams({ [key]: value === fallback ? null : value })
  }, [key, value, fallback])
  return [value, setValue]
}
