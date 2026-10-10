'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { DeviceCatalogBulkVisibility } from '@/components/settings/device-catalog-bulk-visibility'
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
import { DEVICE_CATALOG_SOURCE_LABEL, type DeviceAssetKind, type DeviceCatalogStatusCode } from '@/lib/device-catalog/catalog'
import { deviceBrandCreateSchema, deviceModelCreateSchema } from '@/lib/device-catalog/schemas'
import type {
  DeviceBrandDto,
  DeviceBrandListDto,
  DeviceCatalogBulkResultDto,
  DeviceModelListDto,
  DeviceModelRowDto,
} from '@/lib/device-catalog/types'
import { ASSET_TYPE_LABEL } from '@/lib/cases/status-display'

/**
 * รายการแบรนด์/รุ่นของหน้า "Model Phone" (มติ PO U157/U159 · mockup `settings.html` แท็บ `modelphone`)
 *
 * การแสดง = ค่าที่ตั้งด้วยมือ (ชนะเสมอ) ไม่งั้นตามตัวกรอง · ตัวเลือกต่อแถว: แสดง / ไม่แสดง / ตามตัวกรอง
 * ข้อมูล ~12,000 รุ่น ⇒ ค้นหา + แบ่งหน้าฝั่ง server เสมอ
 */

type Visibility = 'all' | 'visible' | 'hidden' | 'manual'
type ManualChoice = 'auto' | DeviceCatalogStatusCode

const VISIBILITY_LABEL: Readonly<Record<Visibility, string>> = {
  all: 'ทั้งหมด',
  visible: 'แสดงในตัวเลือก',
  hidden: 'ไม่แสดง',
  manual: 'ตั้งด้วยมือ',
}

const PAGE_SIZE = 50

/** สรุปเงื่อนไขที่ใช้อยู่ สำหรับกล่องยืนยัน "เลือกทั้งหมด / ไม่เลือกทั้งหมด" (U162) */
function conditionText(
  visibility: Visibility,
  search: string,
  extra: { brandName?: string | null; assetKindLabel?: string | null } = {},
): string {
  const parts = [`การแสดง = ${VISIBILITY_LABEL[visibility]}`]
  if (extra.brandName !== undefined && extra.brandName !== null) parts.push(`แบรนด์ = ${extra.brandName}`)
  if (extra.assetKindLabel !== undefined && extra.assetKindLabel !== null) parts.push(`ประเภท = ${extra.assetKindLabel}`)
  parts.push(search === '' ? 'ไม่มีคำค้น' : `คำค้น “${search}”`)
  return parts.join(' · ')
}

function manualChoice(value: DeviceCatalogStatusCode | null): ManualChoice {
  return value ?? 'auto'
}

function choiceToStatus(value: ManualChoice): DeviceCatalogStatusCode | null {
  return value === 'auto' ? null : value
}

function VisibilityBadge({ visible, manual }: { visible: boolean; manual: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <StatusBadge group={visible ? 'success' : 'neutral'} label={visible ? 'แสดง' : 'ไม่แสดง'} />
      <span className="text-[11px] text-slate-400">{manual ? 'ตั้งด้วยมือ' : 'ตามตัวกรอง'}</span>
    </span>
  )
}

function ManualSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: DeviceCatalogStatusCode | null
  disabled: boolean
  onChange: (next: DeviceCatalogStatusCode | null) => void
}) {
  return (
    <Select
      aria-label={label}
      value={manualChoice(value)}
      disabled={disabled}
      onChange={(event) => onChange(choiceToStatus(event.target.value as ManualChoice))}
    >
      <option value="auto">ตามตัวกรอง</option>
      <option value="active">แสดง (ตั้งเอง)</option>
      <option value="hidden">ไม่แสดง (ตั้งเอง)</option>
    </Select>
  )
}

export function Pager({
  page,
  pageSize,
  total,
  shown,
  loading,
  hidden = false,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  shown: number
  loading: boolean
  /** โหลดไม่สำเร็จ ⇒ ซ่อน (ไม่โชว์ "แสดง 0 จาก 0 รายการ" ใต้ข้อความ error — preship PS-027) */
  hidden?: boolean
  onPage: (next: number) => void
}) {
  if (hidden) return null
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
      <span>
        แสดง {shown} จาก {total.toLocaleString('th-TH')} รายการ (หน้า {page}/{lastPage})
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>
          ก่อนหน้า
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= lastPage || loading} onClick={() => onPage(page + 1)}>
          ถัดไป
        </Button>
      </div>
    </div>
  )
}

// ─── แบรนด์ ───────────────────────────────────────────────────────

