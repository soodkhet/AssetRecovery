import type { Metadata } from 'next'
import { JobsManager } from '@/components/jobs/jobs-manager'
import { isDevToolsEnabled } from '@/lib/env'
import { requireMenuPage } from '@/lib/nav/menu-guard'

export const metadata: Metadata = { title: 'งานเบื้องหลัง' }

/**
 * ตั้งค่าทั่วไป → งานเบื้องหลัง (Job Log) — `91` §8 · `06` §9
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/jobs` ที่ตรวจ `requirePermission(..., 'manage_jobs')`
 * และกรอง scope เองทุกครั้ง (DEC-002)
 */
export default async function SettingsJobsPage() {
  await requireMenuPage('settings.jobs')
  // staging E-013 — แผงสั่งงานทันทีเฉพาะระบบทดสอบ (Vercel Preview ที่ตั้ง ENABLE_DEV_TOOLS=1 / เครื่อง dev)
  return <JobsManager devToolsEnabled={isDevToolsEnabled()} />
}
