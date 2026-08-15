'use client'

import { useEffect } from 'react'
import { Button, Card, ErrorState, PageHeader } from '@/components/ui'

/**
 * Error boundary ของทุกหน้าใน App Shell (Rule 05 — "ทุกหน้าต้องมี loading / empty / error state")
 * ก่อนหน้า Phase 8.3 ไม่มีไฟล์นี้เลย ⇒ server component ที่ throw จะได้หน้า default ภาษาอังกฤษ
 * ของ Next ที่ไม่มี App Shell (Final Test ด่าน 5)
 *
 * ไม่แสดง `error.message` ดิบบนจอ — ข้อความจาก server อาจมีรายละเอียดภายใน (ชื่อตาราง/ค่า)
 * ผู้ใช้ได้ `digest` ไว้แจ้งปัญหาแทน
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <>
      <PageHeader title="เกิดข้อผิดพลาด" description="ระบบทำงานผิดพลาดระหว่างเปิดหน้านี้" />
      <Card padded={false}>
        <ErrorState
          title="เปิดหน้านี้ไม่สำเร็จ"
          message="ลองใหม่อีกครั้ง — ถ้ายังไม่ได้ กรุณาแจ้งผู้ดูแลระบบพร้อมรหัสอ้างอิงด้านล่าง"
          code={error.digest}
          action={
            <Button type="button" onClick={reset}>
              ลองใหม่
            </Button>
          }
        />
      </Card>
    </>
  )
}
