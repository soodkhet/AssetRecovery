'use client'

import { useEffect, useState } from 'react'
import { ReceiveCustomerWhtModal } from '@/components/accounting/receive-customer-wht-modal'
import { useCustomerWht } from '@/components/accounting/use-customer-wht'
import { usePermission } from '@/components/auth/permission-provider'
import {
  Button,
  FilterGroup,
  InlineAlert,
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
import { callApi } from '@/lib/api/types'
import {
  CUSTOMER_WHT_AGE_BUCKET_LABEL,
  CUSTOMER_WHT_AGE_BUCKETS,
  CUSTOMER_WHT_STATUS_LABEL,
  MANAGE_CUSTOMER_WHT,
  canReceiveCustomerWht,
  type CustomerWhtAgeBucket,
} from '@/lib/customer-wht/customer-wht'
import type { CustomerWhtDto } from '@/lib/customer-wht/types'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import type { CustomerWhtStatus } from '@/lib/generated/prisma/enums'
import { signedFileUrl } from '@/lib/uploads/client'

/**
 * แท็บ "50 ทวิ ลูกค้า" (มติ PO 05/10/2569 U40) — ใช้ร่วมหน้าบัญชีและหน้าการเงิน (ธุรการเข้าผ่านหน้าการเงิน)
 *
 * รายการ "รอ 50 ทวิ จากลูกค้า" เกิดเองเมื่อจับคู่เงินรับที่ลูกค้าหักภาษี — หน้านี้ใช้ติดตามและบันทึกรับหนังสือ
 * (เลขที่/วันที่/ยอด + ไฟล์สแกน) · กรองลูกค้า/สถานะ/อายุค้าง · ปุ่มบันทึกแสดงเฉพาะผู้มีสิทธิ์จัดการ
 */

type StatusFilter = CustomerWhtStatus | 'all'
type AgeFilter = CustomerWhtAgeBucket | 'all'

const STATUS_FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: CUSTOMER_WHT_STATUS_LABEL.pending },
  { value: 'received', label: CUSTOMER_WHT_STATUS_LABEL.received },
  { value: 'all', label: 'ทั้งหมด' },
]

