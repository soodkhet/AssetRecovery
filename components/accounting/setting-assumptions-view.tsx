'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useUrlFilter } from '@/components/ui/use-url-filter'
import { ACCOUNTING_FILTER_PARAMS } from '@/lib/accounting/accounting-tabs'
import { usePermission } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import {
  Button,
  Card,
  FilterGroup,
  PageHeader,
  StatCard,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
  cn,
  useToast,
} from '@/components/ui'
import { TOUCH_TARGET_CLASS } from '@/components/ui/button'
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtCount } from '@/lib/format/money'
import {
  filterSettingAssumptions,
  type SettingAssumptionOverviewDto,
  type SettingAssumptionStatusFilter,
} from '@/lib/settings/assumption-overview'
import {
  CONFIRM_SETTING_ASSUMPTION,
  type SettingAssumptionKey,
  type SettingAssumptionStatusDto,
} from '@/lib/settings/assumptions'

/**
 * หน้า "ค่าตั้งรอนักบัญชียืนยัน" (มติ PO 07/10/2569 U170 · BUG-180 · mockup `reference/accounting.html` เมนูย่อย `assumptions`)
 *
 * ทุกรายการในทะเบียนสมมติฐาน + ค่าที่ใช้อยู่ (อ่านอย่างเดียว) + คำอธิบาย + สถานะยืนยัน (ใคร/เมื่อไร/เหตุผล)
 * · ปุ่ม "ยืนยันแล้ว" (เหตุผลบังคับ + audit) ใช้ API เดิมของป้ายบนหน้าตั้งค่า · ขึ้นเฉพาะผู้ถือสิทธิ์ยืนยัน (API ตรวจซ้ำ)
 * · ลิงก์ไปหน้าตั้งค่าเฉพาะผู้ที่เปิดแท็บนั้นได้ (`links` คำนวณที่ server) · การแก้ค่ายังเป็นสิทธิ์เดิมที่หน้าตั้งค่า
 */

const FILTERS: readonly { value: SettingAssumptionStatusFilter; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'pending', label: 'รอยืนยัน' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
]

