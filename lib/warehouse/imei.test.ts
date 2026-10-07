import { describe, expect, it } from 'vitest'
import {
  IMEI_FORMAT_MESSAGE,
  IMEI_TYPO_WARNING_MESSAGE,
  assetIdentifierWarning,
  compareAssetIdentity,
  looksLikeMistypedImei,
  identityMatches,
  imeiInputSchema,
  imeiSearchKey,
  isImeiLikeIdentifier,
  isValidImei,
  parseImei,
  embeddedImeiCandidate,
  embeddedImeiCandidates,
  IMEI_MULTIPLE_WARNING_MESSAGE,
  IMEI_EMBEDDED_WARNING_MESSAGE,
  imeiPickerCandidates,
  multipleImeiInputCandidates,
} from '@/lib/warehouse/imei'

/**
 * `44` §6.5 · §10 — รับเข้า: ตัดเฉพาะช่องว่าง/ขีด/จุด → ต้องเหลือตัวเลข 15 หลักพอดี (มติ PO U24 · BUG-078)
 * เทียบ: **exact match ทุกหลัก** บนค่าที่ normalize แล้ว ห้าม fuzzy
 * (T03 ของ §17: ไม่ตรงก็ยังรับเข้าได้ แต่ผลการเทียบต้องเป็น "ไม่ตรง" เสมอ)
 */

const IMEI = '355000000000001'

describe('parseImei — ตัดเฉพาะตัวคั่น ช่องว่าง/ขีด/จุด (มติ PO U24)', () => {
  it.each([
    [' 356938035643809 ', '356938035643809'],
    ['35-693803-564380-9', '356938035643809'],
    ['356938.035643809', '356938035643809'],
    ['35 693803 564380 9', '356938035643809'],
    ['\t356938035643809\u00a0', '356938035643809'],
    ['35.6938-03 5643809', '356938035643809'],
    ['356938035643809', '356938035643809'],
  ])('%j → %s', (input, expected) => {
    expect(parseImei(input)).toBe(expected)
  })

  it.each([
    ['35693803564380O', 'มีตัวอักษร O แทนเลข 0'],
    ['356938035643809/01', 'มีอักขระอื่น (/) — ห้ามตัดทิ้งเงียบ ๆ'],
    ['35693803564380', '14 หลัก'],
    ['3569380356438090', '16 หลัก'],
    ['35_693803_564380_9', 'ขีดล่างไม่ใช่ตัวคั่นที่ยอมรับ'],
    ['35,693803,564380,9', 'จุลภาคไม่ใช่ตัวคั่นที่ยอมรับ'],
    ['๓๕๖๙๓๘๐๓๕๖๔๓๘๐๙', 'เลขไทยไม่ใช่ตัวเลข IMEI'],
    ['', 'ว่าง'],
    ['- . -', 'มีแต่ตัวคั่น'],
  ])('%j → null (%s)', (input) => {
    expect(parseImei(input)).toBeNull()
  })

  it('ไม่ใช่ string = null · ไม่ตรวจ Luhn (เลขที่ check digit ผิดยังผ่านรูปแบบ)', () => {
    expect(parseImei(null)).toBeNull()
    expect(parseImei(undefined)).toBeNull()
    expect(parseImei('356938035643800')).toBe('356938035643800')
  })
})

describe('imeiInputSchema (Zod ร่วม FE/BE)', () => {
  it('normalize เป็น 15 หลักล้วน · ว่าง = null', () => {
    expect(imeiInputSchema.parse('35-693803-564380-9')).toBe('356938035643809')
    expect(imeiInputSchema.parse('   ')).toBeNull()
    expect(imeiInputSchema.parse(null)).toBeNull()
    expect(imeiInputSchema.parse(undefined)).toBeNull()
  })

  it('รูปแบบผิด = issue พร้อมข้อความรูปแบบ (ไม่ตัดทิ้ง)', () => {
    const result = imeiInputSchema.safeParse('356938035643809/01')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(IMEI_FORMAT_MESSAGE)
    expect(imeiInputSchema.safeParse('35693803564380').success).toBe(false)
  })
})

describe('isImeiLikeIdentifier / imeiSearchKey', () => {
  it('ไม่มีตัวอักษร = ความพยายามกรอก IMEI · มีตัวอักษร = serial', () => {
    expect(isImeiLikeIdentifier('35-693803-564380-9')).toBe(true)
    expect(isImeiLikeIdentifier('356938035643809/01')).toBe(true)
    expect(isImeiLikeIdentifier('DMPX1234ABCD')).toBe(false)
    expect(isImeiLikeIdentifier('  ')).toBe(false)
  })

  it('คำค้น IMEI มีตัวคั่น → ค่า normalize · อย่างอื่นคงเดิม (trim)', () => {
    expect(imeiSearchKey(' 35-693803-564380-9 ')).toBe('356938035643809')
    expect(imeiSearchKey(' HC-001 ')).toBe('HC-001')
    expect(imeiSearchKey('35693803564380')).toBe('35693803564380')
  })
})

