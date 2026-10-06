import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SettingHelp } from '@/components/settings/setting-help'
import { payeeConditionHelp, taxProfileHelp, whtGrossUpHelp } from '@/lib/settings/help'

/** กล่องคำอธิบายค่าตั้ง (มติ PO U108) — render ครบ 4 ส่วน และตัวอย่างเปลี่ยนตามค่าที่เลือก */
describe('<SettingHelp>', () => {
  it('แสดงหัวข้อ คำอธิบาย ตัวเลือก ตัวอย่าง ใครแก้ได้ และมีผลเมื่อไร', () => {
    const html = renderToStaticMarkup(
      <SettingHelp help={taxProfileHelp({ whtPct: 3, whtBasis: 'before_vat', thresholdSatang: 100_000 })} />,
    )
    expect(html).toContain('<details')
    expect(html).not.toContain(' open=""')
    expect(html).toContain('กติกาภาษี (Tax Profile) ทำงานอย่างไร')
    expect(html).toContain('ยอดขั้นต่ำที่ต้องหัก')
    expect(html).toContain('ตัวอย่าง: เงินได้ ฿10,000.00 อัตรา 3%')
    expect(html).toContain('฿9,700.00')
    expect(html).toContain('ใครแก้ได้')
    expect(html).toContain('มีผลเมื่อไร')
    expect(html).not.toMatch(/§|ไฟล์ \d/)
  })

  it('ตาราง (1)/(2)/(3) และเปิดค้างได้', () => {
    const html = renderToStaticMarkup(<SettingHelp defaultOpen help={whtGrossUpHelp(true)} />)
    expect(html).toContain(' open=""')
    expect(html).toContain('<table')
    expect(html).toContain('฿309.28')
    expect(html).toContain('฿10,309.28')
  })

  it('ตัวอย่างอัปเดตตามค่าที่เลือก (เงื่อนไข/อัตรา)', () => {
    const withhold = renderToStaticMarkup(
      <SettingHelp help={payeeConditionHelp({ condition: 'withhold', allowGrossUp: true, whtPct: 3 })} />,
    )
    const payAlways = renderToStaticMarkup(
      <SettingHelp help={payeeConditionHelp({ condition: 'pay_always', allowGrossUp: true, whtPct: 3 })} />,
    )
    expect(withhold).toContain('฿9,700.00')
    expect(payAlways).toContain('฿10,309.28')
    expect(payAlways).not.toContain('฿9,700.00')
  })
})
