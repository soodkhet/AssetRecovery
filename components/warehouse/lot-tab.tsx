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
import { cn } from '@/components/ui/cn'
import { AssetDetailModal } from '@/components/warehouse/asset-detail-modal'
import { AttachDocModal } from '@/components/warehouse/attach-doc-modal'
import { ViewAttachedDocModal } from '@/components/warehouse/view-attached-doc-modal'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { matchesAssetSearch, type FilterOption } from '@/lib/warehouse/asset-filters'
import { lotDocumentSlots } from '@/lib/warehouse/lot-documents'
import {
  DELIVERED_STATUS_OPTIONS,
  EMPTY_LOT_FILTERS,
  FILTER_ALL,
  buildLotListQuery,
  filterByDeliveredDate,
  lotFilterOptionsOrFallback,
  type LotFilterState,
} from '@/lib/warehouse/lot-filters'
import { LOT_STATUS_LABELS, isLotConfirmed, type LotTab as LotTabId } from '@/lib/warehouse/lot-status'
import { WAREHOUSE_CONFIRM_LOT_CAPABILITY, WAREHOUSE_EXPORT_CAPABILITIES } from '@/lib/warehouse/permissions'
import type { AssetDetailDto, AssetListItemDto, LotDetailDto, LotListDto, LotSummaryDto } from '@/lib/warehouse/types'
import {
  assetConditionBadgeGroup,
  assetConditionLabel,
  HANDOVER_TYPE_SHORT_LABEL,
  LOT_TAB_LABEL,
  lotStatusBadgeGroup,
} from '@/lib/warehouse/warehouse-ui'

/**
 * แท็บ "รอส่งมอบ" (`44` §8.4) และ "ส่งมอบแล้ว" (`44` §8.5) — โครงหน้าเดียวกันทั้งคู่
 * (การ์ดล็อต → drill-down รายการเครื่อง) ต่างกันแค่สถานะที่ดึง ตัวกรองสถานะ และปุ่มบนการ์ด
 * ⇒ รวมเป็น component เดียวคุมด้วย `tab` เพื่อไม่ให้กติกาสองแท็บเพี้ยนจากกันภายหลัง
 *
 * - ล็อตอยู่แท็บไหนตัดสินจาก `lotTab()` ฝั่ง API (`tab` ของ DTO) — `we_deliver` อยู่ "ส่งมอบแล้ว"
 *   ทันทีที่สร้าง แม้ยังไม่แนบหลักฐาน (§6.3 · §9.3) หน้าจอจึงห้าม if สถานะเอง
 * - "วันที่" ของสองแท็บคนละความหมาย: แท็บรอส่งมอบกรอง **วันนัด** ที่ API · แท็บส่งมอบแล้วกรอง
 *   **วันส่งมอบจริง** ฝั่ง client (API กรองได้แค่ `scheduledAt` — ดู `lot-filters.ts`)
 * - ปุ่มยืนยัน/เอกสารผูกกับ capability ตาม `44` §13 — ไม่มีสิทธิ์ = ซ่อน (Company User ได้หน้าอ่านอย่างเดียว)
 */

/** โหลดล็อตทีเดียวให้ครบ (เพดาน schema = 200) — การ์ดของแท็บนี้ไม่มี pagination ตาม mockup */
const LOT_PAGE_SIZE = 200

