'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can, usePermission } from '@/components/auth/permission-provider'
import { CompanyDocumentsModal } from '@/components/finance-companies/company-documents-modal'
import { CompanyFormModal } from '@/components/finance-companies/company-form-modal'
import {
  Button,
  buttonClass,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  InlineAlert,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { CycleDto } from '@/lib/settings/types'
import { MANAGE_CUSTOMER_WHT } from '@/lib/customer-wht/customer-wht'
import type { CustomerWhtCompanySummary, CustomerWhtListDto } from '@/lib/customer-wht/types'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import { formatBranch, formatCustomerWhtPct, formatTaxId, vatModeLabel } from '@/lib/finance-companies/company'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import { portalViewAsHomePath, VIEW_CLIENT_PORTAL_AS_CAPABILITY } from '@/lib/portal/view-as'
import type { ServiceFeeTemplateListDto } from '@/lib/service-fee/types'

/**
 * หน้า "บริษัทไฟแนนซ์" — แสดงเป็น **การ์ด ไม่ใช่ตาราง** ตาม `10` §8 + mockup `renderCompaniesContent`
 * การ์ดเรียง active ก่อน suspended · แสดงเหตุผลระงับเป็นกล่องแดงเมื่อถูกระงับ
 *
 * สิทธิ์บนปุ่มเป็นแค่ UX — API ตรวจ `manage_companies` (Superadmin) ซ้ำเสมอ (DEC-002 · `10` §12)
 * ปุ่ม "เปิด portal ของลูกค้า" (มติ PO U59) — ผู้ถือ `view_client_portal_as` เปิดแท็บใหม่ดูพอร์ทัลของบริษัทนั้น
 * แบบดูอย่างเดียว · ยามจริงอยู่ที่หน้า `/portal/view-as/*` และ `/api/portal/*?as=` (DEC-002)
 * ส่วน "เอกสารบริษัท" (มติ PO U132) — คำเตือนบนการ์ด (ไม่บล็อก) + ปุ่มเปิด modal เอกสาร (ดูได้ทุกคนที่เห็นหน้านี้
 * · แนบ = Superadmin) — พอร์ทัลของลูกค้าไม่แสดงส่วนนี้
 */

const MANAGE_RESOURCE = 'manage_companies'
const REASON_MIN_LENGTH = 5

type StatusFilter = 'all' | 'active' | 'suspended'

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'สถานะบริษัท: ทั้งหมด',
  active: 'ใช้งานปกติ (Active)',
  suspended: 'ระงับ (Suspended)',
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-0.5 block text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{label}</span>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  )
}

