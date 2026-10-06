import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTER_BRANDS,
  DEFAULT_RECENT_YEARS,
  buildCatalogFilter,
  buildCatalogMatcher,
  classifyDeviceKind,
  cleanBrandList,
  deviceSnapshotText,
  extractReleaseYear,
  isBrandVisible,
  isModelVisible,
  minVisibleReleaseYear,
  normalizeCatalogName,
  parseBrandListText,
  planModelUpsert,
  stripBrandPrefix,
  type ExistingModelRow,
} from '@/lib/device-catalog/catalog'

/** แคตตาล็อก Model Phone — ส่วน pure (มติ PO U155 → U159 · U166) */

const NOW = new Date('2026-10-07T05:00:00Z')

describe('ชื่อและการจับคู่', () => {
  it('normalize ไม่สนตัวพิมพ์/ช่องว่าง/ขีด/จุด', () => {
    expect(normalizeCatalogName('Galaxy  S24 Ultra')).toBe('galaxys24ultra')
    expect(normalizeCatalogName('GALAXY-S24-ULTRA')).toBe('galaxys24ultra')
    expect(normalizeCatalogName('Redmi Note 13 Pro+')).toBe('redminote13pro+')
  })

  it('ตัดชื่อแบรนด์นำหน้าชื่อรุ่น และข้อความ snapshot ไม่ซ้ำแบรนด์', () => {
    expect(stripBrandPrefix('Samsung', 'Samsung Galaxy A55')).toBe('Galaxy A55')
    expect(stripBrandPrefix('Apple', 'iPhone 16')).toBe('iPhone 16')
    expect(stripBrandPrefix('Samsung', 'Samsung')).toBe('Samsung')
    expect(deviceSnapshotText('Samsung', 'Galaxy A55')).toBe('Samsung Galaxy A55')
    expect(deviceSnapshotText('Apple', 'Apple iPhone 16')).toBe('Apple iPhone 16')
  })

  it('จัดประเภททรัพย์จากชื่อ — ไม่กรองทิ้ง (U157)', () => {
    expect(classifyDeviceKind('iPad Pro 13 (2024)')).toBe('tablet')
    expect(classifyDeviceKind('Galaxy Tab S9')).toBe('tablet')
    expect(classifyDeviceKind('MatePad 11.5')).toBe('tablet')
    expect(classifyDeviceKind('Redmi Pad SE')).toBe('tablet')
    expect(classifyDeviceKind('Galaxy A55')).toBe('smartphone')
    expect(classifyDeviceKind('Watch Ultra')).toBe('smartphone')
  })

  it('ปีที่ออกจากข้อความ — นอกช่วง = null', () => {
    expect(extractReleaseYear('2023, February 01')).toBe(2023)
    expect(extractReleaseYear('Available. Released 2024, March')).toBe(2024)
    expect(extractReleaseYear('ไม่ทราบ')).toBeNull()
    expect(extractReleaseYear(null)).toBeNull()
  })

  it('ตัวจับคู่ข้อความนำเข้า: แบรนด์+รุ่น หรือรุ่นเฉย ๆ · กำกวม/ประเภทไม่ตรง = ไม่จับ', () => {
    const match = buildCatalogMatcher([
      { modelId: 'a', assetKind: 'smartphone', brandName: 'Samsung', modelName: 'Galaxy A55' },
      { modelId: 'b', assetKind: 'tablet', brandName: 'Apple', modelName: 'iPad Air' },
      { modelId: 'c', assetKind: 'smartphone', brandName: 'Xiaomi', modelName: 'Note 13' },
      { modelId: 'd', assetKind: 'smartphone', brandName: 'Redmi', modelName: 'Note 13' },
    ])
    expect(match('samsung galaxy a55', 'smartphone')?.modelId).toBe('a')
    expect(match('SAMSUNG-GALAXY-A55', null)?.modelId).toBe('a')
    expect(match('Galaxy A55', null)?.modelId).toBe('a')
    expect(match('iPad Air', 'smartphone')).toBeNull()
    expect(match('Note 13', null)).toBeNull()
    expect(match('Redmi Note 13', null)?.modelId).toBe('d')
    expect(match('Nokia 3310', null)).toBeNull()
  })
})

