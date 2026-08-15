'use client'

import { useState } from 'react'
import { ExportPackModal } from '@/components/accounting/export-pack-modal'
import { ReadinessModal } from '@/components/accounting/readiness-modal'
import { usePeriods } from '@/components/accounting/use-periods'
import { usePermission } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import {
  Button,
  InlineAlert,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
  useToast,
} from '@/components/ui'
import {
  MANAGE_ACCOUNTING_PERIOD,
  UNLOCK_PERIOD,
  periodActionsFor,
} from '@/lib/accounting/period'
import type { AccountingPeriodDto } from '@/lib/accounting/types'
import { callApi, jsonRequest } from '@/lib/api/types'
import { EXPORT_ACCOUNTING_PACK } from '@/lib/exports/pack'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtCount } from '@/lib/format/money'

/**
 * แท็บ "รอบส่งบัญชี" (`30` §8 · mockup `accounting.html` แท็บ `closing`)
 *
 * ⚠️ ปุ่มบนแถวมาจาก `periodActionsFor()` (pure) — **ห้าม `if` สถานะเองใน JSX** เพราะกติกาต้องตรงกับ
 *    ที่ API บังคับเป๊ะ (`30` §9/§10) · ปุ่มส่ง/ล็อก/ปลดล็อกบังคับ `reason` ทุกครั้ง (`90` §13)
 * ⚠️ ปุ่ม Export เรียก `<ExportPackModal>` ของ Phase 4.6 — **ห้ามทำโมดัล Export ใหม่**
 * ⚠️ ไม่มีปุ่ม "ส่งทั้งที่ยังไม่พร้อม" — Readiness Check ข้ามไม่ได้ทุกกรณี (`30` §10)
 */

type PeriodAction = 'send' | 'lock' | 'unlock'

const ACTION_COPY: Readonly<
  Record<PeriodAction, { title: string; confirmLabel: string; description: string; placeholder: string }>
> = {
  send: {
    title: 'ส่งมอบรอบบัญชีให้สำนักงานบัญชี',
    confirmLabel: 'ยืนยันส่งมอบ',
    description:
      'ระบบตรวจความพร้อม 3 เงื่อนไขอีกครั้งก่อนเปลี่ยนสถานะ — ไม่ผ่านจะถูกปฏิเสธพร้อมบอกว่าติดข้อไหน',
    placeholder: 'เช่น ปิดยอดเดือนครบแล้ว ส่งชุดเอกสารให้สำนักงานบัญชีตามรอบ',
  },
  lock: {
    title: 'ล็อกรอบบัญชี (ปิดงวด)',
    confirmLabel: 'ยืนยันล็อกงวด',
    description:
      'ล็อกแล้วห้ามแก้ข้อมูลต้นทางโดยตรงทุกกรณี — ต้องแก้ผ่านรายการปรับปรุง (ไฟล์ 20) พร้อมผู้อนุมัติ',
    placeholder: 'เช่น สำนักงานบัญชีตอบรับชุดเอกสารครบแล้ว ปิดงวดตามกำหนด',
  },
  unlock: {
    title: 'ปลดล็อกรอบบัญชี (ผู้บริหารเท่านั้น)',
    confirmLabel: 'ยืนยันปลดล็อก',
    description:
      'ปลดล็อกแล้วรอบกลับไปสถานะ “ส่งสำนักงานบัญชีแล้ว” (ไม่กลับไปกำลังรวบรวม) — ระบบบันทึก audit แยกชัดเจน',
    placeholder: 'เช่น พบรายได้ตกหล่นของงวดนี้ ต้องเปิดแก้ผ่าน Adjustment ตามมติผู้บริหาร',
  },
}

