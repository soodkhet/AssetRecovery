/**
 * รหัสธนาคาร 3 หลักสำหรับไฟล์โอนเงิน (`13` §6.8 คอลัมน์ `receiving_bank_code`) — **pure ล้วน**
 *
 * ระบบเก็บชื่อธนาคารของผู้รับเงินเป็น **ข้อความอิสระ** (`payee_profiles.bank_name` — `02` §8 ไม่มี
 * คอลัมน์รหัสธนาคาร) แต่ไฟล์โอนของทุกธนาคารต้องมีรหัสปลายทาง ⇒ แปลงชื่อ → รหัสที่นี่ที่เดียว
 *
 * เทียบแบบ "มีคำสำคัญอยู่ในชื่อ" ทั้งไทยและอังกฤษ เพราะการเงินพิมพ์ชื่อได้หลายแบบ
 * ("กสิกรไทย" / "ธนาคารกสิกรไทย" / "KBANK") — แปลงไม่ได้ = คืน `null` ให้ผู้เรียกบล็อกไว้ก่อน
 * ห้ามเดารหัสมั่ว (เงินเข้าธนาคารผิด = กู้คืนยากมาก)
 */

interface BankCodeEntry {
  code: string
  name: string
  keywords: readonly string[]
}

/** รหัสตามมาตรฐาน BOT/ITMX ที่ใช้ในไฟล์โอนของธนาคารไทย */
export const THAI_BANK_CODES: readonly BankCodeEntry[] = [
  { code: '002', name: 'ธนาคารกรุงเทพ', keywords: ['กรุงเทพ', 'bangkok bank', 'bbl'] },
  { code: '004', name: 'ธนาคารกสิกรไทย', keywords: ['กสิกร', 'kasikorn', 'kbank'] },
  { code: '006', name: 'ธนาคารกรุงไทย', keywords: ['กรุงไทย', 'krung thai', 'krungthai', 'ktb'] },
  { code: '011', name: 'ธนาคารทหารไทยธนชาต', keywords: ['ทหารไทย', 'ธนชาต', 'ttb', 'tmb'] },
  { code: '014', name: 'ธนาคารไทยพาณิชย์', keywords: ['ไทยพาณิชย์', 'siam commercial', 'scb'] },
  { code: '017', name: 'ธนาคารซิตี้แบงก์', keywords: ['ซิตี้', 'citibank'] },
  { code: '020', name: 'ธนาคารสแตนดาร์ดชาร์เตอร์ด', keywords: ['สแตนดาร์ด', 'standard chartered'] },
  { code: '022', name: 'ธนาคารซีไอเอ็มบีไทย', keywords: ['ซีไอเอ็มบี', 'cimb'] },
  { code: '024', name: 'ธนาคารยูโอบี', keywords: ['ยูโอบี', 'uob'] },
  { code: '025', name: 'ธนาคารกรุงศรีอยุธยา', keywords: ['กรุงศรี', 'ayudhya', 'bay'] },
  { code: '030', name: 'ธนาคารออมสิน', keywords: ['ออมสิน', 'government savings', 'gsb'] },
  { code: '033', name: 'ธนาคารอาคารสงเคราะห์', keywords: ['อาคารสงเคราะห์', 'ghb', 'government housing'] },
  { code: '034', name: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร', keywords: ['เกษตร', 'baac'] },
  { code: '065', name: 'ธนาคารธนชาต', keywords: ['thanachart'] },
  { code: '066', name: 'ธนาคารอิสลามแห่งประเทศไทย', keywords: ['อิสลาม', 'islamic'] },
  { code: '067', name: 'ธนาคารทิสโก้', keywords: ['ทิสโก้', 'tisco'] },
  { code: '069', name: 'ธนาคารเกียรตินาคินภัทร', keywords: ['เกียรตินาคิน', 'kiatnakin', 'kkp'] },
  { code: '070', name: 'ธนาคารไอซีบีซี (ไทย)', keywords: ['ไอซีบีซี', 'icbc'] },
  { code: '071', name: 'ธนาคารไทยเครดิต', keywords: ['ไทยเครดิต', 'thai credit'] },
  { code: '073', name: 'ธนาคารแลนด์ แอนด์ เฮ้าส์', keywords: ['แลนด์', 'land and houses', 'lh bank', 'lhbank'] },
]

function fold(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** ชื่อธนาคาร (ข้อความอิสระ) → รหัส 3 หลัก · ไม่รู้จัก = `null` (ผู้เรียกต้องบล็อก ห้ามเดา) */
export function resolveBankCode(bankName: string | null): string | null {
  if (bankName === null) return null
  const folded = fold(bankName)
  if (folded === '') return null
  const found = THAI_BANK_CODES.find((entry) => entry.keywords.some((keyword) => folded.includes(fold(keyword))))
  return found?.code ?? null
}
