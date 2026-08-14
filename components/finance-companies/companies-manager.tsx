'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { CompanyFormModal } from '@/components/finance-companies/company-form-modal'
import {
  Badge,
  Button,
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
  Textarea,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { formatTaxId } from '@/lib/finance-companies/company'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import type { ServiceFeeTemplateListDto } from '@/lib/service-fee/types'

/**
 * หน้า "บริษัทไฟแนนซ์" — แสดงเป็น **การ์ด ไม่ใช่ตาราง** ตาม `10` §8 + mockup `renderCompaniesContent`
 * การ์ดเรียง active ก่อน suspended · แสดงเหตุผลระงับเป็นกล่องแดงเมื่อถูกระงับ
 *
 * สิทธิ์บนปุ่มเป็นแค่ UX — API ตรวจ `manage_companies` (Superadmin) ซ้ำเสมอ (DEC-002 · `10` §12)
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
  const [companies, setCompanies] = useState<readonly FinanceCompanyDto[]>([])
  const [templates, setTemplates] = useState<readonly ServiceFeeTemplateListDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  const [formCompany, setFormCompany] = useState<FinanceCompanyDto | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const [statusTarget, setStatusTarget] = useState<FinanceCompanyDto | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)

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
      const result = await callApi<ServiceFeeTemplateListDto[]>('/api/service-fee-templates?status=active')
      if (!cancelled) setTemplates(result.data ?? [])
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
                  <Badge
                    className={
                      company.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }
                  >
                    {company.status === 'active' ? 'Active' : 'Suspended'}
                  </Badge>
                </div>

                <div className="mb-1 text-lg font-bold text-slate-900">{company.name}</div>
                <div className="mb-4 font-mono text-xs text-slate-500">
                  Tax ID: {formatTaxId(company.taxId)} ·{' '}
                  {company.vatRegistered ? (
                    <span className="font-semibold text-emerald-600">จด VAT แล้ว</span>
                  ) : (
                    <span className="text-slate-400">ไม่จด VAT</span>
                  )}
                </div>

                {company.status === 'suspended' && company.suspendedReason !== null && (
                  <div className="mb-3">
                    <InlineAlert tone="error" title="บริษัทนี้ถูกระงับ">
                      เหตุผล: {company.suspendedReason} — รับเคสใหม่จากบริษัทนี้ไม่ได้จนกว่าจะเปิดใช้งานกลับ (ไฟล์ 10 §9.3)
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
                  <Detail label="รูปแบบส่งใบแจ้งหนี้">
                    {company.defaultInvoiceDeliveryFormat === 'e_tax_invoice' ? '📧 e-Tax Invoice' : '📄 กระดาษ/PDF'}
                    <div className="text-xs text-slate-500">
                      ตัดรอบวันที่ {company.billingDay} · เครดิต {company.paymentDueDays} วัน
                    </div>
                  </Detail>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <div className="text-xs text-slate-500">
                    <span className="font-bold text-slate-800">{company.caseCount}</span> เคส |{' '}
                    <span className="font-bold text-slate-800">{company.userCount}</span> บัญชีผู้ใช้
                  </div>
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
          onClose={() => setFormOpen(false)}
          onSaved={() => void reload()}
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
            ? 'เคสที่เปิดอยู่ก่อนระงับยังดำเนินต่อตามปกติ แต่จะรับเคสใหม่จากบริษัทนี้ไม่ได้ (ไฟล์ 10 §9.3)'
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
