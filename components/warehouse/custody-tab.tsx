'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import {
  Badge,
  Button,
  Card,
  InlineAlert,
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
  useToast,
} from '@/components/ui'
import { AssetDetailModal } from '@/components/warehouse/asset-detail-modal'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { fmtDate } from '@/lib/format/datetime'
import {
  EMPTY_ASSET_FILTERS,
  FILTER_ALL,
  buildAssetListQuery,
  filterByReceivedDate,
  filterOptionsOrFallback,
  groupCustodyByCompany,
  isSelectableForLot,
  keepSelectable,
  matchesAssetSearch,
  selectableAssetIds,
  type AssetFilterState,
  type FilterOption,
} from '@/lib/warehouse/asset-filters'
import { WAREHOUSE_CREATE_LOT_CAPABILITY } from '@/lib/warehouse/permissions'
import { ASSET_CONDITIONS } from '@/lib/warehouse/schemas'
import type { AssetDetailDto, AssetListDto, AssetListItemDto } from '@/lib/warehouse/types'
import {
  ASSET_CONDITION_LABEL,
  assetConditionBadgeGroup,
  assetConditionLabel,
  assetStatusBadgeGroup,
  assetStatusLabel,
} from '@/lib/warehouse/warehouse-ui'

/**
 * แท็บ "ในคลัง" (`44` §8.3) — การ์ด 1 ใบ = 1 บริษัทไฟแนนซ์ → คลิกเข้า drill-down ตาราง
 *
 * - แท็บนี้ครอบทั้ง `in_custody` และ `handover_pending` (ตาราง badge ของ §8.1) เพื่อให้การ์ดแสดง
 *   breakdown "พร้อมส่ง vs ใน Lot แล้ว" ได้จริง
 * - ติ๊กเลือกได้เฉพาะเครื่องที่ยัง `in_custody` และไม่มีล็อต (`isSelectableForLot()` — เงื่อนไขเดียว
 *   กับด่าน `ASSET_NOT_IN_CUSTODY`/`ASSET_ALREADY_IN_LOT` ของ API)
 * - ปุ่ม "นัดวันส่งมอบ (N)" ส่ง **แถวเครื่องที่เลือก** ออกไปทาง `onScheduleHandover` ให้ผู้เรียกเปิด
 *   `<HandoverLotModal>` เอง (ส่งทั้งแถวไม่ใช่แค่ id เพื่อให้ modal แสดงรายการได้โดยไม่ต้องยิงซ้ำ)
 *   — ยังไม่ผูก = ปุ่มบอกว่ายังไม่เปิดใช้งาน
 */

/** โหลดทีเดียวให้ครบ (เพดานของ schema = 200) — การ์ดต้องนับรวมทุกบริษัทจากชุดเดียวกัน */
const CUSTODY_PAGE_SIZE = 200

