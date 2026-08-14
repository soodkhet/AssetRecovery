'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Can, usePermission } from '@/components/auth/permission-provider'
import { CaseFormModal } from '@/components/cases/case-form-modal'
import {
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  RefText,
  Select,
  StatCard,
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
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { THAI_PROVINCES } from '@/lib/address/thai-address'
import { isCaseEditable } from '@/lib/cases/case'
import { CASE_EDIT_CAPABILITIES, CASE_WRITE_CAPABILITY } from '@/lib/cases/permissions'
import { CASE_STATUSES } from '@/lib/cases/state-machine'
import {
  CASE_SOURCE_CHANNELS,
  caseSourceBadgeClass,
  caseSourceLabel,
  caseStatusBadgeGroup,
  caseStatusLabel,
} from '@/lib/cases/status-display'
import type { CaseDetailDto, CaseListItemDto, CaseListResultDto } from '@/lib/cases/types'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtSatang } from '@/lib/format/money'

/**
 * หน้า "รับเคส" (`/cases/submit` — `38` §7.1/§7.2 · `06` §7.1.1)
 * โครงหน้า/คลาสตาม mockup `38-case-submission-mockup.html` (`renderCaseList`)
 *
 * - filter ครบตาม §7.2: สถานะ · ช่องทาง · บริษัทไฟแนนซ์ · จังหวัด · ค้นหา + pagination
 * - จอเล็ก (< `md`) สลับเป็น **card list** ไม่ใช่ scroll แนวนอน (§7.2 Responsive)
 * - ปุ่มบนหน้าจอเป็นแค่ UX — `/api/cases` ตรวจสิทธิ์เองทุกครั้ง (DEC-002)
 * - แก้ไขได้เฉพาะสถานะที่ `isCaseEditable()` อนุญาต (draft/pending_review/need_info — `38` §8)
 *
 * Phase 2.5 จะเสียบต่อที่หน้านี้: Case Detail/Review Modal, Import wizard, กล่องทีมที่เสนอ
 */

const PAGE_SIZE = 20

/** KPI 4 ใบตาม mockup — นับด้วย `GET /api/cases` (limit=1) แล้วอ่านค่า `total` ไม่ต้องมี endpoint ใหม่ */
const KPI_STATUSES = [
  { status: 'draft', label: 'ร่าง', hint: 'ยังไม่ครบเอกสาร' },
  { status: 'pending_review', label: 'รอพิจารณา', hint: 'พร้อมให้ผู้พิจารณาตัดสิน' },
  { status: 'need_info', label: 'ขอข้อมูลเพิ่ม', hint: 'รอธุรการ/ไฟแนนซ์เติม' },
  { status: 'approved', label: 'รับเคสแล้ว', hint: 'ส่งต่อมอบหมายทีมแล้ว' },
] as const

interface Filters {
  search: string
  status: string
  sourceChannel: string
  financeCompanyId: string
  province: string
}

const EMPTY_FILTERS: Filters = {
  search: '',
  status: 'all',
  sourceChannel: 'all',
  financeCompanyId: 'all',
  province: 'all',
}

function buildListPath(filters: Filters, page: number): string {
  const query: Record<string, string | number> = { page, limit: PAGE_SIZE }
  if (filters.status !== 'all') query.status = filters.status
  if (filters.sourceChannel !== 'all') query.source_channel = filters.sourceChannel
  if (filters.financeCompanyId !== 'all') query.finance_company_id = filters.financeCompanyId
  if (filters.province !== 'all') query.province = filters.province
  if (filters.search.trim() !== '') query.search = filters.search.trim()
  return apiPath('case.list', undefined, query)
}

