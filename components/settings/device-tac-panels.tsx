'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { Pager } from '@/components/settings/device-catalog-lists'
import { MANAGE_DEVICE_CATALOG } from '@/components/settings/shared'
import {
  Button,
  Field,
  Input,
  Modal,
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
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { TAC_SOURCE_LABEL, tacUpdateStatusView, type DeviceTacSourceCode } from '@/lib/device-catalog/tac'
import { deviceTacBindSchema } from '@/lib/device-catalog/schemas'
import type {
  DeviceModelOptionDto,
  DeviceTacHistoryDto,
  DeviceTacListDto,
  DeviceTacRowDto,
  DeviceTacUpdateDto,
} from '@/lib/device-catalog/types'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * ส่วน "TAC" และ "ประวัติการอัปเดต" ของหน้า Model Phone (มติ PO U166 · U167 · `13` §6.18 · mockup `settings.html` แท็บ `modelphone`)
 * - TAC: ค้นหา (ตัวเลขขึ้นต้น/ยี่ห้อ/รุ่น/รหัสรุ่น) · กรองแหล่ง · ผู้ดูแลเพิ่ม/ผูก TAC กับรุ่นเอง
 * - ประวัติ: ทุกรอบ (ผล/ผู้สั่ง/จำนวนที่เพิ่ม/รายชื่อรุ่นที่เพิ่ม — กดดู) + TAC ที่ระบบจำจากงานจริง
 */

const SOURCE_FILTERS: ReadonlyArray<{ value: DeviceTacSourceCode | 'all'; label: string }> = [
  { value: 'all', label: 'ทุกแหล่ง' },
  { value: 'tacdb', label: TAC_SOURCE_LABEL.tacdb },
  { value: 'learned', label: TAC_SOURCE_LABEL.learned },
  { value: 'manual', label: TAC_SOURCE_LABEL.manual },
]

const PAGE_SIZE = 50

export function DeviceTacList({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { can } = usePermission()
  const canManage = can('manage', MANAGE_DEVICE_CATALOG)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<DeviceTacSourceCode | 'all'>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<DeviceTacListDto | null>(null)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [binding, setBinding] = useState<{ tac: string } | null>(null)
  /** เพิ่มค่าเมื่อกด "ลองใหม่" หลังโหลดไม่สำเร็จ — บังคับ effect ด้านล่างยิงซ้ำ (preship R2-022) */
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), source })
    if (query !== '') params.set('q', query)
    void (async () => {
      const result = await callApi<DeviceTacListDto>(`/api/settings/device-catalog/tacs?${params.toString()}`)
      if (cancelled) return
      setLoading(false)
      if (result.error !== undefined) setError({ title: result.error.title, message: result.error.message })
      else {
        setError(null)
        setData(result.data ?? null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [page, query, source, refreshKey, retryKey])

  const items = data?.items ?? []
  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setLoading(true)
            setPage(1)
            setQuery(q.trim())
          }}
        >
          <Input
            aria-label="ค้นหา TAC"
            value={q}
            placeholder="ค้นหา TAC 8 หลัก หรือยี่ห้อ/รุ่น เช่น 35467011 หรือ galaxy a54"
            onChange={(event) => setQ(event.target.value)}
          />
          <Button type="submit" variant="secondary">
            ค้นหา
          </Button>
        </form>
        <div className="w-44">
          <Select
            aria-label="แหล่งข้อมูล"
            value={source}
            onChange={(event) => {
              setLoading(true)
              setPage(1)
              setSource(event.target.value as DeviceTacSourceCode | 'all')
            }}
          >
            {SOURCE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        {canManage && (
          <Button onClick={() => setBinding({ tac: /^\d{8}$/.test(query) ? query : '' })}>เพิ่ม/ผูก TAC เอง</Button>
        )}
      </div>

      <Table>
        <THead>
          <Tr>
            <Th>TAC</Th>
            <Th>ยี่ห้อ / รุ่น</Th>
            <Th>รหัสรุ่นย่อย</Th>
            <Th>ปีที่ออก</Th>
            <Th>แหล่ง</Th>
            <Th>ผูกรุ่นในแคตตาล็อก</Th>
            {canManage && <Th className="text-right">จัดการ</Th>}
          </Tr>
        </THead>
        <TableState
          colSpan={canManage ? 7 : 6}
          loading={loading && data === null}
          error={error}
          isEmpty={!loading && error === null && items.length === 0}
          emptyTitle="ไม่พบ TAC"
          emptyDescription="ยังไม่ได้นำเข้าฐาน TAC หรือคำค้นไม่ตรง — กด “อัปเดตตอนนี้” หรือ “นำเข้าไฟล์เอง” ด้านบน"
          onRetry={() => {
            setError(null)
            setLoading(true)
            setRetryKey((key) => key + 1)
          }}
        />
        {items.length > 0 && (
          <TBody>
            {items.map((row) => (
              <Tr key={row.id}>
                <Td className="font-mono text-xs">{row.tac}</Td>
                <Td>
                  <span className="text-slate-500">{row.brandName}</span> {row.modelName}
                </Td>
                <Td className="font-mono text-xs">{row.variant ?? '—'}</Td>
                <Td className="font-mono text-xs">{row.releaseYear === null ? 'ไม่ทราบ' : row.releaseYear + 543}</Td>
                <Td>
                  <StatusBadge group={row.source === 'tacdb' ? 'sent' : row.source === 'learned' ? 'warning' : 'success'} label={TAC_SOURCE_LABEL[row.source]} />
                </Td>
                <Td className="text-xs text-slate-600">{row.deviceModelLabel ?? 'ยังไม่ผูก'}</Td>
                {canManage && (
                  <Td className="text-right">
                    <Button size="sm" variant="secondary" onClick={() => setBinding({ tac: row.tac })}>
                      ผูกรุ่นใหม่
                    </Button>
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        )}
      </Table>
      {data !== null && (
        <Pager
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          shown={items.length}
          loading={loading}
          onPage={(next) => {
            setLoading(true)
            setPage(next)
          }}
        />
      )}
      {binding !== null && (
        <BindTacModal
          initialTac={binding.tac}
          onClose={() => setBinding(null)}
          onSaved={() => {
            setBinding(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function BindTacModal({ initialTac, onClose, onSaved }: { initialTac: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast()
  const [tac, setTac] = useState(initialTac)
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<DeviceModelOptionDto[]>([])
  const [modelId, setModelId] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        const params = new URLSearchParams({ q: search, limit: '30' })
        const result = await callApi<DeviceModelOptionDto[]>(`/api/device-catalog/options?${params.toString()}`)
        if (!cancelled) setOptions(result.data ?? [])
      })()
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  async function save(): Promise<void> {
    const payload = { tac, deviceModelId: modelId, reason: reason.trim() }
    const parsed = deviceTacBindSchema.safeParse(payload)
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<DeviceTacRowDto>('/api/settings/device-catalog/tacs', jsonRequest('POST', payload))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: 'ผูก TAC แล้ว', description: 'ฟอร์มรับเคสจะเติมรุ่นนี้เมื่อกรอก IMEI ที่ขึ้นต้นด้วย TAC นี้' })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title="เพิ่ม/ผูก TAC กับรุ่นเอง"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            บันทึกการผูก
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field id="bind-tac" label="TAC (8 หลักแรกของ IMEI)" required error={errors.tac}>
          <Input id="bind-tac" className="font-mono" value={tac} maxLength={12} onChange={(event) => setTac(event.target.value)} />
        </Field>
        <Field id="bind-model-search" label="ค้นหารุ่นในแคตตาล็อก" hint="เฉพาะรุ่นที่แสดงในตัวเลือก — รุ่นที่ไม่มีให้เพิ่มเองในแท็บรุ่นก่อน">
          <Input id="bind-model-search" value={search} placeholder="เช่น samsung a55" onChange={(event) => setSearch(event.target.value)} />
        </Field>
        <Field id="bind-model" label="รุ่นที่ผูก" required error={errors.deviceModelId}>
          <Select id="bind-model" value={modelId} onChange={(event) => setModelId(event.target.value)}>
            <option value="">— เลือกรุ่น —</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="bind-reason" label="เหตุผล (ไม่บังคับ)" error={errors.reason}>
          <Input id="bind-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <p className="text-[11px] text-slate-500">การผูกเองชนะข้อมูลจากฐาน TAC และที่ระบบจำ — การอัปเดตรายวันจะไม่เขียนทับ</p>
      </div>
    </Modal>
  )
}

// ─── ประวัติการอัปเดต (U167) ─────────────────────────────────────

const TRIGGER_LABEL: Readonly<Record<DeviceTacUpdateDto['trigger'], string>> = {
  daily: 'งานอัตโนมัติรายวัน',
  manual: 'ผู้ดูแลกดอัปเดต',
  file: 'นำเข้าไฟล์เอง',
}

export function DeviceTacHistory({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<DeviceTacHistoryDto | null>(null)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [openModels, setOpenModels] = useState<DeviceTacUpdateDto | null>(null)
  /** เพิ่มค่าเมื่อกด "ลองใหม่" — ล้าง error แล้วโหลดใหม่ (preship R2-022) */
  const [retryKey, setRetryKey] = useState(0)
  const retry = (): void => {
    setError(null)
    setRetryKey((key) => key + 1)
  }

  const load = useCallback(async () => callApi<DeviceTacHistoryDto>('/api/settings/device-catalog/tac-history'), [])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await load()
      if (cancelled) return
      if (result.error !== undefined) setError({ title: result.error.title, message: result.error.message })
      else {
        setError(null)
        setData(result.data ?? null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load, refreshKey, retryKey])

  const updates = data?.updates ?? []
  const learned = data?.learned ?? []
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-xs font-bold text-slate-800">ประวัติการอัปเดตฐาน TAC</h3>
        <Table>
          <THead>
            <Tr>
              <Th>วันเวลา</Th>
              <Th>ผล</Th>
              <Th>ผู้สั่ง</Th>
              <Th>ไฟล์บน GitHub แก้ล่าสุด</Th>
              <Th className="text-right">TAC / แบรนด์ / รุ่นใหม่</Th>
              <Th className="text-right">รายชื่อรุ่น</Th>
            </Tr>
          </THead>
          <TableState
            colSpan={6}
            loading={data === null && error === null}
            error={error}
            isEmpty={data !== null && updates.length === 0}
            emptyTitle="ยังไม่มีประวัติ"
            emptyDescription="ระบบตรวจแหล่งข้อมูลทุกวันหลังเที่ยงคืน หรือกด “อัปเดตตอนนี้”"
            onRetry={retry}
          />
          {updates.length > 0 && (
            <TBody>
              {updates.map((row) => (
                <Tr key={row.id}>
                  <Td className="text-xs">{fmtDateTime(row.createdAt)}</Td>
                  <Td>
                    <StatusBadge group={tacUpdateStatusView(row).group} label={tacUpdateStatusView(row).label} />
                    {row.errorMessage !== null && <span className="mt-1 block text-[11px] text-rose-700">{row.errorMessage}</span>}
                  </Td>
                  <Td className="text-xs">
                    {TRIGGER_LABEL[row.trigger]}
                    {row.actorName !== null && <span className="block text-slate-500">{row.actorName}</span>}
                  </Td>
                  <Td className="text-xs">{row.sourceUpdatedAt === null ? 'ไม่ทราบ' : fmtDateTime(row.sourceUpdatedAt)}</Td>
                  <Td className="text-right font-mono text-xs">
                    {row.tacsAdded.toLocaleString('th-TH')} / {row.brandsAdded.toLocaleString('th-TH')} /{' '}
                    {row.modelsAdded.toLocaleString('th-TH')}
                  </Td>
                  <Td className="text-right">
                    {row.addedModels.length > 0 ? (
                      <Button size="sm" variant="secondary" onClick={() => setOpenModels(row)}>
                        ดูรายชื่อ ({row.addedModels.length.toLocaleString('th-TH')})
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          )}
        </Table>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold text-slate-800">ระบบจำจากงานจริง</h3>
        <Table>
          <THead>
            <Tr>
              <Th>วันเวลา</Th>
              <Th>TAC</Th>
              <Th>ยี่ห้อ / รุ่น</Th>
              <Th>ผู้เลือก</Th>
            </Tr>
          </THead>
          <TableState
            colSpan={4}
            loading={data === null && error === null}
            error={error}
            isEmpty={data !== null && learned.length === 0}
            emptyTitle="ยังไม่มีรายการที่ระบบจำ"
            emptyDescription="เมื่อผู้ใช้กรอก IMEI ที่ฐานไม่รู้จักแล้วเลือก/ระบุรุ่นเองในฟอร์มรับเคส ระบบจะจำไว้ที่นี่"
            onRetry={retry}
          />
          {learned.length > 0 && (
            <TBody>
              {learned.map((row) => (
                <Tr key={row.id}>
                  <Td className="text-xs">{fmtDateTime(row.createdAt)}</Td>
                  <Td className="font-mono text-xs">{row.tac}</Td>
                  <Td>
                    <span className="text-slate-500">{row.brandName}</span> {row.modelName}
                  </Td>
                  <Td className="text-xs">{row.createdByName ?? '—'}</Td>
                </Tr>
              ))}
            </TBody>
          )}
        </Table>
      </div>

      {openModels !== null && (
        <Modal
          open
          title={`รุ่นที่เพิ่มรอบ ${fmtDateTime(openModels.createdAt)}`}
          onClose={() => setOpenModels(null)}
          footer={
            <Button variant="secondary" onClick={() => setOpenModels(null)}>
              ปิด
            </Button>
          }
        >
          <ul className="max-h-96 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-slate-700">
            {openModels.addedModels.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          {openModels.modelsAdded > openModels.addedModels.length && (
            <p className="mt-2 text-[11px] text-slate-500">
              แสดง {openModels.addedModels.length.toLocaleString('th-TH')} จาก {openModels.modelsAdded.toLocaleString('th-TH')} รุ่น
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}