export function DeviceBrandList({
  refreshKey,
  onChanged,
  onOpenModels,
}: {
  refreshKey: number
  onChanged: () => void
  onOpenModels: (brand: DeviceBrandDto) => void
}) {
  const { can } = usePermission()
  const canManage = can('manage', MANAGE_DEVICE_CATALOG)
  const { showToast } = useToast()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<DeviceBrandListDto>({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)

  const fetchItems = useCallback(async () => {
    const params = new URLSearchParams({ visibility, page: String(page), pageSize: String(PAGE_SIZE) })
    if (search !== '') params.set('q', search)
    return callApi<DeviceBrandListDto>(`/api/settings/device-catalog/brands?${params.toString()}`)
  }, [visibility, page, search])

  /** เพิ่มทุกครั้งที่กดค้นหา — ให้โหลดใหม่แม้คำค้นเท่าเดิม (R3-011) */
  const [searchNonce, setSearchNonce] = useState(0)
  const apply = useCallback((result: Awaited<ReturnType<typeof fetchItems>>) => {
    if (result.error !== undefined) setError({ title: result.error.title, message: result.error.message })
    else {
      setData(result.data ?? { items: [], total: 0, page: 1, pageSize: PAGE_SIZE })
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchItems()
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply, fetchItems, refreshKey, searchNonce])

  async function setManual(brand: DeviceBrandDto, manualStatus: DeviceCatalogStatusCode | null): Promise<void> {
    setSavingId(brand.id)
    try {
      const result = await callApi(`/api/settings/device-catalog/brands/${brand.id}`, jsonRequest('PATCH', { manualStatus }))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: `บันทึกการแสดงแบรนด์ ${brand.name} แล้ว` })
      setLoading(true)
      apply(await fetchItems())
      onChanged()
    } finally {
      setSavingId(null)
    }
  }

  async function addBrand(): Promise<void> {
    const parsed = deviceBrandCreateSchema.safeParse({ name: addName })
    if (!parsed.success) {
      setAddErrors(toFieldErrors(parsed.error))
      return
    }
    setAdding(true)
    try {
      const result = await callApi('/api/settings/device-catalog/brands', jsonRequest('POST', { name: addName.trim() }))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: `เพิ่มแบรนด์ ${addName.trim()} แล้ว` })
      setAddOpen(false)
      setAddName('')
      setLoading(true)
      apply(await fetchItems())
      onChanged()
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setLoading(true)
            setPage(1)
            setSearch(q.trim())
            // ค้นหาซ้ำคำเดิม ⇒ ค่าไม่เปลี่ยน effect ไม่รัน ตารางค้าง "กำลังโหลด" (preship R3-011) — บังคับโหลดใหม่
            setSearchNonce((value) => value + 1)
          }}
        >
          <div className="w-56">
            <Input aria-label="ค้นหาแบรนด์" placeholder="ค้นหาแบรนด์" value={q} onChange={(event) => setQ(event.target.value)} />
          </div>
          <div className="w-44">
            <Select
              aria-label="กรองการแสดง"
              value={visibility}
              onChange={(event) => {
                setLoading(true)
                setPage(1)
                setVisibility(event.target.value as Visibility)
              }}
            >
              {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((key) => (
                <option key={key} value={key}>
                  {VISIBILITY_LABEL[key]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            ค้นหา
          </Button>
        </form>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {/* มติ PO U162 — ทั้งชุดที่ตรงคำค้น/ตัวกรองที่ใช้อยู่ (ไม่ใช่แค่หน้านี้) */}
            <DeviceCatalogBulkVisibility
              criteria={{ target: 'brands', visibility, q: search === '' ? undefined : search }}
              total={data.total}
              unitLabel="แบรนด์"
              conditionText={conditionText(visibility, search)}
              disabled={loading || error !== null}
              onDone={() => {
                setLoading(true)
                void fetchItems().then(apply)
                onChanged()
              }}
            />
            <Button
              onClick={() => {
                setAddErrors({})
                setAddOpen(true)
              }}
            >
              + เพิ่มแบรนด์
            </Button>
          </div>
        )}
      </div>

      <Table>
        <THead>
          <Tr>
            <Th>แบรนด์</Th>
            <Th>การแสดง</Th>
            <Th className="text-right">รุ่นที่แสดง / ทั้งหมด</Th>
            <Th>ที่มา</Th>
            <Th className="text-right">จัดการ</Th>
          </Tr>
        </THead>
        <TableState
          colSpan={5}
          loading={loading}
          error={error}
          isEmpty={data.items.length === 0}
          emptyTitle="ไม่พบแบรนด์"
          emptyDescription="ยังไม่มีข้อมูล — กด “อัปเดตตอนนี้” ด้านบน หรือเพิ่มแบรนด์เอง"
          onRetry={
            <Button
              variant="secondary"
              onClick={() => {
                setLoading(true)
                void fetchItems().then(apply)
              }}
            >
              ลองใหม่
            </Button>
          }
        />
        <TBody>
          {!loading &&
            error === null &&
            data.items.map((brand) => (
              <Tr key={brand.id}>
                <Td>
                  <span className="font-semibold text-slate-800">{brand.name}</span>
                  {brand.source === 'manual' && <span className="ml-1 text-[11px] text-slate-400">(เพิ่มเอง)</span>}
                  {brand.manualStatus === null && (
                    <span className="block text-[11px] text-slate-400">
                      ตัวกรอง: {brand.filterVisible ? 'อยู่ในรายชื่อแบรนด์' : 'ไม่อยู่ในรายชื่อแบรนด์'}
                    </span>
                  )}
                </Td>
                <Td>
                  <VisibilityBadge visible={brand.visible} manual={brand.manualStatus !== null} />
                </Td>
                <Td className="text-right font-mono text-xs">
                  {brand.visibleModelCount.toLocaleString('th-TH')} / {brand.modelCount.toLocaleString('th-TH')}
                </Td>
                <Td>
                  <span className="text-xs text-slate-500">{DEVICE_CATALOG_SOURCE_LABEL[brand.source]}</span>
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {canManage && (
                      <div className="w-40">
                        <ManualSelect
                          label={`การแสดงของแบรนด์ ${brand.name}`}
                          value={brand.manualStatus}
                          disabled={savingId === brand.id}
                          onChange={(next) => void setManual(brand, next)}
                        />
                      </div>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => onOpenModels(brand)}>
                      ดูรุ่น
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
        </TBody>
      </Table>
      <Pager
        hidden={error !== null}
        page={page}
        pageSize={PAGE_SIZE}
        total={data.total}
        shown={data.items.length}
        loading={loading}
        onPage={(next) => {
          setLoading(true)
          setPage(next)
        }}
      />

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="เพิ่มแบรนด์"
        description="แบรนด์ที่เพิ่มเองแสดงในตัวเลือกทันที (ตั้งด้วยมือ) — ชื่อซ้ำกับที่มีอยู่ไม่ได้ (ไม่สนตัวพิมพ์/ช่องว่าง)"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={adding}>
              ยกเลิก
            </Button>
            <Button onClick={() => void addBrand()} loading={adding}>
              เพิ่มแบรนด์
            </Button>
          </>
        }
      >
        <Field id="device-brand-name" label="ชื่อแบรนด์" required error={addErrors.name}>
          <Input id="device-brand-name" value={addName} onChange={(event) => setAddName(event.target.value)} placeholder="เช่น Wiko" />
        </Field>
      </Modal>
    </div>
  )
}

// ─── รุ่น ─────────────────────────────────────────────────────────

export function DeviceModelList({
  brand,
  refreshKey,
  onClearBrand,
  onChanged,
}: {
  brand: DeviceBrandDto | null
  refreshKey: number
  onClearBrand: () => void
  onChanged: () => void
}) {
  const { can } = usePermission()
  const canManage = can('manage', MANAGE_DEVICE_CATALOG)
  const { showToast } = useToast()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [assetKind, setAssetKind] = useState<'all' | DeviceAssetKind>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<DeviceModelListDto>({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', assetKind: 'smartphone' as DeviceAssetKind, releaseYear: '' })
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})

  const brandId = brand?.id ?? null
  const fetchItems = useCallback(async () => {
    const params = new URLSearchParams({ visibility, assetKind, page: String(page), pageSize: String(PAGE_SIZE) })
    if (search !== '') params.set('q', search)
    if (brandId !== null) params.set('brandId', brandId)
    return callApi<DeviceModelListDto>(`/api/settings/device-catalog/models?${params.toString()}`)
  }, [visibility, assetKind, page, search, brandId])

  /** เพิ่มทุกครั้งที่กดค้นหา — ให้โหลดใหม่แม้คำค้นเท่าเดิม (R3-011) */
  const [searchNonce, setSearchNonce] = useState(0)
  const apply = useCallback((result: Awaited<ReturnType<typeof fetchItems>>) => {
    if (result.error !== undefined) setError({ title: result.error.title, message: result.error.message })
    else {
      setData(result.data ?? { items: [], total: 0, page: 1, pageSize: PAGE_SIZE })
      setError(null)
    }
    setSelected(new Set())
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchItems()
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply, fetchItems, refreshKey, searchNonce])

  async function reload(): Promise<void> {
    setLoading(true)
    apply(await fetchItems())
    onChanged()
  }

  async function setManual(ids: readonly string[], manualStatus: DeviceCatalogStatusCode | null): Promise<void> {
    if (ids.length === 0) return
    setSaving(true)
    try {
      const result = await callApi<DeviceCatalogBulkResultDto>(
        '/api/settings/device-catalog/models/status',
        jsonRequest('POST', { ids, manualStatus }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: `บันทึกการแสดง ${result.data?.updated ?? 0} รุ่น` })
      await reload()
    } finally {
      setSaving(false)
    }
  }

  async function addModel(): Promise<void> {
    if (brand === null) return
    const payload = {
      brandId: brand.id,
      assetKind: addForm.assetKind,
      name: addForm.name.trim(),
      // ช่องกรอกเป็น พ.ศ. (Rule 01) — เก็บ ค.ศ. ตามข้อมูลต้นทาง
      releaseYear: addForm.releaseYear.trim() === '' ? null : Number(addForm.releaseYear) - 543,
    }
    const parsed = deviceModelCreateSchema.safeParse(payload)
    if (!parsed.success) {
      setAddErrors(toFieldErrors(parsed.error))
      return
    }
    setSaving(true)
    try {
      const result = await callApi('/api/settings/device-catalog/models', jsonRequest('POST', payload))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: `เพิ่มรุ่น ${brand.name} ${payload.name} แล้ว` })
      setAddOpen(false)
      setAddForm({ name: '', assetKind: 'smartphone', releaseYear: '' })
      await reload()
    } finally {
      setSaving(false)
    }
  }

  const allChecked = data.items.length > 0 && data.items.every((item) => selected.has(item.id))
  const toggle = (item: DeviceModelRowDto): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }

  return (
    <div>
      {brand !== null && (
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-600">
          <span>
            แบรนด์: <b className="text-slate-900">{brand.name}</b>
          </span>
          <Button variant="ghost" size="sm" onClick={onClearBrand}>
            ดูทุกแบรนด์
          </Button>
        </div>
      )}
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setLoading(true)
            setPage(1)
            setSearch(q.trim())
            // ค้นหาซ้ำคำเดิม ⇒ ค่าไม่เปลี่ยน effect ไม่รัน ตารางค้าง "กำลังโหลด" (preship R3-011) — บังคับโหลดใหม่
            setSearchNonce((value) => value + 1)
          }}
        >
          <div className="w-56">
            <Input
              aria-label="ค้นหารุ่น"
              placeholder="ค้นหาแบรนด์/รุ่น เช่น samsung a55"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          <div className="w-36">
            <Select
              aria-label="กรองประเภททรัพย์"
              value={assetKind}
              onChange={(event) => {
                setLoading(true)
                setPage(1)
                setAssetKind(event.target.value as 'all' | DeviceAssetKind)
              }}
            >
              <option value="all">ทุกประเภท</option>
              {Object.entries(ASSET_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select
              aria-label="กรองการแสดง"
              value={visibility}
              onChange={(event) => {
                setLoading(true)
                setPage(1)
                setVisibility(event.target.value as Visibility)
              }}
            >
              {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((key) => (
                <option key={key} value={key}>
                  {VISIBILITY_LABEL[key]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            ค้นหา
          </Button>
        </form>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {/* มติ PO U162 — ทั้งชุดที่ตรงคำค้น/ตัวกรอง/แบรนด์ที่ใช้อยู่ (ไม่ใช่แค่หน้านี้) */}
            <DeviceCatalogBulkVisibility
              criteria={{
                target: 'models',
                visibility,
                assetKind,
                brandId: brandId ?? undefined,
                q: search === '' ? undefined : search,
              }}
              total={data.total}
              unitLabel="รุ่น"
              conditionText={conditionText(visibility, search, {
                brandName: brand?.name ?? null,
                assetKindLabel: assetKind === 'all' ? null : (ASSET_TYPE_LABEL[assetKind] ?? assetKind),
              })}
              disabled={loading || error !== null || saving}
              onDone={() => void reload()}
            />
            <span className="text-xs text-slate-500">เลือก {selected.size} รายการ:</span>
            <Button variant="secondary" size="sm" disabled={selected.size === 0 || saving} onClick={() => void setManual([...selected], 'active')}>
              แสดง
            </Button>
            <Button variant="secondary" size="sm" disabled={selected.size === 0 || saving} onClick={() => void setManual([...selected], 'hidden')}>
              ไม่แสดง
            </Button>
            <Button variant="secondary" size="sm" disabled={selected.size === 0 || saving} onClick={() => void setManual([...selected], null)}>
              ตามตัวกรอง
            </Button>
            <Button
              disabled={brand === null}
              title={brand === null ? 'เลือกแบรนด์ก่อน (กด “ดูรุ่น” ที่แท็บแบรนด์)' : undefined}
              onClick={() => {
                setAddErrors({})
                setAddOpen(true)
              }}
            >
              + เพิ่มรุ่น
            </Button>
          </div>
        )}
      </div>

      <Table>
        <THead>
          <Tr>
            {canManage && (
              <Th className="w-8">
                <input
                  type="checkbox"
                  aria-label="เลือกทั้งหน้า"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(data.items.map((item) => item.id)))}
                />
              </Th>
            )}
            <Th>แบรนด์ / รุ่น</Th>
            <Th>ประเภท</Th>
            <Th>ปีที่ออก</Th>
            <Th>การแสดง</Th>
            {canManage && <Th className="text-right">ตั้งค่า</Th>}
          </Tr>
        </THead>
        <TableState
          colSpan={canManage ? 6 : 4}
          loading={loading}
          error={error}
          isEmpty={data.items.length === 0}
          emptyTitle="ไม่พบรุ่น"
          emptyDescription="ลองเปลี่ยนคำค้นหรือตัวกรอง"
          onRetry={
            <Button variant="secondary" onClick={() => void reload()}>
              ลองใหม่
            </Button>
          }
        />
        <TBody>
          {!loading &&
            error === null &&
            data.items.map((item) => (
              <Tr key={item.id}>
                {canManage && (
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`เลือก ${item.brandName} ${item.name}`}
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item)}
                    />
                  </Td>
                )}
                <Td>
                  <span className="text-xs text-slate-500">{item.brandName}</span>{' '}
                  <span className="font-semibold text-slate-800">{item.name}</span>
                  {item.source === 'manual' && <span className="ml-1 text-[11px] text-slate-400">(เพิ่มเอง)</span>}
                  {!item.brandVisible && <span className="block text-[11px] text-slate-400">แบรนด์ไม่แสดง — รุ่นนี้จึงไม่แสดง</span>}
                </Td>
                <Td>
                  <span className="text-xs">{ASSET_TYPE_LABEL[item.assetKind]}</span>
                </Td>
                <Td>
                  <span className="font-mono text-xs">{item.releaseYear === null ? 'ไม่ทราบ' : item.releaseYear + 543}</span>
                </Td>
                <Td>
                  <VisibilityBadge visible={item.visible} manual={item.manualStatus !== null} />
                </Td>
                {canManage && (
                  <Td className="text-right">
                    <div className="ml-auto w-40">
                      <ManualSelect
                        label={`การแสดงของรุ่น ${item.brandName} ${item.name}`}
                        value={item.manualStatus}
                        disabled={saving}
                        onChange={(next) => void setManual([item.id], next)}
                      />
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
        </TBody>
      </Table>
      <Pager
        hidden={error !== null}
        page={page}
        pageSize={PAGE_SIZE}
        total={data.total}
        shown={data.items.length}
        loading={loading}
        onPage={(next) => {
          setLoading(true)
          setPage(next)
        }}
      />

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={`เพิ่มรุ่นของ ${brand?.name ?? ''}`}
        description="รุ่นที่เพิ่มเองแสดงในตัวเลือกทันที (ตั้งด้วยมือ) — ชื่อซ้ำในแบรนด์เดียวกันไม่ได้"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void addModel()} loading={saving}>
              เพิ่มรุ่น
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field id="device-model-name" label="ชื่อรุ่น" required error={addErrors.name}>
            <Input
              id="device-model-name"
              value={addForm.name}
              onChange={(event) => setAddForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="เช่น Galaxy A56 5G"
            />
          </Field>
          <Field id="device-model-kind" label="ประเภททรัพย์" required error={addErrors.assetKind}>
            <Select
              id="device-model-kind"
              value={addForm.assetKind}
              onChange={(event) => setAddForm((current) => ({ ...current, assetKind: event.target.value as DeviceAssetKind }))}
            >
              {Object.entries(ASSET_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="device-model-year"
            label="ปีที่ออก (พ.ศ. — ไม่บังคับ)"
            error={addErrors.releaseYear}
          >
            <Input
              id="device-model-year"
              numeric
              value={addForm.releaseYear}
              onChange={(event) => setAddForm((current) => ({ ...current, releaseYear: event.target.value }))}
              placeholder="เช่น 2568"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
