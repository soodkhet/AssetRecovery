'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import {
  Button,
  Card,
  Input,
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
import { IntakeModal } from '@/components/warehouse/intake-modal'
import { RejectIntakeModal, ViewRejectModal } from '@/components/warehouse/reject-intake-modal'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { fmtDate } from '@/lib/format/datetime'
import { assetRowActions, type AssetRowAction } from '@/lib/warehouse/asset-actions'
import {
  EMPTY_ASSET_FILTERS,
  FILTER_ALL,
  INTAKE_FILTER_STATUSES,
  buildAssetListQuery,
  filterOptionsOrFallback,
  type AssetFilterState,
  type FilterOption,
} from '@/lib/warehouse/asset-filters'
import { ASSET_CONDITIONS } from '@/lib/warehouse/schemas'
import type { AssetListDto, AssetListItemDto } from '@/lib/warehouse/types'
import {
  ASSET_CONDITION_LABEL,
  assetConditionBadgeGroup,
  assetConditionLabel,
  assetStatusBadgeGroup,
  assetStatusLabel,
} from '@/lib/warehouse/warehouse-ui'

/**
 * แท็บ "รับเข้าคลัง" (`44` §8.2) — filter 7 ตัว + ตาราง 9 คอลัมน์
 *
 * ปุ่มต่อแถวมาจาก `assetRowActions()` (pure) ห้าม if สถานะเองที่นี่ · การซ่อนปุ่มเป็นแค่ UX —
 * `/api/assets/:id/*` ตรวจสิทธิ์ซ้ำเสมอ (DEC-002) และ Company User ที่ไม่มี capability
 * จะเห็นแท็บนี้แบบอ่านอย่างเดียวโดยอัตโนมัติ
 */

const PAGE_SIZE = 20

