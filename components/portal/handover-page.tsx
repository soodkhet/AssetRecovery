'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { HandoverLotCard } from '@/components/portal/handover-lot-card'
import { HandoverLotDetailModal } from '@/components/portal/handover-lot-detail'
import { usePortalData } from '@/components/portal/use-portal-data'
import { Button, Card, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader, Select } from '@/components/ui'
import {
  PORTAL_LOT_STATUS_FILTER_OPTIONS,
  hasActivePortalLotFilters,
  parsePortalLotFilters,
  portalLotFiltersToQuery,
  portalLotLastPage,
  portalLotListApiUrl,
  updatePortalLotFilters,
  type PortalLotFilters,
  type PortalLotStatusFilter,
} from '@/lib/portal/handover-view'
import type { PortalLotListItemDto } from '@/lib/portal/serializers'

interface PortalLotListData {
  items: PortalLotListItemDto[]
  total: number
  page: number
  limit: number
}

/**
 * หน้า "ใบส่งมอบทรัพย์" ของพอร์ทัล (`97` §6.4 · §10.2 · mockup `renderHandover()`) — อ่านอย่างเดียว
 *
 * - ตัวกรอง (สถานะ/ช่วงวันที่สร้างล็อต/ค้นหาเลขล็อต-เลขใบส่งมอบ) + หน้า + ล็อตที่เปิด อยู่ใน URL ทั้งหมด
 *   (`window.history.replaceState` — ผูกกับ router ของ Next ⇒ `useSearchParams()` อัปเดตตาม โดยไม่ยิง server ใหม่)
 * - `canDownload` มาจาก server (`portal_download`) — false ⇒ ซ่อนปุ่มดาวน์โหลด + ไม่โหลดรูปทรัพย์ (UX เท่านั้น
 *   API ตรวจซ้ำทุกครั้ง — DEC-002)
 */
export function PortalHandover({ canDownload }: { canDownload: boolean }) {
  const searchParams = useSearchParams()
  const filters = useMemo(() => parsePortalLotFilters(searchParams), [searchParams])
  const listUrl = portalLotListApiUrl(filters)
  const state = usePortalData<PortalLotListData>(listUrl)
  const [searchDraft, setSearchDraft] = useState(filters.search)
  const [syncedSearch, setSyncedSearch] = useState(filters.search)

  // ช่องค้นหาตามค่าใน URL เมื่อเปลี่ยนจากที่อื่น (ปุ่มล้างตัวกรอง/ย้อนกลับ) — ปรับระหว่าง render ตามแนวทางของ React
  if (syncedSearch !== filters.search) {
    setSyncedSearch(filters.search)
    setSearchDraft(filters.search)
  }

  const apply = useCallback(
    (patch: Partial<PortalLotFilters>) => {
      const next = updatePortalLotFilters(filters, patch)
      window.history.replaceState(null, '', `${window.location.pathname}${portalLotFiltersToQuery(next)}`)
    },
    [filters],
  )

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    apply({ search: searchDraft.trim() })
  }

  const data = state.data
  const lastPage = data === null ? 1 : portalLotLastPage(data.total, data.limit)
  const filtered = hasActivePortalLotFilters(filters)

  return (
    <div>
      <PageHeader title="ใบส่งมอบทรัพย์" description="สถานะการส่งมอบทรัพย์คืนให้บริษัทของท่าน" />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field id="lot-status" label="สถานะ" className="w-full sm:w-52">
          <Select
            id="lot-status"
            value={filters.status}
            onChange={(event) => apply({ status: event.target.value as PortalLotStatusFilter })}
          >
            {PORTAL_LOT_STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="lot-date-from" label="สร้างตั้งแต่วันที่" className="w-[calc(50%-0.375rem)] sm:w-40">
          <Input
            id="lot-date-from"
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo === '' ? undefined : filters.dateTo}
            onChange={(event) => apply({ dateFrom: event.target.value })}
          />
        </Field>
        <Field id="lot-date-to" label="ถึงวันที่" className="w-[calc(50%-0.375rem)] sm:w-40">
          <Input
            id="lot-date-to"
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom === '' ? undefined : filters.dateFrom}
            onChange={(event) => apply({ dateTo: event.target.value })}
          />
        </Field>
        <form onSubmit={submitSearch} className="flex w-full items-end gap-2 sm:w-auto" role="search">
          <Field id="lot-search" label="ค้นหา" className="min-w-0 flex-1 sm:w-56">
            <Input
              id="lot-search"
              type="search"
              value={searchDraft}
              maxLength={100}
              placeholder="เลขล็อต หรือ เลขที่ใบส่งมอบ"
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="secondary">
            ค้นหา
          </Button>
        </form>
        {filtered ? (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchDraft('')
              apply({ status: 'all', dateFrom: '', dateTo: '', search: '' })
            }}
          >
            ล้างตัวกรอง
          </Button>
        ) : null}
        {data !== null && !state.loading ? (
          <div className="ml-auto self-center text-xs text-slate-400">
            ทั้งหมด {data.total.toLocaleString('th-TH')} ล็อต
          </div>
        ) : null}
      </div>

      {state.loading ? (
        <Card padded={false}>
          <LoadingState />
        </Card>
      ) : state.error !== null ? (
        <Card padded={false}>
          <ErrorState
            title={state.error.title}
            message={state.error.message}
            {...(state.error.code === undefined ? {} : { code: state.error.code })}
            action={
              <Button variant="secondary" onClick={state.reload}>
                ลองใหม่
              </Button>
            }
          />
        </Card>
      ) : data !== null && data.items.length === 0 && data.total > 0 ? (
        <Card padded={false}>
          <EmptyState
            title="ไม่มีรายการในหน้านี้"
            action={
              <Button variant="secondary" onClick={() => apply({ page: 1 })}>
                กลับไปหน้าแรก
              </Button>
            }
          />
        </Card>
      ) : data === null || data.items.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title={filtered ? 'ไม่พบล็อตที่ตรงกับเงื่อนไข' : 'ยังไม่มีล็อตส่งมอบ'}
            description={
              filtered
                ? 'ลองเปลี่ยนสถานะ ช่วงวันที่ หรือคำค้นหา'
                : 'เมื่อมีการเตรียมส่งมอบทรัพย์คืนให้บริษัทของท่าน รายการจะแสดงที่นี่'
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((lot) => (
              <HandoverLotCard key={lot.id} lot={lot} canDownload={canDownload} onOpen={(lotId) => apply({ lot: lotId })} />
            ))}
          </div>
          {lastPage > 1 ? (
            <div className="mt-5 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>
                หน้า {filters.page.toLocaleString('th-TH')} / {lastPage.toLocaleString('th-TH')}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() => apply({ page: Math.max(1, filters.page - 1) })}
                >
                  ก่อนหน้า
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={filters.page >= lastPage}
                  onClick={() => apply({ page: filters.page + 1 })}
                >
                  ถัดไป
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {filters.lot !== '' ? (
        <HandoverLotDetailModal
          key={filters.lot}
          lotId={filters.lot}
          canDownload={canDownload}
          onClose={() => apply({ lot: '' })}
        />
      ) : null}
    </div>
  )
}
