import { FetchTimeoutError, fetchWithTimeout } from '@/lib/api/fetch-with-timeout'

/**
 * เรียก `POST /api/auth/logout` ฝั่ง client — คืน `null` เมื่อออกจากระบบสำเร็จ หรือข้อความไทยเมื่อไม่สำเร็จ
 * preship R3-010: ต้องตรวจ `response.ok` ด้วย — เดิม server ตอบ error (เช่น 500) แต่หน้าจอพาไปหน้า login
 * เหมือนสำเร็จทั้งที่ session ยังใช้ได้ (เครื่องใช้ร่วม คนถัดไปเข้าบัญชีเดิมได้)
 * ใช้ร่วมปุ่มออกจากระบบของหน้าหลักและแอปภาคสนาม
 */
export async function requestLogout(fetcher: typeof fetchWithTimeout = fetchWithTimeout): Promise<string | null> {
  try {
    const response = await fetcher('/api/auth/logout', { method: 'POST' })
    if (response.ok) return null
    return 'ระบบขัดข้อง ออกจากระบบไม่สำเร็จ กรุณาลองใหม่ — ถ้ายังไม่ได้ ให้ปิดเบราว์เซอร์และแจ้งผู้ดูแลระบบ'
  } catch (caught) {
    return caught instanceof FetchTimeoutError
      ? 'ระบบตอบช้าเกินไป ออกจากระบบไม่สำเร็จ กรุณาลองใหม่'
      : 'เชื่อมต่อไม่สำเร็จ ออกจากระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'
  }
}
