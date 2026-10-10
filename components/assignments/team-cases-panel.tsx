'use client'

import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Input,
  PageHeader,
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
import { callApi, type ApiCallError } from '@/lib/api/types'
import { caseStatusBadgeGroup, caseStatusLabel } from '@/lib/cases/status-display'
import {
  TEAM_VISIBLE_CASE_STATUSES,
  teamCasesListPath,
  type TeamCaseFilters,
  type TeamVisibleCaseStatus,
} from '@/lib/cases/team-visibility'
import type { CaseListResultDto } from '@/lib/cases/types'
import { fmtDateTime } from '@/lib/format/datetime'

const PAGE_SIZE = 20

/**
 * แท็บ "เคสทั้งหมดของทีม" ในหน้ามอบหมายงาน (staging E-005) — **อ่านอย่างเดียว**
 *
 * อ่านจาก `GET /api/cases` — server กรอง scope ทีม + สถานะที่ทีมเห็น (`caseScopeWhere`) เสมอ
 * รวมเคสที่ปิดแล้ว (สำเร็จ/ไม่สำเร็จ) และรอพิจารณารีไซเคิล ซึ่งหน้ามอบหมายงานปกติไม่แสดง
 * กดแถว = เปิดรายละเอียดเคสแบบอ่านอย่างเดียว (ผู้เรียกเป็นเจ้าของ modal)
 */
export function TeamCasesPanel({
  initialStatus = 'all',
  onBack,
  onOpenCase,
}: {
  initialStatus?: TeamVisibleCaseStatus | 'all'
  onBack: () => void
  onOpenCase: (caseId: string) => void
}) {
  const [filters, setFilters] = useState<TeamCaseFilters>({ search: '', status: initialStatus })
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<CaseListResultDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  const listPath = teamCasesListPath(filters, page, PAGE_SIZE)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await callApi<CaseListResultDto>(listPath)
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
  }, [listPath, retryKey])

  function updateFilter(next: Partial<TeamCaseFilters>): void {
    const nextFilters = { ...filters, ...next }
    // ค่าเดิม ⇒ path เดิม effect ไม่รันซ้ำ — ห้าม setLoading ไม่งั้นค้าง "กำลังโหลด" (staging E-006)
    if (teamCasesListPath(nextFilters, 1, PAGE_SIZE) === listPath) return
    setLoading(true)
    setPage(1)
    setFilters(nextFilters)
  }

  const items = result?.items ?? []
  const total = result?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <PageHeader
        title="เคสทั้งหมดของทีม"
        description="ดูเคสของทีมที่ดูแลทุกสถานะ รวมเคสที่ปิดงานแล้ว (อ่านอย่างเดียว)"
        action={
          <Button variant="secondary" onClick={onBack}>
            กลับหน้ามอบหมายงาน
          </Button>
        }
      />

      <Card>
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 lg:flex-row">
          <div className="flex-1">
            <Input
              aria-label="ค้นหาเลขที่สัญญา หรือชื่อลูกหนี้"
              value={filters.search}
              placeholder="ค้นหา เลขสัญญา / ชื่อลูกหนี้..."
              onChange={(event) => updateFilter({ search: event.target.value })}
            />
          </div>
          <Select
            aria-label="กรองตามสถานะเคส"
            className="lg:w-56"
            value={filters.status}
            onChange={(event) =>
              updateFilter({
                status:
                  TEAM_VISIBLE_CASE_STATUSES.find((status) => status === event.target.value) ?? 'all',
              })
            }
          >
            <option value="all">ทุกสถานะ</option>
            {TEAM_VISIBLE_CASE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {caseStatusLabel(status)}
              </option>
            ))}
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <THead>
              <Tr>
                <Th>เลขที่สัญญา / รอบ</Th>
                <Th>ลูกหนี้ / จังหวัด</Th>
                <Th>ไฟแนนซ์ / ทรัพย์</Th>
                <Th>ทีม</Th>
                <Th>สถานะ</Th>
                <Th>พิจารณาเมื่อ</Th>
              </Tr>
            </THead>
            <TableState
              colSpan={6}
              loading={loading}
              error={error === null ? null : { title: error.title, message: error.message }}
              isEmpty={items.length === 0}
              emptyTitle="ไม่พบเคสของทีมตามเงื่อนไขที่ค้นหา"
              emptyDescription="เคสจะแสดงที่นี่หลังผู้พิจารณารับเคสและเข้าทีมของคุณแล้ว"
              onRetry={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLoading(true)
                    setRetryKey((key) => key + 1)
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
                  <Tr key={item.id} interactive onClick={() => onOpenCase(item.id)}>
                    <Td>
                      <RefText className="font-bold">{item.caseRef}</RefText>
                      <div className="mt-0.5 text-[11px] text-slate-500">รอบที่ {item.trackingRound}</div>
                    </Td>
                    <Td>
                      <div className="font-semibold text-slate-800">{item.debtorName ?? '—'}</div>
                      <div className="text-[11px] text-slate-500">{item.province ?? 'ยังไม่ระบุจังหวัด'}</div>
                    </Td>
                    <Td>
                      <div className="text-xs text-slate-700">{item.financeCompanyName}</div>
                      <div className="text-[11px] text-slate-400">{item.assetBrandModel ?? '—'}</div>
                    </Td>
                    <Td className="text-xs text-slate-700">{item.assignedTeamName ?? '—'}</Td>
                    <Td>
                      <StatusBadge
                        status={item.status}
                        group={caseStatusBadgeGroup(item.status)}
                        label={caseStatusLabel(item.status)}
                      />
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {item.reviewedAt === null ? '—' : fmtDateTime(item.reviewedAt)}
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </div>

        {error === null && !loading && (
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>
              แสดง {items.length} จาก {total} รายการ (หน้า {page}/{lastPage})
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
        )}
      </Card>
    </>
  )
}
