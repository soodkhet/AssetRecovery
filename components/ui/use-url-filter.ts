'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { initialUrlParam, pickParam, replaceUrlParams } from '@/components/ui/url-state'

/**
 * ตัวกรองย่อยในแท็บ (เช่น สถานะรอบวางบิล) ที่ผูกกับ `?key=` — refresh/Back กลับมายังกรองเหมือนเดิม (preship R6-008)
 *
 * - ค่าเริ่มต้นอ่านจาก URL จริงของ browser (`initialUrlParam` — Back กลับมา searchParams ของ Next อาจเป็นของเก่า R6-004)
 *   ฝั่ง server ใช้ `useSearchParams()` ⇒ ตอน hydrate ได้ค่าเดียวกัน
 * - ค่าไม่อยู่ใน `options` = `fallback` · ค่า `fallback` ไม่ใส่ใน URL (URL สั้น)
 */
export function useUrlFilter<T extends string>(
  key: string,
  options: readonly { readonly value: T }[],
  fallback: T,
): [T, Dispatch<SetStateAction<T>>] {
  const pathname = usePathname()
  const serverValue = useSearchParams().get(key)
  const [value, setValue] = useState<T>(() =>
    pickParam(
      initialUrlParam(key, serverValue, pathname) ?? undefined,
      options.map((option) => option.value),
      fallback,
    ),
  )
  useEffect(() => {
    replaceUrlParams({ [key]: value === fallback ? null : value })
  }, [key, value, fallback])
  return [value, setValue]
}
