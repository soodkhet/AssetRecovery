'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { DeviceBrandList, DeviceModelList } from '@/components/settings/device-catalog-lists'
import { MANAGE_DEVICE_CATALOG } from '@/components/settings/shared'
import { Button, Card, Field, InlineAlert, Textarea, cn, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { DEFAULT_RECENT_YEARS, parseBrandListText } from '@/lib/device-catalog/catalog'
import { deviceCatalogSettingsSchema } from '@/lib/device-catalog/schemas'
import type {
  DeviceBrandDto,
  DeviceCatalogSettingsDto,
  DeviceCatalogSummaryDto,
  DeviceCatalogSyncRequestDto,
} from '@/lib/device-catalog/types'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * แท็บ "Model Phone" ใต้ตั้งค่าทั่วไป (มติ PO U155 → U157 → U159 · `13` §6.18 · mockup `settings.html` แท็บ `modelphone`)
 *
 * - สรุป: จำนวนแบรนด์/รุ่นที่แสดง · ความคืบหน้าการดึงครั้งแรก · งานล่าสุด · ปุ่ม "ดึงข้อมูลตอนนี้"
 * - แบรนด์ / รุ่น: ค้นหา + แบ่งหน้า · ตั้งการแสดงด้วยมือ (ชนะตัวกรองเสมอ) · เพิ่มเอง
 * - ตัวกรอง: รายชื่อแบรนด์ — บันทึกแล้วมีผลทันที ไม่ต้องดึงข้อมูลใหม่
 * - มติ PO U162: **ไม่กรองปี** — แหล่งข้อมูลฟรีไม่ส่งปีที่ออก ⇒ ซ่อนค่าตั้ง "จำนวนปี" (ค่าเดิมส่งกลับไปตามเดิม
 *   ไม่เปลี่ยน) · กฎ "ไม่ทราบปี = แสดง" ของ `passesRecentYears()` ทำให้ตัวกรองปีไม่มีผลกับรุ่นจากแหล่งข้อมูลอยู่แล้ว
 */

type View = 'brands' | 'models' | 'filter'

const VIEW_LABEL: Readonly<Record<View, string>> = {
  brands: 'แบรนด์',
  models: 'รุ่น',
  filter: 'ตัวกรองการแสดง',
}

export function DeviceCatalogTab() {
  const { can } = usePermission()
  const canManage = can('manage', MANAGE_DEVICE_CATALOG)
  const { showToast } = useToast()
  const [view, setView] = useState<View>('brands')
  const [brand, setBrand] = useState<DeviceBrandDto | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [summary, setSummary] = useState<DeviceCatalogSummaryDto | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const fetchSummary = useCallback(async () => callApi<DeviceCatalogSummaryDto>('/api/settings/device-catalog'), [])
  const applySummary = useCallback((result: Awaited<ReturnType<typeof fetchSummary>>) => {
    if (result.error !== undefined) setSummaryError(result.error.message)
    else {
      setSummary(result.data ?? null)
      setSummaryError(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchSummary()
      if (!cancelled) applySummary(result)
    })()
    return () => {
      cancelled = true
    }
  }, [applySummary, fetchSummary, refreshKey])

  const changed = (): void => setRefreshKey((current) => current + 1)

  async function syncNow(): Promise<void> {
    setSyncing(true)
    try {
      const result = await callApi<DeviceCatalogSyncRequestDto>('/api/settings/device-catalog/sync', jsonRequest('POST', {}))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: result.data?.duplicate === true ? 'มีการดึงข้อมูลในชั่วโมงนี้แล้ว' : 'เริ่มดึงข้อมูลแล้ว',
        description: 'ระบบดึงข้อมูลเบื้องหลัง — ดูผลได้ที่สรุปด้านบนหรือหน้างานเบื้องหลังในอีกสักครู่',
      })
      changed()
    } finally {
      setSyncing(false)
    }
  }

  const lastResult = summary?.lastJob?.result ?? null
  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Model Phone</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            แคตตาล็อกแบรนด์/รุ่นมือถือและแท็บเล็ตสำหรับช่อง “ยี่ห้อ/รุ่นเครื่อง” ในฟอร์มรับเคส — ระบบดึงข้อมูลทุกเที่ยงคืน
            การแสดงในตัวเลือกเป็นไปตามตัวกรอง เว้นแต่ตั้งด้วยมือ (การตั้งด้วยมือชนะเสมอ)
          </p>
        </div>
        {canManage && (
          <Button variant="secondary" onClick={() => void syncNow()} loading={syncing} disabled={summary?.apiConfigured === false}>
            ดึงข้อมูลตอนนี้
          </Button>
        )}
      </div>

      {summaryError !== null && (
        <InlineAlert tone="error" title="โหลดสรุปไม่สำเร็จ">
          {summaryError}
        </InlineAlert>
      )}
      {summary !== null && !summary.apiConfigured && (
        <InlineAlert tone="warning" title="ยังไม่ได้ตั้งคีย์แหล่งข้อมูลรุ่นเครื่อง">
          ระบบจะไม่ดึงข้อมูลใหม่จนกว่าผู้ดูแลระบบจะตั้งคีย์ — ตัวเลือกเดิมและการเพิ่มเองยังใช้ได้ตามปกติ
        </InlineAlert>
      )}
      {summary !== null && (
        <div className="mb-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-slate-500">แบรนด์ที่แสดง</div>
            <div className="mt-1 font-mono text-base font-bold text-slate-900">
              {summary.visibleBrandCount.toLocaleString('th-TH')} / {summary.brandCount.toLocaleString('th-TH')}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-slate-500">รุ่นที่แสดง</div>
            <div className="mt-1 font-mono text-base font-bold text-slate-900">
              {summary.visibleModelCount.toLocaleString('th-TH')} / {summary.modelCount.toLocaleString('th-TH')}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-slate-500">ยังไม่ได้ดึงรุ่น (ครั้งแรก)</div>
            <div className="mt-1 font-mono text-base font-bold text-slate-900">
              {summary.brandsPendingFirstSync.toLocaleString('th-TH')} แบรนด์
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-slate-500">ดึงข้อมูลล่าสุด</div>
            <div className="mt-1 text-slate-800">
              {summary.lastJob === null
                ? 'ยังไม่เคย'
                : summary.lastJob.finishedAt === null
                  ? 'กำลังทำ/รอคิว'
                  : fmtDateTime(summary.lastJob.finishedAt)}
            </div>
            {lastResult !== null && lastResult['quotaExceeded'] === true && (
              <div className="mt-1 text-amber-700">โควตาหมด — รอบถัดไปดึงต่อจากที่ค้าง</div>
            )}
            {lastResult !== null && lastResult['skipped'] === true && (
              <div className="mt-1 text-amber-700">ข้าม — ยังไม่ได้ตั้งคีย์</div>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(Object.keys(VIEW_LABEL) as View[]).map((key) => (
          <button
            key={key}
            type="button"
            className={cn(
              'focus-ring -mb-px border-b-2 px-3 py-2 text-xs font-semibold',
              view === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
            onClick={() => setView(key)}
          >
            {VIEW_LABEL[key]}
          </button>
        ))}
      </div>

      {view === 'brands' && (
        <DeviceBrandList
          refreshKey={refreshKey}
          onChanged={changed}
          onOpenModels={(next) => {
            setBrand(next)
            setView('models')
          }}
        />
      )}
      {view === 'models' && (
        <DeviceModelList brand={brand} refreshKey={refreshKey} onClearBrand={() => setBrand(null)} onChanged={changed} />
      )}
      {view === 'filter' && <DeviceCatalogFilterForm canManage={canManage} onSaved={changed} />}
    </Card>
  )
}

function DeviceCatalogFilterForm({
  canManage,
  onSaved,
}: {
  canManage: boolean
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [loaded, setLoaded] = useState<DeviceCatalogSettingsDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [brandsText, setBrandsText] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const apply = useCallback((result: Awaited<ReturnType<typeof callApi<DeviceCatalogSettingsDto>>>) => {
    if (result.error !== undefined || result.data === undefined) {
      setError(result.error?.message ?? 'โหลดค่าตั้งไม่สำเร็จ')
      return
    }
    setLoaded(result.data)
    setBrandsText(result.data.brandNames.join('\n'))
    setError(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<DeviceCatalogSettingsDto>('/api/settings/device-catalog/settings')
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply])

  async function save(): Promise<void> {
    // U162 — ซ่อนค่าตั้งจำนวนปี: ส่งค่าเดิมกลับไป (ไม่เปลี่ยน) จนกว่าจะมีแหล่งข้อมูลที่ให้ปีที่ออก
    const payload = {
      brandNames: parseBrandListText(brandsText),
      recentYears: loaded?.recentYears ?? DEFAULT_RECENT_YEARS,
      reason: reason.trim(),
    }
    const parsed = deviceCatalogSettingsSchema.safeParse(payload)
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<DeviceCatalogSettingsDto>('/api/settings/device-catalog/settings', jsonRequest('PATCH', payload))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      apply(result)
      setReason('')
      showToast({ tone: 'success', title: 'บันทึกตัวกรองแล้ว', description: 'การแสดงในตัวเลือกคำนวณใหม่ทันที (ไม่กระทบรายการที่ตั้งด้วยมือ)' })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (error !== null) {
    return (
      <InlineAlert tone="error" title="โหลดค่าตั้งไม่สำเร็จ">
        {error}
      </InlineAlert>
    )
  }
  if (loaded === null) return <p className="text-xs text-slate-400">กำลังโหลด…</p>

  return (
    <div className="max-w-2xl space-y-4">
      <InlineAlert tone="info" title="ตัวกรองกำหนดค่าตั้งต้นของการแสดง">
        แบรนด์ที่อยู่ในรายชื่อจะแสดงทุกรุ่น — รายการที่ตั้งด้วยมือในแท็บแบรนด์/รุ่นไม่ถูกเปลี่ยน
        {loaded.updatedAt === null ? ' · ตอนนี้ใช้ค่าเริ่มต้น' : ''}
        <br />
        ไม่กรองตามปีที่ออก เพราะแหล่งข้อมูลรุ่นเครื่องไม่มีปีที่ออกมาให้ · รายชื่อนี้ใช้จัดลำดับการดึงข้อมูลด้วย (ดึงแบรนด์ในรายชื่อก่อน)
      </InlineAlert>
      <Field
        id="device-filter-brands"
        label="รายชื่อแบรนด์ที่แสดง (บรรทัดละแบรนด์)"
        hint="สะกดตามชื่อแบรนด์ในแท็บแบรนด์ (ไม่สนตัวพิมพ์/ช่องว่าง) — แบรนด์ย่อยที่แหล่งข้อมูลแยกไว้ เช่น Redmi, POCO, HMD, nubia ต้องใส่แยก"
        error={errors.brandNames}
      >
        <Textarea
          id="device-filter-brands"
          rows={10}
          value={brandsText}
          disabled={!canManage}
          onChange={(event) => setBrandsText(event.target.value)}
        />
      </Field>
      {canManage && (
        <>
          <Field id="device-filter-reason" label="เหตุผล (ไม่บังคับ)" error={errors.reason}>
            <Textarea id="device-filter-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <Button onClick={() => void save()} loading={saving}>
            บันทึกตัวกรอง
          </Button>
        </>
      )}
    </div>
  )
}