export function SettingAssumptionsView({ links }: { links: Readonly<Record<SettingAssumptionKey, string | null>> }) {
  const { can } = usePermission()
  const { showToast } = useToast()
  const canConfirm = can('manage', CONFIRM_SETTING_ASSUMPTION)

  const [rows, setRows] = useState<readonly SettingAssumptionOverviewDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  // ตัวกรองอยู่ใน URL — refresh/Back กลับมายังกรองเหมือนเดิม (preship R7-005)
  const [filter, setFilter] = useUrlFilter<SettingAssumptionStatusFilter>(
    ACCOUNTING_FILTER_PARAMS.assumptionStatus,
    FILTERS,
    'all',
  )

  const [target, setTarget] = useState<SettingAssumptionOverviewDto | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchRows = useCallback(
    async () => callApi<SettingAssumptionOverviewDto[]>('/api/settings/assumptions?include=current_value'),
    [],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    const result = await fetchRows()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
    } else {
      setRows(result.data ?? [])
      setError(null)
    }
    setLoading(false)
  }, [fetchRows])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchRows()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
      } else {
        setRows(result.data ?? [])
        setError(null)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchRows])

  function openConfirm(row: SettingAssumptionOverviewDto): void {
    setReason('')
    setTarget(row)
  }

  async function confirm(): Promise<void> {
    if (target === null) return
    setSaving(true)
    const result = await callApi<SettingAssumptionStatusDto>(
      `/api/settings/assumptions/${target.key}/confirm`,
      jsonRequest('POST', { reason: reason.trim() }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({ tone: 'success', title: `ยืนยัน "${target.label}" แล้ว`, description: 'ป้ายรอนักบัญชียืนยันถูกนำออก' })
    setTarget(null)
    await reload()
  }

  const pendingCount = rows.filter((row) => !row.confirmed).length
  const visible = filterSettingAssumptions(rows, filter)

  return (
    <div className="space-y-6">
      <PageHeader
        title="ค่าตั้งรอนักบัญชียืนยัน"
        description="ค่าที่ระบบใช้ค่าแนะนำไปก่อนระหว่างรอคำตอบจากสำนักงานบัญชี — ยืนยันได้จากหน้านี้โดยไม่ต้องเข้าหน้าตั้งค่า (การแก้ค่ายังทำที่หน้าตั้งค่าตามสิทธิ์เดิม)"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* โหลดไม่สำเร็จ ⇒ "—" ไม่ใช่ 0 (preship R3-028) */}
        <StatCard label="รอนักบัญชียืนยัน" value={loading || error !== null ? '—' : fmtCount(pendingCount)} hint="ป้ายยังแสดงบนหน้าตั้งค่า" />
        <StatCard
          label="ยืนยันแล้ว"
          value={loading || error !== null ? '—' : fmtCount(rows.length - pendingCount)}
          hint={loading || error !== null ? undefined : `จากทั้งหมด ${fmtCount(rows.length)} รายการ`}
        />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">รายการค่าตั้ง</h2>
          <FilterGroup options={FILTERS} value={filter} onChange={setFilter} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <Tr>
                <Th>รายการ</Th>
                <Th>ค่าที่ใช้อยู่</Th>
                <Th>สถานะ</Th>
                <Th className="text-right">การทำงาน</Th>
              </Tr>
            </THead>
            <TableState
              colSpan={4}
              loading={loading}
              error={error}
              isEmpty={visible.length === 0}
              emptyTitle={filter === 'pending' ? 'ยืนยันครบทุกรายการแล้ว' : 'ไม่มีรายการในตัวกรองนี้'}
              onRetry={
                <Button size="sm" variant="secondary" onClick={() => void reload()}>
                  ลองใหม่
                </Button>
              }
            />
            <TBody>
              {!loading &&
                error === null &&
                visible.map((row) => {
                  const href = links[row.key]
                  return (
                    <Tr key={row.key}>
                      <Td className="align-top">
                        <div className="font-semibold text-slate-800">{row.label}</div>
                        <div className="mt-0.5 max-w-md text-xs text-slate-500">{row.question}</div>
                      </Td>
                      <Td className="max-w-xs align-top text-xs text-slate-700">{row.currentValue}</Td>
                      <Td className="align-top">
                        {row.confirmed ? (
                          <>
                            <StatusBadge group="success" label="ยืนยันแล้ว" />
                            <div className="mt-1 text-[11px] text-slate-500">
                              {row.confirmedByName ?? '—'} · {fmtDateTime(row.confirmedAt)}
                            </div>
                            {row.reason !== null && <div className="text-[11px] text-slate-400">{row.reason}</div>}
                          </>
                        ) : (
                          <StatusBadge group="warning" label="รอนักบัญชียืนยัน" />
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-right align-top">
                        <div className="flex items-center justify-end gap-3">
                          {href !== null && (
                            <Link href={href} className={cn(TOUCH_TARGET_CLASS, "inline-flex items-center text-xs font-semibold text-emerald-700 hover:underline")}>
                              ไปหน้าตั้งค่า
                            </Link>
                          )}
                          {canConfirm && !row.confirmed && (
                            <Button size="sm" onClick={() => openConfirm(row)}>
                              ยืนยันแล้ว
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
      </Card>

      <ReasonConfirmModal
        maxLength={1000}
        open={target !== null}
        title={target === null ? '' : `ยืนยันค่าตั้ง "${target.label}"`}
        description={target === null ? undefined : `นักบัญชียืนยันแล้วว่า: ${target.question} (ค่าที่ใช้อยู่: ${target.currentValue})`}
        confirmLabel="ยืนยันแล้ว"
        confirmVariant="primary"
        loading={saving}
        reason={reason}
        onReasonChange={setReason}
        onClose={() => setTarget(null)}
        onConfirm={() => void confirm()}
        placeholder="เช่น สำนักงานบัญชียืนยันทางอีเมล 10/10/2569"
      />
    </div>
  )
}
