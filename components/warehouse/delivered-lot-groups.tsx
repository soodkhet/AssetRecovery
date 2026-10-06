'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, RefText, StatusBadge, TBody, THead, Table, TableState, Td, Th, Tr } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { fmtDateTime } from '@/lib/format/datetime'
import { FILTER_ALL, buildLotCompanySummaryQuery, buildLotListQuery, type LotFilterState } from '@/lib/warehouse/lot-filters'
import { LOT_STATUS_LABELS, isLotConfirmed } from '@/lib/warehouse/lot-status'
import type { LotCompanyGroupDto, LotCompanySummaryDto, LotListDto, LotSummaryDto } from '@/lib/warehouse/types'
import { HANDOVER_TYPE_SHORT_LABEL, lotStatusBadgeGroup } from '@/lib/warehouse/warehouse-ui'

/**
 * แท็บ "ส่งมอบแล้ว" แบบตารางจัดกลุ่มตามบริษัท (มติ PO U142 · `44` §8.5)
 *
 * - แถวหัวกลุ่ม = ยอดจาก `GET /api/handover-lots/company-summary` (aggregate ฝั่ง server ตามตัวกรอง + scope)
 * - กางกลุ่ม = ดึงล็อตของบริษัทนั้นจาก `GET /api/handover-lots` แบบแบ่งหน้าจริงต่อบริษัท
 *   (แทนเพดาน 200 ล็อต + ข้อความ "แสดงไม่ครบ" เดิม)
 * - ปุ่มของแถวล็อตผูกสิทธิ์เดิม: แนบเอกสารเฉพาะผู้ยืนยันล็อตได้ · ไม่มีสิทธิ์ = ซ่อน
 */

/** ล็อตต่อหน้าในแต่ละบริษัท */
export const DELIVERED_LOTS_PER_PAGE = 20

const COLUMN_COUNT = 7

export interface DeliveredLotActions {
  canConfirm: boolean
  openingId: string | null
  onOpen: (lotId: string) => void
  onAttach: (lotId: string) => void
  onViewDocs: (lotId: string) => void
}

