import type { Metadata } from 'next'
import { OwnPayeeCard } from '@/components/field/own-payee-card'

export const metadata: Metadata = { title: 'ข้อมูลรับเงิน' }

/** ข้อมูลรับเงินของพนักงานเอง (staging E-035 · `41` §7.12) — อ่านอย่างเดียว แก้ไขต้องแจ้งการเงิน */
export default function FieldProfilePage() {
  return <OwnPayeeCard />
}
