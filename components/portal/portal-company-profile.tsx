'use client'

import type { ReactNode } from 'react'
import { usePortalData } from '@/components/portal/use-portal-data'
import { Button, Card, EmptyState, ErrorState, InlineAlert, LoadingState, PageHeader, RefText } from '@/components/ui'
import type { PortalCompanyProfileDto } from '@/lib/portal/serializers'

/**
 * ข้อมูลบริษัท (ดูอย่างเดียว) — `GET /api/portal/company-profile` (`97` §6.6 · mockup `renderProfile()`)
 * · template ที่ผูกอยู่ = ชื่อ + รุ่นเท่านั้น (ไม่แสดงอัตรา — มติ O44/O46) · เลขผู้เสียภาษี `font-mono`
 */
export function PortalCompanyProfile() {
  const state = usePortalData<PortalCompanyProfileDto>('/api/portal/company-profile')

  return (
    <div>
      <PageHeader title="ข้อมูลบริษัท" description="ดูอย่างเดียว — หากต้องการแก้ไข กรุณาติดต่อเจ้าหน้าที่ภายใน" />
      <div className="max-w-xl space-y-4">
        <Card padded={state.data !== null && !state.loading && state.error === null}>
          {state.loading ? (
            <LoadingState />
          ) : state.error !== null ? (
            <ErrorState
              title={state.error.title}
              message={state.error.message}
              {...(state.error.code === undefined ? {} : { code: state.error.code })}
              action={
                <Button variant="secondary" onClick={state.reload}>
                  ลองใหม่
                </Button>
              }
            />
          ) : state.data === null ? (
            <EmptyState title="ไม่พบข้อมูลบริษัท" />
          ) : (
            <ProfileRows profile={state.data} />
          )}
        </Card>
        <InlineAlert tone="warning">
          ต้องการแก้ไขข้อมูลบริษัทหรือจัดการผู้ใช้งานในบริษัทของท่าน กรุณาติดต่อเจ้าหน้าที่ AssetRecovery โดยตรง —
          พอร์ทัลนี้ไม่รองรับการแก้ไขข้อมูลด้วยตนเอง
        </InlineAlert>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <dt className="shrink-0 text-xs text-slate-400">{label}</dt>
      <dd className="text-right text-sm font-semibold break-words text-slate-800">{children}</dd>
    </div>
  )
}

function orDash(value: string | null): string {
  return value === null || value.trim() === '' ? '—' : value
}

function ProfileRows({ profile }: { profile: PortalCompanyProfileDto }) {
  const contact =
    profile.contactName === null && profile.contactPhone === null
      ? '—'
      : profile.contactPhone === null
        ? orDash(profile.contactName)
        : `${orDash(profile.contactName)} (${profile.contactPhone})`
  const template = profile.serviceFeeTemplate

  return (
    <dl>
      <Row label="ชื่อบริษัท">{profile.name}</Row>
      <Row label="เลขประจำตัวผู้เสียภาษี">
        <RefText className="text-sm font-semibold text-slate-800">{profile.taxId}</RefText>
        <span className="ml-2 text-sm text-slate-600">{profile.branchLabel}</span>
      </Row>
      <Row label="ที่อยู่จดทะเบียน">{orDash(profile.address)}</Row>
      <Row label="ผู้ติดต่อประจำวัน">{contact}</Row>
      <Row label="ผู้มีอำนาจลงนาม">{orDash(profile.signerName)}</Row>
      <Row label="เทมเพลตค่าบริการที่ผูกอยู่">
        {template === null ? '—' : `${template.name} (${template.modelLabel})`}
      </Row>
    </dl>
  )
}
