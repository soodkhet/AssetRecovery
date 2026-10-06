import { describe, expect, it } from 'vitest'
import { isSettingsError } from '@/lib/settings/errors'
import {
  REQUIRED_BANK_FILE_COLUMNS,
  assertBankFileUsable,
  bankFileColumnOptions,
  isColumnOfPurpose,
  toColumnMapping,
  parseColumnMapping,
  runBankFileTest,
  testStatusAfterEdit,
  type BankFileFormatValues,
} from '@/lib/settings/bank-file'

/** `13` §6.8 · §8 state machine · §15 "ใช้ Bank File ที่ยังไม่ทดสอบ → reject BANK_FILE_NOT_TESTED" */

const good: BankFileFormatValues = {
  purpose: 'payment',
  bankCode: '006',
  fileType: 'CSV',
  encoding: 'UTF_8',
  columnMapping: 'receiving_bank_code, receiving_account_no, receiving_account_name, amount, reference_no',
}

describe('parseColumnMapping', () => {
  it('รับทั้ง comma และขึ้นบรรทัดใหม่ + ตัดช่องว่าง + ทำเป็นตัวเล็ก', () => {
    expect(parseColumnMapping(' Amount ,\n receiving_bank_code \n\n')).toEqual(['amount', 'receiving_bank_code'])
  })

  it('ข้อความว่างได้รายการว่าง', () => {
    expect(parseColumnMapping('  \n , ')).toEqual([])
  })

  it('คงลำดับเดิมตามที่ธนาคารกำหนด', () => {
    expect(parseColumnMapping('amount,receiving_account_no')).toEqual(['amount', 'receiving_account_no'])
  })
})

describe('runBankFileTest', () => {
  it('mapping ครบ = passed + ไม่มี issue + มีตัวอย่างบรรทัด', () => {
    const result = runBankFileTest(good)
    expect(result.status).toBe('passed')
    expect(result.issues).toEqual([])
    expect(result.samplePreview.split(',')).toHaveLength(5)
  })

  it('ขาดคอลัมน์บังคับ = failed พร้อมบอกว่าขาดตัวไหน', () => {
    const result = runBankFileTest({ ...good, columnMapping: 'receiving_account_no, amount' })
    expect(result.status).toBe('failed')
    expect(result.issues.join(' ')).toContain('receiving_bank_code')
  })

  it('คอลัมน์ที่ระบบสร้างค่าให้ไม่ได้ = failed', () => {
    const result = runBankFileTest({ ...good, columnMapping: `${good.columnMapping}, branch_code` })
    expect(result.status).toBe('failed')
    expect(result.issues.join(' ')).toContain('branch_code')
  })

  it('คอลัมน์ซ้ำ = failed', () => {
    const result = runBankFileTest({ ...good, columnMapping: `${good.columnMapping}, amount` })
    expect(result.status).toBe('failed')
    expect(result.issues.join(' ')).toContain('amount')
  })

  it('mapping ว่าง = failed', () => {
    expect(runBankFileTest({ ...good, columnMapping: '   ' }).status).toBe('failed')
  })

  it('TIS-620 + คอลัมน์อีเมล = failed พร้อมเตือน encoding (🔶 `13` §17)', () => {
    const result = runBankFileTest({ ...good, encoding: 'TIS_620', columnMapping: `${good.columnMapping}, email` })
    expect(result.status).toBe('failed')
    expect(result.issues.join(' ')).toContain('TIS-620')
  })

  it('TIS-620 ที่ไม่มีคอลัมน์เสี่ยง = passed ได้ปกติ', () => {
    expect(runBankFileTest({ ...good, encoding: 'TIS_620' }).status).toBe('passed')
  })

  it('TXT ใช้ตัวคั่น | (fixed-width/legacy)', () => {
    expect(runBankFileTest({ ...good, fileType: 'TXT' }).samplePreview).toContain('|')
  })

  it('ผล deterministic — เรียกซ้ำได้ผลเดิมเสมอ (ไม่พึ่งเวลา/สุ่ม)', () => {
    expect(runBankFileTest(good)).toEqual(runBankFileTest(good))
  })

  it('คอลัมน์บังคับ 4 ตัวตรงกับที่ประกาศไว้', () => {
    expect([...REQUIRED_BANK_FILE_COLUMNS]).toEqual([
      'receiving_bank_code',
      'receiving_account_no',
      'receiving_account_name',
      'amount',
    ])
  })
})

describe('testStatusAfterEdit', () => {
  it('แก้ mapping = ผลทดสอบเดิมใช้ไม่ได้ กลับไป pending (`13` §8)', () => {
    expect(testStatusAfterEdit(good, { ...good, columnMapping: 'amount' }, 'passed')).toBe('pending')
  })

  it('แก้ชนิดไฟล์/encoding ก็กลับไป pending', () => {
    expect(testStatusAfterEdit(good, { ...good, fileType: 'TXT' }, 'passed')).toBe('pending')
    expect(testStatusAfterEdit(good, { ...good, encoding: 'TIS_620' }, 'passed')).toBe('pending')
  })

  it('แก้ชนิด/ธนาคาร = กลับไป pending (มติ PO U147)', () => {
    expect(testStatusAfterEdit(good, { ...good, purpose: 'statement' }, 'passed')).toBe('pending')
    expect(testStatusAfterEdit(good, { ...good, bankCode: '004' }, 'passed')).toBe('pending')
  })

  it('ไม่ได้แก้อะไรที่กระทบไฟล์ = คงสถานะเดิม', () => {
    expect(testStatusAfterEdit(good, { ...good }, 'passed')).toBe('passed')
    expect(testStatusAfterEdit(good, { ...good }, 'failed')).toBe('failed')
  })
})

