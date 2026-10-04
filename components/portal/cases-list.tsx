'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PortalCaseDetailDrawer } from '@/components/portal/cases-detail-drawer'
import { PortalStatusBadge } from '@/components/portal/cases-status-badge'
import { usePortalData } from '@/components/portal/use-portal-data'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  RefText,
  Select,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { fmtDate } from '@/lib/format/datetime'
import {
  PORTAL_CASES_PAGE_SIZE,
  PORTAL_CASES_PATH,
  PORTAL_CASES_SEARCH_MAX,
  PORTAL_CASE_STATUS_OPTIONS,
  hasActivePortalCasesFilter,
  parsePortalCasesFilters,
  portalCasesApiPath,
  portalCasesLastPage,
  portalCasesPageQuery,
  portalCasesRange,
  type PortalCaseStatusFilter,
  type PortalCasesFilters,
} from '@/lib/portal/cases-view'
import type { PortalCaseListResultDto } from '@/lib/portal/queries/cases'
import type { PortalCaseListItemDto } from '@/lib/portal/serializers'

const SEARCH_DEBOUNCE_MS = 400
const COLUMN_COUNT = 6

/**
 * หน้า "เคสของเรา" ของพอร์ทัล (`97` §6.1/§8 · mockup `renderCases()` desktop + การ์ดมือถือ)
 *
 * - ตัวกรองสถานะ (รหัสฝั่งบริษัท) / ค้นหา / หน้า / เคสที่เปิด drawer ผูกกับ URL query ทั้งหมด (แชร์ลิงก์/ย้อนกลับได้)
 * - กรอง/ค้นหา/แบ่งหน้าที่ server (`GET /api/portal/cases`) — ไม่กรองฝั่ง client
 * - อ่านอย่างเดียว: ไม่มีปุ่มแก้ไข/ส่งเคส · ยังไม่มีเคส = empty state ปกติ (`NO_DATA` ไม่ใช่ error)
 */
export function PortalCasesList({ canViewPhotos }: { canViewPhotos: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filters = useMemo(() => parsePortalCasesFilters(searchParams), [searchParams])
  const apiPath = useMemo(
    () => portalCasesApiPath({ status: filters.status, search: filters.search, page: filters.page, caseId: null }),
    [filters.status, filters.search, filters.page],
  )
  const state = usePortalData<PortalCaseListResultDto>(apiPath)

  const navigate = useCallback(
    (next: PortalCasesFilters) => {
      router.replace(`${PORTAL_CASES_PATH}${portalCasesPageQuery(next)}`, { scroll: false })
    },
    [router],
  )

  // ช่องค้นหา: พิมพ์แล้วหน่วงก่อนยิง (หรือกด Enter) — URL เปลี่ยนจากที่อื่น (ล้างตัวกรอง/ย้อนกลับ) ให้ช่องตามด้วย
  const [searchDraft, setSearchDraft] = useState(filters.search)
  const [syncedSearch, setSyncedSearch] = useState(filters.search)
  if (syncedSearch !== filters.search) {
    setSyncedSearch(filters.search)
    setSearchDraft(filters.search)
  }
  useEffect(() => {
    const draft = searchDraft.trim()
    if (draft === filters.search) return
    const timer = setTimeout(() => navigate({ ...filters, search: draft, page: 1 }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, filters, navigate])

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const draft = searchDraft.trim()
    if (draft !== filters.search) navigate({ ...filters, search: draft, page: 1 })
  }

  const data = state.data
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const limit = data?.limit ?? PORTAL_CASES_PAGE_SIZE
  const page = data?.page ?? filters.page
  const lastPage = portalCasesLastPage(total, limit)
  const range = portalCasesRange(page, limit, items.length, total)
  const filtered = hasActivePortalCasesFilter(filters)
  const empty = !state.loading && state.error === null && items.length === 0
  const emptyTitle = filtered ? 'ไม่พบเคสที่ตรงกับเงื่อนไข' : 'ยังไม่มีเคส'
  const emptyDescription = filtered
    ? 'ลองเปลี่ยนสถานะหรือคำค้นหา'
    : 'เคสที่บริษัทส่งเข้าระบบจะแสดงที่นี่เมื่อเจ้าหน้าที่ได้รับเรื่องแล้ว'

  const openCase = (caseId: string) => navigate({ ...filters, caseId })
  const retry = (
    <Button variant="secondary" onClick={state.reload}>
      ลองใหม่
    </Button>
  )

  return (
    <div>
      <PageHeader title="เคสของเรา" description="ติดตามสถานะเคสที่บริษัทส่งเข้าระบบ" />

      <Card>
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <form role="search" onSubmit={submitSearch} className="md:w-72">
            <Input
              type="search"
              value={searchDraft}
              maxLength={PORTAL_CASES_SEARCH_MAX}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="ค้นหาเลขที่สัญญา / ชื่อลูกหนี้..."
              aria-label="ค้นหาเลขที่สัญญาหรือชื่อลูกหนี้"
            />
          </form>
          <Select
            value={filters.status}
            onChange={(event) =>
              navigate({ ...filters, status: event.target.value as PortalCaseStatusFilter, page: 1 })
            }
            aria-label="กรองตามสถานะ"
            className="md:w-56"
          >
            {PORTAL_CASE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {filtered && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchDraft('')
                navigate({ status: 'all', search: '', page: 1, caseId: null })
              }}
            >
              ล้างตัวกรอง
            </Button>
          )}
          <div className="text-xs text-slate-400 md:ml-auto">ทั้งหมด {total.toLocaleString('th-TH')} รายการ</div>
        </div>

        {/* desktop: ตาราง */}
        <div className="hidden md:block">
          <Table>
            <THead>
              <tr>
                <Th>เลขที่สัญญา</Th>
                <Th>ลูกหนี้</Th>
                <Th>สถานะ</Th>
                <Th>เหตุผล</Th>
                <Th>วันที่ส่งเคส</Th>
                <Th className="text-right">จัดการ</Th>
              </tr>
            </THead>
            <TableState
              colSpan={COLUMN_COUNT}
              loading={state.loading}
              error={state.error}
              isEmpty={empty}
              emptyTitle={emptyTitle}
              emptyDescription={emptyDescription}
              onRetry={retry}
            />
            {!state.loading && state.error === null && items.length > 0 && (
              <TBody>
                {items.map((item) => (
                  <CaseRow key={item.id} item={item} onOpen={openCase} />
                ))}
              </TBody>
            )}
          </Table>
        </div>

        {/* มือถือ: การ์ด */}
        <div className="md:hidden">
          {state.loading ? (
            <LoadingState />
          ) : state.error !== null ? (
            <ErrorState
              title={state.error.title}
              message={state.error.message}
              {...(state.error.code === undefined ? {} : { code: state.error.code })}
              action={retry}
            />
          ) : empty ? (
            <EmptyState title={emptyTitle} description={emptyDescription} />
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <CaseCard key={item.id} item={item} onOpen={openCase} />
              ))}
            </div>
          )}
        </div>

        {!state.loading && state.error === null && total > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {range === null ? '' : `แสดง ${range} รายการ`} (หน้า {page}/{lastPage})
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => navigate({ ...filters, page: Math.max(1, page - 1) })}
              >
                ก่อนหน้า
              </Button>
              <Button
                variant="secondary"
                disabled={page >= lastPage}
                onClick={() => navigate({ ...filters, page: Math.min(lastPage, page + 1) })}
              >
                ถัดไป
              </Button>
            </div>
          </div>
        )}
      </Card>

      {filters.caseId !== null && (
        <PortalCaseDetailDrawer
          key={filters.caseId}
          caseId={filters.caseId}
          canViewPhotos={canViewPhotos}
          onClose={() => navigate({ ...filters, caseId: null })}
        />
      )}
    </div>
  )
}

