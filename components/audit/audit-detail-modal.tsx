'use client'

import { useAuditLogDetail } from '@/components/audit/use-audit-logs'
import {
  Button,
  InlineAlert,
  LoadingState,
  Modal,
  RefText,
  StatusBadge,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import {
  auditRowDisplay,
  auditActorLabel,
  auditFieldChanges,
  auditFieldLabel,
  auditRefLabel,
  auditTargetLabel,
  auditValueDisplay,
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
      {error !== null && (
        <InlineAlert tone="error" title={error.title}>
          {error.message}
        </InlineAlert>
      )}

      {/* ระหว่างโหลดรายการใหม่ ต้องไม่ค้างข้อมูลของรายการก่อนหน้าให้เข้าใจผิด */}
      {!loading && detail !== null && (
        <div className="space-y-5">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Item label="วันเวลา">{fmtDateTime(detail.createdAt)}</Item>
            <Item label="การกระทำ">
              <StatusBadge group={auditRowDisplay(detail).group} label={auditRowDisplay(detail).label} />
            </Item>
            <Item label="ผู้ดำเนินการ">{auditActorLabel(detail.actorName, detail.actorRole, detail.loginFailure)}</Item>
            <Item label="เป้าหมาย">
              {auditTargetLabel(detail.targetType)}
              {detail.targetRef !== null && (
                <>
                  {' '}
                  <RefText className="ml-1">{detail.targetRef}</RefText>
                </>
              )}
              {/* known H-06 — UUID ยังดูได้ในรายละเอียด (บรรทัดย่อย) */}
              {detail.targetId !== null && (
                <RefText className="mt-0.5 block text-[11px] break-all text-slate-400">{detail.targetId}</RefText>
              )}
            </Item>
            <Item label="เหตุผล">{auditRowDisplay(detail).detail}</Item>
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
              <Table>
                <THead>
                  <Tr>
                    <Th className="px-3 py-2">ฟิลด์</Th>
                    <Th className="px-3 py-2">ก่อน</Th>
                    <Th className="px-3 py-2">หลัง</Th>
                  </Tr>
                </THead>
                <TBody>
                  {changes.map((change) => (
                    <Tr key={change.field} className="align-top">
                      {/* mytester H-06 — ชื่อฟิลด์/ค่าเป็นภาษาไทยเมื่อรู้จัก */}
                      <Td className="px-3 py-2 text-xs">{auditFieldLabel(change.field)}</Td>
                      <Td
                        className="px-3 py-2 text-xs break-all text-slate-500"
                        title={refTooltip(change.before, change.field, detail.refLabels)}
                      >
                        {auditValueDisplay(change.before, change.field, detail.targetType, detail.refLabels)}
                      </Td>
                      <Td
                        className="px-3 py-2 text-xs font-medium break-all text-slate-800"
                        title={refTooltip(change.after, change.field, detail.refLabels)}
                      >
                        {auditValueDisplay(change.after, change.field, detail.targetType, detail.refLabels)}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
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

/** known H-06 — ค่าที่แสดงเป็นชื่อแทน id ⇒ tooltip บอก UUID เดิม */
function refTooltip(value: unknown, field: string, refLabels: Readonly<Record<string, string>>): string | undefined {
  return auditRefLabel(value, field, refLabels) !== null && typeof value === 'string' ? value : undefined
}
