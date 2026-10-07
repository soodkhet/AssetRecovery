'use client'

import { SettingHelp } from '@/components/settings/setting-help'
import { organizationProfileHelp } from '@/lib/settings/help'
import { useCallback, useEffect, useState } from 'react'
import { AddressFields } from '@/components/address/address-fields'
import { Can } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import { MANAGE_INVOICE_NUMBERING } from '@/components/settings/shared'
import {
  Button,
  Card,
  ErrorState,
  Field,
  InlineAlert,
  Input,
  LoadingState,
  Modal,
  Select,
  Textarea,
  useToast,
} from '@/components/ui'
import { EMPTY_ADDRESS, type AddressValue } from '@/lib/address/address-value'
import { callApi, jsonRequest } from '@/lib/api/types'
import { REASON_MAX, toFieldErrors } from '@/lib/api/validation'
import { formatTaxId } from '@/lib/finance-companies/company'
import { branchCodeFromForm, branchKindOf, isHeadOfficeBranch, type BranchKind } from '@/lib/format/branch'
import {
  ORGANIZATION_LOGO_ACCEPT,
  ORGANIZATION_LOGO_MAX_BYTES,
  ORGANIZATION_SIGNATURE_ACCEPT,
} from '@/lib/organization/profile'
import {
  ORGANIZATION_REQUIRED_ADDRESS_FIELDS,
  organizationLogoSetSchema,
  organizationProfileUpdateSchema,
  organizationSignatureSetSchema,
} from '@/lib/organization/schemas'
import type { OrganizationProfileDto } from '@/lib/organization/types'
import { StorageUploadError, uploadToStorage } from '@/lib/uploads/client'

/**
 * ตั้งค่าทั่วไป → **ข้อมูลองค์กร** (มติ PO 06/10/2569 U99 · mockup `settings.html` `renderOrganizationContent`)
 *
 * - ข้อมูลผู้ขายบนใบกำกับภาษี/ใบแจ้งหนี้ + หัวเอกสารของ PDF ทุกใบ (ยกเว้นแบบ 50 ทวิ ที่ใช้แบบฟอร์มทางการ)
 * - แก้ได้เฉพาะ Superadmin (`manage_invoice_numbering`) · บริหาร/บัญชีดูอย่างเดียว · ทุกการแก้ต้องมีเหตุผล
 * - เอกสารที่ออกแล้วไม่เปลี่ยน (อ่าน snapshot ตอนออก) — แก้แล้วมีผลกับเอกสารที่ออกหลังจากนี้เท่านั้น
 * - รูปลายเซ็นผู้มีอำนาจ (มติ PO U122 · ไม่บังคับ) — กติกาเดียวกับโลโก้ · ผู้ดูอย่างเดียวไม่เห็นรูป (เห็นแค่สถานะ)
 * - โลโก้ PNG/JPG ≤ 1 MB อัปโหลดผ่าน server (ตรวจชนิด/ขนาดจากเนื้อไฟล์อีกชั้นตอนบันทึก) · ลบ = ปลดออกจากหัวเอกสาร
 * - สำนักงานใหญ่/สาขา ย้ายมารวมที่นี่ (เดิมเป็นการ์ดในแท็บเลขที่ใบกำกับภาษี)
 */

const ENDPOINT = '/api/settings/organization'

/** รูปที่อัปโหลดได้ในหน้านี้ — โลโก้ (U99) และรูปลายเซ็นผู้มีอำนาจ (U122 · ไม่บังคับ) ใช้กติกาเดียวกัน */
type ImageKind = 'logo' | 'signature'

interface ImageConfig {
  endpoint: string
  target: 'organization_logo' | 'organization_signature'
  noun: string
  modalTitle: string
  hint: string
  reasonPlaceholder: string
  note: string
  savedDescription: string
  removeTitle: string
  removeDescription: string
  removedToast: string
}

