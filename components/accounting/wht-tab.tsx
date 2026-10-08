'use client'

import { buttonClass } from '@/components/ui/button'
import { useState } from 'react'
import { useUrlFilter } from '@/components/ui/use-url-filter'
import { ACCOUNTING_FILTER_PARAMS } from '@/lib/accounting/accounting-tabs'
import { kpiValue } from '@/components/ui/kpi-value'
import { CancelWhtModal } from '@/components/accounting/cancel-wht-modal'
import { MarkWhtFiledModal } from '@/components/accounting/mark-wht-filed-modal'
import {
  MarkWhtSupplementaryFiledModal,
  signedSatangText,
} from '@/components/accounting/mark-wht-supplementary-filed-modal'
import { useWht, type WhtStatusFilter } from '@/components/accounting/use-wht'
import { usePermission } from '@/components/auth/permission-provider'
import {
  Badge,
  Button,
  FilterGroup,
  InlineAlert,
  RefText,
  StatCard,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { PERIOD_CLOSED_CANCEL_HINT } from '@/lib/accounting/period'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import type { WhtCertificateDto, WhtFilingSummaryDto } from '@/lib/wht/types'
import { MANAGE_WHT } from '@/lib/wht/wht'

/**
 * แท็บ "เอกสาร & WHT" (`33` §8 · mockup `accounting.html` แท็บ `wht`)
 *
 * โครงหน้า 3 ส่วนตาม mockup: **banner countdown กำหนดนำส่ง** → ตารางสรุปรอบนำส่งรายเดือน →
 * ทะเบียนใบ 50 ทวิ
 *
 * ⚠️ ไม่มีปุ่ม "ออกหนังสือรับรอง" โดยเจตนา — ใบเกิดเองจากรอบจ่ายที่ `completed` (`33` §9)
 * ⚠️ ปุ่มยกเลิก/Mark Filed ขึ้นเฉพาะผู้มีสิทธิ์ `manage_wht` (API ตรวจซ้ำอีกชั้น — DEC-002)
 */

const STATUS_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'active', label: 'ใช้งาน' },
  { value: 'cancelled', label: 'ยกเลิก' },
]

