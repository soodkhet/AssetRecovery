'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button, Modal, buttonClass } from '@/components/ui'
import { loginUrlFor, SESSION_EXPIRED_EVENT } from '@/lib/api/session-expiry'

/**
 * กล่อง "เซสชันหมดอายุ" — เปิดเมื่อ API ตอบ 401 `UNAUTHENTICATED` (preship R8-009) · วางใน shell ทุกตัว
 *
 * - **เข้าสู่ระบบในแท็บใหม่** (แนะนำ): cookie ใช้ร่วมกัน ⇒ กลับมาแท็บนี้แล้วกดบันทึกซ้ำได้ ข้อมูลที่กรอกค้างไม่หาย
 * - **เข้าสู่ระบบใหม่**: ไปหน้า login ในแท็บนี้แล้วกลับมาหน้าเดิม (`?next=`) — ข้อมูลที่กรอกค้างจะหาย
 */
export function SessionExpiredDialog() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()
  const loginUrl = loginUrlFor(pathname, query === '' ? '' : `?${query}`)

  useEffect(() => {
    const onExpired = () => setOpen(true)
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
      description="ระบบออกจากระบบให้อัตโนมัติ — รายการล่าสุดยังไม่ถูกบันทึก"
      footer={
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
      }
    >
      <p className="text-sm text-slate-600">
        แนะนำให้เข้าสู่ระบบในแท็บใหม่ แล้วกลับมาที่หน้านี้กดบันทึกอีกครั้ง — ข้อมูลที่กรอกค้างไว้จะไม่หาย
        ถ้าเลือก “เข้าสู่ระบบใหม่” ระบบจะพากลับมาหน้านี้หลังเข้าสู่ระบบ แต่ข้อมูลที่กรอกค้างจะหาย
      </p>
    </Modal>
  )
}
