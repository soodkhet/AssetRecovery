/**
 * สร้าง `lib/address/data/thai-postal.json` จากชุดข้อมูล kongvut/thai-province-data (MIT)
 * — มติ PO 03/10/2569 (UAT Q19, BUG-036) · license + ที่มา: `lib/address/data/THIRD_PARTY_LICENSE.md`
 *
 * ใช้: `pnpm tsx scripts/build-thai-postal-data.ts <path>/province_with_district_and_sub_district.json`
 *
 * รูปแบบผลลัพธ์ (กะทัดรัด lookup ด้วยคีย์เดียว):
 *   { "10200": [["กรุงเทพมหานคร", "พระนคร", ["พระบรมมหาราชวัง", ...]], ...], ... }
 *   = รหัสไปรษณีย์ → รายการ [จังหวัด, อำเภอ/เขต, ตำบล/แขวง[]] (จัดกลุ่มตามอำเภอ)
 * ชื่อเก็บแบบ**ไม่มีคำนำหน้า** (ไม่มี "เขต/อำเภอ/แขวง/ตำบล") ให้ตรงกับค่าที่ `<AddressFields>`
 * และข้อมูลเคสใช้อยู่ (เช่น `กรุงเทพมหานคร` · `จตุจักร` · `เมืองนนทบุรี`)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface LocalizedName {
  th: string
}
interface SourceSubDistrict {
  zip_code: number | null
  name: LocalizedName
  deleted_at: string | null
}
interface SourceDistrict {
  name: LocalizedName
  deleted_at: string | null
  sub_districts: SourceSubDistrict[]
}
interface SourceProvince {
  name: LocalizedName
  deleted_at: string | null
  districts: SourceDistrict[]
}

type PostalGroup = [province: string, district: string, subdistricts: string[]]

const OUTPUT = resolve(import.meta.dirname, '../lib/address/data/thai-postal.json')

function main(): void {
  const source = process.argv[2]
  if (source === undefined) {
    console.error('usage: tsx scripts/build-thai-postal-data.ts <province_with_district_and_sub_district.json>')
    process.exit(1)
  }
  const provinces = JSON.parse(readFileSync(source, 'utf8')) as SourceProvince[]

  const byCode = new Map<string, PostalGroup[]>()
  let rows = 0
  for (const province of provinces) {
    if (province.deleted_at !== null) continue
    const provinceName = province.name.th.trim()
    for (const district of province.districts) {
      if (district.deleted_at !== null) continue
      const districtName = district.name.th.trim()
      for (const sub of district.sub_districts) {
        if (sub.deleted_at !== null || sub.zip_code === null) continue
        const code = String(sub.zip_code).padStart(5, '0')
        if (!/^\d{5}$/.test(code)) throw new Error(`รหัสไปรษณีย์ผิดรูปแบบ: ${code}`)
        const groups = byCode.get(code) ?? []
        let group = groups.find(([p, d]) => p === provinceName && d === districtName)
        if (group === undefined) {
          group = [provinceName, districtName, []]
          groups.push(group)
        }
        const subName = sub.name.th.trim()
        if (!group[2].includes(subName)) {
          group[2].push(subName)
          rows += 1
        }
        byCode.set(code, groups)
      }
    }
  }

  // หนึ่งบรรทัดต่อรหัส เรียงตามรหัส — diff อ่านง่ายเมื่อสร้างซ้ำ
  const codes = [...byCode.keys()].sort()
  const lines = codes.map((code) => `${JSON.stringify(code)}:${JSON.stringify(byCode.get(code))}`)
  writeFileSync(OUTPUT, `{\n${lines.join(',\n')}\n}\n`, 'utf8')
  console.log(`wrote ${OUTPUT} — ${codes.length} รหัส · ${rows} ตำบล/แขวง`)
}

main()
