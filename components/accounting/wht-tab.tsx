'use client'

import { useState } from 'react'
import { CancelWhtModal } from '@/components/accounting/cancel-wht-modal'
import { MarkWhtFiledModal } from '@/components/accounting/mark-wht-filed-modal'
import { useWht, type WhtStatusFilter } from '@/components/accounting/use-wht'
import { usePermission } from '@/components/auth/permission-provider'
import {
  Badge,
  Button,
  FilterGroup,
  InlineAlert,
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

  const [status, setStatus] = useState<WhtStatusFilter>('all')
  const { certificates, filings, warning, loading, error, reload } = useWht(status)

  const [cancelling, setCancelling] = useState<WhtCertificateDto | null>(null)
  const [marking, setMarking] = useState<WhtFilingSummaryDto | null>(null)

  const pending = filings.pending

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
              กำหนดนำส่งวันที่ {fmtDate(pending.filingDueDate)} (ยื่นทางอินเทอร์เน็ต) — ยื่นล่าช้ามีเบี้ยปรับ/เงินเพิ่ม
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="ใบที่ใช้งานอยู่" value={fmtCount(certificates.summary.activeCount)} hint="ตามตัวกรองปัจจุบัน" />
        <StatCard label="ภ.ง.ด.3 (บุคคลธรรมดา)" value={fmtSatangSymbol(certificates.summary.pnd3Satang)} hint="ไม่รวมใบที่ยกเลิก" />
        <StatCard label="ภ.ง.ด.53 (นิติบุคคล)" value={fmtSatangSymbol(certificates.summary.pnd53Satang)} hint="ไม่รวมใบที่ยกเลิก" />
        <StatCard label="ใบที่ยกเลิก" value={fmtCount(certificates.summary.cancelledCount)} hint="เก็บไว้เป็นหลักฐาน ห้ามลบ" />
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
                <Th>สถานะ</Th>
                <Th className="text-right">จัดการ</Th>
              </Tr>
            </THead>
            <TableState
              loading={loading}
              error={error}
              isEmpty={filings.items.length === 0}
              emptyTitle="ยังไม่มีรอบนำส่ง WHT"
              emptyDescription="รอบจะเกิดเองเมื่อมีการจ่ายเงินที่หักภาษี ณ ที่จ่ายในเดือนนั้น"
              colSpan={6}
            />
            <TBody>
              {!loading &&
                error === null &&
                filings.items.map((row) => (
                  <Tr key={row.id}>
                    <Td className="font-semibold">{row.periodLabel}</Td>
                    <Td className={row.isOverdue ? 'text-xs font-bold text-red-600' : 'text-xs text-slate-500'}>
                      {fmtDate(row.filingDueDate)}
                    </Td>
                    <Td numeric className="font-semibold">
                      {fmtSatangSymbol(row.pnd3Satang)}
                    </Td>
                    <Td numeric className="font-semibold">
                      {fmtSatangSymbol(row.pnd53Satang)}
                    </Td>
                    <Td>
                      <StatusBadge status={row.status} label={row.statusLabel} />
                      {row.filedByName === null ? null : (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {row.filedByName} · {fmtDate(row.filedAt)}
                        </p>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {row.status === 'pending' && canManage && (
                        <Button size="sm" variant="success" onClick={() => setMarking(row)}>
                          Mark Filed
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
              ออกอัตโนมัติ 1 ใบต่อรายการจ่ายที่มีการหักภาษี เมื่อรอบจ่ายเงินจ่ายจริงแล้ว (ไฟล์ 17)
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
                      <span className="font-mono text-xs text-blue-600">{row.certificateNumber}</span>
                      {row.replacesCertificateNumber === null ? null : (
                        <p className="mt-0.5 text-[10px] text-slate-400">ออกแทน {row.replacesCertificateNumber}</p>
                      )}
                    </Td>
                    <Td>
                      <div className="text-sm font-semibold text-slate-900">{row.payeeName}</div>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">{row.payoutBatchName}</p>
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
                          className="focus-ring rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          href={`/api/accounting/wht-certificates/${row.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          หนังสือรับรอง
                        </a>
                        {row.status === 'active' && canManage && (
                          <Button size="sm" variant="danger" onClick={() => setCancelling(row)}>
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

      <InlineAlert tone="info" title="หลักการ (ไฟล์ 33)">
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
    </div>
  )
}
