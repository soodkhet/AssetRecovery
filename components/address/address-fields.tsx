'use client'

import { useId, useRef, useState } from 'react'
import { Field, Input, Select } from '@/components/ui'
import {
  THAI_PROVINCE_REGIONS,
  commonPostalArea,
  districtOptions,
  subdistrictOptions,
  isValidPostalCode,
  lookupPostalCode,
  type PostalCodeArea,
} from '@/lib/address/thai-address'
import type { AddressValue } from '@/lib/address/address-value'
import { digitsOnly } from '@/lib/cases/case'

/**
 * บล็อกที่อยู่ 1 ชุด (`38` §6.1.2) — **shared component ใช้ซ้ำทุกที่ที่กรอกที่อยู่**
 * (เคส 3 ที่อยู่ของไฟล์ 38 · ไฟล์ 41 ตอนจุดลงพื้นที่) ห้ามเขียนช่องที่อยู่เองในโมดูลตัวเอง
 *
 * ลำดับฟิลด์บังคับตาม §6.1.2: บ้านเลขที่ → รหัสไปรษณีย์ (auto-complete) → จังหวัด → อำเภอ → ตำบล
 * - กรอกรหัสไปรษณีย์ครบ 5 หลัก → ค้นอัตโนมัติ (`lookupPostalCode()` — ข้อมูลจริงทั้งประเทศ)
 *   พบพื้นที่เดียว = เติม 3 ระดับให้ · พบหลายตำบล (ปกติของรหัสไปรษณีย์ไทย) = เติมส่วนที่ร่วมกัน
 *   (จังหวัด/อำเภอ) แล้วแสดง dropdown "เลือกตำบล/แขวงของรหัสนี้" ให้เลือก
 * - หาไม่เจอ = ไม่ block ให้กรอกเองต่อทีละขั้น (ตามที่ §6.1.2 กำหนดไว้)
 * - จังหวัดที่ยังไม่มี master data อำเภอ/ตำบล (Open Item `38` §22 ข้อ 5) สลับเป็นช่องพิมพ์เอง
 *   ส่วนจังหวัดที่มีข้อมูลใช้ `<datalist>` ช่วยเลือกแบบ cascading
 * - เปลี่ยนจังหวัด = ล้างอำเภอ/ตำบลเสมอ (กันค่าค้างข้ามจังหวัด) · เปลี่ยนอำเภอ = ล้างตำบล
 *
 * ⚠️ ไม่มี `useEffect` ในไฟล์นี้โดยตั้งใจ — ทุกการเปลี่ยนค่าเกิดจาก event ของผู้ใช้เท่านั้น
 * (กับดัก `react-hooks/set-state-in-effect` ใน REUSE_INDEX)
 */

type LookupState = 'idle' | 'loading' | 'found' | 'multiple' | 'notfound' | 'error'

function areaKey(area: Pick<PostalCodeArea, 'province' | 'district' | 'subdistrict'>): string {
  return `${area.province}|${area.district}|${area.subdistrict}`
}

const LOOKUP_HINT: Readonly<Record<LookupState, string>> = {
  idle: 'กรอกรหัสไปรษณีย์ 5 หลักเพื่อให้ระบบเติมจังหวัด/อำเภอ/ตำบลให้ หรือเลือกเองทีละขั้นก็ได้',
  loading: 'กำลังค้นหารหัสไปรษณีย์…',
  found: 'เติมจังหวัด/อำเภอ/ตำบลจากรหัสไปรษณีย์แล้ว — แก้ไขเองได้',
  multiple: 'รหัสไปรษณีย์นี้ครอบคลุมหลายตำบล — เลือกตำบล/แขวงจากรายการด้านล่าง หรือพิมพ์เองในช่องตำบล',
  notfound: 'ไม่พบรหัสไปรษณีย์นี้ในระบบ — กรุณาเลือกจังหวัด/อำเภอ/ตำบลเอง',
  error: 'โหลดข้อมูลรหัสไปรษณีย์ไม่สำเร็จ — กรุณาเลือกจังหวัด/อำเภอ/ตำบลเอง',
}

export interface AddressFieldsProps {
  label: string
  value: AddressValue
  onChange: (next: AddressValue) => void
  /** ที่อยู่ปัจจุบันเป็นช่องเดียวที่ใช้ตัดสิน routing ทีม (`38` §6.1.2) — ไฮไลต์ + แจ้งผู้กรอก */
  routing?: boolean
  /**
   * ช่องที่ต้องกรอกก่อนส่งตรวจ (แสดงดอกจัน) — **ต้องมาจากค่าคงที่ของ business logic ฝั่ง lib**
   * (เช่น `CASE_REQUIRED_ADDRESS_FIELDS`) ห้ามกำหนดเองที่หน้าจอ เพื่อให้ FE/BE บังคับชุดเดียวกัน (UAT BUG-024)
   * ไม่ส่ง = ไม่บังคับทุกช่อง
   */
  requiredFields?: readonly (keyof AddressValue)[]
  disabled?: boolean
  /** error รายฟิลด์จาก API/Zod — คีย์เป็นชื่อฟิลด์ของที่อยู่ (`province`, `postalCode`, …) */
  errors?: Partial<Record<keyof AddressValue, string>>
}

