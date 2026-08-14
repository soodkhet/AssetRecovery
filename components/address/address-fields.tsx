'use client'

import { useId, useState } from 'react'
import { Field, Input, Select } from '@/components/ui'
import {
  THAI_PROVINCE_REGIONS,
  getDistricts,
  getSubDistricts,
  isValidPostalCode,
  lookupPostalCode,
} from '@/lib/address/thai-address'
import type { AddressValue } from '@/lib/address/address-value'
import { digitsOnly } from '@/lib/cases/case'

/**
 * บล็อกที่อยู่ 1 ชุด (`38` §6.1.2) — **shared component ใช้ซ้ำทุกที่ที่กรอกที่อยู่**
 * (เคส 3 ที่อยู่ของไฟล์ 38 · ไฟล์ 41 ตอนจุดลงพื้นที่) ห้ามเขียนช่องที่อยู่เองในโมดูลตัวเอง
 *
 * ลำดับฟิลด์บังคับตาม §6.1.2: บ้านเลขที่ → รหัสไปรษณีย์ (auto-complete) → จังหวัด → อำเภอ → ตำบล
 * - กรอกรหัสไปรษณีย์ครบ 5 หลัก → ค้นอัตโนมัติ (`lookupPostalCode()`) แล้วเติม 3 ระดับให้
 * - หาไม่เจอ = ไม่ block ให้กรอกเองต่อทีละขั้น (ตามที่ §6.1.2 กำหนดไว้)
 * - จังหวัดที่ยังไม่มี master data อำเภอ/ตำบล (Open Item `38` §22 ข้อ 5) สลับเป็นช่องพิมพ์เอง
 *   ส่วนจังหวัดที่มีข้อมูลใช้ `<datalist>` ช่วยเลือกแบบ cascading
 * - เปลี่ยนจังหวัด = ล้างอำเภอ/ตำบลเสมอ (กันค่าค้างข้ามจังหวัด) · เปลี่ยนอำเภอ = ล้างตำบล
 *
 * ⚠️ ไม่มี `useEffect` ในไฟล์นี้โดยตั้งใจ — ทุกการเปลี่ยนค่าเกิดจาก event ของผู้ใช้เท่านั้น
 * (กับดัก `react-hooks/set-state-in-effect` ใน REUSE_INDEX)
 */

type LookupState = 'idle' | 'loading' | 'found' | 'notfound'

const LOOKUP_HINT: Readonly<Record<LookupState, string>> = {
  idle: 'กรอกรหัสไปรษณีย์ 5 หลักเพื่อให้ระบบเติมจังหวัด/อำเภอ/ตำบลให้ หรือเลือกเองทีละขั้นก็ได้',
  loading: 'กำลังค้นหารหัสไปรษณีย์…',
  found: 'เติมจังหวัด/อำเภอ/ตำบลจากรหัสไปรษณีย์แล้ว — แก้ไขเองได้',
  notfound: 'ไม่พบรหัสไปรษณีย์นี้ในระบบ — กรุณาเลือกจังหวัด/อำเภอ/ตำบลเอง',
}

export interface AddressFieldsProps {
  label: string
  value: AddressValue
  onChange: (next: AddressValue) => void
  /** ที่อยู่ปัจจุบันเป็นช่องเดียวที่ใช้ตัดสิน routing ทีม (`38` §6.1.2) — ไฮไลต์ + แจ้งผู้กรอก */
  routing?: boolean
  required?: boolean
  disabled?: boolean
  /** error รายฟิลด์จาก API/Zod — คีย์เป็นชื่อฟิลด์ของที่อยู่ (`province`, `postalCode`, …) */
  errors?: Partial<Record<keyof AddressValue, string>>
}

