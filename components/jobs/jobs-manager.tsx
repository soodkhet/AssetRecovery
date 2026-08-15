'use client'

import { useState } from 'react'
import { JobDetailModal } from '@/components/jobs/job-detail-modal'
import { EMPTY_JOB_FILTERS, useJobs, type JobFilters } from '@/components/jobs/use-jobs'
import {
  Button,
  Card,
  Field,
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
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtCount } from '@/lib/format/money'
import { JOB_STATUS_GROUP, JOB_STATUS_LABEL, type JobViewStatus } from '@/lib/jobs/job-state'
import { JOB_TYPES, JOB_TYPE_SPECS } from '@/lib/jobs/job-types'

/**
 * ตั้งค่าทั่วไป → งานเบื้องหลัง (Job Log) — `91` §8/§14
 *
 * หน้ารวมสถานะงานที่ระบบทำเบื้องหลังทั้งหมด (ตั้งเวลาและสั่งเอง) · ตัวกรองทุกช่องส่งไปที่ API
 * ทุกแถวเปิดดูรายละเอียดได้ (payload/result/สาเหตุที่ล้ม/ไฟล์ผลลัพธ์) · ปุ่มสั่งทำงานใหม่อยู่ใน
 * รายละเอียดและเห็นเฉพาะ Superadmin (`91` §12)
 */

const STATUS_OPTIONS: readonly JobViewStatus[] = [
  'pending',
  'running',
  'completed',
  'failed',
  'dead_letter',
  'cancelled',
]

export function JobsManager() {
  const [filters, setFilters] = useState<JobFilters>(EMPTY_JOB_FILTERS)
  const [offset, setOffset] = useState(0)
  const [openedId, setOpenedId] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const { data, loading, error, reload } = useJobs(filters, offset, refreshToken)

  function update(patch: Partial<JobFilters>): void {
    setFilters((current) => ({ ...current, ...patch }))
    setOffset(0)
  }

  const shown = data.items.length
  const from = shown === 0 ? 0 : data.offset + 1

  return (
    <div className="space-y-6">
      <PageHeader
        title="งานเบื้องหลัง (Job Log)"
        description="สถานะงานที่ระบบทำให้เบื้องหลัง — ตั้งเวลาโดยระบบหรือสั่งจากหน้าจอ · งานที่ล้มเหลวจะถูกลองใหม่อัตโนมัติจนครบเพดาน แล้วรอผู้ดูแลระบบสั่งทำใหม่"
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="ประเภทงาน">
            <Select
              value={filters.jobType}
              onChange={(event) => update({ jobType: event.target.value as JobFilters['jobType'] })}
            >
              <option value="all">ทั้งหมด</option>
              {JOB_TYPES.map((code) => (
                <option key={code} value={code}>
                  {JOB_TYPE_SPECS[code].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="สถานะ">
            <Select
              value={filters.status}
              onChange={(event) => update({ status: event.target.value as JobFilters['status'] })}
            >
              <option value="all">ทั้งหมด</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {JOB_STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
          </Field>
          {/* `<input type="date">` = ข้อยกเว้นเดียวที่ใช้ ค.ศ. (DEC-005) — ช่วงวันถูกตีความเป็นวันไทยที่ backend */}
          <Field label="ตั้งแต่วันที่">
            <Input type="date" value={filters.dateFrom} onChange={(event) => update({ dateFrom: event.target.value })} />
          </Field>
          <Field label="ถึงวันที่">
            <Input type="date" value={filters.dateTo} onChange={(event) => update({ dateTo: event.target.value })} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            แสดง {fmtCount(from)}–{fmtCount(data.offset + shown)} จาก {fmtCount(data.total)} รายการ
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFilters(EMPTY_JOB_FILTERS)}>
              ล้างตัวกรอง
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void reload()}>
              รีเฟรช
            </Button>
          </div>
        </div>
      </Card>

      <Table>
        <THead>
          <Tr>
            <Th>สร้างเมื่อ</Th>
            <Th>ประเภทงาน</Th>
            <Th>สถานะ</Th>
            <Th>ทำใหม่</Th>
            <Th>ผู้สั่งงาน</Th>
            <Th>ผลล่าสุด</Th>
          </Tr>
        </THead>
        <TableState
          colSpan={6}
          loading={loading}
          error={error}
          isEmpty={!loading && error === null && shown === 0}
          emptyTitle="ไม่พบงานตามตัวกรองนี้"
          emptyDescription="ลองขยายช่วงวันที่ หรือเลือกประเภทงาน/สถานะอื่น"
        />
        {!loading && error === null && shown > 0 && (
          <TBody>
            {data.items.map((row) => (
              <Tr key={row.id} interactive onClick={() => setOpenedId(row.id)}>
                <Td className="text-xs whitespace-nowrap text-slate-500">{fmtDateTime(row.createdAt)}</Td>
                <Td className="text-slate-700">
                  {row.jobTypeLabel}
                  <RefText className="ml-2 text-xs">{row.id.slice(0, 8)}</RefText>
                </Td>
                <Td>
                  <StatusBadge group={JOB_STATUS_GROUP[row.status]} label={JOB_STATUS_LABEL[row.status]} />
                </Td>
                <Td className="text-xs whitespace-nowrap text-slate-500">
                  {row.retryCount}/{row.maxRetries}
                </Td>
                <Td className="text-slate-600">{row.createdByName ?? 'ระบบ'}</Td>
                <Td className="max-w-md truncate text-xs text-slate-500">
                  {row.errorMessage ?? (row.completedAt === null ? '—' : `จบเมื่อ ${fmtDateTime(row.completedAt)}`)}
                </Td>
              </Tr>
            ))}
          </TBody>
        )}
      </Table>

      {(data.offset > 0 || data.hasMore) && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={data.offset === 0}
            onClick={() => setOffset(Math.max(0, data.offset - data.limit))}
          >
            ก่อนหน้า
          </Button>
          <Button variant="secondary" size="sm" disabled={!data.hasMore} onClick={() => setOffset(data.offset + data.limit)}>
            ถัดไป
          </Button>
        </div>
      )}

      <JobDetailModal
        id={openedId}
        onClose={() => setOpenedId(null)}
        onRetried={() => setRefreshToken((token) => token + 1)}
      />
    </div>
  )
}
