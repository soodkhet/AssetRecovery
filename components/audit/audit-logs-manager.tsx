'use client'

import { useState } from 'react'
import { AuditDetailModal } from '@/components/audit/audit-detail-modal'
import { EMPTY_AUDIT_FILTERS, useAuditLogs, type AuditLogFilters } from '@/components/audit/use-audit-logs'
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  RefText,
  Select,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { AUDIT_ACTION_GROUP, AUDIT_ACTION_LABEL, auditActorLabel, auditTargetLabel } from '@/lib/audit/log-display'
import type { AuditLogAction } from '@/lib/audit/log-schemas'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtCount } from '@/lib/format/money'

/**
 * ตั้งค่าทั่วไป → บันทึกการใช้งาน (Audit Log) — `90` §8/§14 · mockup `settings.html` แท็บ `auditlog`
 *
 * **หน้าอ่านอย่างเดียวทั้งหน้า** ไม่มีปุ่มแก้/ลบเลย (`02` §13 — audit immutable แม้ Superadmin)
 * ตัวกรองทุกช่องถูกส่งไปที่ API (ห้ามกรองฝั่ง client — หน้าเดียวโหลดแค่ 50 แถว)
 *
 * ⚠️ ปุ่ม "Filter / Export" ของ mockup ทำเฉพาะส่วน Filter ที่นี่ — การ export CSV/Excel รอ
 *    Export Engine กลางของ Phase 6.1 (`96` §12) เพื่อไม่ให้เกิดตัวส่งออกซ้ำสองระบบ
 */

const ACTION_OPTIONS = Object.entries(AUDIT_ACTION_LABEL) as [AuditLogAction, string][]

export function AuditLogsManager() {
  const [filters, setFilters] = useState<AuditLogFilters>(EMPTY_AUDIT_FILTERS)
  const [offset, setOffset] = useState(0)
  const [openedId, setOpenedId] = useState<string | null>(null)

  const { data, loading, error, reload } = useAuditLogs(filters, offset)

  function update(patch: Partial<AuditLogFilters>): void {
    setFilters((current) => ({ ...current, ...patch }))
    setOffset(0)
  }

  const shown = data.items.length
  const from = shown === 0 ? 0 : data.offset + 1

  return (
    <div className="space-y-6">
      <PageHeader
        title="บันทึกการใช้งาน (Audit Log)"
        description="ประวัติการกระทำทั้งระบบ — อ่านอย่างเดียว แก้ไขหรือลบไม่ได้ทุกกรณี เก็บ 5 ปีตามกฎหมายบัญชี"
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="เป้าหมาย (Target)">
            <Select value={filters.targetType} onChange={(event) => update({ targetType: event.target.value })}>
              <option value="">ทั้งหมด</option>
              {data.targetTypes.map((targetType) => (
                <option key={targetType} value={targetType}>
                  {auditTargetLabel(targetType)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="การกระทำ (Action)">
            <Select
              value={filters.action}
              onChange={(event) => update({ action: event.target.value as AuditLogFilters['action'] })}
            >
              <option value="all">ทั้งหมด</option>
              {ACTION_OPTIONS.map(([action, label]) => (
                <option key={action} value={action}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {/* `<input type="date">` = ข้อยกเว้นเดียวที่ใช้ ค.ศ. (DEC-005) — ช่วงวันถูกตีความเป็นวันไทยที่ backend */}
          <Field label="ตั้งแต่วันที่">
            <Input type="date" value={filters.dateFrom} onChange={(event) => update({ dateFrom: event.target.value })} />
          </Field>
          <Field label="ถึงวันที่">
            <Input type="date" value={filters.dateTo} onChange={(event) => update({ dateTo: event.target.value })} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            แสดง {fmtCount(from)}–{fmtCount(data.offset + shown)} จาก {fmtCount(data.total)} รายการ
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFilters(EMPTY_AUDIT_FILTERS)}>
              ล้างตัวกรอง
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void reload()}>
              รีเฟรช
            </Button>
          </div>
        </div>
      </Card>

      <Table>
        <THead>
          <Tr>
            <Th>วันเวลา</Th>
            <Th>การกระทำ (Action)</Th>
            <Th>ผู้ดำเนินการ</Th>
            <Th>เป้าหมาย (Target)</Th>
            <Th>เหตุผล / รายละเอียด</Th>
          </Tr>
        </THead>
        <TableState
          colSpan={5}
          loading={loading}
          error={error}
          isEmpty={!loading && error === null && shown === 0}
          emptyTitle="ไม่พบบันทึกตามตัวกรองนี้"
          emptyDescription="ลองขยายช่วงวันที่ หรือเลือกเป้าหมาย/การกระทำอื่น"
        />
        {!loading && error === null && shown > 0 && (
          <TBody>
            {data.items.map((row) => (
              <Tr key={row.id} interactive onClick={() => setOpenedId(row.id)}>
                <Td className="text-xs whitespace-nowrap text-slate-500">{fmtDateTime(row.createdAt)}</Td>
                <Td>
                  <StatusBadge group={AUDIT_ACTION_GROUP[row.action]} label={AUDIT_ACTION_LABEL[row.action]} />
                </Td>
                <Td className="text-slate-600">{auditActorLabel(row.actorName, row.actorRole)}</Td>
                <Td className="text-slate-600">
                  {auditTargetLabel(row.targetType)}
                  {row.targetId !== null && <RefText className="ml-2 text-xs">{row.targetId.slice(0, 8)}</RefText>}
                </Td>
                <Td className="max-w-md truncate text-xs text-slate-500">{row.reason ?? '—'}</Td>
              </Tr>
            ))}
          </TBody>
        )}
      </Table>

      {(data.offset > 0 || data.hasMore) && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={data.offset === 0}
            onClick={() => setOffset(Math.max(0, data.offset - data.limit))}
          >
            ก่อนหน้า
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data.hasMore}
            onClick={() => setOffset(data.offset + data.limit)}
          >
            ถัดไป
          </Button>
        </div>
      )}

      <AuditDetailModal id={openedId} onClose={() => setOpenedId(null)} />
    </div>
  )
}
