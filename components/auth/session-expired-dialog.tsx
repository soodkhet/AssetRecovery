'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button, Modal, buttonClass } from '@/components/ui'
import { loginUrlFor, SESSION_EXPIRED_EVENT } from '@/lib/api/session-expiry'

/**
 * แอปที่ติดตั้งบนหน้าจอโฮม (PWA `display: standalone`) — บน iOS ลิงก์แท็บใหม่เปิดใน Safari ซึ่งไม่ใช้ cookie ร่วมกับแอป
 * ⇒ เข้าสู่ระบบในแท็บใหม่แล้วแอปยังไม่มี session (preship R9-011)
 */
function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

/**
 * กล่อง "เซสชันหมดอายุ" — เปิดเมื่อ API ตอบ 401 ของ session (preship R8-009 · R9-003) · วางใน shell ทุกตัว
 *
 * - **เข้าสู่ระบบในแท็บใหม่** (แนะนำบนเบราว์เซอร์): cookie ใช้ร่วมกัน ⇒ กลับมาแท็บนี้แล้วกดบันทึกซ้ำได้ ข้อมูลที่กรอกค้างไม่หาย
 * - **เข้าสู่ระบบใหม่**: ไปหน้า login ในแท็บนี้แล้วกลับมาหน้าเดิม (`?next=`) — ข้อมูลที่กรอกค้างจะหาย
 *   แอปที่ติดตั้งบนหน้าจอโฮมมีแค่ทางนี้ (R9-011)
 * - ถ้อยคำไม่ยืนยันว่า "มีรายการยังไม่บันทึก" — กล่องเปิดได้จากการโหลดข้อมูลเฉย ๆ เช่นกระดิ่งรีเฟรช (R9-015)
 */
export function SessionExpiredDialog() {
  const [open, setOpen] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()
  const loginUrl = loginUrlFor(pathname, query === '' ? '' : `?${query}`)

  useEffect(() => {
    const onExpired = () => {
      setStandalone(isStandaloneApp())
      setOpen(true)
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      confirmDiscard={false}
      size="sm"
      title="เซสชันหมดอายุ"
      description="ระบบออกจากระบบให้อัตโนมัติ — ต้องเข้าสู่ระบบใหม่เพื่อใช้งานต่อ"
      footer={
        standalone ? (
          <Button onClick={() => window.location.assign(loginUrl)}>เข้าสู่ระบบใหม่</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => window.location.assign(loginUrl)}>
              เข้าสู่ระบบใหม่
            </Button>
            <a
              href={loginUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className={buttonClass('primary')}
            >
              เข้าสู่ระบบในแท็บใหม่
            </a>
          </>
        )
      }
    >
      {standalone ? (
        <p className="text-sm text-slate-600">
          ถ้ากำลังกรอกฟอร์มค้างไว้ รายการนั้นยังไม่ถูกบันทึก — จดข้อมูลที่กรอกไว้ก่อน แล้วกด “เข้าสู่ระบบใหม่”
          ระบบจะพากลับมาหน้านี้หลังเข้าสู่ระบบ
        </p>
      ) : (
        <p className="text-sm text-slate-600">
          ถ้ากำลังกรอกฟอร์มค้างไว้ รายการนั้นยังไม่ถูกบันทึก — แนะนำให้เข้าสู่ระบบในแท็บใหม่ แล้วกลับมาที่หน้านี้กดบันทึกอีกครั้ง
          ข้อมูลที่กรอกจะไม่หาย · ถ้าเลือก “เข้าสู่ระบบใหม่” ระบบจะพากลับมาหน้านี้ แต่ข้อมูลที่กรอกค้างจะหาย
        </p>
      )}
    </Modal>
  )
}