export function CustodyTab({
  companies,
  onScheduleHandover,
  reloadToken = 0,
}: {
  companies: readonly FilterOption[]
  /** เพิ่มค่าเมื่อมีเหตุจากภายนอกที่ทำให้รายการเปลี่ยน (สร้างล็อตแล้วเครื่องกลายเป็น `handover_pending`) */
  reloadToken?: number
  onScheduleHandover?: (companyId: string, assets: readonly AssetListItemDto[]) => void
}) {
  const { can } = usePermission()
  const { showToast } = useToast()

  const [result, setResult] = useState<AssetListDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [filters, setFilters] = useState<AssetFilterState>(EMPTY_ASSET_FILTERS)
  const [version, setVersion] = useState(0)

  /** บริษัทที่เปิด drill-down อยู่ (`null` = หน้าการ์ด) */
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null)
  const [detailSearch, setDetailSearch] = useState('')
  const [detailDate, setDetailDate] = useState('')
  const [selected, setSelected] = useState<readonly string[]>([])

  const [detailAsset, setDetailAsset] = useState<AssetDetailDto | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  const listPath = useMemo(
    () => apiPath('asset.list', undefined, buildAssetListQuery('in_custody', filters, 1, CUSTODY_PAGE_SIZE)),
    [filters],
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
  }, [fetchList, version, reloadToken])

  /** ต้อง memo เพราะ `?? []` สร้าง array ใหม่ทุก render ⇒ `drillRows` จะคำนวณใหม่ไม่จบ */
  const items = useMemo(() => result?.items ?? [], [result])
  const total = result?.total ?? 0
  const groups = groupCustodyByCompany(items)
  const companyOptions = filterOptionsOrFallback(companies, items, 'company')

  const openGroup = groups.find((group) => group.companyId === openCompanyId) ?? null
  const drillRows = useMemo(() => {
    if (openCompanyId === null) return []
    const inCompany = items.filter((item) => item.companyId === openCompanyId)
    const searched = inCompany.filter((item) => matchesAssetSearch(item, detailSearch))
    return filterByReceivedDate(searched, detailDate)
  }, [items, openCompanyId, detailSearch, detailDate])

  const selectableHere = selectableAssetIds(drillRows)
  const selectedHere = keepSelectable(selected, drillRows)
  const allSelected = selectableHere.length > 0 && selectedHere.length === selectableHere.length

  function updateFilter(next: Partial<AssetFilterState>): void {
    setLoading(true)
    setSelected([])
    setFilters((current) => ({ ...current, ...next }))
  }

  function reload(): void {
    setLoading(true)
    setVersion((current) => current + 1)
  }

  function toggleAsset(id: string, checked: boolean): void {
    setSelected((current) => (checked ? [...new Set([...current, id])] : current.filter((each) => each !== id)))
  }

  async function openDetail(item: AssetListItemDto): Promise<void> {
    setOpeningId(item.id)
    try {
      const response = await callApi<AssetDetailDto>(apiPath('asset.detail', { id: item.id }))
      if (response.error !== undefined || response.data === undefined) {
        showToast({
          tone: 'error',
          title: response.error?.title ?? 'เปิดรายละเอียดไม่สำเร็จ',
          description: response.error?.message ?? 'กรุณาลองใหม่',
        })
        return
      }
      setDetailAsset(response.data)
    } finally {
      setOpeningId(null)
    }
  }

  function scheduleHandover(): void {
    if (openCompanyId === null || selectedHere.length === 0) return
    if (onScheduleHandover === undefined) {
      // Modal "นัดวันส่งมอบ" อยู่ใน Phase 2.15 — ยังไม่ผูกเข้ามาก็ต้องไม่ทำให้ผู้ใช้สับสน
      showToast({
        tone: 'info',
        title: 'ยังเปิดใช้งานไม่ได้',
        description: `เลือกไว้ ${selectedHere.length} เครื่อง — หน้าจอนัดวันส่งมอบจะเปิดใช้ใน Phase 2.15`,
      })
      return
    }
    const picked = drillRows.filter((row) => selectedHere.includes(row.id))
    onScheduleHandover(openCompanyId, picked)
  }

  // ── หน้าการ์ด (grouped by บริษัท) ─────────────────────────────
  if (openCompanyId === null || openGroup === null) {
    return (
      <>
        <Card>
          <div className="mb-4 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Input
              className="min-w-[16rem] flex-1"
              placeholder="ค้นหา IMEI / ชื่อลูกหนี้ / เลขสัญญา"
              aria-label="ค้นหา"
              value={filters.search}
              onChange={(event) => updateFilter({ search: event.target.value })}
            />
            <Select
              aria-label="กรองตามบริษัทไฟแนนซ์"
              className="sm:w-56"
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

          {loading && <div className="py-12 text-center text-sm text-slate-400">กำลังโหลด...</div>}
          {!loading && error !== null && (
            <div className="py-12 text-center text-sm text-red-600">
              {error.title} — {error.message}
              <div className="mt-3">
                <Button variant="secondary" onClick={reload}>
                  ลองใหม่
                </Button>
              </div>
            </div>
          )}
          {!loading && error === null && groups.length === 0 && (
            <div className="py-16 text-center text-sm text-slate-400">ไม่มีเครื่องในคลัง</div>
          )}

          {!loading && error === null && groups.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => (
                <button
                  key={group.companyId}
                  type="button"
                  onClick={() => {
                    setOpenCompanyId(group.companyId)
                    setDetailSearch('')
                    setDetailDate('')
                    setSelected([])
                  }}
                  className="focus-ring rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="font-bold text-slate-900">{group.companyName}</div>
                    <div className="text-right">
                      <div className="text-2xl font-extrabold text-slate-900">{group.total}</div>
                      <div className="text-[10px] text-slate-400">เครื่องทั้งหมด</div>
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Badge className="bg-blue-50 text-blue-700">พร้อมส่ง {group.ready}</Badge>
                    {group.inLot > 0 && <Badge className="bg-slate-100 text-slate-600">อยู่ในล็อต {group.inLot}</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ASSET_CONDITIONS.filter((condition) => (group.byCondition[condition] ?? 0) > 0).map(
                      (condition) => (
                        <Badge key={condition} className="bg-slate-50 text-slate-600">
                          {group.byCondition[condition]} {ASSET_CONDITION_LABEL[condition]}
                        </Badge>
                      ),
                    )}
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">คลิกเพื่อดูรายการ</div>
                </button>
              ))}
            </div>
          )}

          {!loading && error === null && total > items.length && (
            <InlineAlert className="mt-4" tone="info" title="แสดงไม่ครบทุกเครื่อง">
              มีเครื่องในคลัง {total} เครื่อง แสดงได้ {items.length} เครื่องต่อครั้ง — ใช้ตัวกรองด้านบนเพื่อดูส่วนที่เหลือ
            </InlineAlert>
          )}
        </Card>

        {detailAsset !== null && (
          <AssetDetailModal open asset={detailAsset} onClose={() => setDetailAsset(null)} />
        )}
      </>
    )
  }

  // ── Drill-down ตารางของบริษัทเดียว ────────────────────────────
  return (
    <>
      <Card>
        <button
          type="button"
          onClick={() => setOpenCompanyId(null)}
          className="focus-ring mb-4 text-sm font-semibold text-slate-700 hover:underline"
        >
          ← กลับไปหน้ารวมบริษัท
        </button>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900">{openGroup.companyName}</h3>
            <div className="mt-0.5 text-xs text-slate-500">
              {openGroup.total} เครื่องในคลัง · พร้อมส่ง {openGroup.ready} · อยู่ในล็อตแล้ว {openGroup.inLot}
            </div>
          </div>
          {can('manage', WAREHOUSE_CREATE_LOT_CAPABILITY) && (
            <Button variant="primary" disabled={selectedHere.length === 0} onClick={scheduleHandover}>
              นัดวันส่งมอบ{selectedHere.length > 0 ? ` (${selectedHere.length})` : ''}
            </Button>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Input
            className="min-w-[16rem] flex-1"
            placeholder="ค้นหา IMEI / ชื่อลูกหนี้ / เลขสัญญา"
            aria-label="ค้นหาในรายการ"
            value={detailSearch}
            onChange={(event) => setDetailSearch(event.target.value)}
          />
          <Input
            type="date"
            aria-label="วันที่รับเข้า"
            className="sm:w-48"
            value={detailDate}
            onChange={(event) => setDetailDate(event.target.value)}
          />
        </div>

        <Table>
          <THead>
            <Tr>
              <Th>
                <input
                  type="checkbox"
                  aria-label="เลือกทุกเครื่องที่พร้อมส่ง"
                  className="focus-ring rounded"
                  checked={allSelected}
                  disabled={selectableHere.length === 0}
                  onChange={(event) => setSelected(event.target.checked ? selectableHere : [])}
                />
              </Th>
              <Th>เลขสัญญา / ลูกหนี้</Th>
              <Th>อุปกรณ์ / IMEI</Th>
              <Th>วันที่รับเข้า</Th>
              <Th>สภาพ</Th>
              <Th>สถานะ</Th>
              <Th className="text-right">รายละเอียด</Th>
            </Tr>
          </THead>
          <TableState
            colSpan={7}
            loading={loading}
            error={error === null ? null : { title: error.title, message: error.message, code: error.code }}
            isEmpty={drillRows.length === 0}
            emptyTitle="ไม่พบเครื่องตามเงื่อนไข"
            emptyDescription="ลองล้างคำค้นหรือวันที่รับเข้า"
          />
          <TBody>
            {!loading &&
              error === null &&
              drillRows.map((item) => {
                const selectable = isSelectableForLot(item)
                const checked = selectedHere.includes(item.id)
                return (
                  <Tr key={item.id} className={checked ? 'bg-slate-50' : undefined}>
                    <Td>
                      <input
                        type="checkbox"
                        className="focus-ring rounded"
                        aria-label={`เลือก ${item.caseRef}`}
                        checked={checked}
                        disabled={!selectable}
                        title={selectable ? undefined : 'อยู่ในล็อตส่งมอบแล้ว'}
                        onChange={(event) => toggleAsset(item.id, event.target.checked)}
                      />
                    </Td>
                    <Td>
                      <RefText className="font-bold">{item.caseRef}</RefText>
                      <div className="font-semibold text-slate-800">{item.debtorName}</div>
                    </Td>
                    <Td>
                      <div>{item.deviceDesc}</div>
                      <div className="font-mono text-[10px] text-slate-400">
                        {item.imeiActual ?? item.imeiContract ?? '—'}
                      </div>
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-600">{fmtDate(item.receivedAt)}</span>
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
                      {item.lotNumber !== null && (
                        <div className="mt-0.5 font-mono text-[10px] text-slate-400">{item.lotNumber}</div>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={openingId === item.id}
                        onClick={() => void openDetail(item)}
                      >
                        ดู
                      </Button>
                    </Td>
                  </Tr>
                )
              })}
          </TBody>
        </Table>
      </Card>

      {detailAsset !== null && <AssetDetailModal open asset={detailAsset} onClose={() => setDetailAsset(null)} />}
    </>
  )
}