export function CompaniesManager() {
  const { showToast } = useToast()
  const { can } = usePermission()
  // มติ PO U40 — 50 ทวิ ที่ลูกค้ารายนี้ยังค้างส่ง (แสดงเฉพาะผู้มีสิทธิ์ดูข้อมูลภาษีนี้)
  const canViewCustomerWht = can('view', MANAGE_CUSTOMER_WHT)
  const [pendingWht, setPendingWht] = useState<ReadonlyMap<string, CustomerWhtCompanySummary>>(new Map())
  const [companies, setCompanies] = useState<readonly FinanceCompanyDto[]>([])
  const [templates, setTemplates] = useState<readonly ServiceFeeTemplateListDto[]>([])
  /** มติ PO U146 — รอบบิลที่ใช้งาน ให้ฟอร์มเลือก "รอบบิลที่ใช้" */
  const [billingCycles, setBillingCycles] = useState<readonly CycleDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  const [formCompany, setFormCompany] = useState<FinanceCompanyDto | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const [statusTarget, setStatusTarget] = useState<FinanceCompanyDto | null>(null)
  const [docsCompany, setDocsCompany] = useState<FinanceCompanyDto | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)

  useEffect(() => {
    if (!canViewCustomerWht) return
    let cancelled = false
    void (async () => {
      const result = await callApi<CustomerWhtListDto>('/api/accounting/customer-wht-certificates?status=pending&limit=1')
      if (cancelled || result.data === undefined) return
      setPendingWht(new Map(result.data.byCompany.map((row) => [row.companyId, row])))
    })()
    return () => {
      cancelled = true
    }
  }, [canViewCustomerWht])

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchCompanies = useCallback(async () => {
    const params = new URLSearchParams({ status })
    if (search.trim() !== '') params.set('search', search.trim())
    return callApi<FinanceCompanyDto[]>(`/api/finance-companies?${params.toString()}`)
  }, [status, search])

  const reload = useCallback(async () => {
    const result = await fetchCompanies()
    if (result.error !== undefined) {
      setError(result.error.message)
      setLoading(false)
      return
    }
    setCompanies(result.data ?? [])
    setError(null)
    setLoading(false)
  }, [fetchCompanies])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchCompanies()
      if (cancelled) return
      if (result.error !== undefined) {
        setError(result.error.message)
        setLoading(false)
        return
      }
      setCompanies(result.data ?? [])
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchCompanies])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [result, cycles] = await Promise.all([
        callApi<ServiceFeeTemplateListDto[]>('/api/service-fee-templates?status=active'),
        callApi<CycleDto[]>('/api/settings/cycles?type=AR&status=active'),
      ])
      if (cancelled) return
      setTemplates(result.data ?? [])
      setBillingCycles(cycles.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function confirmStatus(): Promise<void> {
    if (statusTarget === null) return
    const nextStatus = statusTarget.status === 'active' ? 'suspended' : 'active'
    setStatusSaving(true)
    try {
      const result = await callApi<FinanceCompanyDto>(
        `/api/finance-companies/${statusTarget.id}/status`,
        jsonRequest('POST', { status: nextStatus, reason: statusReason }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }

      showToast({
        tone: 'success',
        title: nextStatus === 'suspended' ? 'ระงับบริษัทแล้ว' : 'เปิดใช้งานบริษัทแล้ว',
        description: statusTarget.name,
      })
      setStatusTarget(null)
      setStatusReason('')
      await reload()
    } finally {
      setStatusSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="บริษัทไฟแนนซ์ (Finance Companies)"
        description="คู่ค้าที่ส่งเคสเข้ามาติดตาม — ผูกเทมเพลตค่าบริการ 1 ตัวต่อบริษัท · บริษัทที่ถูกระงับรับเคสใหม่ไม่ได้"
        action={
          <Can action="manage" resource={MANAGE_RESOURCE}>
            <Button
              onClick={() => {
                setFormCompany(null)
                setFormOpen(true)
              }}
            >
              + สร้างบริษัท
            </Button>
          </Can>
        }
      />

      <Card>
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:flex-row">
          <div className="flex-1">
            <Input
              aria-label="ค้นหาชื่อบริษัทหรือเลขผู้เสียภาษี"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อบริษัท หรือเลขประจำตัวผู้เสียภาษี..."
            />
          </div>
          <div className="w-full sm:w-52">
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
        )}
        {!loading && error === null && companies.length === 0 && (
          <EmptyState title="ไม่พบข้อมูลบริษัท" description="สร้างบริษัทไฟแนนซ์รายแรกเพื่อเริ่มรับเคส" />
        )}

        {!loading && error === null && companies.length > 0 && (
          <div className="grid grid-cols-1 gap-4">
            {companies.map((company) => (
              <div key={company.id} className="relative rounded-lg border border-slate-200 p-5 shadow-sm">
                <div className="absolute top-5 right-5">
                  <StatusBadge
                    group={company.status === 'active' ? 'success' : 'critical'}
                    label={company.status === 'active' ? 'Active' : 'Suspended'}
                  />
                </div>

                <div className="mb-1 text-lg font-bold text-slate-900">{company.name}</div>
                <div className="mb-4 font-mono text-xs text-slate-500">
                  Tax ID: {formatTaxId(company.taxId)} · {formatBranch(company.branchCode)} ·{' '}
                  {company.vatRegistered ? (
                    <span className="font-semibold text-emerald-600">จด VAT แล้ว</span>
                  ) : (
                    <span className="text-slate-400">ไม่จด VAT</span>
                  )}
                </div>

                {company.status === 'suspended' && company.suspendedReason !== null && (
                  <div className="mb-3">
                    <InlineAlert tone="error" title="บริษัทนี้ถูกระงับ">
                      เหตุผล: {company.suspendedReason} — รับเคสใหม่จากบริษัทนี้ไม่ได้จนกว่าจะเปิดใช้งานกลับ
                    </InlineAlert>
                  </div>
                )}

                {company.documentWarnings.length > 0 && (
                  <div className="mb-3">
                    <InlineAlert tone="warning" title="เอกสารบริษัทยังไม่ครบ">
                      {company.documentWarnings.map((warning) => warning.message).join(' · ')}
                    </InlineAlert>
                  </div>
                )}

                <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
                  <Detail label="ผู้ติดต่อบริษัท">
                    {company.contactName ?? '—'}
                    <div className="text-xs text-slate-500">📞 {company.contactPhone ?? '-'}</div>
                  </Detail>
                  <Detail label="ผู้ลงนามสัญญา">{company.signerName ?? '—'}</Detail>
                  <Detail label="เทมเพลตค่าบริการ">
                    <span className="font-bold text-slate-900">{company.serviceFeeTemplateName ?? '—'}</span>
                    {company.serviceFeeTemplateModel !== null && (
                      <span className="ml-1 text-xs text-slate-500">({company.serviceFeeTemplateModel})</span>
                    )}
                  </Detail>
                  <Detail label="รูปแบบราคา/VAT">
                    {vatModeLabel(company.vatMode)}
                    <div className="text-xs text-slate-500">
                      ลูกค้าหักภาษี ณ ที่จ่าย: {formatCustomerWhtPct(company.whtWithheldByCustomerPct)}
                    </div>
                    {pendingWht.has(company.id) && (
                      <div className="text-xs font-semibold text-amber-700">
                        รอ 50 ทวิ จากลูกค้า {fmtCount(pendingWht.get(company.id)?.pendingCount ?? 0)} รายการ ·{' '}
                        {fmtSatangSymbol(pendingWht.get(company.id)?.pendingSatang ?? 0)}
                      </div>
                    )}
                  </Detail>
                  <Detail label="รูปแบบส่งใบแจ้งหนี้">
                    {company.defaultInvoiceDeliveryFormat === 'e_tax_invoice' ? '📧 e-Tax Invoice' : '📄 กระดาษ/PDF'}
                    {/* มติ PO U146 — วันตัดรอบ/เครดิตเทอมมาจากรอบบิลที่ใช้ (แหล่งเดียว) */}
                    {company.billingCycle === null ? (
                      <div className="text-xs font-semibold text-amber-700">ยังไม่เลือกรอบบิล — สร้างรอบวางบิลไม่ได้</div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        รอบบิล {company.billingCycle.name} · ตัดรอบ{company.billingCycle.cutoffLabel} · ครบกำหนด{' '}
                        {company.billingCycle.dueLabel}
                      </div>
                    )}
                  </Detail>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <div className="text-xs text-slate-500">
                    <span className="font-bold text-slate-800">{company.caseCount}</span> เคส |{' '}
                    <span className="font-bold text-slate-800">{company.userCount}</span> บัญชีผู้ใช้
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="secondary" onClick={() => setDocsCompany(company)}>
                      📎 เอกสารบริษัท
                    </Button>
                    <Can action="view" resource={VIEW_CLIENT_PORTAL_AS_CAPABILITY}>
                      <a
                        href={portalViewAsHomePath(company.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClass('secondary')}
                        aria-label={`เปิด portal ของลูกค้า ${company.name} ในแท็บใหม่ (ดูอย่างเดียว)`}
                      >
                        เปิด portal ของลูกค้า ↗
                      </a>
                    </Can>
                    <Can action="manage" resource={MANAGE_RESOURCE}>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setFormCompany(company)
                            setFormOpen(true)
                          }}
                        >
                          ⚙️ แก้ไขบริษัท
                        </Button>
                        <Button
                          variant={company.status === 'active' ? 'danger' : 'secondary'}
                          onClick={() => {
                            setStatusTarget(company)
                            setStatusReason('')
                          }}
                        >
                          {company.status === 'active' ? '🚫 ระงับ' : '✓ เปิดใช้งาน'}
                        </Button>
                      </div>
                    </Can>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {formOpen && (
        <CompanyFormModal
          key={formCompany?.id ?? 'create'}
          open={formOpen}
          company={formCompany}
          templates={templates}
          billingCycles={billingCycles}
          onClose={() => setFormOpen(false)}
          onSaved={() => void reload()}
        />
      )}

      {docsCompany !== null && (
        <CompanyDocumentsModal
          key={docsCompany.id}
          company={docsCompany}
          onClose={() => setDocsCompany(null)}
          onChanged={() => void reload()}
        />
      )}

      <ConfirmModal
        open={statusTarget !== null}
        onClose={() => setStatusTarget(null)}
        onConfirm={() => void confirmStatus()}
        title={
          statusTarget?.status === 'active'
            ? `ระงับบริษัท "${statusTarget.name}"`
            : `เปิดใช้งานบริษัท "${statusTarget?.name ?? ''}"`
        }
        description={
          statusTarget?.status === 'active'
            ? 'เคสที่เปิดอยู่ก่อนระงับยังดำเนินต่อตามปกติ แต่จะรับเคสใหม่จากบริษัทนี้ไม่ได้'
            : 'เปิดใช้งานกลับได้ตลอด ไม่มีเงื่อนไขพิเศษ — เหตุผลที่ระงับไว้เดิมจะถูกล้างทิ้ง'
        }
        confirmLabel={statusTarget?.status === 'active' ? 'ยืนยันระงับบริษัท' : 'ยืนยันเปิดใช้งาน'}
        confirmVariant={statusTarget?.status === 'active' ? 'danger' : 'primary'}
        loading={statusSaving}
        confirmDisabled={statusReason.trim().length < REASON_MIN_LENGTH}
      >
        <Field id="company-status-reason" label="เหตุผล" required>
          <Textarea
            id="company-status-reason"
            value={statusReason}
            onChange={(event) => setStatusReason(event.target.value)}
            placeholder={
              statusTarget?.status === 'active' ? 'เช่น ค้างชำระเกิน 90 วัน' : 'เช่น เคลียร์ยอดค้างชำระครบแล้ว'
            }
          />
        </Field>
      </ConfirmModal>
    </>
  )
}