export function CasesManager() {
  const { showToast } = useToast()

  const [result, setResult] = useState<CaseListResultDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiCallError | null>(null)

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)

  const [companies, setCompanies] = useState<readonly FinanceCompanyDto[]>([])
  const [counts, setCounts] = useState<Readonly<Record<string, number>>>({})

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CaseDetailDto | null>(null)
  const [openingCaseId, setOpeningCaseId] = useState<string | null>(null)
  /** เปลี่ยนทุกครั้งที่เปิดฟอร์ม — บังคับให้ modal เริ่มจากค่าเปล่า/ค่าเคสล่าสุดเสมอ (กันค่าค้างจากรอบก่อน) */
  const [formKey, setFormKey] = useState(0)

  const listPath = useMemo(() => buildListPath(filters, page), [filters, page])

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchList = useCallback(async () => callApi<CaseListResultDto>(listPath), [listPath])

  const fetchCounts = useCallback(async () => {
    const results = await Promise.all(
      KPI_STATUSES.map(async (item) => {
        const path = apiPath('case.list', undefined, { status: item.status, page: 1, limit: 1 })
        const response = await callApi<CaseListResultDto>(path)
        return [item.status, response.data?.total ?? 0] as const
      }),
    )
    return Object.fromEntries(results)
  }, [])

  const reload = useCallback(async () => {
    const [list, kpi] = await Promise.all([fetchList(), fetchCounts()])
    if (list.error !== undefined) {
      setError(list.error)
      setLoading(false)
      return
    }
    setResult(list.data ?? null)
    setCounts(kpi)
    setError(null)
    setLoading(false)
  }, [fetchList, fetchCounts])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [list, kpi] = await Promise.all([fetchList(), fetchCounts()])
      if (cancelled) return
      if (list.error !== undefined) {
        setError(list.error)
        setLoading(false)
        return
      }
      setResult(list.data ?? null)
      setCounts(kpi)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchList, fetchCounts])

  // ข้อมูลประกอบ filter (บริษัทไฟแนนซ์) โหลดครั้งเดียวตอนเข้าหน้า
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await callApi<FinanceCompanyDto[]>('/api/finance-companies?status=active')
      if (cancelled) return
      setCompanies(response.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function updateFilter(next: Partial<Filters>): void {
    setLoading(true)
    setPage(1)
    setFilters((current) => ({ ...current, ...next }))
  }

  function openCreate(): void {
    setEditing(null)
    setFormKey((current) => current + 1)
    setFormOpen(true)
  }

  /** ต้องดึง detail ก่อนเพราะแถวใน list ไม่มีที่อยู่/ช่องทางติดต่อครบ (`38` §7.3 pre-fill ทุก field) */
  async function openEdit(item: CaseListItemDto): Promise<void> {
    setOpeningCaseId(item.id)
    try {
      const response = await callApi<CaseDetailDto>(apiPath('case.detail', { id: item.id }))
      if (response.error !== undefined || response.data === undefined) {
        showToast({
          tone: 'error',
          title: response.error?.title ?? 'เปิดเคสไม่สำเร็จ',
          description: response.error?.message ?? 'กรุณาลองใหม่',
        })
        return
      }
      setEditing(response.data)
      setFormKey((current) => current + 1)
      setFormOpen(true)
    } finally {
      setOpeningCaseId(null)
    }
  }

  const items = result?.items ?? []
  const total = result?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <PageHeader
        title="รับเคส (Case Submission)"
        description="รับเคสจากบริษัทไฟแนนซ์ผ่าน API / Import ไฟล์ / กรอกฟอร์มมือ — ตรวจสอบและพิจารณารับก่อนส่งต่อมอบหมายทีม"
        action={
          <>
            <Button variant="secondary" disabled title="Import wizard อยู่ใน Phase 2.5">
              Import ไฟล์
            </Button>
            <Can action="manage" resource={CASE_WRITE_CAPABILITY}>
              <Button onClick={openCreate}>+ รับเคส (กรอกมือ)</Button>
            </Can>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        {KPI_STATUSES.map((item) => (
          <StatCard key={item.status} label={item.label} value={counts[item.status] ?? 0} hint={item.hint} />
        ))}
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 lg:flex-row">
          <div className="flex-1">
            <Input
              aria-label="ค้นหาเลขเคส เลขที่สัญญา หรือชื่อลูกหนี้"
              value={filters.search}
              placeholder="ค้นหา เลขเคส / เลขสัญญา / ชื่อลูกหนี้..."
              onChange={(event) => updateFilter({ search: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-nowrap">
            <Select
              aria-label="กรองตามสถานะ"
              className="lg:w-44"
              value={filters.status}
              onChange={(event) => updateFilter({ status: event.target.value })}
            >
              <option value="all">สถานะทั้งหมด</option>
              {CASE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {caseStatusLabel(status)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="กรองตามช่องทาง"
              className="lg:w-36"
              value={filters.sourceChannel}
              onChange={(event) => updateFilter({ sourceChannel: event.target.value })}
            >
              <option value="all">ช่องทางทั้งหมด</option>
              {CASE_SOURCE_CHANNELS.map((source) => (
                <option key={source} value={source}>
                  {caseSourceLabel(source)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="กรองตามบริษัทไฟแนนซ์"
              className="lg:w-48"
              value={filters.financeCompanyId}
              onChange={(event) => updateFilter({ financeCompanyId: event.target.value })}
            >
              <option value="all">ไฟแนนซ์ทั้งหมด</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="กรองตามจังหวัด"
              className="lg:w-40"
              value={filters.province}
              onChange={(event) => updateFilter({ province: event.target.value })}
            >
              <option value="all">จังหวัดทั้งหมด</option>
              {THAI_PROVINCES.map((province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* จอ md ขึ้นไป = ตาราง */}
        <div className="hidden md:block">
          <Table>
            <THead>
              <Tr>
                <Th>เลขที่สัญญา / รอบ</Th>
                <Th>ไฟแนนซ์ / ช่องทาง</Th>
                <Th>ลูกหนี้ / จังหวัด</Th>
                <Th>ทรัพย์</Th>
                <Th className="text-right">มูลหนี้คงเหลือ</Th>
                <Th>ทีมที่เสนอ</Th>
                <Th>สร้างเมื่อ / โดย</Th>
                <Th>สถานะ</Th>
                <Th className="text-right">จัดการ</Th>
              </Tr>
            </THead>
            {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
            <TableState
              colSpan={9}
              loading={loading}
              error={error === null ? null : { title: error.title, message: error.message }}
              isEmpty={items.length === 0}
              emptyTitle="ไม่พบเคสตามเงื่อนไขที่ค้นหา"
              emptyDescription="ลองล้างตัวกรอง หรือกด “รับเคส (กรอกมือ)” เพื่อสร้างเคสใหม่"
              onRetry={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLoading(true)
                    void reload()
                  }}
                >
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
                      <div className="mt-0.5 text-[11px] text-slate-500">รอบที่ {item.trackingRound}</div>
                    </Td>
                    <Td>
                      <div className="text-xs text-slate-700">{item.financeCompanyName}</div>
                      <Badge className={`mt-1 ${caseSourceBadgeClass(item.sourceChannel)}`}>
                        {caseSourceLabel(item.sourceChannel)}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="font-semibold text-slate-800">{item.debtorName ?? '—'}</div>
                      <div className="text-[11px] text-slate-500">{item.province ?? 'ยังไม่ระบุจังหวัด'}</div>
                    </Td>
                    <Td>
                      <div className="text-xs text-slate-600">{item.assetBrandModel ?? '—'}</div>
                      <div className="text-[11px] text-slate-400">เอกสารแนบ {item.documentCount} ไฟล์</div>
                    </Td>
                    <Td numeric>{fmtSatang(item.outstandingDebtSatang)}</Td>
                    <Td>
                      {item.assignedTeamName ?? item.suggestedTeamName ?? (
                        <span className="text-slate-400 italic">ยังไม่เสนอ</span>
                      )}
                    </Td>
                    <Td>
                      <div className="text-xs text-slate-700">{fmtDateTime(item.createdAt)}</div>
                      <div className="text-[11px] text-slate-400">{item.createdByName}</div>
                    </Td>
                    <Td>
                      <StatusBadge
                        group={caseStatusBadgeGroup(item.status)}
                        label={caseStatusLabel(item.status)}
                      />
                    </Td>
                    <Td className="text-right">
                      <CaseRowActions
                        item={item}
                        busy={openingCaseId === item.id}
                        onEdit={() => void openEdit(item)}
                      />
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </div>

        {/* จอเล็ก = card list (`38` §7.2 Responsive) */}
        <div className="space-y-3 md:hidden">
          {loading && <div className="py-8 text-center text-sm text-slate-400">กำลังโหลด...</div>}
          {!loading && error !== null && (
            <div className="py-8 text-center text-sm text-red-600">
              {error.title} — {error.message}
            </div>
          )}
          {!loading && error === null && items.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-400">ไม่พบเคสตามเงื่อนไขที่ค้นหา</div>
          )}
          {!loading &&
            error === null &&
            items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <RefText className="font-bold">{item.caseRef}</RefText>
                    <div className="text-[11px] text-slate-500">รอบที่ {item.trackingRound}</div>
                  </div>
                  <StatusBadge group={caseStatusBadgeGroup(item.status)} label={caseStatusLabel(item.status)} />
                </div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">{item.debtorName ?? '—'}</div>
                  <Badge className={caseSourceBadgeClass(item.sourceChannel)}>
                    {caseSourceLabel(item.sourceChannel)}
                  </Badge>
                </div>
                <div className="mb-2 text-xs text-slate-500">
                  {item.province ?? 'ยังไม่ระบุจังหวัด'} · {item.financeCompanyName}
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>
                    <span className="text-slate-400">ทรัพย์:</span> {item.assetBrandModel ?? '—'}
                  </div>
                  <div className="text-right font-mono font-semibold text-slate-800">
                    {fmtSatang(item.outstandingDebtSatang)}
                  </div>
                  <div>
                    <span className="text-slate-400">ทีมที่เสนอ:</span>{' '}
                    {item.assignedTeamName ?? item.suggestedTeamName ?? 'ยังไม่เสนอ'}
                  </div>
                  <div className="text-right text-slate-400">เอกสาร {item.documentCount} ไฟล์</div>
                </div>
                <div className="mb-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                  สร้างเมื่อ {fmtDateTime(item.createdAt)} โดย {item.createdByName}
                </div>
                <CaseRowActions item={item} busy={openingCaseId === item.id} onEdit={() => void openEdit(item)} />
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

      <CaseFormModal
        key={formKey}
        open={formOpen}
        editing={editing}
        companies={companies}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false)
          setLoading(true)
          void reload()
        }}
        onOpenExistingCase={(info) => {
          setFormOpen(false)
          updateFilter({ search: info.caseRef, status: 'all' })
        }}
      />
    </>
  )
}

/**
 * ปุ่มต่อแถว — แก้ไขได้เฉพาะสถานะที่ `38` §8 อนุญาต และผู้ใช้ที่ถือ capability อย่างน้อย 1 ตัวใน
 * `CASE_EDIT_CAPABILITIES` (any-of เหมือนฝั่ง API) · การซ่อนปุ่มเป็น UX — API ตรวจซ้ำเสมอ (DEC-002)
 */
function CaseRowActions({
  item,
  busy,
  onEdit,
}: {
  item: CaseListItemDto
  busy: boolean
  onEdit: () => void
}) {
  const { can } = usePermission()

  if (!isCaseEditable(item.status)) {
    return (
      <Button variant="secondary" size="sm" disabled title="หน้ารายละเอียด/พิจารณาเคสอยู่ใน Phase 2.5">
        ดูรายละเอียด
      </Button>
    )
  }
  if (!CASE_EDIT_CAPABILITIES.some((capability) => can('manage', capability))) return null

  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={onEdit}>
      แก้ไข
    </Button>
  )
}