export function ClosingTab() {
  const { can } = usePermission()
  const caps = {
    canManagePeriod: can('manage', MANAGE_ACCOUNTING_PERIOD),
    canUnlockPeriod: can('manage', UNLOCK_PERIOD),
    canExportPack: can('manage', EXPORT_ACCOUNTING_PACK),
  }
  const { showToast } = useToast()

  const { items, loading, error, reload } = usePeriods()
  const [checking, setChecking] = useState<AccountingPeriodDto | null>(null)
  const [exporting, setExporting] = useState<AccountingPeriodDto | null>(null)
  const [pending, setPending] = useState<{ period: AccountingPeriodDto; action: PeriodAction } | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  function openAction(period: AccountingPeriodDto, action: PeriodAction): void {
    setReason('')
    setPending({ period, action })
  }

  async function runAction(): Promise<void> {
    if (pending === null) return
    setSaving(true)
    const result = await callApi<AccountingPeriodDto>(
      `/api/accounting/periods/${pending.period.id}/${pending.action}`,
      jsonRequest('PATCH', { reason: reason.trim() }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: `${ACTION_COPY[pending.action].confirmLabel}แล้ว — ${pending.period.periodLabel}`,
      description: result.data?.statusLabel,
    })
    setPending(null)
    setReason('')
    await reload()
  }

  const blockingTotal = items.reduce((sum, period) => sum + period.criticalCount, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">รอบบัญชีรายเดือน (Accounting Periods)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            รอบของเดือนใหม่เปิดเองอัตโนมัติ — ปิดงวดได้เมื่อผ่านความพร้อมครบ 3 เงื่อนไขเท่านั้น
          </p>
        </div>
      </div>

      {blockingTotal > 0 && (
        <InlineAlert
          tone="error"
          title={`มีข้อยกเว้นระดับวิกฤตเปิดอยู่รวม ${fmtCount(blockingTotal)} รายการ`}
        >
          ต้องแก้ที่ต้นทางหรือให้ผู้บริหารอนุมัติยกเว้นในแท็บ “เอกสารไม่ครบ” ก่อน จึงจะส่งมอบ/Export ชุดเอกสารของรอบนั้นได้
        </InlineAlert>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>รอบบัญชี</Th>
              <Th>สถานะ</Th>
              <Th>ข้อยกเว้น</Th>
              <Th>Export ล่าสุด</Th>
              <Th>ส่ง / ล็อกโดย</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          <TableState
            loading={loading}
            error={error}
            isEmpty={items.length === 0}
            emptyTitle="ยังไม่มีรอบบัญชี"
            emptyDescription="รอบแรกจะเปิดเองเมื่อมีรายได้เข้าระบบ"
            colSpan={6}
          />
          <TBody>
            {!loading &&
              error === null &&
              items.map((period) => {
                const actions = periodActionsFor(period.status, caps)
                return (
                  <Tr key={period.id}>
                    <Td>
                      <div className="text-sm font-semibold text-slate-900">{period.periodLabel}</div>
                      <p className="mt-0.5 text-[10px] text-slate-400">{period.directEditLabel}</p>
                    </Td>
                    <Td>
                      <StatusBadge status={period.status} label={period.statusLabel} />
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={
                            period.criticalCount > 0 ? 'font-bold text-red-600' : 'text-slate-400'
                          }
                        >
                          {fmtCount(period.criticalCount)} วิกฤต
                        </span>
                        {period.warningCount > 0 && (
                          <span className="font-semibold text-orange-600">
                            {fmtCount(period.warningCount)} คำเตือน
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {period.lastReadinessCheckedAt === null
                          ? 'ยังไม่เคยตรวจความพร้อม'
                          : `ตรวจล่าสุด ${fmtDateTime(period.lastReadinessCheckedAt)}`}
                      </p>
                    </Td>
                    <Td className="text-xs text-slate-500">{fmtDate(period.exportedAt)}</Td>
                    <Td className="text-xs text-slate-500">
                      <div>{period.sentByName === null ? '—' : `ส่ง: ${period.sentByName}`}</div>
                      <div className="text-[10px] text-slate-400">
                        {period.lockedByName === null
                          ? ''
                          : `ล็อก: ${period.lockedByName} · ${fmtDateTime(period.lockedAt)}`}
                      </div>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setChecking(period)}>
                          ตรวจความพร้อม
                        </Button>
                        {actions.canSend && (
                          <Button size="sm" variant="ghost" onClick={() => openAction(period, 'send')}>
                            ส่งสำนักงานบัญชี
                          </Button>
                        )}
                        {actions.canLock && (
                          <Button size="sm" variant="ghost" onClick={() => openAction(period, 'lock')}>
                            ล็อกงวด
                          </Button>
                        )}
                        {actions.canUnlock && (
                          <Button size="sm" variant="ghost" onClick={() => openAction(period, 'unlock')}>
                            ปลดล็อก
                          </Button>
                        )}
                        {actions.canExport && (
                          <Button size="sm" onClick={() => setExporting(period)}>
                            Export
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

      <InlineAlert tone="info" title="วงจรปิดงวด (ไฟล์ 30)">
        กำลังรวบรวม → ส่งสำนักงานบัญชี (ผ่านความพร้อม 3 เงื่อนไข ข้ามไม่ได้) → ล็อกงวด ·
        ปลดล็อกได้เฉพาะผู้บริหาร และกลับไปที่ “ส่งสำนักงานบัญชีแล้ว” เท่านั้น — แก้ยอดของงวดที่ล็อกต้องผ่านรายการปรับปรุง (ไฟล์ 20)
      </InlineAlert>

      <ReadinessModal
        key={`readiness-${checking?.id ?? 'none'}`}
        period={checking}
        onClose={() => setChecking(null)}
      />

      <ExportPackModal
        key={`export-${exporting?.id ?? 'none'}`}
        open={exporting !== null}
        periods={exporting === null ? [] : [exporting]}
        onClose={() => setExporting(null)}
        onExported={() => void reload()}
      />

      <ReasonConfirmModal
        open={pending !== null}
        title={
          pending === null
            ? ''
            : `${ACTION_COPY[pending.action].title} — ${pending.period.periodLabel}`
        }
        description={pending === null ? undefined : ACTION_COPY[pending.action].description}
        confirmLabel={pending === null ? 'ยืนยัน' : ACTION_COPY[pending.action].confirmLabel}
        confirmVariant={pending?.action === 'unlock' ? 'danger' : 'primary'}
        loading={saving}
        reason={reason}
        onReasonChange={setReason}
        onClose={() => setPending(null)}
        onConfirm={() => void runAction()}
        placeholder={pending === null ? undefined : ACTION_COPY[pending.action].placeholder}
      />
    </div>
  )
}