function RecycleTag({ round, compact = false }: { round: number | null; compact?: boolean }) {
  if (round === null) return null
  return <span className="ml-1.5 font-sans text-[12px] font-bold text-violet-600">{compact ? `· รอบ ${round}` : `รอบที่ ${round}`}</span>
}

function CaseRow({ item, onOpen }: { item: PortalCaseListItemDto; onOpen: (id: string) => void }) {
  return (
    <Tr interactive onClick={() => onOpen(item.id)}>
      <Td className="whitespace-nowrap">
        <RefText className="font-semibold text-slate-800">{item.caseRef}</RefText>
        <RecycleTag round={item.recycleRound} />
      </Td>
      <Td>{item.debtorName ?? '—'}</Td>
      <Td>
        <PortalStatusBadge display={item.statusDisplay} />
      </Td>
      <Td className="max-w-xs text-xs text-slate-500">
        {item.statusReason === null || item.statusReason.trim() === '' ? (
          '—'
        ) : (
          <span className="line-clamp-2" title={item.statusReason}>
            {item.statusReason}
          </span>
        )}
      </Td>
      <Td className="text-xs whitespace-nowrap text-slate-500">{fmtDate(item.createdAt)}</Td>
      <Td className="text-right">
        <Button
          variant="secondary"
          onClick={(event) => {
            event.stopPropagation()
            onOpen(item.id)
          }}
        >
          ดูรายละเอียด
        </Button>
      </Td>
    </Tr>
  )
}

function CaseCard({ item, onOpen }: { item: PortalCaseListItemDto; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className="focus-ring w-full rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50"
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0 truncate">
          <RefText className="font-bold text-slate-800">{item.caseRef}</RefText>
          <RecycleTag round={item.recycleRound} compact />
        </div>
        <PortalStatusBadge display={item.statusDisplay} />
      </div>
      <div className="text-sm font-semibold text-slate-700">{item.debtorName ?? '—'}</div>
      {item.statusReason !== null && item.statusReason.trim() !== '' && (
        <div className="mt-1 line-clamp-2 text-xs text-amber-700">{item.statusReason}</div>
      )}
      <div className="mt-1 text-xs text-slate-400">ส่งเคสเมื่อ {fmtDate(item.createdAt)}</div>
    </button>
  )
}