describe('ตัวกรองการแสดง + การตั้งด้วยมือ (U159)', () => {
  const filter = buildCatalogFilter(['Samsung', 'Xiaomi'], DEFAULT_RECENT_YEARS, NOW)

  it('N ปีล่าสุดนับปีนี้ด้วย — 5 ปีในปี 2026 = 2022 ขึ้นไป', () => {
    expect(minVisibleReleaseYear(NOW, 5)).toBe(2022)
    expect(filter.minReleaseYear).toBe(2022)
  })

  it('แบรนด์: ไม่ตั้งด้วยมือ = ตามรายชื่อ · ตั้งด้วยมือชนะเสมอ', () => {
    expect(isBrandVisible({ manualStatus: null, nameKey: 'samsung' }, filter)).toBe(true)
    expect(isBrandVisible({ manualStatus: null, nameKey: 'blu' }, filter)).toBe(false)
    expect(isBrandVisible({ manualStatus: 'hidden', nameKey: 'samsung' }, filter)).toBe(false)
    expect(isBrandVisible({ manualStatus: 'active', nameKey: 'blu' }, filter)).toBe(true)
  })

  it('รุ่น: ปิดแบรนด์ = ไม่แสดงทุกรุ่น แม้ตั้งรุ่นให้แสดง', () => {
    expect(isModelVisible({ manualStatus: 'active', releaseYear: 2025 }, false, filter)).toBe(false)
  })

  it('U166 — ไม่ทราบปี: รุ่นจากฐาน TAC = ไม่แสดง · รุ่นที่เพิ่มเอง = แสดง', () => {
    expect(isModelVisible({ manualStatus: null, releaseYear: null, source: 'tacdb' }, true, filter)).toBe(false)
    expect(isModelVisible({ manualStatus: null, releaseYear: null, source: 'manual' }, true, filter)).toBe(true)
    expect(isModelVisible({ manualStatus: 'active', releaseYear: null, source: 'tacdb' }, true, filter)).toBe(true)
    expect(isModelVisible({ manualStatus: null, releaseYear: 2024, source: 'tacdb' }, true, filter)).toBe(true)
  })

  it('รุ่น: ไม่ตั้งด้วยมือ = ตามปี (ไม่ทราบปี = แสดง) · ตั้งด้วยมือชนะตัวกรองปี', () => {
    expect(isModelVisible({ manualStatus: null, releaseYear: 2022 }, true, filter)).toBe(true)
    expect(isModelVisible({ manualStatus: null, releaseYear: 2021 }, true, filter)).toBe(false)
    expect(isModelVisible({ manualStatus: null, releaseYear: null }, true, filter)).toBe(true)
    expect(isModelVisible({ manualStatus: 'active', releaseYear: 2015 }, true, filter)).toBe(true)
    expect(isModelVisible({ manualStatus: 'hidden', releaseYear: 2026 }, true, filter)).toBe(false)
  })

  it('เปลี่ยนตัวกรองแล้วผลเปลี่ยนทันที แต่ค่าที่ตั้งด้วยมือคงผลเดิม', () => {
    const wider = buildCatalogFilter(['Samsung', 'Xiaomi', 'BLU'], 10, NOW)
    expect(isBrandVisible({ manualStatus: null, nameKey: 'blu' }, wider)).toBe(true)
    expect(isModelVisible({ manualStatus: null, releaseYear: 2018 }, true, wider)).toBe(true)
    expect(isBrandVisible({ manualStatus: 'hidden', nameKey: 'blu' }, wider)).toBe(false)
    expect(isModelVisible({ manualStatus: 'hidden', releaseYear: 2025 }, true, wider)).toBe(false)
  })

  it('รายชื่อแบรนด์เริ่มต้นครบตามมติ (รวมแบรนด์ย่อย Redmi/POCO/HMD/nubia)', () => {
    for (const name of ['Samsung', 'Apple', 'Xiaomi', 'Redmi', 'POCO', 'Nokia', 'HMD', 'ZTE', 'nubia', 'itel', 'Lenovo', 'Nothing']) {
      expect(DEFAULT_FILTER_BRANDS).toContain(name)
    }
    expect(new Set(DEFAULT_FILTER_BRANDS.map(normalizeCatalogName)).size).toBe(DEFAULT_FILTER_BRANDS.length)
  })

  it('ทำความสะอาดรายชื่อแบรนด์ — ตัดว่าง/ซ้ำแบบไม่สนตัวพิมพ์ คงลำดับ', () => {
    expect(cleanBrandList([' Samsung ', 'samsung', '', 'OPPO'])).toEqual(['Samsung', 'OPPO'])
    expect(parseBrandListText('Samsung\nOPPO, vivo\n\n')).toEqual(['Samsung', 'OPPO', 'vivo'])
  })
})

describe('แผน upsert ของ job — idempotent + ไม่ทับการตั้งของผู้ดูแล', () => {
  const row = (over: Partial<ExistingModelRow>): ExistingModelRow => ({
    id: 'm1',
    externalId: 'ext-1',
    nameKey: 'galaxya55',
    name: 'Galaxy A55',
    releaseYear: 2024,
    nameEditedAt: null,
    ...over,
  })

  it('ไม่มีแถวเดิม = สร้าง', () => {
    expect(planModelUpsert([], { externalId: 'ext-1', name: ' Galaxy  A55 ', releaseYear: 2024 })).toEqual({
      kind: 'create',
      name: 'Galaxy A55',
      nameKey: 'galaxya55',
      externalId: 'ext-1',
      releaseYear: 2024,
    })
  })

  it('ข้อมูลเดิมครบ = ไม่ทำอะไร (รันซ้ำไม่เกิดแถวซ้ำ)', () => {
    expect(planModelUpsert([row({})], { externalId: 'ext-1', name: 'Galaxy A55', releaseYear: 2024 }).kind).toBe('unchanged')
  })

  it('จับคู่ด้วยชื่อแล้วเติม external id/ปีที่ยังว่าง', () => {
    const plan = planModelUpsert([row({ externalId: null, releaseYear: null })], {
      externalId: 'ext-1',
      name: 'galaxy a55',
      releaseYear: 2024,
    })
    expect(plan).toMatchObject({ kind: 'update', id: 'm1', data: { externalId: 'ext-1', releaseYear: 2024 } })
  })

  it('ผู้ดูแลแก้ชื่อแล้ว — job ไม่ทับชื่อ (จับคู่ด้วย external id)', () => {
    const plan = planModelUpsert([row({ name: 'A55 (TH)', nameKey: 'a55(th)', nameEditedAt: NOW })], {
      externalId: 'ext-1',
      name: 'Galaxy A55',
      releaseYear: 2024,
    })
    expect(plan.kind).toBe('unchanged')
  })

  it('ชื่อจากต้นทางเปลี่ยน (ผู้ดูแลยังไม่แก้) = อัปเดตชื่อ', () => {
    const plan = planModelUpsert([row({})], { externalId: 'ext-1', name: 'Galaxy A55 5G', releaseYear: 2024 })
    expect(plan).toMatchObject({ kind: 'update', data: { name: 'Galaxy A55 5G', nameKey: 'galaxya555g' } })
  })
})