const IMAGE_CONFIG: Readonly<Record<ImageKind, ImageConfig>> = {
  logo: {
    endpoint: '/api/settings/organization/logo',
    target: 'organization_logo',
    noun: 'โลโก้',
    modalTitle: 'อัปโหลดโลโก้บริษัท',
    hint: 'PNG / JPG · ขนาดแนะนำ 400×400 px · ไฟล์ไม่เกิน 1 MB',
    reasonPlaceholder: 'เช่น ใช้โลโก้ใหม่ตามแบบของบริษัท',
    note: 'โลโก้จะปรากฏบนใบกำกับภาษี ใบเสร็จรับเงิน ใบแจ้งหนี้ และเอกสาร PDF ที่ระบบสร้างหลังจากนี้ — เอกสารที่ออกแล้วไม่เปลี่ยน',
    savedDescription: 'เอกสารที่ออกหลังจากนี้จะพิมพ์โลโก้ใหม่',
    removeTitle: 'ลบโลโก้ออกจากหัวเอกสาร',
    removeDescription: 'เอกสารที่ออกหลังจากนี้จะไม่มีโลโก้ · เอกสารที่ออกไปแล้วยังพิมพ์โลโก้เดิม',
    removedToast: 'นำโลโก้ออกจากหัวเอกสารแล้ว',
  },
  signature: {
    endpoint: '/api/settings/organization/signature',
    target: 'organization_signature',
    noun: 'รูปลายเซ็น',
    modalTitle: 'อัปโหลดรูปลายเซ็นผู้มีอำนาจ',
    hint: 'PNG พื้นโปร่งแนะนำ (หรือ JPG) · ไฟล์ไม่เกิน 1 MB',
    reasonPlaceholder: 'เช่น ใช้ลายเซ็นกรรมการผู้มีอำนาจคนปัจจุบัน',
    note: 'รูปจะพิมพ์บนเอกสารชนิดที่เปิดไว้ในแท็บ "เทมเพลตเอกสาร" ที่ออกหลังจากนี้ — เอกสารที่ออกแล้วไม่เปลี่ยน',
    savedDescription: 'พิมพ์บนเอกสารชนิดที่เปิดไว้ในแท็บเทมเพลตเอกสาร',
    removeTitle: 'ลบรูปลายเซ็นผู้มีอำนาจ',
    removeDescription: 'เอกสารที่ออกหลังจากนี้จะเว้นช่องให้เซ็นมือ · เอกสารที่ออกไปแล้วยังพิมพ์รูปเดิม',
    removedToast: 'นำรูปลายเซ็นออกแล้ว',
  },
}

interface FormState {
  name: string
  nameEn: string
  taxId: string
  branchKind: BranchKind
  branchNumber: string
  address: AddressValue
  phone: string
  email: string
  website: string
  vatRegistered: boolean
  authorizedSignerName: string
  authorizedSignerTitle: string
  reason: string
}

function formOf(profile: OrganizationProfileDto): FormState {
  return {
    name: profile.name,
    nameEn: profile.nameEn ?? '',
    // ค่าตัวอย่างของ seed ไม่ส่งเข้าฟอร์ม — บังคับให้กรอกเลขจริง
    taxId: profile.issues.length > 0 && /^0+$/.test(profile.taxId) ? '' : profile.taxId,
    branchKind: branchKindOf(profile.branchCode),
    branchNumber: isHeadOfficeBranch(profile.branchCode) ? '' : profile.branchCode,
    address:
      profile.addressDetail === null && profile.addressProvince === null
        ? { ...EMPTY_ADDRESS, detail: profile.issues.some((issue) => issue.startsWith('ที่อยู่')) ? '' : profile.address }
        : {
            detail: profile.addressDetail ?? '',
            subdistrict: profile.addressSubdistrict ?? '',
            district: profile.addressDistrict ?? '',
            province: profile.addressProvince ?? '',
            postalCode: profile.addressPostalCode ?? '',
          },
    phone: profile.phone ?? '',
    email: profile.email ?? '',
    website: profile.website ?? '',
    vatRegistered: profile.vatRegistered,
    authorizedSignerName: profile.authorizedSignerName ?? '',
    authorizedSignerTitle: profile.authorizedSignerTitle ?? '',
    reason: '',
  }
}

