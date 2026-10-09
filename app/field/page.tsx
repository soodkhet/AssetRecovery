import type { Metadata } from 'next'
import { FieldDashboard } from '@/components/field/field-dashboard'

export const metadata: Metadata = { title: 'หน้าแรก' }

/** หน้าแรกของ Field Tracker — Dashboard 5 บล็อก (`41` §7.1) */
export default function FieldDashboardPage() {
  return <FieldDashboard />
}
