import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('ข้ามค่า false/null/undefined', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })

  it('คลาสที่ขัดกัน ตัวหลังชนะ (เช่น w-44 ทับ w-full ของ Select)', () => {
    expect(cn('w-full rounded-lg', 'w-44')).toBe('rounded-lg w-44')
    expect(cn('bg-white', 'bg-slate-50')).toBe('bg-slate-50')
  })

  it('responsive variant ไม่ถูกตัดทิ้ง', () => {
    expect(cn('w-full', 'lg:w-48')).toBe('w-full lg:w-48')
  })
})
