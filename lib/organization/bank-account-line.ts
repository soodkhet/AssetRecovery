/**
 * บรรทัดบัญชีธนาคารของ**องค์กรเรา**บนเอกสาร (มติ PO U100/U101) — pure ล้วน
 * ใช้ในแถว "ช่องทางการชำระเงิน" ของใบแจ้งหนี้ (บัญชีรับโอน) และใบเสร็จรับเงิน (บัญชีที่เงินเข้าจริง)
 */

export interface DocBankAccount {
  bankName: string
  accountNumber: string
  accountName: string | null
}

/** "ธนาคาร… · เลขที่บัญชี … · ชื่อบัญชี …" — ช่องว่างไม่พิมพ์ */
export function bankAccountLine(account: DocBankAccount): string {
  const name = (account.accountName ?? '').trim()
  return [account.bankName.trim(), `เลขที่บัญชี ${account.accountNumber.trim()}`, name === '' ? null : `ชื่อบัญชี ${name}`]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ')
}

/**
 * เลือกบัญชีรับโอนที่พิมพ์บนใบแจ้งหนี้ — เฉพาะบัญชีที่ใช้ "รับเงิน" (`receive`/`both`) · บัญชีหลักก่อน
 * ไม่มีบัญชีรับเงินเลย = `null` (ไม่พิมพ์แถว — มติ PO U100)
 */
export function pickReceivingAccount<T extends { usage: 'receive' | 'pay' | 'both'; isPrimary: boolean }>(
  accounts: readonly T[],
): T | null {
  const receiving = accounts.filter((account) => account.usage !== 'pay')
  return receiving.find((account) => account.isPrimary) ?? receiving[0] ?? null
}