describe('assertBankFileUsable', () => {
  it('passed = ผ่าน', () => {
    expect(() => assertBankFileUsable({ id: 'f1', bankName: 'กรุงไทย', testStatus: 'passed' })).not.toThrow()
  })

  it.each(['pending', 'failed'] as const)('%s = โยน BANK_FILE_NOT_TESTED', (status) => {
    try {
      assertBankFileUsable({ id: 'f1', bankName: 'กรุงไทย', testStatus: status })
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(isSettingsError(error)).toBe(true)
      if (isSettingsError(error)) {
        expect(error.code).toBe('BANK_FILE_NOT_TESTED')
        expect(error.status).toBe(400)
        expect(error.context).toMatchObject({ testStatus: status })
      }
    }
  })
})

describe('มติ PO U147 — ชนิดไฟล์ + ธนาคารจากรายการ + คอลัมน์จากคำศัพท์ของชนิด', () => {
  const statement: BankFileFormatValues = {
    purpose: 'statement',
    bankCode: '004',
    fileType: 'CSV',
    encoding: 'UTF_8',
    columnMapping: 'transaction_date,description,reference,amount_in,amount_out,balance',
  }

  it('ตัวเลือกคอลัมน์แยกตามชนิด — คำศัพท์ statement กับไฟล์โอนไม่ปนกัน', () => {
    const statementColumns = bankFileColumnOptions('statement').map((option) => option.value)
    const paymentColumns = bankFileColumnOptions('payment').map((option) => option.value)
    expect(statementColumns).toContain('amount_in')
    expect(statementColumns).not.toContain('receiving_bank_code')
    expect(paymentColumns).toContain('receiving_bank_code')
    expect(paymentColumns).not.toContain('transaction_date')
    expect(isColumnOfPurpose('statement', 'receiving_bank_code')).toBe(false)
    expect(bankFileColumnOptions('statement').every((option) => option.label !== option.value)).toBe(true)
  })

  it('statement ที่ตั้งครบ = passed จริง (ไฟล์ตัวอย่างผ่านตัวนำเข้า statement ตัวจริง)', () => {
    const result = runBankFileTest(statement)
    expect(result.issues).toEqual([])
    expect(result.status).toBe('passed')
    expect(result.samplePreview).toContain('วันที่')
  })

  it('statement ยอดเดียวมีเครื่องหมาย (amount) ก็ผ่าน · เงินเข้าอย่างเดียวก็ผ่าน', () => {
    expect(runBankFileTest({ ...statement, columnMapping: 'transaction_date,description,amount' }).status).toBe('passed')
    expect(runBankFileTest({ ...statement, columnMapping: 'transaction_date,amount_in' }).status).toBe('passed')
  })

  it('statement ที่ใช้คำศัพท์ไฟล์โอน (ปัญหาเดิม ND-5) = failed', () => {
    const result = runBankFileTest({ ...statement, columnMapping: 'receiving_account_no,amount' })
    expect(result.status).toBe('failed')
    expect(result.issues.join(' ')).toContain('receiving_account_no')
  })

  it('statement ไม่มีวันที่/ยอด · TXT · TIS-620 = failed (ตัวนำเข้าอ่าน CSV UTF-8)', () => {
    expect(runBankFileTest({ ...statement, columnMapping: 'description,amount_in' }).status).toBe('failed')
    expect(runBankFileTest({ ...statement, fileType: 'TXT' }).status).toBe('failed')
    expect(runBankFileTest({ ...statement, encoding: 'TIS_620' }).status).toBe('failed')
  })

  it('ไม่ได้เลือกธนาคารจากรายการ (ข้อมูลเดิม) = failed', () => {
    expect(runBankFileTest({ ...good, bankCode: null }).issues.join(' ')).toContain('ธนาคาร')
    expect(runBankFileTest({ ...good, bankCode: '999' }).status).toBe('failed')
  })

  it('ไฟล์โอนที่ใช้คำศัพท์ statement = failed', () => {
    expect(runBankFileTest({ ...good, columnMapping: `${good.columnMapping}, transaction_date` }).status).toBe('failed')
  })

  it('toColumnMapping() ต่อรายการที่เลือกเป็นข้อความที่เก็บ (ทิ้งช่องว่าง)', () => {
    expect(toColumnMapping(['transaction_date', '', ' Amount '])).toBe('transaction_date,amount')
  })

  it('assertBankFileUsable: รูปแบบ statement ใช้สร้างไฟล์โอนไม่ได้ = BANK_FILE_FORMAT_NOT_FOUND', () => {
    try {
      assertBankFileUsable({ id: 's1', bankName: 'กสิกรไทย', testStatus: 'passed', purpose: 'statement' })
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(isSettingsError(error) && error.code).toBe('BANK_FILE_FORMAT_NOT_FOUND')
    }
  })
})
