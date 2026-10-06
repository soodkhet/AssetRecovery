/** id ของ master data/แถวทดสอบที่สร้างระหว่างรัน (key ตาม FINAL-coverage) */
export const ids = {
  teams: {} as Record<string, string>,
  plans: {} as Record<string, string>,
  templates: {} as Record<string, string>,
  companies: {} as Record<string, string>,
  taxProfiles: {} as Record<string, string>,
  bankAccounts: {} as Record<string, string>,
  bankFiles: {} as Record<string, string>,
  payees: {} as Record<string, string>,
  cases: {} as Record<string, string>,
  advances: {} as Record<string, string>,
  payouts: {} as Record<string, string>,
  billing: {} as Record<string, string>,
  periods: {} as Record<string, string>,
}

/** เลขผู้เสียภาษี 13 หลักตาม mod-11 (สมมติ) */
export function thaiId(prefix12: string): string {
  if (!/^\d{12}$/.test(prefix12)) throw new Error('ต้อง 12 หลัก')
  let sum = 0
  for (let index = 0; index < 12; index += 1) sum += Number(prefix12[index]) * (13 - index)
  return `${prefix12}${(11 - (sum % 11)) % 10}`
}

export function strip<T extends { reason?: unknown }>(value: T): Omit<T, 'reason'> {
  const { reason: _reason, ...rest } = value
  return rest
}

/** 'YYYY-MM-DD' → Date เที่ยงคืน UTC (แบบเดียวกับ dateOnlySchema) */
export function d(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}
