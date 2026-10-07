'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import { DeviceBrandList, DeviceModelList } from '@/components/settings/device-catalog-lists'
import { DeviceTacHistory, DeviceTacList } from '@/components/settings/device-tac-panels'
import { MANAGE_DEVICE_CATALOG } from '@/components/settings/shared'
import { Button, Card, Field, InlineAlert, Input, Textarea, cn, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { parseBrandListText } from '@/lib/device-catalog/catalog'
import { NOT_SPECIFIED_IN_CONTRACT, parseAttributeOptionsText } from '@/lib/device-catalog/device-attributes'
import { deviceCatalogSettingsSchema } from '@/lib/device-catalog/schemas'
import { TAC_SOURCE_ATTRIBUTION, TAC_SOURCE_REPO_URL } from '@/lib/device-catalog/tac'
import type {
  DeviceBrandDto,
  DeviceCatalogSettingsDto,
  DeviceCatalogSummaryDto,
  DeviceCatalogSyncRequestDto,
} from '@/lib/device-catalog/types'
import { fmtDateTime } from '@/lib/format/datetime'
import { StorageUploadError, uploadToStorage } from '@/lib/uploads/client'

/**
 * แท็บ "Model Phone" ใต้ตั้งค่าทั่วไป (มติ PO U155 → U162 · U166 · U167 · U168 · `13` §6.18 · mockup `settings.html` แท็บ `modelphone`)
 *
 * - แหล่งยี่ห้อ/รุ่น = ฐาน TAC จาก IMEI (U166) — ระบบตรวจทุกวันหลังเที่ยงคืน (U168) · ปุ่ม "อัปเดตตอนนี้" (+ บังคับดึงใหม่)
 *   · "นำเข้าไฟล์เอง" (CSV รูปแบบเดียวกับไฟล์ต้นทาง) · สรุป + ป้าย "แหล่งข้อมูลอาจหยุดอัปเดต" (U167)
 * - แบรนด์ / รุ่น: ค้นหา + แบ่งหน้า · ตั้งการแสดงด้วยมือ (ชนะตัวกรองเสมอ) · เลือกทั้งหมด/ไม่เลือกทั้งหมด (U162) · เพิ่มเอง
 * - TAC: ค้นหา/ผูกเอง · ประวัติการอัปเดต + รายการที่ระบบจำ (U167)
 * - ตั้งค่า: รายชื่อแบรนด์ + ตัวกรองปี (กลับมาใช้ได้เพราะ TAC มีปีที่ออก) + ตัวเลือกความจุ/สี + จำนวนวันเตือน
 */

type View = 'brands' | 'models' | 'tac' | 'history' | 'filter'

const VIEW_LABEL: Readonly<Record<View, string>> = {
  brands: 'แบรนด์',
  models: 'รุ่น',
  tac: 'TAC',
  history: 'ประวัติการอัปเดต',
  filter: 'ตั้งค่า',
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
  const [updating, setUpdating] = useState(false)
  const [force, setForce] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

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

  function startedToast(result: DeviceCatalogSyncRequestDto | undefined, what: string): void {
    showToast({
      tone: 'success',
      title: result?.duplicate === true ? `มีการ${what}ในชั่วโมงนี้แล้ว` : `เริ่ม${what}แล้ว`,
      description: 'ระบบทำงานเบื้องหลัง — ดูผลได้ที่แท็บประวัติการอัปเดตในอีกสักครู่',
    })
  }

  async function updateNow(): Promise<void> {
    setUpdating(true)
    try {
      const result = await callApi<DeviceCatalogSyncRequestDto>(
        '/api/settings/device-catalog/tac-update',
        jsonRequest('POST', { force }),
        // route ทำงานได้ถึง 300 วินาที (`maxDuration`) — รอให้เท่ากัน
        { timeoutMs: 300_000 },
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      startedToast(result.data, 'อัปเดต')
      changed()
    } finally {
      setUpdating(false)
    }
  }

  async function importFile(file: File): Promise<void> {
    setImporting(true)
    try {
      const path = await uploadToStorage({ kind: 'device_tac_file' }, file)
      const result = await callApi<DeviceCatalogSyncRequestDto>(
        '/api/settings/device-catalog/tac-import',
        jsonRequest('POST', { path }),
        { timeoutMs: 300_000 },
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      startedToast(result.data, 'นำเข้าไฟล์')
      changed()
    } catch (error) {
      if (!(error instanceof StorageUploadError)) throw error
      showToast({ tone: 'error', title: 'อัปโหลดไฟล์ไม่สำเร็จ', description: error.message })
    } finally {
      setImporting(false)
      if (fileInput.current !== null) fileInput.current.value = ''
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">ฐานรุ่นเครื่อง (TAC)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {/* ประโยคแนะนำแคตตาล็อกอยู่ใน PageHeader ของ page แล้ว — ไม่พูดซ้ำ (preship R2-032) */}
            TAC = 8 หลักแรกของ IMEI · ระบบตรวจฐานข้อมูลทุกวันหลังเที่ยงคืน · การแสดงในตัวเลือกเป็นไปตามตัวกรอง เว้นแต่ตั้งด้วยมือ (ชนะเสมอ)
          </p>
        </div>
        {canManage && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => fileInput.current?.click()}
                loading={importing}
                disabled={summary?.pendingJob === true}
              >
                นำเข้าไฟล์เอง
              </Button>
              <Button onClick={() => void updateNow()} loading={updating} disabled={summary?.pendingJob === true}>
                อัปเดตตอนนี้
              </Button>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
              บังคับดึงไฟล์ใหม่ (แม้ไฟล์ต้นทางไม่เปลี่ยน)
            </label>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="ไฟล์ TAC (CSV)"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file !== undefined) void importFile(file)
              }}
            />
          </div>
        )}
      </div>

      {summaryError !== null && (
        <InlineAlert tone="error" title="โหลดสรุปไม่สำเร็จ">
          {summaryError}
        </InlineAlert>
      )}
      {summary !== null && summary.sourceStale && (
        <InlineAlert tone="warning" title="แหล่งข้อมูลอาจหยุดอัปเดต">
          ไฟล์ฐาน TAC ต้นทางไม่ถูกแก้มานานกว่า {summary.staleAlertDays.toLocaleString('th-TH')} วัน — รุ่นใหม่อาจยังไม่มีในฐาน
          ระบบยังจำรุ่นจากงานจริง และผู้ดูแลผูก TAC เองได้ในแท็บ TAC
        </InlineAlert>
      )}
      {summary !== null && summary.tacCount === 0 && (
        <InlineAlert tone="info" title="ยังไม่ได้นำเข้าฐาน TAC">
          กด “อัปเดตตอนนี้” เพื่อดึงฐาน TAC ครั้งแรก (ไฟล์ประมาณ 12 MB · ใช้เวลาสักครู่) — ระหว่างนี้เลือก/ระบุรุ่นเองได้ตามปกติ
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
            <div className="text-slate-500">รุ่นที่แสดง (ออกตั้งแต่ปี {summary.minReleaseYear + 543})</div>
            <div className="mt-1 font-mono text-base font-bold text-slate-900">
              {summary.visibleModelCount.toLocaleString('th-TH')} / {summary.modelCount.toLocaleString('th-TH')}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-slate-500">TAC ในระบบ</div>
            <div className="mt-1 font-mono text-base font-bold text-slate-900">{summary.tacCount.toLocaleString('th-TH')}</div>
            <div className="mt-0.5 text-slate-500">ระบบจำจากงานจริง {summary.learnedTacCount.toLocaleString('th-TH')}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-slate-500">นำเข้าสำเร็จล่าสุด</div>
            <div className="mt-1 text-slate-800">{summary.tacImportedAt === null ? 'ยังไม่เคย' : fmtDateTime(summary.tacImportedAt)}</div>
            <div className="mt-0.5 text-slate-500">
              ไฟล์ต้นทางแก้ล่าสุด: {summary.sourceUpdatedAt === null ? 'ไม่ทราบ' : fmtDateTime(summary.sourceUpdatedAt)}
            </div>
            {summary.pendingJob && <div className="mt-0.5 text-amber-700">กำลังอัปเดต/รอคิว</div>}
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {(Object.keys(VIEW_LABEL) as View[]).map((key) => (
          <button
            key={key}
            type="button"
            className={cn(
              'focus-ring -mb-px border-b-2 px-3 py-2 text-xs font-semibold whitespace-nowrap pointer-coarse:min-h-11',
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
      {view === 'tac' && <DeviceTacList refreshKey={refreshKey} onChanged={changed} />}
      {view === 'history' && <DeviceTacHistory refreshKey={refreshKey} />}
      {view === 'filter' && <DeviceCatalogSettingsForm canManage={canManage} onSaved={changed} />}

      <p className="mt-6 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
        แหล่งที่มา: {TAC_SOURCE_ATTRIBUTION} ·{' '}
        <a
          className="inline-flex items-center underline hover:text-slate-600 pointer-coarse:min-h-11"
          href={TAC_SOURCE_REPO_URL} target="_blank" rel="noreferrer">
          ดูแหล่งข้อมูล
        </a>
      </p>
    </Card>
  )
}

function DeviceCatalogSettingsForm({ canManage, onSaved }: { canManage: boolean; onSaved: () => void }) {
  const { showToast } = useToast()
  const [loaded, setLoaded] = useState<DeviceCatalogSettingsDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [brandsText, setBrandsText] = useState('')
  const [recentYears, setRecentYears] = useState('')
  const [capacityText, setCapacityText] = useState('')
  const [colorText, setColorText] = useState('')
  const [staleDays, setStaleDays] = useState('')
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
    setRecentYears(String(result.data.recentYears))
    setCapacityText(result.data.capacityOptions.join('\n'))
    setColorText(result.data.colorOptions.join('\n'))
    setStaleDays(String(result.data.staleAlertDays))
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
    const payload = {
      brandNames: parseBrandListText(brandsText),
      recentYears: Number(recentYears),
      capacityOptions: parseAttributeOptionsText(capacityText),
      colorOptions: parseAttributeOptionsText(colorText),
      staleAlertDays: Number(staleDays),
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
      showToast({ tone: 'success', title: 'บันทึกค่าตั้งแล้ว', description: 'การแสดงในตัวเลือกคำนวณใหม่ทันที (ไม่กระทบรายการที่ตั้งด้วยมือ)' })
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
        แสดงเฉพาะแบรนด์ในรายชื่อ และรุ่นที่ออกภายในจำนวนปีล่าสุดที่ตั้ง (ฐาน TAC มีปีที่ออก — รุ่นที่ไม่ทราบปีจากฐาน TAC
        ไม่แสดงจนกว่าจะเปิดเอง) · รายการที่ตั้งด้วยมือในแท็บแบรนด์/รุ่นไม่ถูกเปลี่ยน · IMEI ที่ตรงรุ่นยังเติมรุ่นให้ฟอร์มได้เสมอ
        {loaded.updatedAt === null ? ' · ตอนนี้ใช้ค่าเริ่มต้น' : ''}
      </InlineAlert>
      <Field
        id="device-filter-brands"
        label="รายชื่อแบรนด์ที่แสดง (บรรทัดละแบรนด์)"
        hint="สะกดตามชื่อแบรนด์ในแท็บแบรนด์ (ไม่สนตัวพิมพ์/ช่องว่าง) — แบรนด์ย่อย เช่น Redmi, POCO, HMD, nubia ต้องใส่แยก"
        error={errors.brandNames}
      >
        <Textarea id="device-filter-brands" rows={8} value={brandsText} disabled={!canManage} onChange={(event) => setBrandsText(event.target.value)} />
      </Field>
      <Field id="device-filter-years" label="แสดงรุ่นที่ออกภายใน (ปีล่าสุด)" hint="นับปีนี้ด้วย เช่น 5 ปี = รุ่นที่ออกตั้งแต่ 4 ปีก่อนถึงปีนี้" error={errors.recentYears}>
        <Input
          id="device-filter-years"
          numeric
          inputMode="numeric"
          className="w-32"
          value={recentYears}
          disabled={!canManage}
          onChange={(event) => setRecentYears(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="device-capacity-options"
          label="ตัวเลือกความจุ (บรรทัดละรายการ)"
          hint={`ฟอร์มรับเคสมี “ระบุเอง” และ “${NOT_SPECIFIED_IN_CONTRACT}” ให้เสมอ`}
          error={errors.capacityOptions}
        >
          <Textarea id="device-capacity-options" rows={8} value={capacityText} disabled={!canManage} onChange={(event) => setCapacityText(event.target.value)} />
        </Field>
        <Field
          id="device-color-options"
          label="ตัวเลือกสี (บรรทัดละรายการ)"
          hint={`ฟอร์มรับเคสมี “ระบุเอง” และ “${NOT_SPECIFIED_IN_CONTRACT}” ให้เสมอ`}
          error={errors.colorOptions}
        >
          <Textarea id="device-color-options" rows={8} value={colorText} disabled={!canManage} onChange={(event) => setColorText(event.target.value)} />
        </Field>
      </div>
      <Field
        id="device-stale-days"
        label="เตือนเมื่อแหล่งข้อมูลไม่อัปเดตเกิน (วัน)"
        hint="ไฟล์ฐาน TAC ต้นทางไม่ถูกแก้นานกว่านี้ ⇒ ขึ้นป้าย “แหล่งข้อมูลอาจหยุดอัปเดต”"
        error={errors.staleAlertDays}
      >
        <Input
          id="device-stale-days"
          numeric
          inputMode="numeric"
          className="w-32"
          value={staleDays}
          disabled={!canManage}
          onChange={(event) => setStaleDays(event.target.value)}
        />
      </Field>
      {canManage && (
        <>
          <Field id="device-filter-reason" label="เหตุผล (ไม่บังคับ)" error={errors.reason}>
            <Textarea maxLength={500} id="device-filter-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <Button onClick={() => void save()} loading={saving}>
            บันทึกค่าตั้ง
          </Button>
        </>
      )}
    </div>
  )
}
