import Link from 'next/link'
import { buttonClass, Card, EmptyState } from '@/components/ui'
import { DASHBOARD_PATH } from '@/lib/auth/constants'

/**
 * หน้า 404 ของทั้งแอป (Rule 05) — ก่อน Phase 8.3 URL ที่ไม่มีจริงจะได้หน้า default
 * ภาษาอังกฤษของ Next ซึ่งไม่มีทางกลับเข้าระบบ (Final Test ด่าน 5)
 *
 * ไม่ผูก layout ของ App Shell เพราะ `not-found` ระดับ root ต้องเรนเดอร์ได้แม้ยังไม่ล็อกอิน
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4">
      <Card padded={false} className="w-full">
        <EmptyState
          title="ไม่พบหน้าที่ต้องการ"
          description="ลิงก์อาจถูกเปลี่ยนหรือหน้านี้ถูกย้ายไปแล้ว"
          action={
            <Link href={DASHBOARD_PATH} className={buttonClass()}>
              กลับหน้าแดชบอร์ด
            </Link>
          }
        />
      </Card>
    </main>
  )
}
