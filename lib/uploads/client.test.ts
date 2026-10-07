import { afterEach, describe, expect, it, vi } from 'vitest'

/** อัปโหลดค้างต้องจบด้วย error ที่ผู้ใช้อ่านได้ ไม่ล็อก modal ตลอดไป (preship R2-024) */

const uploadToSignedUrlMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: uploadToSignedUrlMock }) } }),
}))
vi.mock('@/lib/api/types', () => ({
  callApi: async () => ({ data: { path: 'org/x/receipt.jpg', token: 't' } }),
  jsonRequest: (method: string, body: unknown) => ({ method, body: JSON.stringify(body) }),
}))

const { StorageUploadError, uploadTimeoutMs, uploadToStorage } = await import('@/lib/uploads/client')

afterEach(() => {
  vi.useRealTimers()
  uploadToSignedUrlMock.mockReset()
})

describe('uploadToStorage — timeout (R2-024)', () => {
  it('อัปโหลดสำเร็จ ⇒ คืน path จาก server', async () => {
    uploadToSignedUrlMock.mockResolvedValue({ data: {}, error: null })
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    await expect(uploadToStorage({ kind: 'expense_receipt' } as never, file)).resolves.toBe('org/x/receipt.jpg')
  })

  it('ค้างเกินเวลา ⇒ StorageUploadError ข้อความไทย', async () => {
    vi.useFakeTimers()
    uploadToSignedUrlMock.mockReturnValue(new Promise(() => undefined))
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    const pending = uploadToStorage({ kind: 'expense_receipt' } as never, file)
    const assertion = expect(pending).rejects.toBeInstanceOf(StorageUploadError)
    await vi.advanceTimersByTimeAsync(uploadTimeoutMs(file.size))
    await assertion
    await expect(pending).rejects.toThrow(/ใช้เวลานานเกินไป/)
  })

  it('เวลารอเพิ่มตามขนาดไฟล์ (วิดีโอใหญ่บนเน็ตช้าไม่ถูกตัดก่อนเวลา)', () => {
    expect(uploadTimeoutMs(0)).toBe(120_000)
    expect(uploadTimeoutMs(50 * 1024 * 1024)).toBeGreaterThan(600_000)
  })
})
