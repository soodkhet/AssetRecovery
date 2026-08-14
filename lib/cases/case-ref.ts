/**
 * Normalize เลขที่สัญญา (`case_ref`) — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * `38` §11: normalize เบาที่สุดที่ปลอดภัย = (1) uppercase ทั้งหมด (2) trim ช่องว่างหัว-ท้าย **เท่านั้น**
 * ห้ามตัด `-`/`_`/ช่องว่างกลางออก เพราะ false-positive (บล็อกเคสที่ไม่ซ้ำจริง) อันตรายกว่า false-negative
 * ในธุรกิจนี้ — เลขสัญญาของแต่ละไฟแนนซ์คนละรูปแบบกัน
 *
 * ค่าที่ได้ลงคอลัมน์ `cases.case_ref_normalized` ซึ่งมี unique index คู่กับ `company_id`
 * (`uniq_cases_company_case_ref`) เป็น safety net ชั้นที่ 1 ของการกันซ้ำ 2 ชั้น
 */
export function normalizeCaseRef(caseRef: string): string {
  return caseRef.trim().toUpperCase()
}
