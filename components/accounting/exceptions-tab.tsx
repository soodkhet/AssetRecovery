'use client'

import { useState } from 'react'
import {
  ExceptionActionModal,
  type ExceptionActionKind,
} from '@/components/accounting/exception-action-modal'
import { ExceptionFormModal } from '@/components/accounting/exception-form-modal'
import {
  useAccountingExceptions,
  type ExceptionLevelFilter,
  type ExceptionStatusFilter,
} from '@/components/accounting/use-exceptions'
import { usePeriods } from '@/components/accounting/use-periods'
import { usePermission } from '@/components/auth/permission-provider'
import {
  Button,
  FilterGroup,
  InlineAlert,
  RefText,
  StatCard,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import {
  AUTHORIZE_EXCEPTION,
  MANAGE_EXCEPTIONS,
  exceptionActionsFor,
} from '@/lib/accounting/exception'
import type { ExceptionDto } from '@/lib/accounting/types'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtCount } from '@/lib/format/money'
import { EXCEPTION_LEVEL_LABEL, exceptionModuleLabel } from '@/lib/reports/dashboard'

/**
 * แท็บ "เอกสารไม่ครบ" (`34` §8 · mockup `accounting.html` แท็บ `documents`)
 *
 * ⚠️ **`ผ่านแบบมีข้อยกเว้น` ห้ามนับปนกับ `แก้ไขแล้ว` เด็ดขาด** (`34` §6.3) — การ์ดสรุปแยกช่องเสมอ
 * ⚠️ ปุ่มบนแถวมาจาก `exceptionActionsFor()` (pure) — ห้าม `if` สถานะเองใน JSX
 * ⚠️ ปุ่ม "อนุมัติยกเว้น" ขึ้นเฉพาะผู้ถือ `authorize_exception` (ผู้บริหาร) · API ตรวจซ้ำอีกชั้น
 */

const STATUS_FILTERS: readonly { value: ExceptionStatusFilter; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'open', label: 'ยังไม่จัดการ' },
  { value: 'authorized', label: 'ผ่านแบบมีข้อยกเว้น' },
  { value: 'resolved', label: 'แก้ไขแล้ว' },
]

const LEVEL_FILTERS: readonly { value: ExceptionLevelFilter; label: string }[] = [
  { value: 'all', label: 'ทุกระดับ' },
  { value: 'critical', label: EXCEPTION_LEVEL_LABEL.critical },
  { value: 'warning', label: EXCEPTION_LEVEL_LABEL.warning },
  { value: 'info', label: EXCEPTION_LEVEL_LABEL.info },
]