export function AddressFields({
  label,
  value,
  onChange,
  routing = false,
  requiredFields = [],
  disabled = false,
  errors,
}: AddressFieldsProps) {
  const fieldId = useId()
  const isRequired = (field: keyof AddressValue): boolean => requiredFields.includes(field)
  const [lookup, setLookup] = useState<LookupState>('idle')
  const [choices, setChoices] = useState<readonly PostalCodeArea[]>([])
  /** รหัสล่าสุดที่สั่งค้น — กันผลค้นเก่าทับของใหม่ และกัน blur ค้นซ้ำทับตำบลที่ผู้ใช้เลือกไว้แล้ว */
  const lastLookupCode = useRef<string | null>(null)

  // staging E-017 — รวมพื้นที่จากรหัสไปรษณีย์ (ข้อมูลจริงทั้งประเทศ) เข้ากับชุดตัวอย่าง
  const districts = districtOptions(value.province, choices)
  const subdistricts = subdistrictOptions(value.province, value.district, choices)

  function patch(next: Partial<AddressValue>): void {
    onChange({ ...value, ...next })
  }

  /** ค้นรหัสไปรษณีย์แล้วเติม 3 ระดับ — เรียกตอนครบ 5 หลัก และตอน blur (รหัสเดิมไม่ค้นซ้ำ) */
  async function runLookup(code: string): Promise<void> {
    if (!isValidPostalCode(code)) {
      lastLookupCode.current = null
      setChoices([])
      setLookup('idle')
      return
    }
    if (lastLookupCode.current === code) return
    lastLookupCode.current = code
    setLookup('loading')
    let areas: readonly PostalCodeArea[]
    try {
      areas = await lookupPostalCode(code)
    } catch {
      if (lastLookupCode.current !== code) return
      lastLookupCode.current = null // ให้ลองใหม่ได้ตอน blur/พิมพ์ใหม่
      setChoices([])
      setLookup('error')
      return
    }
    if (lastLookupCode.current !== code) return // ผู้ใช้เปลี่ยนรหัสระหว่างรอ — ทิ้งผลเก่า
    if (areas.length === 0) {
      setChoices([])
      setLookup('notfound')
      return
    }
    // ค่าที่กรอกไว้ตรงกับพื้นที่หนึ่งของรหัสนี้อยู่แล้ว (เช่น แก้ไขเคสเดิม) → คงไว้ ไม่ล้าง
    const current = areas.find((area) => areaKey(area) === areaKey(value))
    const fill = current ?? commonPostalArea(areas)
    setChoices(areas.length > 1 ? areas : [])
    setLookup(areas.length > 1 && current === undefined ? 'multiple' : 'found')
    onChange({
      ...value,
      postalCode: code,
      province: fill.province,
      district: fill.district,
      subdistrict: fill.subdistrict,
    })
  }

  function onChooseArea(key: string): void {
    const area = choices.find((choice) => areaKey(choice) === key)
    if (area === undefined) return
    setLookup('found')
    patch({ province: area.province, district: area.district, subdistrict: area.subdistrict })
  }

  function onPostalChange(raw: string): void {
    const code = digitsOnly(raw).slice(0, 5)
    patch({ postalCode: code })
    if (code.length === 5) {
      void runLookup(code)
    } else {
      lastLookupCode.current = null
      if (choices.length > 0) setChoices([])
      if (lookup !== 'idle') setLookup('idle')
    }
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
          required={isRequired('detail')}
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
          required={isRequired('postalCode')}
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

      {choices.length > 1 && (
        <div className="mt-3">
          <Field id={`${fieldId}-postal-choice`} label={`เลือกตำบล/แขวงของรหัส ${value.postalCode}`}>
            <Select
              id={`${fieldId}-postal-choice`}
              value={choices.some((choice) => areaKey(choice) === areaKey(value)) ? areaKey(value) : ''}
              disabled={disabled}
              onChange={(event) => onChooseArea(event.target.value)}
            >
              <option value="">— เลือกตำบล/แขวง ({choices.length} รายการ) —</option>
              {choices.map((choice) => (
                <option key={areaKey(choice)} value={areaKey(choice)}>
                  {choice.subdistrict} · {choice.district} · {choice.province}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field id={`${fieldId}-province`} label="จังหวัด" required={isRequired('province')} error={errors?.province}>
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

        <Field id={`${fieldId}-district`} label="อำเภอ/เขต" required={isRequired('district')} error={errors?.district}>
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
          required={isRequired('subdistrict')}
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
          lookup === 'notfound' || lookup === 'error'
            ? 'mt-2 text-[11px] font-semibold text-amber-600'
            : 'mt-2 text-[11px] text-slate-400'
        }
      >
        {LOOKUP_HINT[lookup]}
      </p>
    </div>
  )
}
