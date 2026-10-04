import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// มติ PO 04/10/2569: คลิกเมาส์ = ไม่มีกรอบโฟกัส · คีย์บอร์ด = กรอบครบทั้งปุ่ม (แท็บ/เมนูย่อยวาดด้านใน ไม่ถูก overflow ตัด)
const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const TAB_COMPONENTS = [
  'components/accounting/accounting-shell.tsx',
  'components/finance/finance-shell.tsx',
  'components/warehouse/warehouse-tabs.tsx',
  'components/roles/role-group-tabs.tsx',
  'components/settings/finance-settings-shell.tsx',
  'components/settings/functional-permissions-tab.tsx',
  'components/shell/sub-nav.tsx',
  'components/shell/top-nav.tsx',
  'components/ui/filter-group.tsx',
  'components/teams/teams-manager.tsx',
]

describe('focus ring standard', () => {
  const css = read('app/globals.css')

  it('draws the outline only on :focus-visible (no ring after a mouse click)', () => {
    expect(css).toMatch(/\.focus-ring:focus-visible\s*\{[^}]*outline:\s*2px solid[^}]*outline-offset:\s*2px/)
    expect(css).toMatch(/\.focus-ring-inset:focus-visible\s*\{[^}]*outline:\s*2px solid[^}]*outline-offset:\s*-2px/)
    expect(css).not.toMatch(/\.focus-ring(-inset)?:focus\s*\{[^}]*outline:\s*2px/)
  })

  it.each(TAB_COMPONENTS)('%s uses the inset ring for tabs/menu items', (file) => {
    const src = read(file)
    expect(src).toContain('focus-ring-inset')
    expect(src).not.toMatch(/focus:(ring|outline)/)
  })
})
