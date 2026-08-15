'use client'

import { useState } from 'react'
import { AnswerQuestionModal } from '@/components/accounting/answer-question-modal'
import { QuestionFormModal } from '@/components/accounting/question-form-modal'
import { useAccountantQuestions, type QuestionStatusFilter } from '@/components/accounting/use-questions'
import { usePermission } from '@/components/auth/permission-provider'
import {
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
import {
  MANAGE_ACCOUNTANT_QUESTIONS,
  QUESTION_STATUS_GROUP,
  QUESTION_STATUS_LABEL,
} from '@/lib/accounting/question'
import type { AccountantQuestionDto } from '@/lib/accounting/types'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtCount } from '@/lib/format/money'

/**
 * แท็บ "ข้อซักถาม" (`36` §7 · mockup `accounting.html` แท็บ `qa`)
 *
 * ⚠️ คอลัมน์ "อ้างอิง" และ "Due Date" ของ mockup ยังไม่มีคอลัมน์ใน `02` §9 ⇒ ยังไม่แสดง
 *    (บันทึกไว้ที่ `docs/02_OPEN_DECISIONS.md` D14) — แสดงวันที่บันทึกคำถามแทนเพื่อให้ตามลำดับได้
 */

const STATUS_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'open', label: QUESTION_STATUS_LABEL.open },
  { value: 'answered', label: QUESTION_STATUS_LABEL.answered },
]

export function QuestionsTab() {
  const { can } = usePermission()
  const canManage = can('manage', MANAGE_ACCOUNTANT_QUESTIONS)

  const [status, setStatus] = useState<QuestionStatusFilter>('all')
  const { data, loading, error, reload } = useAccountantQuestions(status)

  const [creating, setCreating] = useState(false)
  const [opened, setOpened] = useState<AccountantQuestionDto | null>(null)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="ข้อซักถามทั้งหมด" value={fmtCount(data.summary.total)} hint="ตามตัวกรองปัจจุบัน" />
        <StatCard label="ยังไม่ได้ตอบ" value={fmtCount(data.summary.open)} hint="ควรเคลียร์ก่อนปิดงวด" />
        <StatCard label="ตอบแล้ว" value={fmtCount(data.summary.answered)} hint="เก็บเป็นหลักฐานการสื่อสาร" />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">ข้อซักถามจากสำนักงานบัญชี (Accountant Q&amp;A)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            เก็บคำถาม-คำตอบไว้ในระบบแทนการคุยผ่านไลน์/อีเมลแล้วหาไม่เจอ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterGroup
            options={STATUS_FILTERS}
            value={status}
            onChange={(value) => setStatus(value as QuestionStatusFilter)}
          />
          {canManage && (
            <Button size="sm" onClick={() => setCreating(true)}>
              บันทึกข้อซักถาม
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>รอบบัญชี</Th>
              <Th>คำถาม</Th>
              <Th>บันทึกเมื่อ</Th>
              <Th>ผู้ตอบ / เวลา</Th>
              <Th>สถานะ</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          <TableState
            loading={loading}
            error={error}
            isEmpty={data.items.length === 0}
            emptyTitle="ยังไม่มีข้อซักถามตามตัวกรองนี้"
            emptyDescription="กด “บันทึกข้อซักถาม” เมื่อสำนักงานบัญชีถามกลับมาหลังได้รับชุดเอกสาร"
            colSpan={6}
          />
          <TBody>
            {!loading &&
              error === null &&
              data.items.map((row) => (
                <Tr key={row.id} className={row.isResolved ? undefined : 'bg-amber-50/20'}>
                  <Td className="font-semibold">{row.periodLabel}</Td>
                  <Td className="max-w-[320px] text-xs font-medium text-slate-900">{row.questionText}</Td>
                  <Td className="text-xs text-slate-500">{fmtDateTime(row.createdAt)}</Td>
                  <Td className="text-xs text-slate-500">
                    {row.answeredByName === null ? '—' : `${row.answeredByName} · ${fmtDateTime(row.answeredAt)}`}
                  </Td>
                  <Td>
                    <StatusBadge
                      status={row.status}
                      group={QUESTION_STATUS_GROUP[row.status]}
                      label={row.statusLabel}
                    />
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    {!row.isResolved && canManage ? (
                      <Button size="sm" variant="ghost" onClick={() => setOpened(row)}>
                        ตอบคำถาม
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setOpened(row)}>
                        {row.isResolved ? 'ดูคำตอบ' : 'ดูคำถาม'}
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <InlineAlert tone="info" title="หลักการ (ไฟล์ 36)">
        ตอบได้ครั้งเดียวต่อ 1 ข้อซักถาม — ถ้ามีข้อมูลเพิ่มให้บันทึกเป็นข้อซักถามใหม่ ·
        การแก้ไขข้อมูลที่เป็นต้นเหตุทำที่โมดูลต้นทาง (ถ้ากระทบยอดต้องผ่าน Adjustment ไฟล์ 20)
      </InlineAlert>

      <QuestionFormModal open={creating} onClose={() => setCreating(false)} onCreated={() => void reload()} />

      <AnswerQuestionModal
        key={`answer-${opened?.id ?? 'none'}`}
        question={opened}
        onClose={() => setOpened(null)}
        onAnswered={() => void reload()}
      />
    </div>
  )
}
