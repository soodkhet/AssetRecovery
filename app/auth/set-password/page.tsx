import type { Metadata } from 'next'
import { SetPasswordForm } from '@/components/auth/set-password-form'

export const metadata: Metadata = {
  title: 'ตั้งรหัสผ่าน — AssetRecovery',
}

/**
 * ปลายทางของลิงก์ในอีเมลคำเชิญ (`inviteUserByEmail` → `redirectTo`) — มติ PO ปิด open item D1
 *
 * ⚠️ URL นี้ต้องถูกเพิ่มใน Supabase Dashboard → Authentication → URL Configuration → Redirect URLs
 * ของทุก environment (local / staging / production) ไม่งั้นลิงก์จะเด้งกลับ site URL แทน
 *
 * หน้านี้อยู่นอก route group `(app)` และไม่มี route guard — ผู้ใช้ยังไม่มี session ของระบบเราตอนกดลิงก์
 */
export default function SetPasswordPage() {
  return <SetPasswordForm />
}