describe('isValidImei', () => {
  it('ผ่านเฉพาะตัวเลข 15 หลักพอดี', () => {
    expect(isValidImei(IMEI)).toBe(true)
    expect(isValidImei('35500000000000')).toBe(false) // 14 หลัก
    expect(isValidImei('3550000000000012')).toBe(false) // 16 หลัก
    expect(isValidImei('35500000000000A')).toBe(false)
    expect(isValidImei(null)).toBe(false)
  })
})

describe('identityMatches — exact บนค่าที่ normalize แล้ว (ไม่ normalize ซ้ำที่จุดเทียบ)', () => {
  it('ค่าเท่ากันเป๊ะเท่านั้นถือว่าตรง', () => {
    expect(identityMatches(IMEI, IMEI)).toBe(true)
  })

  it('ต่างกัน 1 หลัก = ไม่ตรง', () => {
    expect(identityMatches(IMEI, '355000000000002')).toBe(false)
  })

  it('จุดเทียบไม่ normalize เอง — ค่าดิบที่ยังไม่ผ่าน parseImei() ไม่ถือว่าตรง', () => {
    expect(identityMatches(IMEI, ` ${IMEI} `)).toBe(false)
    expect(identityMatches(IMEI, '35500-0000000001')).toBe(false)
    expect(identityMatches('SN-ab12', 'SN-AB12')).toBe(false)
  })

  it('ค่าใดว่าง = ไม่ตรง (ยืนยันไม่ได้ ≠ ตรง)', () => {
    expect(identityMatches(IMEI, null)).toBe(false)
    expect(identityMatches(null, IMEI)).toBe(false)
  })
})

describe('compareAssetIdentity', () => {
  it('สัญญามี IMEI + ตรวจตรง = ตรง', () => {
    const result = compareAssetIdentity(
      { imeiContract: IMEI, serialContract: null },
      { imeiActual: IMEI, serialActual: null },
    )
    expect(result).toMatchObject({ matched: true, comparable: true, mismatchedFields: [] })
  })

  it('สัญญามี IMEI + ตรวจไม่ตรง = ไม่ตรง และระบุช่องที่พลาด', () => {
    const result = compareAssetIdentity(
      { imeiContract: IMEI, serialContract: null },
      { imeiActual: '355000000000999', serialActual: null },
    )
    expect(result.matched).toBe(false)
    expect(result.mismatchedFields).toEqual(['imei'])
  })

  it('เครื่องไม่มี IMEI (A6) เทียบด้วย serial แทน', () => {
    const contract = { imeiContract: null, serialContract: 'SN-TAB-001' }
    expect(compareAssetIdentity(contract, { imeiActual: null, serialActual: 'SN-TAB-001' }).matched).toBe(true)
    expect(compareAssetIdentity(contract, { imeiActual: null, serialActual: 'SN-TAB-002' }).matched).toBe(false)
  })

  it('เทียบเฉพาะช่องที่สัญญามีค่า — serial ที่ธุรการกรอกเพิ่มไม่ทำให้ผลเพี้ยน', () => {
    const result = compareAssetIdentity(
      { imeiContract: IMEI, serialContract: null },
      { imeiActual: IMEI, serialActual: 'SN-ที่ไม่มีในสัญญา' },
    )
    expect(result.matched).toBe(true)
    expect(result.fields).toHaveLength(1)
  })

  it('สัญญามีทั้งสองช่อง ต้องตรงทั้งคู่', () => {
    const contract = { imeiContract: IMEI, serialContract: 'SN-1' }
    expect(compareAssetIdentity(contract, { imeiActual: IMEI, serialActual: 'SN-1' }).matched).toBe(true)
    const partial = compareAssetIdentity(contract, { imeiActual: IMEI, serialActual: 'SN-2' })
    expect(partial.matched).toBe(false)
    expect(partial.mismatchedFields).toEqual(['serial'])
  })

  it('ยังไม่กรอกค่าที่ตรวจจริง = ไม่ตรง (ต้องเตือน ไม่ใช่ผ่านเงียบ)', () => {
    const result = compareAssetIdentity(
      { imeiContract: IMEI, serialContract: null },
      { imeiActual: null, serialActual: null },
    )
    expect(result.matched).toBe(false)
    expect(result.comparable).toBe(true)
  })

  it('สัญญาไม่มีทั้ง IMEI และ serial = เทียบไม่ได้ (ข้อมูลเคสผิดปกติ)', () => {
    const result = compareAssetIdentity(
      { imeiContract: null, serialContract: null },
      { imeiActual: IMEI, serialActual: null },
    )
    expect(result).toMatchObject({ matched: false, comparable: false, fields: [] })
  })
})

