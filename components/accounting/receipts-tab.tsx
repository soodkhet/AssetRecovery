'use client'

import { useCashReceipts } from '@/components/accounting/use-sales'
import {
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
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'

/**
 * แท็บ "เงินรับ" (`31` §8 · mockup `accounting.html` แท็บ `receipts`) — **อ่านอย่างเดียวทั้งแท็บ**
 *
 * ⚠️ ไม่มีปุ่มสร้าง/แก้/ลบเลยโดยเจตนา — เงินรับเกิดจากการจับคู่รายการเดินบัญชีเท่านั้น (`31` §6.3/§10)
 *    จับคู่รายการที่ยังค้างให้ไปที่แท็บ “กระทบยอด” (ไฟล์ 35)
 * ⚠️ คอลัมน์ "เลขที่ใบเสร็จ" ของ mockup ยังไม่มีคอลัมน์ใน `02` (`cash_receipts` ไม่มี `receipt_number`)
 *    ⇒ ยังไม่แสดง — ยึด schema เป็นหลักตามลำดับเอกสาร (CLAUDE.md)
 */
export function ReceiptsTab() {
  const { data, loading, error } = useCashReceipts()

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="เงินรับรวม" value={fmtSatangSymbol(data.totalSatang)} hint="ยอดที่เข้าบัญชีจริง" />
        <StatCard
          label="ลูกค้าหัก ณ ที่จ่าย"
          value={fmtSatangSymbol(data.totalWhtWithheldByCustomerSatang)}
          hint="เครดิตภาษีของบริษัท — ต้องมีหนังสือรับรองจากลูกค้า"
        />
        <StatCard label="จำนวนรายการ" value={fmtCount(data.items.length)} hint="ตามรอบที่แสดงอยู่" />
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900">เงินรับ (Cash Receipts)</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          เกิดอัตโนมัติเมื่อจับคู่รายการเดินบัญชีกับรอบวางบิลสำเร็จ — แก้ที่นี่ไม่ได้ทุกกรณี
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>วันที่รับเงิน</Th>
              <Th>ผู้จ่าย</Th>
              <Th numeric>ยอดรับ</Th>
              <Th numeric>ลูกค้าหัก ณ ที่จ่าย</Th>
              <Th>อ้างอิงธนาคาร</Th>
              <Th>รอบวางบิล</Th>
              <Th>สถานะจับคู่</Th>
              <Th>บันทึกเมื่อ</Th>
            </Tr>
          </THead>
          <TableState
            loading={loading}
            error={error}
            isEmpty={data.items.length === 0}
            emptyTitle="ยังไม่มีเงินรับ"
            emptyDescription="รายการจะเกิดเองเมื่อจับคู่เงินเข้ากับรอบวางบิลในแท็บ “กระทบยอด”"
            colSpan={8}
          />
          <TBody>
            {!loading &&
              error === null &&
              data.items.map((row) => (
                <Tr key={row.id}>
                  <Td className="text-xs text-slate-500">{fmtDate(row.receivedDate)}</Td>
                  <Td className="text-xs font-semibold text-slate-900">{row.payerName}</Td>
                  <Td numeric className="font-semibold text-emerald-700">
                    {fmtSatangSymbol(row.amountSatang)}
                  </Td>
                  <Td
                    numeric
                    className={row.whtWithheldByCustomerSatang > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}
                  >
                    {fmtSatangSymbol(row.whtWithheldByCustomerSatang)}
                  </Td>
                  <Td>
                    {row.bankRef === null ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : (
                      <RefText>{row.bankRef}</RefText>
                    )}
                  </Td>
                  <Td>
                    <RefText>{row.billingPeriod}</RefText>
                    <div className="mt-0.5">
                      <StatusBadge status={row.billingStatus} />
                    </div>
                  </Td>
                  <Td>
                    {row.bankMatchStatus === null ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : (
                      <StatusBadge status={row.bankMatchStatus} />
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">{fmtDateTime(row.createdAt)}</Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <InlineAlert tone="info" title="ทำไมแก้ที่นี่ไม่ได้ (ไฟล์ 31 §10)">
        เงินรับต้องตรงกับเงินที่เข้าบัญชีจริงเสมอ — สร้างมือได้เมื่อไหร่ ยอดในระบบกับ statement จะเริ่มไม่ตรงกัน ·
        ถ้าจับคู่ผิด ให้แก้ที่แท็บ “กระทบยอด” และยอดที่อยู่ในงวดที่ล็อกแล้วต้องผ่านรายการปรับปรุง (ไฟล์ 20)
      </InlineAlert>
    </div>
  )
}