export function CustomerWhtTab() {
  const { can } = usePermission()
  const canManage = can('manage', MANAGE_CUSTOMER_WHT)
  const { showToast } = useToast()

  const [status, setStatus] = useState<StatusFilter>('pending')
  const [age, setAge] = useState<AgeFilter>('all')
  const [companyId, setCompanyId] = useState('')
  const [companies, setCompanies] = useState<readonly FinanceCompanyDto[]>([])
  const [receiving, setReceiving] = useState<CustomerWhtDto | null>(null)

  const { data, loading, error, reload } = useCustomerWht({
    ...(status === 'all' ? {} : { status }),
    ...(age === 'all' ? {} : { age }),
    ...(companyId === '' ? {} : { companyId }),
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<FinanceCompanyDto[]>('/api/finance-companies')
      if (!cancelled) setCompanies(result.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function openFile(path: string): Promise<void> {
    const url = await signedFileUrl(path)
    if (url === null) {
      showToast({ tone: 'error', title: 'เปิดไฟล์ไม่ได้', description: 'ไม่พบไฟล์หรือคุณไม่มีสิทธิ์เปิดไฟล์นี้' })
      return
    }
    window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="รอ 50 ทวิ จากลูกค้า"
          value={fmtSatangSymbol(data.summary.pendingSatang)}
          hint={`${fmtCount(data.summary.pendingCount)} รายการ`}
        />
        <StatCard
          label="ได้รับหนังสือแล้ว"
          value={fmtSatangSymbol(data.summary.receivedSatang)}
          hint={`${fmtCount(data.summary.receivedCount)} รายการ`}
        />
        <StatCard
          label="ลูกค้าที่ยังค้างหนังสือ"
          value={fmtCount(data.byCompany.length)}
          hint="นับทุกงวด"
        />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">หนังสือรับรอง 50 ทวิ ที่ลูกค้าหักภาษี</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            เกิดรายการอัตโนมัติเมื่อจับคู่เงินรับที่ลูกค้าหักภาษี ณ ที่จ่าย — ใช้ตามหนังสือและเก็บหลักฐานเครดิตภาษี
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={companyId} onChange={(event) => setCompanyId(event.target.value)} aria-label="กรองลูกค้า">
            <option value="">ลูกค้าทั้งหมด</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
          <Select value={age} onChange={(event) => setAge(event.target.value as AgeFilter)} aria-label="กรองอายุค้าง">
            <option value="all">ทุกอายุค้าง</option>
            {CUSTOMER_WHT_AGE_BUCKETS.map((bucket) => (
              <option key={bucket} value={bucket}>
                {CUSTOMER_WHT_AGE_BUCKET_LABEL[bucket]}
              </option>
            ))}
          </Select>
          <FilterGroup options={STATUS_FILTERS} value={status} onChange={setStatus} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>วันที่รับเงิน</Th>
              <Th>ลูกค้า</Th>
              <Th>รอบวางบิล / ใบกำกับ</Th>
              <Th numeric>ยอดที่ถูกหัก</Th>
              <Th>อายุค้าง</Th>
              <Th>หนังสือ</Th>
              <Th>สถานะ</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          <TableState
            loading={loading}
            error={error}
            isEmpty={data.items.length === 0}
            emptyTitle="ไม่มีรายการตามตัวกรองนี้"
            emptyDescription="รายการจะเกิดเองเมื่อจับคู่เงินรับที่ลูกค้าหักภาษี ณ ที่จ่ายในหน้ากระทบยอด"
            colSpan={8}
          />
          <TBody>
            {!loading &&
              error === null &&
              data.items.map((row) => (
                <Tr key={row.id}>
                  <Td className="text-xs text-slate-500">{fmtDate(row.withheldDate)}</Td>
                  <Td className="text-sm font-semibold text-slate-900">{row.companyName}</Td>
                  <Td className="font-mono text-xs text-slate-600">
                    {row.billingRef ?? '—'}
                    {row.taxInvoiceNumbers.length > 0 && (
                      <p className="mt-0.5 text-[10px] text-slate-400">{row.taxInvoiceNumbers.join(', ')}</p>
                    )}
                  </Td>
                  <Td numeric className="font-bold text-slate-900">
                    {fmtSatangSymbol(row.withheldSatang)}
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {row.status === 'pending' ? `${fmtCount(row.ageDays)} วัน` : '—'}
                  </Td>
                  <Td className="text-xs text-slate-600">
                    {row.certificateNumber === null ? (
                      '—'
                    ) : (
                      <>
                        <span className="font-mono">{row.certificateNumber}</span>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {fmtDate(row.certificateDate)} · {fmtSatangSymbol(row.whtSatang)}
                          {row.amountMatches === false ? ' · ยอดไม่ตรงยอดที่ถูกหัก' : ''}
                        </p>
                      </>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={row.status} group={row.statusGroup} label={row.statusLabel} />
                    {row.receivedByName !== null && (
                      <p className="mt-1 text-[10px] text-slate-400">
                        {row.receivedByName} · {fmtDate(row.receivedAt)}
                      </p>
                    )}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      {canManage && canReceiveCustomerWht(row.status) && (
                        <Button size="sm" variant="ghost" onClick={() => setReceiving(row)}>
                          บันทึกได้รับหนังสือ
                        </Button>
                      )}
                      {row.filePath !== null && (
                        <Button size="sm" variant="ghost" onClick={() => void openFile(row.filePath ?? '')}>
                          ดูไฟล์
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <InlineAlert tone="info" title="หลักการ">
        ภาษีที่ลูกค้าหักไว้เป็นเครดิตภาษีของบริษัท ใช้ได้เมื่อมีหนังสือรับรองฉบับจริง — ระบบเก็บข้อมูลและไฟล์สแกนเพื่อ
        ส่งสำนักงานบัญชี · ยังไม่ได้รับหนังสือก็ปิดงวดได้ แต่ระบบจะแสดงเตือนยอดค้าง
      </InlineAlert>

      <ReceiveCustomerWhtModal
        key={`receive-${receiving?.id ?? 'none'}`}
        certificate={receiving}
        onClose={() => setReceiving(null)}
        onReceived={() => void reload()}
      />
    </div>
  )
}