export function AddressFields({
  label,
  value,
  onChange,
  routing = false,
  required = false,
  disabled = false,
  errors,
}: AddressFieldsProps) {
  const fieldId = useId()
  const [lookup, setLookup] = useState<LookupState>('idle')

  const districts = getDistricts(value.province)
  const subdistricts = getSubDistricts(value.province, value.district)

  function patch(next: Partial<AddressValue>): void {
    onChange({ ...value, ...next })
  }

  /** ค้นรหัสไปรษณีย์แล้วเติม 3 ระดับ — เรียกตอนครบ 5 หลัก และตอน blur */
  async function runLookup(code: string): Promise<void> {
    if (!isValidPostalCode(code)) {
      setLookup('idle')
      return
    }
    setLookup('loading')
    const area = await lookupPostalCode(code)
    if (area === null) {
      setLookup('notfound')
      return
    }
    setLookup('found')
    onChange({
      ...value,
      postalCode: code,
      province: area.province,
      district: area.district,
      subdistrict: area.subdistrict,
    })
  }

  function onPostalChange(raw: string): void {
    const code = digitsOnly(raw).slice(0, 5)
    patch({ postalCode: code })
    if (code.length === 5) void runLookup(code)
    else if (lookup !== 'idle') setLookup('idle')
  }

  return (
    <div
      className={
        routing
          ? 'rounded-lg border border-blue-200 bg-blue-50/40 p-4'
          : 'rounded-lg border border-slate-200 p-4'
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold tracking-wide text-slate-600 uppercase">{label}</h4>
        {routing && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
            ใช้สำหรับ routing ทีม
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field
          className="sm:col-span-2"
          id={`${fieldId}-detail`}
          label="บ้านเลขที่ / หมู่บ้าน / ถนน"
          required={required}
          error={errors?.detail}
        >
          <Input
            id={`${fieldId}-detail`}
            value={value.detail}
            disabled={disabled}
            invalid={errors?.detail !== undefined}
            placeholder="รายละเอียดที่อยู่"
            onChange={(event) => patch({ detail: event.target.value })}
          />
        </Field>

        <Field
          id={`${fieldId}-postal`}
          label="รหัสไปรษณีย์"
          required={required}
          error={errors?.postalCode}
        >
          <Input
            id={`${fieldId}-postal`}
            value={value.postalCode}
            disabled={disabled}
            inputMode="numeric"
            maxLength={5}
            placeholder="5 หลัก"
            invalid={errors?.postalCode !== undefined}
            onChange={(event) => onPostalChange(event.target.value)}
            onBlur={(event) => void runLookup(event.target.value)}
          />
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field id={`${fieldId}-province`} label="จังหวัด" required={required} error={errors?.province}>
          <Select
            id={`${fieldId}-province`}
            value={value.province}
            disabled={disabled}
            invalid={errors?.province !== undefined}
            onChange={(event) => patch({ province: event.target.value, district: '', subdistrict: '' })}
          >
            <option value="">— เลือกจังหวัด —</option>
            {THAI_PROVINCE_REGIONS.map((group) => (
              <optgroup key={group.region} label={group.region}>
                {group.provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>

        <Field id={`${fieldId}-district`} label="อำเภอ/เขต" required={required} error={errors?.district}>
          <Input
            id={`${fieldId}-district`}
            list={districts.length > 0 ? `${fieldId}-district-options` : undefined}
            value={value.district}
            disabled={disabled || value.province === ''}
            invalid={errors?.district !== undefined}
            placeholder={value.province === '' ? 'เลือกจังหวัดก่อน' : 'พิมพ์หรือเลือกอำเภอ/เขต'}
            onChange={(event) => patch({ district: event.target.value, subdistrict: '' })}
          />
          {districts.length > 0 && (
            <datalist id={`${fieldId}-district-options`}>
              {districts.map((district) => (
                <option key={district} value={district} />
              ))}
            </datalist>
          )}
        </Field>

        <Field
          id={`${fieldId}-subdistrict`}
          label="ตำบล/แขวง"
          required={required}
          error={errors?.subdistrict}
        >
          <Input
            id={`${fieldId}-subdistrict`}
            list={subdistricts.length > 0 ? `${fieldId}-subdistrict-options` : undefined}
            value={value.subdistrict}
            disabled={disabled || value.district === ''}
            invalid={errors?.subdistrict !== undefined}
            placeholder={value.district === '' ? 'เลือกอำเภอก่อน' : 'พิมพ์หรือเลือกตำบล/แขวง'}
            onChange={(event) => patch({ subdistrict: event.target.value })}
          />
          {subdistricts.length > 0 && (
            <datalist id={`${fieldId}-subdistrict-options`}>
              {subdistricts.map((subdistrict) => (
                <option key={subdistrict} value={subdistrict} />
              ))}
            </datalist>
          )}
        </Field>
      </div>

      <p
        className={
          lookup === 'notfound'
            ? 'mt-2 text-[11px] font-semibold text-amber-600'
            : 'mt-2 text-[11px] text-slate-400'
        }
      >
        {LOOKUP_HINT[lookup]}
      </p>
    </div>
  )
}
