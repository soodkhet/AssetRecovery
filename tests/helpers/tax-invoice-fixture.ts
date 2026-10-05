/**
 * Fixture ของเทสต์ระดับ DB ที่ insert `tax_invoices` ตรง (ไม่ผ่าน service) — มติ PO 06/10/2569 U95/U96 #4
 * เพิ่มคอลัมน์ snapshot ที่ NOT NULL (ชนิดเอกสาร/ยอด/อัตรา/คู่ค้า/รูปแบบการส่ง/รายละเอียด)
 *
 * ใช้คู่กัน: `INSERT INTO tax_invoices (<เดิม>, ${TAX_INVOICE_FIXTURE_COLUMNS}) VALUES (<เดิม>, ${taxInvoiceFixtureValues(salesId)})`
 * ⇒ ใบแบบเดิม (`tax_invoice`) ยอดเท่ารายการขาย · คู่ค้าจากองค์กร/บริษัทปัจจุบัน (subquery ตาม `sales_records`)
 */
export const TAX_INVOICE_FIXTURE_COLUMNS =
  'doc_kind, amount_before_vat_satang, vat_satang, total_satang, vat_rate_pct_used, seller_name, seller_tax_id, ' +
  'seller_address, buyer_name, buyer_tax_id, buyer_address, delivery_format, description'

export function taxInvoiceFixtureValues(salesRecordId: string, vatRatePct = '7.00'): string {
  const sales = `(SELECT %s FROM sales_records s WHERE s.id = '${salesRecordId}')`
  const org = `(SELECT o.%s FROM sales_records s JOIN organizations o ON o.id = s.organization_id WHERE s.id = '${salesRecordId}')`
  const company = `(SELECT c.%s FROM sales_records s JOIN finance_companies c ON c.id = s.company_id WHERE s.id = '${salesRecordId}')`
  return [
    `'tax_invoice'`,
    sales.replace('%s', 's.total_before_vat_satang'),
    sales.replace('%s', 's.vat_satang'),
    sales.replace('%s', 's.total_satang'),
    vatRatePct,
    org.replace('%s', 'name'),
    org.replace('%s', 'tax_id'),
    org.replace('%s', 'address'),
    company.replace('%s', 'name'),
    company.replace('%s', 'tax_id'),
    `COALESCE(${company.replace('%s', 'address')}, '')`,
    company.replace('%s', 'default_invoice_delivery_format'),
    `'ค่าบริการติดตามทรัพย์'`,
  ].join(', ')
}