// ── มติ PO U54 — Serial ที่ดูเหมือน IMEI พิมพ์ผิด: เตือน ไม่บล็อก ───────────────────────

describe('looksLikeMistypedImei / assetIdentifierWarning (U54)', () => {
  it('ตัวเลข 14 ตัว + O/o/I/l/S/B/Z 1 ตัว (ยาว 15) ⇒ เตือน', () => {
    for (const value of [
      '35693803564380O',
      '3569380356438o9',
      '35693803564I809',
      '356938035643l09',
      'S56938035643809',
      '3569380356438B9',
      '35693803564380Z',
    ]) {
      expect(looksLikeMistypedImei(value)).toBe(true)
    }
  })

  it('ตัวเลข 13 ตัว + ตัวอักษรสับสน 2 ตัว และมีตัวคั่นชุดเดียวกับ IMEI ⇒ เตือน', () => {
    expect(looksLikeMistypedImei('35-69380O-564380-l')).toBe(true)
    expect(looksLikeMistypedImei('35 693803 5643O0 9')).toBe(true)
    expect(assetIdentifierWarning('35.693803.56438O.9')).toBe(IMEI_TYPO_WARNING_MESSAGE)
  })

  it('ไม่เตือน: IMEI ถูกต้อง · Serial ทั่วไป · ตัวอักษรอื่น · ความยาวไม่ใช่ 15 · ตัวอักษรเกิน 2 ตัว · ว่าง', () => {
    expect(looksLikeMistypedImei('356938035643809')).toBe(false)
    expect(looksLikeMistypedImei('F2LXK1ABHG7F')).toBe(false)
    expect(looksLikeMistypedImei('35693803564380X')).toBe(false)
    expect(looksLikeMistypedImei('3569380356438O')).toBe(false)
    expect(looksLikeMistypedImei('3569380356438O09')).toBe(false)
    expect(looksLikeMistypedImei('356938035643OOO')).toBe(false)
    expect(looksLikeMistypedImei('35693803564380/O')).toBe(false)
    expect(looksLikeMistypedImei('')).toBe(false)
    expect(looksLikeMistypedImei(null)).toBe(false)
    expect(assetIdentifierWarning('F2LXK1ABHG7F')).toBeNull()
  })

  it('ข้อความเตือนตรงมติ และไม่มีเลขอ้างอิงสเปค', () => {
    expect(IMEI_TYPO_WARNING_MESSAGE).toBe('ดูเหมือน IMEI ที่มีตัวอักษรปน — ตรวจอีกครั้ง')
  })
})

describe('embeddedImeiCandidate / assetIdentifierWarning — IMEI ปนข้อความ (preship PS-005)', () => {
  it('พบ IMEI 15 หลักชุดเดียวในข้อความ (label นำหน้า / หมายเหตุต่อท้าย / มีตัวคั่น)', () => {
    expect(embeddedImeiCandidate('IMEI: 356938035643809')).toBe('356938035643809')
    expect(embeddedImeiCandidate('356938035643809 (เครื่องลูกค้า)')).toBe('356938035643809')
    expect(embeddedImeiCandidate('IMEI 35-693803-564380-9')).toBe('356938035643809')
  })

  it('ไม่เสนอเมื่อไม่ใช่ Serial / ไม่มีเลข 15 หลักพอดี / มีหลายชุด', () => {
    expect(embeddedImeiCandidate('356938035643809')).toBeNull()
    expect(embeddedImeiCandidate('SN: C02XK1ABJG5J')).toBeNull()
    expect(embeddedImeiCandidate('IMEI 35693803564380')).toBeNull()
    expect(embeddedImeiCandidate('IMEI1 356938035643809 IMEI2 356938035643817')).toBeNull()
    expect(embeddedImeiCandidate('')).toBeNull()
    expect(embeddedImeiCandidate(null)).toBeNull()
  })

  it('เตือนไม่บล็อก — ค่ายังเป็น Serial ตามที่กรอก (ไม่ตัดให้เงียบ ๆ)', () => {
    expect(assetIdentifierWarning('IMEI: 356938035643809')).toBe(IMEI_EMBEDDED_WARNING_MESSAGE)
    expect(assetIdentifierWarning('SN: C02XK1ABJG5J')).toBeNull()
    expect(isImeiLikeIdentifier('IMEI: 356938035643809')).toBe(false)
  })
})

