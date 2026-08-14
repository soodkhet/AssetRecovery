'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { ServiceFeeFormModal } from '@/components/service-fee/service-fee-form-modal'
import { VersionHistoryModal, type VersionRow } from '@/components/settings/version-history-modal'
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest, type ApiCallResult } from '@/lib/api/types'
import {
  SERVICE_FEE_BASIS_LABEL,
  describeServiceFeeFormula,
  type ServiceFeeCharge,
  type ServiceFeeModel,
} from '@/lib/service-fee/template'
import type { ServiceFeeTemplateDto, ServiceFeeTemplateListDto } from '@/lib/service-fee/types'
import { fmtPercent, fmtSatang } from '@/lib/format/money'

/**
 * หน้า "เทมเพลตค่าบริการ (รับเข้า)" — DEC-008: แสดงเป็น**การ์ด**ไม่ใช่ตาราง (คอลัมน์เยอะเกินไป)
 * โครงตาม mockup `settings.html` (`renderServiceFeeContent`) · สูตร 2 กรณีตาม `22` §6.5–6.7
 */

const MANAGE_RESOURCE = 'manage_service_fees'
const REASON_MIN_LENGTH = 5

type StatusFilter = 'active' | 'inactive' | 'all'

const STATUS_LABEL: Record<StatusFilter, string> = {
  active: 'ใช้งานอยู่',
  inactive: 'ปิดใช้งาน',
  all: 'ทั้งหมด',
}

const MODEL_BADGE: Record<ServiceFeeModel, string> = {
  SUCCESS_FEE: 'bg-emerald-100 text-emerald-800',
  FLAT: 'bg-blue-100 text-blue-800',
  HYBRID: 'bg-purple-100 text-purple-800',
}

/** แปลงองค์ประกอบของสูตรเป็นข้อความ — ไม่คำนวณเงิน (ต้องรู้มูลหนี้/มูลค่าเครื่องของเคสก่อน) */
function chargeText(charge: ServiceFeeCharge): string {
  switch (charge.kind) {
    case 'none':
      return 'ไม่เรียกเก็บ (0 บาท)'
    case 'flat':
      return `${fmtSatang(charge.baseSatang)} บาท (เหมาคงที่)`
    case 'rate':
      return `${fmtPercent(charge.ratePct)} × ${SERVICE_FEE_BASIS_LABEL[charge.basis]}`
    case 'hybrid':
      return `${fmtSatang(charge.baseSatang)} บาท + ${fmtPercent(charge.ratePct)} × ${SERVICE_FEE_BASIS_LABEL[charge.basis]}`
  }
}