export function DeliveredLotGroups({
  filters,
  version,
  actions,
  onGroupsLoaded,
}: {
  filters: LotFilterState
  /** เพิ่มค่าเมื่อต้องการโหลดใหม่ (หลังยืนยันล็อต / กดลองใหม่) */
  version: number
  actions: DeliveredLotActions
  onGroupsLoaded: (groups: readonly LotCompanyGroupDto[]) => void
}) {
  const [summary, setSummary] = useState<LotCompanySummaryDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [retry, setRetry] = useState(0)
  /** บริษัทที่ผู้ใช้กาง/หุบเอง — `undefined` = ใช้ค่าเริ่มต้น (กางเมื่อมีบริษัทเดียว) */
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map())

  const summaryPath = useMemo(
    () => apiPath('lot.companySummary', undefined, buildLotCompanySummaryQuery('handed_over', filters)),
    [filters],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await callApi<LotCompanySummaryDto>(summaryPath)
      if (cancelled) return
      if (response.error !== undefined) {
        setError(response.error)
        setLoading(false)
        return
      }
      const data = response.data ?? null
      setSummary(data)
      setError(null)
      setLoading(false)
      if (data !== null) onGroupsLoaded(data.groups)
    })()
    return () => {
      cancelled = true
    }
  }, [summaryPath, version, retry, onGroupsLoaded])

  // ตัวกรองเปลี่ยน = เริ่มโหลดใหม่ (setState ตอน render ตามแนว React แทนการ setState ใน effect)
  const [lastKey, setLastKey] = useState(`${summaryPath}#${version}`)
  if (lastKey !== `${summaryPath}#${version}`) {
    setLastKey(`${summaryPath}#${version}`)
    setLoading(true)
  }

  const groups = summary?.groups ?? []

  function isOpen(companyId: string): boolean {
    return toggled.get(companyId) ?? groups.length === 1
  }

  function toggle(companyId: string): void {
    setToggled((current) => new Map(current).set(companyId, !isOpen(companyId)))
  }

  return (
    <>
      {!loading && error === null && summary !== null && groups.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-600">
          <Badge className="bg-slate-100 text-slate-700">{summary.totalLots} ล็อต</Badge>
          <Badge className="bg-slate-100 text-slate-700">{summary.totalAssets} เครื่อง</Badge>
          {summary.totalPendingLots > 0 && (
            <Badge className="bg-amber-100 text-amber-800">รอเอกสาร {summary.totalPendingLots} ล็อต</Badge>
          )}
        </div>
      )}

      <Table>
        <THead>
          <Tr>
            <Th>เลขล็อต</Th>
            <Th>ประเภท</Th>
            <Th>วันส่งมอบจริง</Th>
            <Th>วันยืนยัน</Th>
            <Th numeric>เครื่อง</Th>
            <Th>สถานะ</Th>
            <Th className="text-right">จัดการ</Th>
          </Tr>
        </THead>
        <TableState
          colSpan={COLUMN_COUNT}
          loading={loading}
          error={error}
          isEmpty={groups.length === 0}
          emptyTitle="ไม่มีล็อตที่ส่งมอบในช่วงนี้"
          emptyDescription="ลองเลือกเดือนอื่นหรือล้างตัวกรองด้านบน"
          onRetry={
            <Button
              variant="secondary"
              onClick={() => {
                setLoading(true)
                setRetry((current) => current + 1)
              }}
            >
              ลองใหม่
            </Button>
          }
        />
        {!loading && error === null &&
          groups.map((group) => (
            <TBody key={group.companyId}>
              <GroupHeaderRow group={group} open={isOpen(group.companyId)} onToggle={() => toggle(group.companyId)} />
              {isOpen(group.companyId) && (
                <CompanyLotRows
                  // ตัวกรองเปลี่ยน = เริ่มหน้า 1 ใหม่ (remount)
                  key={summaryPath}
                  companyId={group.companyId}
                  filters={filters}
                  version={version}
                  actions={actions}
                />
              )}
            </TBody>
          ))}
      </Table>
    </>
  )
}

function GroupHeaderRow({
  group,
  open,
  onToggle,
}: {
  group: LotCompanyGroupDto
  open: boolean
  onToggle: () => void
}) {
  return (
    <tr className="bg-slate-50">
      <td colSpan={COLUMN_COUNT} className="p-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="focus-ring flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-100"
        >
          <span className="w-4 text-slate-500" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
          <span className="font-bold text-slate-900">{group.companyName}</span>
          <span className="text-xs text-slate-500">{group.lotCount} ล็อต</span>
          <span className="text-xs text-slate-500">{group.assetCount} เครื่อง</span>
          {group.pendingLotCount > 0 ? (
            <Badge className="bg-amber-100 text-amber-800">รอเอกสาร {group.pendingLotCount} ล็อต</Badge>
          ) : (
            <Badge className="bg-emerald-100 text-emerald-800">ยืนยันครบ</Badge>
          )}
        </button>
      </td>
    </tr>
  )
}

