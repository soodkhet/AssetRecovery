import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * กันถดถอย mytester6 T-004/T-010 — ฟอร์มใน modal เหล่านี้กดบันทึกไม่ผ่าน (ตรวจฝั่งหน้าจอ / API ตอบ error / เน็ตหลุด)
 * ต้องมีข้อความที่ footer เหนือปุ่มบันทึก (`<FormSubmitFooter>` · role="alert") + เลื่อน/โฟกัสช่องแรกที่ผิด
 * (`useRevealFieldError`) — เดิมโฟกัสค้างที่ปุ่มบันทึก ผู้ใช้คีย์บอร์ด/โปรแกรมอ่านจอไม่รู้ว่าผิดตรงไหน
 */
const ROOT = join(__dirname, '..', '..')

const SETTINGS_FORMS = [
  'components/settings/organization-profile-tab.tsx',
  'components/settings/bank-accounts-tab.tsx',
  'components/settings/tax-profiles-tab.tsx',
  'components/settings/payee-tab.tsx',
  'components/finance-companies/company-form-modal.tsx',
  'components/compensation/compensation-plan-form-modal.tsx',
  'components/users/user-form-modal.tsx',
] as const

describe('ฟอร์มตั้งค่า — ข้อผิดตอนกดบันทึกขึ้น footer + โฟกัสช่องที่ผิด (mytester6 T-004)', () => {
  it.each(SETTINGS_FORMS)('%s', (file) => {
    const source = readFileSync(join(ROOT, file), 'utf8')
    expect(source).toContain('<FormSubmitFooter message={submitError.message} tick={submitError.tick}>')
    expect(source).toContain('useSubmitError(revealFieldError)')
    expect(source).toContain('ref={formBodyRef}')
    // ตรวจฝั่งหน้าจอไม่ผ่าน + API ตอบ error ⇒ ขึ้น footer ทั้งสองทาง
    expect(source).toContain('fieldErrorsSummary(')
    expect(source).toContain('apiFailureSummary(result.error)')
    // เปิดใหม่ไม่ค้างข้อความเก่า
    expect(source).toContain('useClearOnClose(')
  })
})

describe('ฟอร์มรับเคส — บันทึกไม่สำเร็จ (เน็ตหลุด/API) ขึ้น footer ด้วย (mytester6 T-010)', () => {
  it('case-form-modal ส่งข้อความ formError ให้ <FormSubmitFooter> + ยังแจ้ง toast', () => {
    const source = readFileSync(join(ROOT, 'components/cases/case-form-modal.tsx'), 'utf8')
    expect(source).toMatch(/<FormSubmitFooter\s+message=\{formError === null \? null : apiFailureSummary\(formError\)\}/)
    expect(source).toContain('setSubmitFailTick((tick) => tick + 1)')
    expect(source).toContain("showToast({ tone: 'error', title: failure.title, description: failure.message })")
  })
})
