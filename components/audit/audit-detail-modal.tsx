'use client'

import { useAuditLogDetail } from '@/components/audit/use-audit-logs'
import { Button, InlineAlert, LoadingState, Modal, RefText, StatusBadge } from '@/components/ui'
import {
  auditActionLabel,
  auditActorLabel,
  auditFieldChanges,
  auditTargetLabel,
  auditValueText,
  AUDIT_ACTION_GROUP,
} from '@/lib/audit/log-display'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * รายละเอียดรายการ audit — **อ่านอย่างเดียวเสมอ** ไม่มีปุ่มแก้/ลบ (`90` §8/§10 · `02` §13)
 * ตารางเทียบค่าก่อน/หลังต่อฟิลด์ (`90` §14 "before/after JSON เต็ม") + ที่มาของการเรียก (IP/อุปกรณ์)
 */
export function AuditDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { detail, loading, error } = useAuditLogDetail(id)
  const changes = detail === null ? [] : auditFieldChanges(detail.before, detail.after)

  // audit immutable — `90` §10 / `02` §13 (อ้างสเปคไว้ในคอมเมนต์ ไม่ปล่อยเลขไฟล์ขึ้นหน้าจอผู้ใช้)
  return (
    <Modal
      open={id !== null}
      onClose={onClose}
      size="lg"
      title="รายละเอียดบันทึกการใช้งาน"
      description="ข้อมูลชุดนี้แก้ไขหรือลบไม่ได้ทุกกรณี — ใช้เป็นหลักฐานการตรวจสอบย้อนหลัง"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          ปิด
        </Button>
      }
    >
      {loading && <LoadingState message="กำลังโหลดรายละเอียด..." />}
      {error !== null && <InlineAlert tone="error" title={error.title}>{error.message}</InlineAlert>}

      {/* ระหว่างโหลดรายการใหม่ ต้องไม่ค้างข้อมูลของรายการก่อนหน้าให้เข้าใจผิด */}
      {!loading && detail !== null && (
        <div className="space-y-5">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Item label="วันเวลา">{fmtDateTime(detail.createdAt)}</Item>
            <Item label="การกระทำ">
              <StatusBadge group={AUDIT_ACTION_GROUP[detail.action]} label={auditActionLabel(detail.action)} />
            </Item>
            <Item label="ผู้ดำเนินการ">{auditActorLabel(detail.actorName, detail.actorRole)}</Item>
            <Item label="เป้าหมาย">
              {auditTargetLabel(detail.targetType)}
              {detail.targetId !== null && <RefText className="ml-2">{detail.targetId}</RefText>}
            </Item>
            <Item label="เหตุผล">{detail.reason ?? '—'}</Item>
            <Item label="ที่มาการเรียก">
              {detail.ipAddress ?? '—'}
              {detail.userAgent !== null && (
                <span className="mt-0.5 block truncate text-xs text-slate-400">{detail.userAgent}</span>
              )}
            </Item>
          </dl>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">ค่าก่อน / หลัง</h3>
            {changes.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                รายการนี้ไม่ได้เก็บค่าก่อน/หลัง (เช่น การเข้าสู่ระบบ)
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        ฟิลด์
                      </th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        ก่อน
                      </th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        หลัง
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {changes.map((change) => (
                      <tr key={change.field} className="align-top">
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{change.field}</td>
                        <td className="px-3 py-2 text-xs break-all text-slate-500">{auditValueText(change.before, change.field)}</td>
                        <td className="px-3 py-2 text-xs font-medium break-all text-slate-800">
                          {auditValueText(change.after, change.field)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  )
}