/** ล็อตของบริษัทเดียว — แบ่งหน้าจริงที่ API (`page`/`limit`) */
function CompanyLotRows({
  companyId,
  filters,
  version,
  actions,
}: {
  companyId: string
  filters: LotFilterState
  version: number
  actions: DeliveredLotActions
}) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<LotListDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [retry, setRetry] = useState(0)

  const listPath = useMemo(
    () =>
      apiPath(
        'lot.list',
        undefined,
        buildLotListQuery(
          'handed_over',
          // ตัวกรองบริษัทด้านบน (ถ้ามี) ตรงกับกลุ่มนี้อยู่แล้ว — กลุ่มต้องดึงเฉพาะบริษัทของตัวเองเสมอ
          { ...filters, companyId: filters.companyId === FILTER_ALL ? companyId : filters.companyId },
          page,
          DELIVERED_LOTS_PER_PAGE,
        ),
      ),
    [filters, companyId, page],
  )

  const fetchPage = useCallback(async () => callApi<LotListDto>(listPath), [listPath])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await fetchPage()
      if (cancelled) return
      if (response.error !== undefined) {
        setError(response.error)
        setLoading(false)
        return
      }
      setResult(response.data ?? null)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchPage, version, retry])

  const items = result?.items ?? []
  const total = result?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / DELIVERED_LOTS_PER_PAGE))

  if (loading) {
    return (
      <tr>
        <td colSpan={COLUMN_COUNT} className="px-4 py-4 text-center text-xs text-slate-400">
          กำลังโหลดล็อต...
        </td>
      </tr>
    )
  }
  if (error !== null) {
    return (
      <tr>
        <td colSpan={COLUMN_COUNT} className="px-4 py-4 text-center text-xs text-red-600">
          {error.title} — {error.message}{' '}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setLoading(true)
              setRetry((current) => current + 1)
            }}
          >
            ลองใหม่
          </Button>
        </td>
      </tr>
    )
  }

  return (
    <>
      {items.map((lot) => (
        <LotRow key={lot.id} lot={lot} actions={actions} />
      ))}
      {total > DELIVERED_LOTS_PER_PAGE && (
        <tr>
          <td colSpan={COLUMN_COUNT} className="px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                แสดง {items.length} จาก {total} ล็อต (หน้า {page}/{lastPage})
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => {
                    setLoading(true)
                    setPage((current) => Math.max(1, current - 1))
                  }}
                >
                  ก่อนหน้า
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= lastPage}
                  onClick={() => {
                    setLoading(true)
                    setPage((current) => current + 1)
                  }}
                >
                  ถัดไป
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function LotRow({ lot, actions }: { lot: LotSummaryDto; actions: DeliveredLotActions }) {
  const confirmed = isLotConfirmed(lot.status)
  return (
    <Tr>
      <Td>
        <RefText className="font-bold">{lot.lotNumber}</RefText>
        <div className="font-mono text-[10px] text-slate-400">{lot.docRef}</div>
      </Td>
      <Td>
        <span className="whitespace-nowrap text-xs">
          {lot.type === 'finance_pickup' ? '🏢' : '🚚'} {HANDOVER_TYPE_SHORT_LABEL[lot.type]}
        </span>
      </Td>
      <Td>
        {lot.deliveredAt !== null ? (
          <span className="whitespace-nowrap text-xs text-slate-700">{fmtDateTime(lot.deliveredAt)}</span>
        ) : (
          <div className="text-xs text-slate-400">
            —
            {lot.scheduledAt !== null && (
              <div className="whitespace-nowrap text-[10px]">กำหนดส่ง {fmtDateTime(lot.scheduledAt)}</div>
            )}
          </div>
        )}
      </Td>
      <Td>
        <span className="whitespace-nowrap text-xs text-slate-700">{fmtDateTime(lot.confirmedAt)}</span>
      </Td>
      <Td numeric>{lot.assetCount}</Td>
      <Td>
        <StatusBadge group={lotStatusBadgeGroup(lot.status)} label={LOT_STATUS_LABELS[lot.status]} />
      </Td>
      <Td className="text-right">
        <div className="flex justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            loading={actions.openingId === lot.id}
            onClick={() => actions.onOpen(lot.id)}
          >
            ดูรายการ
          </Button>
          {confirmed ? (
            <Button variant="secondary" size="sm" onClick={() => actions.onViewDocs(lot.id)}>
              เอกสาร
            </Button>
          ) : (
            actions.canConfirm && (
              <Button variant="primary" size="sm" onClick={() => actions.onAttach(lot.id)}>
                แนบเอกสาร
              </Button>
            )
          )}
        </div>
      </Td>
    </Tr>
  )
}
