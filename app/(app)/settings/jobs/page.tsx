import { JobsManager } from '@/components/jobs/jobs-manager'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * ตั้งค่าทั่วไป → งานเบื้องหลัง (Job Log) — `91` §8 · `06` §9
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/jobs` ที่ตรวจ `requirePermission(..., 'manage_jobs')`
 * และกรอง scope เองทุกครั้ง (DEC-002)
 */
export default async function SettingsJobsPage() {
  await requireMenuPage('settings.jobs')
  return <JobsManager />
}