export function LotTab({
  tab,
  companies,
  onChanged,
}: {
  tab: LotTabId
  companies: readonly FilterOption[]
  onChanged: () => void
}) {
  const { can } = usePermission()
  const { showToast } = useToast()

  const [result, setResult] = useState<LotListDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [filters, setFilters] = useState<LotFilterState>(EMPTY_LOT_FILTERS)
  const [version, setVersion] = useState(0)

  /** ล็อตที่เปิด drill-down อยู่ (`null` = หน้าการ์ด) */
  const [openLot, setOpenLot] = useState<LotDetailDto | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [detailSearch, setDetailSearch] = useState('')

  const [attachLot, setAttachLot] = useState<LotDetailDto | null>(null)
  const [docsLot, setDocsLot] = useState<LotDetailDto | null>(null)
  const [detailAsset, setDetailAsset] = useState<AssetDetailDto | null>(null)
  const [openingAssetId, setOpeningAssetId] = useState<string | null>(null)

  const canConfirm = can('manage', WAREHOUSE_CONFIRM_LOT_CAPABILITY)
  const canExport = WAREHOUSE_EXPORT_CAPABILITIES.some((capability) => can('view', capability))

  const listPath = useMemo(
    () => apiPath('lot.list', undefined, buildLotListQuery(tab, filters, 1, LOT_PAGE_SIZE)),
    [tab, filters],
  )

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchList = useCallback(async () => callApi<LotListDto>(listPath), [listPath])

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
  }, [fetchList, version])

  const items = useMemo(() => result?.items ?? [], [result])
  const total = result?.total ?? 0
  const companyOptions = lotFilterOptionsOrFallback(companies, items)
  // แท็บ "ส่งมอบแล้ว" กรองวันส่งมอบจริงฝั่ง client (API กรองได้แค่วันนัด)
  const rows = tab === 'handed_over' ? filterByDeliveredDate(items, filters.date) : [...items]

  function updateFilter(next: Partial<LotFilterState>): void {
    setLoading(true)
    setFilters((current) => ({ ...current, ...next }))
  }

  function reload(): void {
    setLoading(true)
    setVersion((current) => current + 1)
  }

  /** โหลดล็อตฉบับเต็ม (พร้อมรายการเครื่อง + url เอกสาร) แล้วส่งต่อให้ผู้เรียก */
  async function loadLot(lotId: string, open: (lot: LotDetailDto) => void): Promise<void> {
    setOpeningId(lotId)
    try {
      const response = await callApi<LotDetailDto>(apiPath('lot.detail', { id: lotId }))
      if (response.error !== undefined || response.data === undefined) {
        showToast({
          tone: 'error',
          title: response.error?.title ?? 'เปิดล็อตไม่สำเร็จ',
          description: response.error?.message ?? 'กรุณาลองใหม่',
        })
        return
      }
      open(response.data)
    } finally {
      setOpeningId(null)
    }
  }

  async function openAsset(item: AssetListItemDto): Promise<void> {
    setOpeningAssetId(item.id)
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
      setOpeningAssetId(null)
    }
  }

  /** ยืนยันสำเร็จ = ล็อตย้ายสถานะ ⇒ ปิด modal + กลับหน้าการ์ด + รีเฟรชทั้งรายการและ badge */
  function afterConfirmed(): void {
    setAttachLot(null)
    setOpenLot(null)
    setDetailSearch('')
    reload()
    onChanged()
  }

  const modals = (
    <>
      {attachLot !== null && (
        <AttachDocModal
          key={attachLot.id}
          open
          lot={attachLot}
          onClose={() => setAttachLot(null)}
          onConfirmed={afterConfirmed}
        />
      )}
      {docsLot !== null && <ViewAttachedDocModal open lot={docsLot} onClose={() => setDocsLot(null)} />}
      {detailAsset !== null && <AssetDetailModal open asset={detailAsset} onClose={() => setDetailAsset(null)} />}
    </>
  )

  // ── Drill-down: รายการเครื่องในล็อตเดียว (`44` §8.4 · §8.5) ────
  if (openLot !== null) {
    const confirmed = isLotConfirmed(openLot.status)
    const assets = openLot.assets.filter((asset) => matchesAssetSearch(asset, detailSearch))
    const slots = lotDocumentSlots(openLot)

    return (
      <>
        <Card>
          <button
            type="button"
            onClick={() => {
              setOpenLot(null)
              setDetailSearch('')
            }}
            className="focus-ring mb-4 text-sm font-semibold text-slate-700 hover:underline"
          >
            ← กลับไปหน้ารวมล็อต
          </button>

          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-lg font-bold text-slate-900">{openLot.lotNumber}</span>
                <StatusBadge
                  group={lotStatusBadgeGroup(openLot.status)}
                  label={LOT_STATUS_LABELS[openLot.status]}
                />
              </div>
              <div className="text-sm font-semibold text-slate-700">{openLot.companyName}</div>
              <div className="mt-0.5 text-xs text-slate-400">
                {typeIcon(openLot)} {HANDOVER_TYPE_SHORT_LABEL[openLot.type]} · ใบส่งมอบ {openLot.docRef} ·{' '}
                {openLot.assetCount} เครื่อง
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {openLot.type === 'finance_pickup' ? 'นัดรับ' : 'กำหนดส่ง'} {fmtDateTime(openLot.scheduledAt)}
                {openLot.deliveredAt !== null && <> · ส่งมอบจริง {fmtDateTime(openLot.deliveredAt)}</>}
                {openLot.confirmedAt !== null && <> · ยืนยัน {fmtDateTime(openLot.confirmedAt)}</>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canExport && (
                <>
                  <a
                    href={apiPath('lot.exportExcel', { id: openLot.id })}
                    className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Export Excel
                  </a>
                  <a
                    href={apiPath('lot.pdf', { id: openLot.id })}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    ใบส่งมอบ PDF
                  </a>
                </>
              )}
              {!confirmed && canConfirm && (
                <Button variant="primary" onClick={() => setAttachLot(openLot)}>
                  แนบเอกสาร &amp; ยืนยัน
                </Button>
              )}
              {confirmed && (
                <Button variant="secondary" onClick={() => setDocsLot(openLot)}>
                  ดูเอกสารแนบ
                </Button>
              )}
            </div>
          </div>

          {!confirmed && (
            <InlineAlert className="mb-4" tone="warning" title={LOT_STATUS_LABELS[openLot.status]}>
              ต้องแนบ{slots.map((slot) => slot.label).join(' + ')} แล้วยืนยัน — รายการเบิกของทีมภาคสนามและรายได้จะปลดล็อกเมื่อยืนยัน
            </InlineAlert>
          )}
          {openLot.note !== null && (
            <InlineAlert className="mb-4" tone="info" title="หมายเหตุ">
              {openLot.note}
            </InlineAlert>
          )}

          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Input
              placeholder="ค้นหา IMEI / ชื่อลูกหนี้ / เลขสัญญา"
              aria-label="ค้นหาในรายการเครื่อง"
              value={detailSearch}
              onChange={(event) => setDetailSearch(event.target.value)}
            />
          </div>

          <Table>
            <THead>
              <Tr>
                <Th>เลขสัญญา / ลูกหนี้</Th>
                <Th>อุปกรณ์ / IMEI</Th>
                <Th>วันที่รับเข้าคลัง</Th>
                <Th>สภาพ</Th>
                <Th className="text-right">รายละเอียด</Th>
              </Tr>
            </THead>
            <TableState
              colSpan={5}
              loading={false}
              error={null}
              isEmpty={assets.length === 0}
              emptyTitle="ไม่พบเครื่องตามคำค้น"
              emptyDescription="ลองล้างคำค้นเพื่อดูรายการทั้งหมดของล็อตนี้"
            />
            <TBody>
              {assets.map((asset) => (
                <Tr key={asset.id}>
                  <Td>
                    <RefText className="font-bold">{asset.caseRef}</RefText>
                    <div className="font-semibold text-slate-800">{asset.debtorName}</div>
                  </Td>
                  <Td>
                    <div>{asset.deviceDesc}</div>
                    <div className="font-mono text-[10px] text-slate-400">
                      {asset.imeiActual ?? asset.imeiContract ?? '—'}
                    </div>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-600">{fmtDate(asset.receivedAt)}</span>
                  </Td>
                  <Td>
                    <StatusBadge
                      group={assetConditionBadgeGroup(asset.condition)}
                      label={assetConditionLabel(asset.condition)}
                    />
                  </Td>
                  <Td className="text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={openingAssetId === asset.id}
                      onClick={() => void openAsset(asset)}
                    >
                      ดู
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>

        {modals}
      </>
    )
  }

  // ── หน้าการ์ดล็อต ──────────────────────────────────────────────
  return (
    <>
      <Card>
        <div className="mb-4 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Input
            className="min-w-[16rem] flex-1"
            placeholder="ค้นหา เลขล็อต / IMEI / ชื่อลูกหนี้"
            aria-label="ค้นหาล็อต"
            value={filters.search}
            onChange={(event) => updateFilter({ search: event.target.value })}
          />
          <Input
            type="date"
            aria-label={tab === 'pending_handover' ? 'วันนัดส่งมอบ' : 'วันส่งมอบจริง'}
            className="sm:w-48"
            value={filters.date}
            onChange={(event) => updateFilter({ date: event.target.value })}
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
          {tab === 'handed_over' && (
            <Select
              aria-label="กรองตามสถานะล็อต"
              className="sm:w-44"
              value={filters.status}
              onChange={(event) => updateFilter({ status: event.target.value })}
            >
              <option value={FILTER_ALL}>ทุกสถานะ</option>
              {DELIVERED_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {LOT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          )}
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
        {!loading && error === null && rows.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">ไม่มีล็อตในแท็บ “{LOT_TAB_LABEL[tab]}”</div>
        )}

        {!loading && error === null && rows.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((lot) => (
              <LotCard
                key={lot.id}
                lot={lot}
                busy={openingId === lot.id}
                canConfirm={canConfirm}
                onOpen={() => void loadLot(lot.id, setOpenLot)}
                onAttach={() => void loadLot(lot.id, setAttachLot)}
                onViewDocs={() => void loadLot(lot.id, setDocsLot)}
              />
            ))}
          </div>
        )}

        {!loading && error === null && total > items.length && (
          <InlineAlert className="mt-4" tone="info" title="แสดงไม่ครบทุกล็อต">
            มีล็อตในแท็บนี้ {total} ล็อต แสดงได้ {items.length} ล็อตต่อครั้ง — ใช้ตัวกรองด้านบนเพื่อดูส่วนที่เหลือ
          </InlineAlert>
        )}
      </Card>

      {modals}
    </>
  )
}

function typeIcon(lot: { type: LotSummaryDto['type'] }): string {
  return lot.type === 'finance_pickup' ? '🏢' : '🚚'
}

/** การ์ด 1 ใบ = 1 ล็อต (`44` §8.4 · §8.5) — กรอบ amber = ยังรอเอกสาร · emerald = ยืนยันแล้ว */
function LotCard({
  lot,
  busy,
  canConfirm,
  onOpen,
  onAttach,
  onViewDocs,
}: {
  lot: LotSummaryDto
  busy: boolean
  canConfirm: boolean
  onOpen: () => void
  onAttach: () => void
  onViewDocs: () => void
}) {
  const confirmed = isLotConfirmed(lot.status)
  const slots = lotDocumentSlots(lot)

  return (
    <div
      className={cn(
        'rounded-2xl border-2 bg-white p-5 shadow-sm transition-shadow hover:shadow-md',
        confirmed ? 'border-emerald-200' : 'border-amber-300',
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-bold text-slate-500">{lot.lotNumber}</div>
          <div className="truncate font-bold text-slate-900">{lot.companyName}</div>
        </div>
        <div className="text-right">
          <div className={cn('text-2xl font-extrabold', confirmed ? 'text-emerald-700' : 'text-amber-600')}>
            {lot.assetCount}
          </div>
          <div className="text-[10px] text-slate-400">เครื่อง</div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Badge className="bg-slate-100 text-slate-600">
          {typeIcon(lot)} {HANDOVER_TYPE_SHORT_LABEL[lot.type]}
        </Badge>
        <StatusBadge group={lotStatusBadgeGroup(lot.status)} label={LOT_STATUS_LABELS[lot.status]} />
      </div>

      <div className="mb-3 space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-[10px]">
        {slots.map((slot) => (
          <div key={slot.document} className={slot.attached ? 'text-emerald-700' : 'text-slate-500'}>
            {slot.attached ? '✅' : '⏳'} {slot.label} {slot.attached ? 'แนบแล้ว' : 'รอแนบ'}
          </div>
        ))}
      </div>

      <div className="mb-4 text-xs text-slate-500">
        {lot.type === 'finance_pickup' ? 'นัดรับ' : 'กำหนดส่ง'}:{' '}
        <span className="font-semibold text-slate-700">{fmtDateTime(lot.scheduledAt)}</span>
        {lot.deliveredAt !== null && (
          <div className="mt-0.5">
            ส่งมอบจริง: <span className="font-semibold text-slate-700">{fmtDateTime(lot.deliveredAt)}</span>
          </div>
        )}
        {lot.confirmedAt !== null && (
          <div className="mt-0.5">
            ยืนยัน: <span className="font-semibold text-emerald-700">{fmtDateTime(lot.confirmedAt)}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" size="sm" className="flex-1" loading={busy} onClick={onOpen}>
          ดูรายการ
        </Button>
        {confirmed ? (
          <Button variant="secondary" size="sm" className="flex-1" onClick={onViewDocs}>
            เอกสาร
          </Button>
        ) : (
          canConfirm && (
            <Button variant="primary" size="sm" className="flex-1" onClick={onAttach}>
              แนบเอกสาร
            </Button>
          )
        )}
      </div>
    </div>
  )
}
