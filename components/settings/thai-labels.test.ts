import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * กันถดถอย mytester6 T-008 — ป้ายที่ผู้ใช้เห็นในหน้าตั้งค่า/ผู้ใช้/ทีม/บริษัท ต้องเป็นภาษาไทย ไม่มีรหัสระบบ
 * (Rule 05 · มติ PO 03/10/2569) — Inhouse/Outsource คงไว้ (ชื่อฝั่งทีมที่ใช้ทั้งระบบ ผ่าน `TEAM_SIDE_LABEL`)
 */
const ROOT = join(__dirname, '..', '..')

const FORBIDDEN: Readonly<Record<string, readonly string[]>> = {
  'components/finance-companies/companies-manager.tsx': ['(Active)', '(Suspended)', "'Active'", "'Suspended'", 'Tax ID'],
  'components/finance-companies/company-form-modal.tsx': ['checksum'],
  'components/users/users-manager.tsx': ['(Active)', '(Suspended)', "'Active'", "'Suspended'"],
  'components/users/user-form-modal.tsx': ['({team.side})'],
  'components/teams/teams-manager.tsx': ['(Active)', '(Inactive)', "'Active'", "'Inactive'"],
  'components/teams/team-form-modal.tsx': ['(Active)', '(Inactive)', '{plan.side} ·', 'v{plan.version}'],
  'components/settings/organization-profile-tab.tsx': ['Prefix'],
  'components/settings/bank-file-formats-tab.tsx': ['label="Encoding"', '/ Encoding<'],
  'components/settings/assignment-policy-tab.tsx': ['กลุ่ม System', '(Supervisor)'],
  'components/settings/payee-tab.tsx': ['Tax ID'],
}

describe('ป้ายหน้าตั้งค่าเป็นภาษาไทย (mytester6 T-008)', () => {
  it.each(Object.entries(FORBIDDEN))('%s', (file, words) => {
    const source = readFileSync(join(ROOT, file), 'utf8')
    for (const word of words) expect(source, word).not.toContain(word)
  })
})