export function IntakeTab({
  companies,
  teams,
  agents,
  onChanged,
}: {
  companies: readonly FilterOption[]
  teams: readonly FilterOption[]
  agents: readonly FilterOption[]
  onChanged: () => void
}) {
  const [result, setResult] = useState<AssetListDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [filters, setFilters] = useState<AssetFilterState>(EMPTY_ASSET_FILTERS)
  const [page, setPage] = useState(1)
  /** เปลี่ยนค่าทุกครั้งที่ทำ action สำเร็จ เพื่อบังคับให้ตารางโหลดใหม่ */
  const [version, setVersion] = useState(0)

  const [active, setActive] = useState<{ asset: AssetListItemDto; action: AssetRowAction } | null>(null)

  const listPath = useMemo(
    () => apiPath('asset.list', undefined, buildAssetListQuery('intake', filters, page, PAGE_SIZE)),
    [filters, page],
  )

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchList = useCallback(async () => callApi<AssetListDto>(listPath), [listPath])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await fetchList()
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
    // `version` อยู่ใน deps เพื่อให้โหลดซ้ำหลังทำ action สำเร็จ
  }, [fetchList, version])

  const items = result?.items ?? []
  const total = result?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const companyOptions = filterOptionsOrFallback(companies, items, 'company')
  const teamOptions = filterOptionsOrFallback(teams, items, 'team')
  const agentOptions = filterOptionsOrFallback(agents, items, 'agent')

  function updateFilter(next: Partial<AssetFilterState>): void {
    setLoading(true)
    setPage(1)
    setFilters((current) => ({ ...current, ...next }))
  }

  function reload(): void {
    setLoading(true)
    setVersion((current) => current + 1)
  }

  function afterAction(): void {
    setActive(null)
    reload()
    onChanged()
  }

  return (
    <>
      <Card>
        {/* ── Filter Bar 7 ตัว (`44` §8.2) ───────────────────────── */}
        <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              placeholder="ค้นหา IMEI / ชื่อลูกหนี้ / เลขสัญญา"
              aria-label="ค้นหา"
              value={filters.search}
              onChange={(event) => updateFilter({ search: event.target.value })}
            />
            <Input
              type="date"
              aria-label="วันที่ปิดเคส"
              value={filters.closedDate}
              onChange={(event) => updateFilter({ closedDate: event.target.value })}
            />
            <Select
              aria-label="กรองตามบริษัทไฟแนนซ์"
              value={filters.companyId}
              onChange={(event) => updateFilter({ companyId: event.target.value })}
            >
              <option value={FILTER_ALL}>ทุกบริษัทไฟแนนซ์</option>
              {companyOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Select
              aria-label="กรองตามทีม"
              value={filters.teamId}
              onChange={(event) => updateFilter({ teamId: event.target.value })}
            >
              <option value={FILTER_ALL}>ทุกทีม</option>
              {teamOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="กรองตามพนักงาน"
              value={filters.agentId}
              onChange={(event) => updateFilter({ agentId: event.target.value })}
            >
              <option value={FILTER_ALL}>ทุกพนักงาน</option>
              {agentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="กรองตามสถานะ"
              value={filters.status}
              onChange={(event) => updateFilter({ status: event.target.value })}
            >
              <option value={FILTER_ALL}>ทุกสถานะ</option>
              {INTAKE_FILTER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {assetStatusLabel(status)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="กรองตามสภาพเครื่อง"
              value={filters.condition}
              onChange={(event) => updateFilter({ condition: event.target.value })}
            >
              <option value={FILTER_ALL}>ทุกสภาพ</option>
              {ASSET_CONDITIONS.map((condition) => (
                <option key={condition} value={condition}>
                  {ASSET_CONDITION_LABEL[condition]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* ── ตาราง 9 คอลัมน์ (`44` §8.2) ────────────────────────── */}
        <div className="hidden md:block">
          <Table>
            <THead>
              <Tr>
                <Th>เลขสัญญา</Th>
                <Th>ลูกหนี้</Th>
                <Th>IMEI สัญญา</Th>
                <Th>อุปกรณ์</Th>
                <Th>ทีม / พนักงาน</Th>
                <Th>วันปิดเคส</Th>
                <Th>สภาพ</Th>
                <Th>สถานะ</Th>
                <Th className="text-right">จัดการ</Th>
              </Tr>
            </THead>
            <TableState
              colSpan={9}
              loading={loading}
              error={error === null ? null : { title: error.title, message: error.message, code: error.code }}
              isEmpty={items.length === 0}
              emptyTitle="ไม่มีเครื่องรอรับเข้าคลัง"
              emptyDescription="เครื่องจะเข้ามาที่นี่อัตโนมัติเมื่อเคสถูกปิดงานสำเร็จ"
              onRetry={
                <Button variant="secondary" onClick={reload}>
                  ลองใหม่
                </Button>
              }
            />
            <TBody>
              {!loading &&
                error === null &&
                items.map((item) => (
                  <Tr key={item.id}>
                    <Td>
                      <RefText className="font-bold">{item.caseRef}</RefText>
                      <div className="mt-0.5 text-[11px] text-slate-500">{item.companyName}</div>
                    </Td>
                    <Td>
                      <span className="font-semibold text-slate-800">{item.debtorName}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs text-slate-600">{item.imeiContract ?? '—'}</span>
                      {item.serialContract !== null && (
                        <div className="font-mono text-[10px] text-slate-400">S/N {item.serialContract}</div>
                      )}
                    </Td>
                    <Td>{item.deviceDesc}</Td>
                    <Td>
                      <div className="text-xs text-slate-700">{item.teamName ?? '—'}</div>
                      <div className="text-[11px] text-slate-400">{item.agentName ?? '—'}</div>
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-600">{fmtDate(item.closedAt)}</span>
                    </Td>
                    <Td>
                      <StatusBadge
                        group={assetConditionBadgeGroup(item.condition)}
                        label={assetConditionLabel(item.condition)}
                      />
                    </Td>
                    <Td>
                      <StatusBadge
                        group={assetStatusBadgeGroup(item.assetStatus)}
                        label={assetStatusLabel(item.assetStatus)}
                      />
                    </Td>
                    <Td className="text-right">
                      <RowActions item={item} onAction={(action) => setActive({ asset: item, action })} />
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </div>

        {/* จอเล็ก = card list (แนวเดียวกับหน้ารับเคส `38` §7.2) */}
        <div className="space-y-3 md:hidden">
          {loading && <div className="py-8 text-center text-sm text-slate-400">กำลังโหลด...</div>}
          {!loading && error !== null && (
            <div className="py-8 text-center text-sm text-red-600">
              {error.title} — {error.message}
            </div>
          )}
          {!loading && error === null && items.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-400">ไม่มีเครื่องรอรับเข้าคลัง</div>
          )}
          {!loading &&
            error === null &&
            items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <RefText className="font-bold">{item.caseRef}</RefText>
                    <div className="text-sm font-semibold text-slate-800">{item.debtorName}</div>
                  </div>
                  <StatusBadge
                    group={assetStatusBadgeGroup(item.assetStatus)}
                    label={assetStatusLabel(item.assetStatus)}
                  />
                </div>
                <div className="mb-2 text-xs text-slate-500">
                  {item.deviceDesc} · <span className="font-mono">{item.imeiContract ?? '—'}</span>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>
                    <span className="text-slate-400">ทีม:</span> {item.teamName ?? '—'}
                  </div>
                  <div className="text-right">{item.agentName ?? '—'}</div>
                  <div>
                    <span className="text-slate-400">ปิดเคส:</span> {fmtDate(item.closedAt)}
                  </div>
                  <div className="text-right">{assetConditionLabel(item.condition)}</div>
                </div>
                <RowActions item={item} onAction={(action) => setActive({ asset: item, action })} />
              </div>
            ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>
            แสดง {items.length} จาก {total} รายการ (หน้า {page}/{lastPage})
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || loading}
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
              disabled={page >= lastPage || loading}
              onClick={() => {
                setLoading(true)
                setPage((current) => current + 1)
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      </Card>

      {active !== null && active.action === 'intake' && (
        <IntakeModal
          key={`intake-${active.asset.id}`}
          open
          asset={active.asset}
          onClose={() => setActive(null)}
          onDone={afterAction}
        />
      )}
      {active !== null && active.action === 'reject_intake' && (
        <RejectIntakeModal
          key={`reject-${active.asset.id}`}
          open
          asset={active.asset}
          onClose={() => setActive(null)}
          onDone={afterAction}
        />
      )}
      {active !== null && active.action === 'view_reject' && (
        <ViewRejectModal open asset={active.asset} onClose={() => setActive(null)} />
      )}
    </>
  )
}

/**
 * ปุ่มต่อแถว (`44` §8.2) — รายการปุ่มมาจาก `assetRowActions()` ทั้งหมด
 * ห้ามเพิ่มเงื่อนไขสถานะที่นี่ · การซ่อนปุ่มเป็น UX เท่านั้น API ตรวจซ้ำเสมอ (DEC-002)
 */
function RowActions({ item, onAction }: { item: AssetListItemDto; onAction: (action: AssetRowAction) => void }) {
  const { can } = usePermission()
  const buttons = assetRowActions(item.assetStatus, (capability) => can('manage', capability))

  if (buttons.length === 0) return <span className="text-xs text-slate-400">—</span>

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {buttons.map((button) => (
        <Button
          key={button.action}
          size="sm"
          variant={button.primary ? 'primary' : button.action === 'reject_intake' ? 'danger' : 'secondary'}
          onClick={() => onAction(button.action)}
        >
          {button.label}
        </Button>
      ))}
    </div>
  )
}
