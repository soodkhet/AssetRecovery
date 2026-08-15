import { AuditLogsManager } from '@/components/audit/audit-logs-manager'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * ตั้งค่าทั่วไป → บันทึกการใช้งาน (Audit Log) — `90` §8 · `06` §9 (แท็บ `auditlog`)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/audit-logs` ที่ตรวจ `requirePermission('view', 'view_audit_log')`
 * และกรอง scope เองทุกครั้ง (DEC-002)
 */
export default async function SettingsAuditLogsPage() {
  await requireMenuPage('settings.audit-logs')
  return <AuditLogsManager />
}