export function WhtTab() {
  const { can } = usePermission()
  const canManage = can('manage', MANAGE_WHT)

  // ตัวกรองอยู่ใน URL — refresh/Back กลับมายังกรองเหมือนเดิม (preship R7-005)
  const [status, setStatus] = useUrlFilter<WhtStatusFilter>(ACCOUNTING_FILTER_PARAMS.whtStatus, STATUS_FILTERS, 'all')
  const { certificates, filings, warning, loading, error, reload } = useWht(status)
  // ระหว่างโหลด/โหลดไม่สำเร็จ KPI = "—" ไม่ใช่ ฿0.00/0 ที่อ่านเหมือนไม่มียอด (preship R2-007)
  const ready = !loading && error === null

  const [cancelling, setCancelling] = useState<WhtCertificateDto | null>(null)
  const [marking, setMarking] = useState<WhtFilingSummaryDto | null>(null)
  const [supplementing, setSupplementing] = useState<WhtFilingSummaryDto | null>(null)

  const pending = filings.pending
  // มติ PO U127 — รอบที่ยื่นแล้วแต่มีการยกเลิก/ออกใบภายหลัง
  const supplementary = filings.items.filter((item) => item.supplementaryRequired)

  return (
    <div className="space-y-6">
      {pending !== null && (
        <InlineAlert
          tone={pending.isOverdue ? 'error' : 'warning'}
          title={
            pending.isOverdue
              ? `เลยกำหนดนำส่ง ภ.ง.ด.3/53 ของรอบ ${pending.periodLabel} แล้ว ${Math.abs(pending.daysRemaining)} วัน`
              : `เหลือ ${pending.daysRemaining} วัน ก่อนกำหนดนำส่ง ภ.ง.ด.3/53 ของรอบ ${pending.periodLabel}`
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              กำหนดนำส่งวันที่ {pending.filingDueLabel} — ยื่นล่าช้ามีเบี้ยปรับ/เงินเพิ่ม
              {warning === null ? '' : ` · ${warning.message}`}
            </span>
            {canManage && (
              <Button size="sm" variant={pending.isOverdue ? 'danger' : 'secondary'} onClick={() => setMarking(pending)}>
                Mark ว่ายื่นแล้ว
              </Button>
            )}
          </div>
        </InlineAlert>
      )}

      {supplementary.length > 0 && (
        <InlineAlert tone="warning" title={`ต้องยื่น ภ.ง.ด. เพิ่มเติม ${fmtCount(supplementary.length)} รอบ`}>
          มีการยกเลิก/ออกหนังสือรับรองในเดือนที่ยื่นแบบไปแล้ว — รอบ{' '}
          {supplementary.map((item) => `${item.periodLabel} (ยอดต่าง ${signedSatangText(item.supplementaryDiff?.totalSatang ?? 0)})`).join(' · ')}
          {' '}· ยอดที่ยื่นแล้วยังคงเดิม ยื่นเพิ่มเติมนอกระบบแล้วกด &quot;ยื่นเพิ่มเติมแล้ว&quot; ที่แถวของรอบนั้น
        </InlineAlert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
        <StatCard label="ใบที่ใช้งานอยู่" value={kpiValue(ready ? certificates.summary.activeCount : null, fmtCount)} hint="ตามตัวกรองปัจจุบัน" />
        <StatCard label="ภ.ง.ด.3 (บุคคลธรรมดา)" value={kpiValue(ready ? certificates.summary.pnd3Satang : null, fmtSatangSymbol)} hint="ไม่รวมใบที่ยกเลิก" />
        <StatCard label="ภ.ง.ด.53 (นิติบุคคล)" value={kpiValue(ready ? certificates.summary.pnd53Satang : null, fmtSatangSymbol)} hint="ไม่รวมใบที่ยกเลิก" />
        <StatCard
          label="ภ.ง.ด.1 (เงินได้ 40(1)/40(2))"
          value={kpiValue(ready ? certificates.summary.pnd1Satang : null, fmtSatangSymbol)}
          // จำนวนราย/เงินได้รวมใบอัตรา 0% (ภาษี 0) ด้วย — มติ PO 05/10/2569 UAT U16
          hint={`${kpiValue(ready ? certificates.summary.pnd1Count : null, fmtCount)} ใบ · เงินได้ ${kpiValue(ready ? certificates.summary.pnd1GrossSatang : null, fmtSatangSymbol)} · ไม่รวมใบที่ยกเลิก`}
        />
        <StatCard label="ใบที่ยกเลิก" value={kpiValue(ready ? certificates.summary.cancelledCount : null, fmtCount)} hint="เก็บไว้เป็นหลักฐาน ห้ามลบ" />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">สรุปรอบนำส่ง WHT รายเดือน</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ยอดคิดจากใบ 50 ทวิ ที่ยังใช้งานอยู่ของรอบนั้น — กำหนดนำส่ง = วันที่ 15 ของเดือนถัดไป (ยื่นอินเทอร์เน็ต)
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <Tr>
                <Th>รอบเดือน</Th>
                <Th>กำหนดนำส่ง</Th>
                <Th numeric>ภ.ง.ด.3</Th>
                <Th numeric>ภ.ง.ด.53</Th>
                <Th numeric>ภ.ง.ด.1</Th>
                <Th>สถานะ</Th>
                <Th className="text-right">จัดการ</Th>
              </Tr>
            </THead>
            <TableState
              onRetry={() => void reload()}
              loading={loading}
              error={error}
              isEmpty={filings.items.length === 0}
              emptyTitle="ยังไม่มีรอบนำส่ง WHT"
              emptyDescription="รอบจะเกิดเองเมื่อมีการจ่ายเงินที่หักภาษี ณ ที่จ่ายในเดือนนั้น"
              colSpan={7}
            />
            <TBody>
              {!loading &&
                error === null &&
                filings.items.map((row) => (
                  <Tr key={row.id}>
                    <Td className="font-semibold">{row.periodLabel}</Td>
                    <Td className={row.isOverdue ? 'text-xs font-bold text-red-600' : 'text-xs text-slate-500'}>
                      {row.filingDueDateText}
                      <div className="text-[11px] font-normal text-slate-400">{row.filingMethodLabel}</div>
                    </Td>
                    <Td numeric className="font-semibold">
                      {fmtSatangSymbol(row.pnd3Satang)}
                    </Td>
                    <Td numeric className="font-semibold">
                      {fmtSatangSymbol(row.pnd53Satang)}
                    </Td>
                    <Td numeric className="font-semibold">
                      {fmtSatangSymbol(row.pnd1Satang)}
                    </Td>
                    <Td>
                      <StatusBadge status={row.status} label={row.statusLabel} />
                      {row.filedByName === null ? null : (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {row.filedByName} · {fmtDate(row.filedAt)}
                        </p>
                      )}
                      {row.supplementaryRequired && (
                        <div className="mt-1 space-y-0.5">
                          <StatusBadge group="warning" label="ต้องยื่นเพิ่มเติม" />
                          <p className="text-[10px] text-slate-500">
                            ยอดต่างจากที่ยื่น {signedSatangText(row.supplementaryDiff?.totalSatang ?? 0)}
                          </p>
                        </div>
                      )}
                      {!row.supplementaryRequired && row.supplementaryFiledAt !== null && (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          ยื่นเพิ่มเติมแล้ว · {row.supplementaryFiledByName ?? '-'} · {fmtDate(row.supplementaryFiledAt)}
                        </p>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {row.status === 'pending' && canManage && (
                        <Button size="sm" variant="success" onClick={() => setMarking(row)}>
                          Mark Filed
                        </Button>
                      )}
                      {row.supplementaryRequired && canManage && (
                        <Button size="sm" variant="secondary" onClick={() => setSupplementing(row)}>
                          ยื่นเพิ่มเติมแล้ว
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">หนังสือรับรองการหัก ณ ที่จ่าย (ใบ 50 ทวิ)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              ออกอัตโนมัติ 1 ใบต่อรายการจ่ายที่มีการหักภาษี เมื่อรอบจ่ายเงินจ่ายจริงแล้ว
            </p>
          </div>
          <FilterGroup options={STATUS_FILTERS} value={status} onChange={(value) => setStatus(value as WhtStatusFilter)} />
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <Tr>
                <Th>เลขที่</Th>
                <Th>ผู้ถูกหัก</Th>
                <Th>Tax ID</Th>
                <Th>ประเภทเงินได้</Th>
                <Th>วันที่จ่าย</Th>
                <Th numeric>ฐานหัก</Th>
                <Th numeric>ยอด WHT</Th>
                <Th>แบบ</Th>
                <Th>สถานะ</Th>
                <Th className="text-right">เอกสาร</Th>
              </Tr>
            </THead>
            <TableState
              onRetry={() => void reload()}
              loading={loading}
              error={error}
              isEmpty={certificates.items.length === 0}
              emptyTitle="ยังไม่มีหนังสือรับรองตามตัวกรองนี้"
              emptyDescription="ใบจะเกิดเองเมื่อรอบจ่ายเงินที่หักภาษีถูกยืนยันว่าจ่ายจริงแล้ว"
              colSpan={10}
            />
            <TBody>
              {!loading &&
                error === null &&
                certificates.items.map((row) => (
                  <Tr key={row.id} className={row.status === 'cancelled' ? 'bg-red-50/30 opacity-60' : undefined}>
                    <Td>
                      <RefText className="text-blue-600">{row.certificateNumber}</RefText>
                      {row.replacesCertificateNumber === null ? null : (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          ออกแทน <span className="font-mono whitespace-nowrap">{row.replacesCertificateNumber}</span>
                        </p>
                      )}
                    </Td>
                    <Td>
                      <div className="text-sm font-semibold text-slate-900">{row.payeeName}</div>
                      <p className="mt-0.5 font-mono text-[10px] whitespace-nowrap text-slate-400">{row.payoutBatchName}</p>
                    </Td>
                    <Td className="font-mono text-xs text-slate-500">{row.payeeTaxId ?? '—'}</Td>
                    <Td className="text-xs text-slate-600">{row.incomeType}</Td>
                    <Td className="text-xs text-slate-500">{fmtDate(row.paymentDate)}</Td>
                    <Td numeric>{fmtSatangSymbol(row.grossSatang)}</Td>
                    <Td numeric className="font-bold text-rose-600">
                      {fmtSatangSymbol(row.whtSatang)}
                    </Td>
                    <Td>
                      <Badge>{row.filingForm}</Badge>
                    </Td>
                    <Td>
                      <StatusBadge status={row.status} label={row.statusLabel} />
                      {row.cancelReason === null ? null : (
                        <p className="mt-0.5 max-w-40 text-[10px] text-slate-400">{row.cancelReason}</p>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <a
                          className={buttonClass('secondary')}
                          href={`/api/accounting/wht-certificates/${row.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          หนังสือรับรอง
                        </a>
                        {row.status === 'active' && canManage && (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={row.periodClosed}
                            title={row.periodClosed ? PERIOD_CLOSED_CANCEL_HINT : undefined}
                            onClick={() => setCancelling(row)}
                          >
                            ยกเลิก
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </div>
      </section>

      <InlineAlert tone="info" title="หลักการ">
        ใบที่ออกแล้วแก้ยอดไม่ได้ — ต้องยกเลิกพร้อมเหตุผลแล้วออกใบใหม่ที่อ้างกลับฉบับเดิม · ยอดของใบที่ยกเลิกจะ
        ไม่ถูกนับใน ภ.ง.ด.3/53 · การยื่นแบบจริงทำนอกระบบผ่านสำนักงานบัญชี ระบบเตรียมข้อมูลและเตือนกำหนดเท่านั้น
      </InlineAlert>

      <CancelWhtModal
        key={`cancel-${cancelling?.id ?? 'none'}`}
        certificate={cancelling}
        onClose={() => setCancelling(null)}
        onCancelled={() => void reload()}
      />

      <MarkWhtFiledModal
        key={`filed-${marking?.id ?? 'none'}`}
        summary={marking}
        onClose={() => setMarking(null)}
        onFiled={() => void reload()}
      />

      <MarkWhtSupplementaryFiledModal
        key={`supplementary-${supplementing?.id ?? 'none'}`}
        summary={supplementing}
        onClose={() => setSupplementing(null)}
        onFiled={() => void reload()}
      />
    </div>
  )
}