function versionRow(template: ServiceFeeTemplateDto): VersionRow {
  const formula = describeServiceFeeFormula(template)
  return {
    id: template.id,
    version: template.version,
    isCurrent: template.isCurrent,
    updatedAt: template.updatedAt,
    summary: `${template.model} · สำเร็จ: ${chargeText(formula.onSuccess)} · ไม่สำเร็จ: ${chargeText(formula.onFail)}`,
  }
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'amber' }) {
  const wrap = {
    slate: 'rounded-lg border border-slate-100 bg-slate-50 p-2.5',
    emerald: 'rounded-lg border border-emerald-100 bg-emerald-50 p-2.5',
    amber: 'rounded-lg border border-amber-100 bg-amber-50 p-2.5',
  }[tone]
  const labelClass = {
    slate: 'mb-1 block text-[10px] font-bold tracking-wider text-slate-400 uppercase',
    emerald: 'mb-1 block text-[10px] font-bold tracking-wider text-emerald-600 uppercase',
    amber: 'mb-1 block text-[10px] font-bold tracking-wider text-amber-600 uppercase',
  }[tone]
  const valueClass = {
    slate: 'text-sm font-bold text-slate-800',
    emerald: 'text-sm font-bold text-emerald-700',
    amber: 'text-sm font-bold text-amber-700',
  }[tone]

  return (
    <div className={wrap}>
      <span className={labelClass}>{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  )
}

export function ServiceFeeTemplatesManager() {
  const { showToast } = useToast()
  const [templates, setTemplates] = useState<readonly ServiceFeeTemplateListDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusFilter>('active')

  const [formTemplate, setFormTemplate] = useState<ServiceFeeTemplateListDto | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [historyTemplate, setHistoryTemplate] = useState<ServiceFeeTemplateListDto | null>(null)

  const [activationTarget, setActivationTarget] = useState<ServiceFeeTemplateListDto | null>(null)
  const [activationReason, setActivationReason] = useState('')
  const [activating, setActivating] = useState(false)

  const apply = useCallback((result: ApiCallResult<ServiceFeeTemplateListDto[]>) => {
    if (result.error !== undefined) {
      setError(result.error.message)
      setLoading(false)
      return
    }
    setTemplates(result.data ?? [])
    setError(null)
    setLoading(false)
  }, [])

  const load = useCallback(
    async (filter: StatusFilter) => {
      apply(await callApi<ServiceFeeTemplateListDto[]>(`/api/service-fee-templates?status=${filter}`))
    },
    [apply],
  )

  // ตั้ง state **หลัง** await เท่านั้น (กฎ `react-hooks/set-state-in-effect`)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<ServiceFeeTemplateListDto[]>(`/api/service-fee-templates?status=${status}`)
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [status, apply])

  async function confirmActivation(): Promise<void> {
    if (activationTarget === null) return
    const nextActive = !activationTarget.isActive
    setActivating(true)
    try {
      const result = await callApi<ServiceFeeTemplateDto>(
        `/api/service-fee-templates/${activationTarget.id}`,
        jsonRequest('DELETE', { isActive: nextActive, reason: activationReason }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }

      showToast({
        tone: 'success',
        title: nextActive ? 'เปิดใช้งานเทมเพลตแล้ว' : 'ปิดใช้งานเทมเพลตแล้ว',
        description: activationTarget.name,
      })
      setActivationTarget(null)
      setActivationReason('')
      await load(status)
    } finally {
      setActivating(false)
    }
  }

  return (
    <>
      <PageHeader
        title="เทมเพลตค่าบริการ (รับเข้า)"
        description="ฐานคำนวณรายได้ที่เรียกเก็บจากบริษัทไฟแนนซ์ — 3 model ตามไฟล์ 12 §6 · ผูกกับบริษัทไฟแนนซ์ทุกราย"
        action={
          <Can action="manage" resource={MANAGE_RESOURCE}>
            <Button
              onClick={() => {
                setFormTemplate(null)
                setFormOpen(true)
              }}
            >
              + สร้างเทมเพลต
            </Button>
          </Can>
        }
      />

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            แก้ไขเทมเพลตที่ใช้งานอยู่จะสร้าง <strong>เวอร์ชันใหม่</strong> — เคสที่อนุมัติแล้วใช้ snapshot เดิม (ไฟล์ 12 §9)
          </span>
          <div className="w-40">
            <Select
              aria-label="กรองตามสถานะ"
              value={status}
              onChange={(event) => {
                setLoading(true)
                setStatus(event.target.value as StatusFilter)
              }}
            >
              {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {loading && <LoadingState />}
        {!loading && error !== null && (
          <ErrorState
            message={error}
            action={
              <Button variant="secondary" onClick={() => void load(status)}>
                ลองใหม่
              </Button>
            }
          />
        )}
        {!loading && error === null && templates.length === 0 && (
          <EmptyState title="ยังไม่มีเทมเพลตค่าบริการ" description="สร้างเทมเพลตแรกเพื่อผูกกับบริษัทไฟแนนซ์" />
        )}

        {!loading && error === null && templates.length > 0 && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {templates.map((template) => {
              const formula = describeServiceFeeFormula(template)
              const chargesOnFail = formula.onFail.kind !== 'none'

              return (
                <div key={template.id} className="rounded-lg border border-slate-200 p-5 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-slate-900">{template.name}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge className={MODEL_BADGE[template.model]}>{template.model}</Badge>
                        <span className="font-mono text-[10px] text-slate-400">v{template.version}</span>
                      </div>
                    </div>
                    <Badge
                      className={template.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}
                    >
                      {template.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                    </Badge>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <Stat
                      label="💰 ค่าเปิดเคส (Base)"
                      value={template.baseSatang > 0 ? `${fmtSatang(template.baseSatang)} บาท` : '—'}
                    />
                    <Stat
                      label="📊 อัตราความสำเร็จ"
                      value={
                        template.ratePct > 0 && template.basis !== null
                          ? `${fmtPercent(template.ratePct)} × ${SERVICE_FEE_BASIS_LABEL[template.basis]}`
                          : '—'
                      }
                    />
                    <div className="col-span-2">
                      <Stat label="✅ เคสสำเร็จ (closed_success) เรียกเก็บ" tone="emerald" value={chargeText(formula.onSuccess)} />
                    </div>
                    <div className="col-span-2">
                      <Stat
                        label="🔄 เคสไม่สำเร็จ (closed_fail) เรียกเก็บ"
                        tone={chargesOnFail ? 'amber' : 'slate'}
                        value={chargeText(formula.onFail)}
                      />
                    </div>
                  </div>

                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {template.model === 'SUCCESS_FEE' ? (
                      <Badge className="border border-slate-200 bg-slate-50 text-slate-400">
                        เก็บเฉพาะเคสสำเร็จโดยนิยามของโมเดล (§6.1) — ไม่มีตัวเลือก charge_on_fail
                      </Badge>
                    ) : template.chargeOnFail ? (
                      <Badge className="border border-amber-200 bg-amber-100 text-amber-800">
                        ⚠️ charge_on_fail = true — เก็บค่า base เสมอไม่ว่าผลจะเป็นอย่างไร
                      </Badge>
                    ) : (
                      <Badge className="border border-slate-200 bg-slate-50 text-slate-400">
                        charge_on_fail = false — เรียกเก็บเฉพาะเคสสำเร็จ
                      </Badge>
                    )}
                    <Badge className="border border-slate-200 bg-slate-50 text-slate-500">
                      {template.companyCount} บริษัทผูกอยู่
                    </Badge>
                  </div>

                  <div className="flex items-center justify-end gap-1 border-t border-slate-100 pt-3">
                    <Button variant="ghost" onClick={() => setHistoryTemplate(template)}>
                      ประวัติเวอร์ชัน
                    </Button>
                    <Can action="manage" resource={MANAGE_RESOURCE}>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setFormTemplate(template)
                          setFormOpen(true)
                        }}
                      >
                        ⚙️ แก้ไขข้อมูล
                      </Button>
                      <Button
                        variant={template.isActive ? 'danger' : 'secondary'}
                        onClick={() => {
                          setActivationTarget(template)
                          setActivationReason('')
                        }}
                      >
                        {template.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                      </Button>
                    </Can>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {formOpen && (
        <ServiceFeeFormModal
          key={formTemplate?.id ?? 'create'}
          open={formOpen}
          template={formTemplate}
          onClose={() => setFormOpen(false)}
          onSaved={() => void load(status)}
        />
      )}

      <VersionHistoryModal<ServiceFeeTemplateDto>
        key={historyTemplate?.id ?? 'history-none'}
        open={historyTemplate !== null}
        onClose={() => setHistoryTemplate(null)}
        title={`ประวัติเวอร์ชัน — ${historyTemplate?.name ?? ''}`}
        url={historyTemplate === null ? null : `/api/service-fee-templates/${historyTemplate.id}/versions`}
        toRow={versionRow}
      />

      <ConfirmModal
        open={activationTarget !== null}
        onClose={() => setActivationTarget(null)}
        onConfirm={() => void confirmActivation()}
        title={`${activationTarget?.isActive === true ? 'ปิด' : 'เปิด'}ใช้งานเทมเพลต "${activationTarget?.name ?? ''}"`}
        description={
          activationTarget?.isActive === true
            ? 'เทมเพลตที่มีบริษัทไฟแนนซ์ผูกอยู่ปิดใช้งานไม่ได้ — ย้ายบริษัทไปเทมเพลตอื่นก่อน (ไฟล์ 12 §10)'
            : 'เปิดใช้งานกลับให้เลือกผูกกับบริษัทได้อีกครั้ง'
        }
        confirmLabel={activationTarget?.isActive === true ? 'ยืนยันปิดใช้งาน' : 'ยืนยันเปิดใช้งาน'}
        confirmVariant={activationTarget?.isActive === true ? 'danger' : 'primary'}
        loading={activating}
        confirmDisabled={activationReason.trim().length < REASON_MIN_LENGTH}
      >
        <Field id="sf-activation-reason" label="เหตุผล" required>
          <Textarea
            id="sf-activation-reason"
            value={activationReason}
            onChange={(event) => setActivationReason(event.target.value)}
            placeholder="เช่น เลิกใช้เทมเพลตนี้หลังสัญญาหมดอายุ"
          />
        </Field>
      </ConfirmModal>
    </>
  )
}
