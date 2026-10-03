import { describe, expect, it } from 'vitest'
import { isTopModal, registerModal, unregisterModal } from '@/components/ui/modal-stack'

describe('modal-stack — Esc ปิดเฉพาะ modal บนสุด (UAT BUG-031)', () => {
  it('modal ที่เปิดทีหลังอยู่บนสุด · ปิดแล้วตัวข้างหลังกลับมาเป็นบนสุด', () => {
    const review = registerModal()
    expect(isTopModal(review)).toBe(true)

    const viewer = registerModal()
    expect(isTopModal(viewer)).toBe(true)
    expect(isTopModal(review)).toBe(false)

    unregisterModal(viewer)
    expect(isTopModal(review)).toBe(true)
    unregisterModal(review)
    expect(isTopModal(review)).toBe(false)
  })

  it('ถอนตัวที่อยู่กลางกองได้โดยไม่กระทบตัวบนสุด และถอนซ้ำไม่พัง', () => {
    const first = registerModal()
    const second = registerModal()
    const third = registerModal()
    unregisterModal(second)
    unregisterModal(second)
    expect(isTopModal(third)).toBe(true)
    unregisterModal(third)
    expect(isTopModal(first)).toBe(true)
    unregisterModal(first)
  })
})