const ADDRESS_ERROR_KEYS: Readonly<Record<string, keyof AddressValue>> = {
  addressDetail: 'detail',
  addressSubdistrict: 'subdistrict',
  addressDistrict: 'district',
  addressProvince: 'province',
  addressPostalCode: 'postalCode',
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      {children}
    </div>
  )
}

export function OrganizationProfileTab() {
  const { showToast } = useToast()
  const [profile, setProfile] = useState<OrganizationProfileDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  // ปุ่ม "ลองใหม่" บน ErrorState — เพิ่มตัวนับให้ effect โหลดซ้ำ (R3-027)
  const [retryKey, setRetryKey] = useState(0)

  const [form, setForm] = useState<FormState | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [imageKind, setImageKind] = useState<ImageKind | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoReason, setLogoReason] = useState('')
  const [logoError, setLogoError] = useState<string | null>(null)
  const [logoSaving, setLogoSaving] = useState(false)

  const [removeKind, setRemoveKind] = useState<ImageKind | null>(null)
  const [removeReason, setRemoveReason] = useState('')
  const [removing, setRemoving] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchProfile = useCallback(async () => callApi<OrganizationProfileDto>(ENDPOINT), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchProfile()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setProfile(result.data ?? null)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchProfile, retryKey])

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => (current === null ? current : { ...current, [key]: value }))
  }

  async function save(): Promise<void> {
    if (form === null) return
    const parsed = organizationProfileUpdateSchema.safeParse({
      name: form.name,
      nameEn: form.nameEn,
      taxId: form.taxId,
      branchCode: branchCodeFromForm(form.branchKind, form.branchNumber),
      addressDetail: form.address.detail,
      addressSubdistrict: form.address.subdistrict,
      addressDistrict: form.address.district,
      addressProvince: form.address.province,
      addressPostalCode: form.address.postalCode,
      phone: form.phone,
      email: form.email,
      website: form.website,
      vatRegistered: form.vatRegistered,
      authorizedSignerName: form.authorizedSignerName,
      authorizedSignerTitle: form.authorizedSignerTitle,
      reason: form.reason,
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<OrganizationProfileDto>(ENDPOINT, jsonRequest('PATCH', parsed.data))
      if (result.error !== undefined) {
        if (result.error.fields !== undefined) setErrors(result.error.fields)
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      setProfile(result.data ?? null)
      showToast({ tone: 'success', title: 'บันทึกข้อมูลองค์กรแล้ว', description: 'มีผลกับเอกสารที่ออกหลังจากนี้' })
      setForm(null)
    } finally {
      setSaving(false)
    }
  }

  function openImage(kind: ImageKind): void {
    setLogoFile(null)
    setLogoReason('')
    setLogoError(null)
    setImageKind(kind)
  }

  function pickLogo(file: File | null): void {
    setLogoError(null)
    if (file === null) {
      setLogoFile(null)
      return
    }
    // ด่านแรกฝั่งหน้าจอ (UX) — server ตรวจชนิด/ขนาดจากเนื้อไฟล์อีกชั้นเสมอ
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setLogoError('รับเฉพาะไฟล์ PNG หรือ JPG')
      setLogoFile(null)
      return
    }
    if (file.size > ORGANIZATION_LOGO_MAX_BYTES) {
      setLogoError('ไฟล์ใหญ่เกิน 1 MB — กรุณาลดขนาดรูปก่อนอัปโหลด')
      setLogoFile(null)
      return
    }
    setLogoFile(file)
  }

  async function saveImage(kind: ImageKind, organizationId: string): Promise<void> {
    const config = IMAGE_CONFIG[kind]
    if (logoFile === null) {
      setLogoError(`กรุณาเลือกไฟล์${config.noun}`)
      return
    }
    setLogoSaving(true)
    try {
      let path: string
      try {
        path = await uploadToStorage({ kind: config.target, organizationId }, logoFile)
      } catch (uploadError) {
        setLogoError(uploadError instanceof StorageUploadError ? uploadError.message : `อัปโหลด${config.noun}ไม่สำเร็จ`)
        return
      }
      // schema ของโลโก้/ลายเซ็นรูปเดียวกัน ({ path, reason }) — ใช้ตัวที่ตรงชนิดเพื่อข้อความผิดพลาดที่ถูกต้อง
      const schema = kind === 'logo' ? organizationLogoSetSchema : organizationSignatureSetSchema
      const parsed = schema.safeParse({ path, reason: logoReason })
      if (!parsed.success) {
        setLogoError(toFieldErrors(parsed.error).reason ?? 'ข้อมูลไม่ครบ')
        return
      }
      const result = await callApi<OrganizationProfileDto>(config.endpoint, jsonRequest('POST', parsed.data))
      if (result.error !== undefined) {
        setLogoError(result.error.message)
        return
      }
      setProfile(result.data ?? null)
      showToast({ tone: 'success', title: `บันทึก${config.noun}แล้ว`, description: config.savedDescription })
      setImageKind(null)
    } finally {
      setLogoSaving(false)
    }
  }

  async function removeImage(kind: ImageKind): Promise<void> {
    const config = IMAGE_CONFIG[kind]
    setRemoving(true)
    try {
      const result = await callApi<OrganizationProfileDto>(
        config.endpoint,
        jsonRequest('DELETE', { reason: removeReason }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      setProfile(result.data ?? null)
      showToast({ tone: 'success', title: config.removedToast })
      setRemoveKind(null)
    } finally {
      setRemoving(false)
    }
  }

  const retryLoad = () => {
    setError(null)
    setLoading(true)
    setRetryKey((key) => key + 1)
  }

  if (loading) {
    return (
      <Card>
        <LoadingState message="กำลังโหลดข้อมูลองค์กร" />
      </Card>
    )
  }
  if (error !== null) {
    return (
      <Card>
        <ErrorState title={error.title} message={error.message} onRetry={retryLoad} />
      </Card>
    )
  }
  if (profile === null) return null

  const addressErrors = Object.fromEntries(
    Object.entries(errors)
      .filter(([key]) => ADDRESS_ERROR_KEYS[key] !== undefined)
      .map(([key, message]) => [ADDRESS_ERROR_KEYS[key], message]),
  ) as Partial<Record<keyof AddressValue, string>>

  return (
    <Card>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* หัวข้อหลัก + คำอธิบายย้ายไป PageHeader ของ page แล้ว (preship R2-031) — ในการ์ดเหลือหัวข้อย่อย */}
        <h2 className="text-sm font-bold text-slate-900">ข้อมูลผู้ขายบนเอกสาร</h2>
        <Can action="manage" resource={MANAGE_INVOICE_NUMBERING}>
          <Button
            onClick={() => {
              setErrors({})
              setForm(formOf(profile))
            }}
          >
            แก้ไขข้อมูล
          </Button>
        </Can>
      </div>

      <SettingHelp className="mb-4" help={organizationProfileHelp()} />

      {profile.issues.length > 0 && (
        <InlineAlert tone="warning" title="ข้อมูลองค์กรยังเป็นค่าตัวอย่าง — กรอกข้อมูลจริงก่อนออกเอกสาร">
          <ul className="list-disc pl-4">
            {profile.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </InlineAlert>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
          {profile.logoPreviewUrl !== null ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL อายุสั้นจาก Storage (ไม่ผ่าน next/image)
            <img src={profile.logoPreviewUrl} alt="โลโก้บริษัท" className="mb-3 h-24 w-24 rounded-lg object-contain" />
          ) : (
            <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-xl bg-slate-200 text-xs text-slate-400">
              {profile.logoPath === null ? 'ไม่มีโลโก้' : 'แสดงตัวอย่างไม่ได้'}
            </div>
          )}
          <div className="mb-2 text-xs text-slate-400">โลโก้บริษัท (ปรากฏบนเอกสาร)</div>
          <Can action="manage" resource={MANAGE_INVOICE_NUMBERING}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => openImage('logo')}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                {profile.logoPath === null ? 'อัปโหลดโลโก้' : 'เปลี่ยนโลโก้'}
              </button>
              {profile.logoPath !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveReason('')
                    setRemoveKind('logo')
                  }}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  ลบโลโก้
                </button>
              )}
            </div>
          </Can>

          {/* รูปลายเซ็นผู้มีอำนาจ (มติ PO U122 · ไม่บังคับ) — จะพิมพ์บนเอกสารชนิดใดตั้งที่แท็บ "เทมเพลตเอกสาร" */}
          <div className="mt-5 w-full border-t border-dashed border-slate-200 pt-5">
            {profile.signaturePreviewUrl !== null ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL อายุสั้นจาก Storage (ไม่ผ่าน next/image)
              <img
                src={profile.signaturePreviewUrl}
                alt="รูปลายเซ็นผู้มีอำนาจ"
                className="mx-auto mb-2 h-12 object-contain"
              />
            ) : (
              <div className="mb-2 flex h-12 items-center justify-center text-xs text-slate-400">
                {profile.hasSignature ? 'มีรูปลายเซ็นแล้ว' : 'ยังไม่มีรูปลายเซ็น'}
              </div>
            )}
            <div className="mb-2 text-xs text-slate-400">รูปลายเซ็นผู้มีอำนาจ (ไม่บังคับ)</div>
            <Can action="manage" resource={MANAGE_INVOICE_NUMBERING}>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => openImage('signature')}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  {profile.hasSignature ? 'เปลี่ยนรูปลายเซ็น' : 'อัปโหลดรูปลายเซ็น'}
                </button>
                {profile.hasSignature && (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveReason('')
                      setRemoveKind('signature')
                    }}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    ลบรูปลายเซ็น
                  </button>
                )}
              </div>
            </Can>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="border-b border-slate-100 pb-4 sm:col-span-2">
              <InfoItem label="ชื่อนิติบุคคล">
                <div className="text-base font-bold text-slate-900">{profile.name}</div>
                {profile.nameEn !== null && <div className="text-xs text-slate-500">{profile.nameEn}</div>}
              </InfoItem>
            </div>
            <InfoItem label="เลขประจำตัวผู้เสียภาษี">
              <div className="font-mono font-bold text-slate-800">{formatTaxId(profile.taxId)}</div>
              <div className="mt-0.5 text-xs text-slate-600">{profile.branchLabel}</div>
              <span
                className={`mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                  profile.vatRegistered ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {profile.vatRegistered ? 'จด VAT' : 'ไม่จด VAT'}
              </span>
            </InfoItem>
            <InfoItem label="เบอร์โทรสำนักงาน">
              <div className="font-medium text-slate-700">{profile.phone ?? '—'}</div>
              <div className="mt-0.5 text-xs text-slate-400">{profile.email ?? 'ไม่ระบุอีเมล'}</div>
              <div className="mt-0.5 text-xs text-slate-400">{profile.website ?? 'ไม่ระบุเว็บไซต์'}</div>
            </InfoItem>
            <div className="sm:col-span-2">
              <InfoItem label="ที่อยู่ตามที่จดทะเบียน">
                <div className="text-sm leading-relaxed text-slate-700">{profile.address}</div>
              </InfoItem>
            </div>
            {/* มติ PO U151 — พิมพ์ใต้ช่องลายเซ็นฝั่งบริษัทบนเอกสารส่งออกนอก (คู่รูปลายเซ็นด้านซ้าย) */}
            <div className="sm:col-span-2">
              <InfoItem label="ผู้มีอำนาจลงนาม">
                <div className="font-medium text-slate-700">{profile.authorizedSignerName ?? 'ไม่ระบุ'}</div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {profile.authorizedSignerTitle ?? 'ไม่ระบุตำแหน่ง'} · พิมพ์บนใบแจ้งหนี้ ใบเสร็จรับเงิน/ใบกำกับภาษี
                  ใบส่งมอบทรัพย์ และหนังสือรับรองการหักภาษี ณ ที่จ่าย
                </div>
              </InfoItem>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <b>หมายเหตุ:</b> ข้อมูลองค์กรนี้ถูกบันทึกลงในใบกำกับภาษีและใบแจ้งหนี้ทุกฉบับตอนออก — แก้ไขแล้วมีผลเฉพาะเอกสารที่ออกหลังจากนี้
        เอกสารเก่าไม่เปลี่ยน · สิทธิ์แก้ไข: Superadmin เท่านั้น
        <br />
        <b>การตั้งค่า Prefix / รูปแบบเลขที่เอกสาร</b> อยู่ที่ <b>ตั้งค่าบัญชี/การเงิน → เลขที่เอกสาร</b>
      </div>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title="แก้ไขข้อมูลองค์กร"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              บันทึก
            </Button>
          </>
        }
      >
        {form !== null && (
          <div className="space-y-4">
            <InlineAlert tone="warning" title="ข้อมูลนี้ปรากฏบนใบกำกับภาษีทุกฉบับ">
              มีผลกับเอกสารที่ออกหลังจากบันทึกเท่านั้น · สิทธิ์: Superadmin เท่านั้น
            </InlineAlert>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="org-name" label="ชื่อบริษัท (ไทย)" required error={errors.name} className="sm:col-span-2">
                <Input
                  id="org-name"
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                  placeholder="บริษัท xxx จำกัด"
                />
              </Field>
              <Field id="org-name-en" label="ชื่อบริษัท (อังกฤษ)" error={errors.nameEn} className="sm:col-span-2">
                <Input
                  id="org-name-en"
                  value={form.nameEn}
                  onChange={(event) => set('nameEn', event.target.value)}
                  placeholder="xxx Co., Ltd."
                />
              </Field>
              <Field id="org-tax-id" label="เลขประจำตัวผู้เสียภาษี (13 หลัก)" required error={errors.taxId}>
                <Input
                  id="org-tax-id"
                  numeric
                  inputMode="numeric"
                  maxLength={17}
                  value={form.taxId}
                  onChange={(event) => set('taxId', event.target.value)}
                  placeholder="0000000000000"
                />
              </Field>
              <Field id="org-branch-kind" label="สำนักงานใหญ่ / สาขา" required>
                <Select
                  id="org-branch-kind"
                  value={form.branchKind}
                  onChange={(event) => set('branchKind', event.target.value as BranchKind)}
                >
                  <option value="head_office">สำนักงานใหญ่</option>
                  <option value="branch">สาขาที่</option>
                </Select>
              </Field>
              {form.branchKind === 'branch' && (
                <Field id="org-branch-no" label="เลขที่สาขา (5 หลัก)" required error={errors.branchCode}>
                  <Input
                    id="org-branch-no"
                    numeric
                    inputMode="numeric"
                    maxLength={5}
                    value={form.branchNumber}
                    onChange={(event) => set('branchNumber', event.target.value)}
                    placeholder="00001"
                  />
                </Field>
              )}
              <Field id="org-phone" label="เบอร์โทรสำนักงาน" required error={errors.phone}>
                <Input
                  id="org-phone"
                  type="tel"
                  maxLength={20}
                  value={form.phone}
                  onChange={(event) => set('phone', event.target.value)}
                  placeholder="02-xxx-xxxx"
                />
              </Field>
              <Field id="org-email" label="อีเมลองค์กร" error={errors.email}>
                <Input
                  id="org-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => set('email', event.target.value)}
                />
              </Field>
              <Field id="org-website" label="เว็บไซต์" error={errors.website} className="sm:col-span-2">
                <Input
                  id="org-website"
                  value={form.website}
                  onChange={(event) => set('website', event.target.value)}
                  placeholder="www.example.co.th"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="org-signer-name" label="ชื่อผู้มีอำนาจลงนาม (ไม่บังคับ)" error={errors.authorizedSignerName}>
                <Input
                  id="org-signer-name"
                  value={form.authorizedSignerName}
                  onChange={(event) => set('authorizedSignerName', event.target.value)}
                  placeholder="เช่น นายสมชาย ใจดี"
                />
              </Field>
              <Field id="org-signer-title" label="ตำแหน่ง" error={errors.authorizedSignerTitle}>
                <Input
                  id="org-signer-title"
                  value={form.authorizedSignerTitle}
                  onChange={(event) => set('authorizedSignerTitle', event.target.value)}
                  placeholder="เช่น กรรมการผู้จัดการ"
                />
              </Field>
            </div>

            <AddressFields
              label="ที่อยู่ตามที่จดทะเบียน"
              value={form.address}
              onChange={(next) => set('address', next)}
              requiredFields={ORGANIZATION_REQUIRED_ADDRESS_FIELDS}
              errors={addressErrors}
            />

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.vatRegistered}
                onChange={(event) => set('vatRegistered', event.target.checked)}
                className="rounded text-blue-600"
              />
              จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)
            </label>
            {!form.vatRegistered && (
              <InlineAlert tone="error" title="องค์กรที่ไม่จด VAT ออกใบกำกับภาษีไม่ได้">
                เมื่อบันทึก ระบบจะไม่ให้ออกใบเสร็จรับเงิน/ใบกำกับภาษีจนกว่าจะกลับมาจด VAT — ตรวจกับใบทะเบียนภาษีมูลค่าเพิ่มก่อน
              </InlineAlert>
            )}

            <Field id="org-reason" label="เหตุผล" required error={errors.reason}>
              <Textarea
                maxLength={500}
                id="org-reason"
                value={form.reason}
                onChange={(event) => set('reason', event.target.value)}
                placeholder="เช่น กรอกข้อมูลจริงตามหนังสือรับรองบริษัทก่อนเริ่มใช้งาน"
              />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={imageKind !== null}
        onClose={() => setImageKind(null)}
        title={imageKind === null ? '' : IMAGE_CONFIG[imageKind].modalTitle}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImageKind(null)} disabled={logoSaving}>
              ยกเลิก
            </Button>
            <Button
              onClick={() => {
                if (imageKind !== null) void saveImage(imageKind, profile.organizationId)
              }}
              loading={logoSaving}
            >
              {imageKind === null ? 'บันทึก' : `บันทึก${IMAGE_CONFIG[imageKind].noun}`}
            </Button>
          </>
        }
      >
        {imageKind !== null && (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <div className="mb-1 font-semibold text-slate-600">เลือกไฟล์{IMAGE_CONFIG[imageKind].noun}</div>
              <div className="text-xs text-slate-400">{IMAGE_CONFIG[imageKind].hint}</div>
              <input
                type="file"
                accept={imageKind === 'logo' ? ORGANIZATION_LOGO_ACCEPT : ORGANIZATION_SIGNATURE_ACCEPT}
                aria-label={`ไฟล์${IMAGE_CONFIG[imageKind].noun}`}
                className="mt-3 text-sm text-slate-500"
                onChange={(event) => pickLogo(event.target.files?.[0] ?? null)}
              />
              {logoFile !== null && <div className="mt-2 text-xs text-slate-600">{logoFile.name}</div>}
            </div>
            {logoError !== null && (
              <InlineAlert tone="error" title={`อัปโหลด${IMAGE_CONFIG[imageKind].noun}ไม่ได้`}>
                {logoError}
              </InlineAlert>
            )}
            <Field id="org-image-reason" label="เหตุผล" required>
              <Textarea
                maxLength={500}
                id="org-image-reason"
                value={logoReason}
                onChange={(event) => setLogoReason(event.target.value)}
                placeholder={IMAGE_CONFIG[imageKind].reasonPlaceholder}
              />
            </Field>
            <div className="text-xs text-slate-500">{IMAGE_CONFIG[imageKind].note}</div>
          </div>
        )}
      </Modal>

      <ReasonConfirmModal
        maxLength={REASON_MAX}
        open={removeKind !== null}
        title={removeKind === null ? '' : IMAGE_CONFIG[removeKind].removeTitle}
        description={removeKind === null ? '' : IMAGE_CONFIG[removeKind].removeDescription}
        confirmLabel={removeKind === null ? 'ลบ' : `ลบ${IMAGE_CONFIG[removeKind].noun}`}
        loading={removing}
        reason={removeReason}
        onReasonChange={setRemoveReason}
        onClose={() => setRemoveKind(null)}
        onConfirm={() => {
          if (removeKind !== null) void removeImage(removeKind)
        }}
      />
    </Card>
  )
}
