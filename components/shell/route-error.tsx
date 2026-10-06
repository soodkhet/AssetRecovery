'use client'

import { useEffect } from 'react'
import { Button, Card, ErrorState, PageHeader } from '@/components/ui'

/**
 * หน้าจอ error ของ route segment (`error.tsx`) — ใช้ร่วมกันทั้ง App Shell / Field Tracker / Client Portal
 * (Rule 05 — "ทุกหน้าต้องมี loading / empty / error state") · ไม่มี boundary = server component ที่ throw
 * ได้หน้า default ภาษาอังกฤษของ Next
 *
 * ไม่แสดง `error.message` ดิบบนจอ — ข้อความจาก server อาจมีรายละเอียดภายใน (ชื่อตาราง/ค่า)
 * ผู้ใช้ได้ `digest` ไว้แจ้งปัญหาแทน
 */
export function RouteErrorFallback({
  error,
  reset,
  withHeader = true,
}: {
  error: Error & { digest?: string }
  reset: () => void
  /** หน้า Field Tracker (มือถือ) ไม่มี PageHeader แบบ desktop */
  withHeader?: boolean
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <>
      {withHeader && <PageHeader title="เกิดข้อผิดพลาด" description="ระบบทำงานผิดพลาดระหว่างเปิดหน้านี้" />}
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