describe('embeddedImeiCandidates — เครื่องสองซิม (preship R2-014)', () => {
  it('พบทุกเลข · คั่นด้วย label / จุลภาค / ทับ / ช่องว่างล้วน', () => {
    expect(embeddedImeiCandidates('IMEI1: 356938035643809 IMEI2: 356938035643817')).toEqual([
      '356938035643809',
      '356938035643817',
    ])
    expect(embeddedImeiCandidates('IMEI 356938035643809, 356938035643817')).toHaveLength(2)
    expect(embeddedImeiCandidates('IMEI 356938035643809 / 356938035643817')).toHaveLength(2)
    expect(embeddedImeiCandidates('IMEI 356938035643809 356938035643817')).toHaveLength(2)
  })

  it('ไม่มีตัวอักษรเลย ⇒ เป็นช่อง IMEI ที่ต้องผ่าน parseImei (ปฏิเสธ) ไม่ใช่ Serial ที่ต้องเสนอ', () => {
    expect(embeddedImeiCandidates('356938035643809 / 356938035643817')).toEqual([])
  })

  it('ชุดที่ช่องว่างคั่นแต่ไม่ใช่ IMEI ครบทุกท่อน ⇒ ไม่เดาแยกเอง', () => {
    expect(embeddedImeiCandidates('IMEI 3569380356438 0935643817')).toEqual([])
  })

  it('หลายเลข ⇒ เตือนให้เลือกเลขหลัก (ไม่บล็อก ไม่เลือกให้)', () => {
    expect(assetIdentifierWarning('IMEI1: 356938035643809 IMEI2: 356938035643817')).toBe(IMEI_MULTIPLE_WARNING_MESSAGE)
    expect(embeddedImeiCandidate('IMEI1: 356938035643809 IMEI2: 356938035643817')).toBeNull()
  })
})

describe('multipleImeiInputCandidates — คู่ IMEI ตัวเลขล้วน (preship R3-031)', () => {
  const pair = ['356938035643809', '356938035643817']

  it('คั่นด้วยช่องว่าง / ทับ / จุลภาค / ขึ้นบรรทัด ⇒ เสนอทั้งสองเลข', () => {
    expect(multipleImeiInputCandidates('356938035643809 356938035643817')).toEqual(pair)
    expect(multipleImeiInputCandidates('356938035643809/356938035643817')).toEqual(pair)
    expect(multipleImeiInputCandidates('356938035643809 / 356938035643817')).toEqual(pair)
    expect(multipleImeiInputCandidates('356938035643809, 356938035643817')).toEqual(pair)
    expect(multipleImeiInputCandidates('356938035643809\n356938035643817')).toEqual(pair)
    expect(multipleImeiInputCandidates('35-693803-564380-9 / 35-693803-564381-7')).toEqual(pair)
  })

  it('ทุกท่อนต้องผ่าน parseImei() พอดี — ไม่ครบ/เกิน/มีอักขระอื่น = ไม่เสนอ (CLAUDE.md ข้อ 10)', () => {
    expect(multipleImeiInputCandidates('35693803564380 356938035643817')).toEqual([])
    expect(multipleImeiInputCandidates('3569380356438091 356938035643817')).toEqual([])
    expect(multipleImeiInputCandidates('356938035643809 / 35693803564381#')).toEqual([])
    expect(multipleImeiInputCandidates('356938035643809/')).toEqual([])
  })

  it('IMEI เลขเดียว (มีตัวคั่น) / ว่าง / มีตัวอักษร ⇒ ไม่ใช่กรณีนี้', () => {
    expect(multipleImeiInputCandidates('35 693803 564380 9')).toEqual([])
    expect(multipleImeiInputCandidates('356938035643809')).toEqual([])
    expect(multipleImeiInputCandidates('')).toEqual([])
    expect(multipleImeiInputCandidates(null)).toEqual([])
    expect(multipleImeiInputCandidates('IMEI1 356938035643809 IMEI2 356938035643817')).toEqual([])
  })

  it('เลขซ้ำกันนับครั้งเดียว · ทุกตัวเลือกเป็น IMEI ที่ normalize แล้ว', () => {
    expect(multipleImeiInputCandidates('356938035643809 356938035643809')).toEqual(['356938035643809'])
    for (const imei of multipleImeiInputCandidates('35.693803.564380.9, 35.693803.564381.7')) {
      expect(parseImei(imei)).toBe(imei)
    }
  })

  it('imeiPickerCandidates รวมทั้งแบบปนข้อความและแบบตัวเลขล้วน', () => {
    expect(imeiPickerCandidates('IMEI1: 356938035643809 IMEI2: 356938035643817')).toEqual(pair)
    expect(imeiPickerCandidates('356938035643809/356938035643817')).toEqual(pair)
    expect(imeiPickerCandidates('356938035643809')).toEqual([])
  })
})