export function ExceptionsTab() {
  const { can } = usePermission()
  const caps = {
    canManage: can('manage', MANAGE_EXCEPTIONS),
    canAuthorize: can('manage', AUTHORIZE_EXCEPTION),
  }

  const [status, setStatus] = useState<ExceptionStatusFilter>('all')
  const [level, setLevel] = useState<ExceptionLevelFilter>('all')
  const { data, loading, error, reload } = useAccountingExceptions({ status, level, periodId: '' })
  const { items: periods } = usePeriods()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ExceptionDto | null>(null)
  const [acting, setActing] = useState<{ exception: ExceptionDto; kind: ExceptionActionKind } | null>(null)

  const summary = data.summary

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard
          label="ยังไม่จัดการ"
          value={fmtCount(summary.open.total)}
          hint={`วิกฤต ${fmtCount(summary.open.critical)} · คำเตือน ${fmtCount(summary.open.warning)}`}
        />
        <StatCard
          label="บล็อกการส่งมอบ"
          value={fmtCount(summary.blockingCritical)}
          hint="วิกฤตที่ยังเปิดอยู่ — ต้องเคลียร์ก่อน Export"
        />
        <StatCard
          label="ผ่านแบบมีข้อยกเว้น"
          value={fmtCount(summary.authorized.total)}
          hint="ผู้บริหารอนุมัติให้ข้าม — ปัญหายังไม่ถูกแก้จริง"
        />
        <StatCard
          label="แก้ไขแล้ว"
          value={fmtCount(summary.resolved.total)}
          hint="แก้ที่ต้นทางเรียบร้อย"
        />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">เอกสารไม่ครบและข้อยกเว้น (Exceptions)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            รายการที่ต้องเคลียร์ก่อนส่งชุดเอกสารให้สำนักงานบัญชี — ผูกกับรอบบัญชี ไม่สืบทอดข้ามรอบ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterGroup options={LEVEL_FILTERS} value={level} onChange={setLevel} />
          <FilterGroup options={STATUS_FILTERS} value={status} onChange={setStatus} />
          {caps.canManage && (
            <Button size="sm" onClick={() => setCreating(true)}>
              บันทึกข้อยกเว้น
            </Button>
          )}
        </div>
      </div>

      {summary.blockingCritical > 0 ? (
        <InlineAlert
          tone="error"
          title={`มีข้อยกเว้นระดับวิกฤตเปิดอยู่ ${fmtCount(summary.blockingCritical)} รายการ`}
        >
          ระบบจะไม่ให้ส่งชุดเอกสารบัญชีของรอบนั้นจนกว่าจะแก้ที่ต้นทาง หรือผู้บริหารอนุมัติยกเว้นให้เป็นรายรอบ
        </InlineAlert>
      ) : (
        <InlineAlert tone="success" title="ไม่มีข้อยกเว้นระดับวิกฤตค้าง">
          ส่งชุดเอกสารบัญชีได้ตามปกติ (ยังต้องผ่านความพร้อมอีก 2 เงื่อนไขในแท็บ “รอบส่งบัญชี”)
        </InlineAlert>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>ระดับ</Th>
              <Th>โมดูล</Th>
              <Th>รายละเอียด</Th>
              <Th>อ้างอิง</Th>
              <Th>รอบบัญชี</Th>
              <Th>ผู้บันทึก</Th>
              <Th>สถานะ</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          <TableState
            loading={loading}
            error={error}
            isEmpty={data.items.length === 0}
            emptyTitle="ยังไม่มีข้อยกเว้นตามตัวกรองนี้"
            emptyDescription="ระบบสร้างให้เองเมื่อเจอเอกสารไม่ครบ และบัญชีบันทึกเพิ่มเองได้"
            colSpan={8}
          />
          <TBody>
            {!loading &&
              error === null &&
              data.items.map((row) => {
                const actions = exceptionActionsFor(row.status, caps)
                // ลิงก์กลับต้นทางมาจาก DTO (server เรียก `exceptionLinkOf()` ให้แล้ว) — ห้ามคิดซ้ำในจอ
                const link = row.sourceLink
                return (
                  <Tr
                    key={row.id}
                    className={row.level === 'critical' && row.status === 'open' ? 'bg-red-50/30' : undefined}
                  >
                    <Td>
                      <StatusBadge status={row.level} label={EXCEPTION_LEVEL_LABEL[row.level]} />
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {link === null ? (
                        exceptionModuleLabel(row.sourceModule)
                      ) : (
                        <a className="focus-ring text-slate-700 underline underline-offset-2" href={link}>
                          {exceptionModuleLabel(row.sourceModule)}
                        </a>
                      )}
                    </Td>
                    <Td className="max-w-[280px]">
                      <div className="text-xs font-semibold text-slate-900">{row.title}</div>
                      <p className="mt-0.5 text-[11px] text-slate-500">{row.description}</p>
                      {row.status === 'authorized' && row.authorizeNote !== null && (
                        <p className="mt-1 text-[10px] text-purple-700">
                          อนุมัติยกเว้นโดย {row.authorizedByName ?? '—'} · {row.authorizeNote}
                        </p>
                      )}
                      {row.status === 'resolved' && row.resolutionNote !== null && (
                        <p className="mt-1 text-[10px] text-emerald-700">
                          แก้โดย {row.resolvedByName ?? '—'} · {row.resolutionNote}
                        </p>
                      )}
                    </Td>
                    <Td>
                      {row.sourceRef === null ? (
                        <span className="text-xs text-slate-300">—</span>
                      ) : (
                        <RefText>{row.sourceRef}</RefText>
                      )}
                    </Td>
                    <Td className="text-xs text-slate-500">{row.periodLabel}</Td>
                    <Td className="text-xs text-slate-500">
                      <div>{row.createdByName}</div>
                      <div className="text-[10px] text-slate-400">{fmtDateTime(row.createdAt)}</div>
                    </Td>
                    <Td>
                      <StatusBadge status={row.status} label={row.statusLabel} />
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {actions.canEdit && (
                          <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                            แก้ไข
                          </Button>
                        )}
                        {actions.canResolve && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setActing({ exception: row, kind: 'resolve' })}
                          >
                            ปิดรายการ
                          </Button>
                        )}
                        {actions.canAuthorize && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setActing({ exception: row, kind: 'authorize' })}
                          >
                            อนุมัติยกเว้น
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                )
              })}
          </TBody>
        </Table>
      </div>

      <ExceptionFormModal
        key={`create-${creating}`}
        open={creating}
        editing={null}
        periods={periods}
        onClose={() => setCreating(false)}
        onSaved={() => void reload()}
      />

      <ExceptionFormModal
        key={`edit-${editing?.id ?? 'none'}`}
        open={editing !== null}
        editing={editing}
        periods={periods}
        onClose={() => setEditing(null)}
        onSaved={() => void reload()}
      />

      <ExceptionActionModal
        key={`action-${acting?.kind ?? 'none'}-${acting?.exception.id ?? 'none'}`}
        exception={acting?.exception ?? null}
        kind={acting?.kind ?? 'resolve'}
        onClose={() => setActing(null)}
        onDone={() => void reload()}
      />
    </div>
  )
}
