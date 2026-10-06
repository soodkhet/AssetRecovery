-- มติ PO U147 (Final Test ด่าน 5 ND-5): รูปแบบไฟล์ธนาคาร "เลือกจากรายการทั้งหมด"
--  · bank_file_formats: + purpose (statement/payment) + bank_code (รายการธนาคารไทยมาตรฐาน) · bank_name = ชื่อมาตรฐานของรหัสนั้น
--  · bank_accounts: อ้างรูปแบบด้วย id (statement_format_id / payment_file_format_id) แทนชื่อธนาคารข้อความอิสระ
-- แปลงข้อมูลเดิม:
--  · purpose: คอลัมน์ทุกตัวอยู่ในคำศัพท์ statement = statement · นอกนั้น = payment (คำศัพท์ไฟล์โอน)
--  · bank_code: จับคู่คำสำคัญชุดเดียวกับ `resolveBankCode()` (lib/banks/thai-banks.ts) — จับไม่ได้ = NULL (หน้าจอให้เลือกใหม่)
--  · บัญชี: ชื่อเดิมตรง bank_name ของรูปแบบที่ยังใช้งานและ "ชนิดตรงช่อง" เท่านั้น (ล่าสุดก่อน) — ไม่ตรง = NULL + NOTICE
--    (เดิมพิมพ์ผิด/ผิดชนิด = นำเข้าใช้รูปแบบมาตรฐานเงียบ ๆ อยู่แล้ว ⇒ ผลการทำงานไม่เปลี่ยน)

CREATE TYPE bank_file_purpose AS ENUM ('statement', 'payment');

ALTER TABLE bank_file_formats
  ADD COLUMN purpose bank_file_purpose,
  ADD COLUMN bank_code VARCHAR(3);

UPDATE bank_file_formats f
SET purpose = CASE
  WHEN NOT EXISTS (
    SELECT 1
    FROM unnest(regexp_split_to_array(f.column_mapping, '[,\n]')) AS c(col)
    WHERE btrim(lower(c.col)) <> ''
      AND btrim(lower(c.col)) NOT IN ('transaction_date', 'description', 'reference', 'amount_in', 'amount_out', 'amount', 'balance')
  ) AND btrim(f.column_mapping) <> '' THEN 'statement'::bank_file_purpose
  ELSE 'payment'::bank_file_purpose
END;

ALTER TABLE bank_file_formats ALTER COLUMN purpose SET NOT NULL;

ALTER TABLE bank_accounts
  ADD COLUMN statement_format_id UUID,
  ADD COLUMN payment_file_format_id UUID;
-- รูปแบบเป็น soft delete เสมอ (และลบไม่ได้ขณะมีบัญชีอ้าง — BANK_FILE_FORMAT_IN_USE) ⇒ RESTRICT
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_statement_format_id_fkey" FOREIGN KEY ("statement_format_id") REFERENCES "bank_file_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_payment_file_format_id_fkey" FOREIGN KEY ("payment_file_format_id") REFERENCES "bank_file_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE bank_accounts a
SET statement_format_id = (
      SELECT f.id FROM bank_file_formats f
      WHERE f.organization_id = a.organization_id AND f.deleted_at IS NULL
        AND f.purpose = 'statement' AND f.bank_name = btrim(a.statement_format)
      ORDER BY f.updated_at DESC LIMIT 1
    ),
    payment_file_format_id = (
      SELECT f.id FROM bank_file_formats f
      WHERE f.organization_id = a.organization_id AND f.deleted_at IS NULL
        AND f.purpose = 'payment' AND f.bank_name = btrim(a.payment_file_format)
      ORDER BY f.updated_at DESC LIMIT 1
    );

DO $$
DECLARE
  unmatched TEXT;
BEGIN
  SELECT string_agg(id::text, ', ')
  INTO unmatched
  FROM bank_accounts
  WHERE (statement_format IS NOT NULL AND btrim(statement_format) <> '' AND statement_format_id IS NULL)
     OR (payment_file_format IS NOT NULL AND btrim(payment_file_format) <> '' AND payment_file_format_id IS NULL);
  IF unmatched IS NOT NULL THEN
    RAISE NOTICE 'U147: บัญชีธนาคารที่ชื่อรูปแบบเดิมไม่ตรงรูปแบบชนิดเดียวกัน — ล้างค่า ให้เลือกใหม่จากหน้าจอ: %', unmatched;
  END IF;
END $$;

ALTER TABLE bank_accounts DROP COLUMN statement_format, DROP COLUMN payment_file_format;

-- รหัสธนาคาร + ชื่อมาตรฐาน (ทำหลังจับคู่บัญชี เพราะบัญชีจับคู่ด้วยชื่อเดิม)
UPDATE bank_file_formats f
SET bank_code = (
  SELECT CASE
      WHEN position('กรุงเทพ' in n.folded) > 0 OR position('bangkok bank' in n.folded) > 0 OR position('bbl' in n.folded) > 0 THEN '002'
      WHEN position('กสิกร' in n.folded) > 0 OR position('kasikorn' in n.folded) > 0 OR position('kbank' in n.folded) > 0 THEN '004'
      WHEN position('กรุงไทย' in n.folded) > 0 OR position('krung thai' in n.folded) > 0 OR position('krungthai' in n.folded) > 0 OR position('ktb' in n.folded) > 0 THEN '006'
      WHEN position('ทหารไทย' in n.folded) > 0 OR position('ธนชาต' in n.folded) > 0 OR position('ttb' in n.folded) > 0 OR position('tmb' in n.folded) > 0 THEN '011'
      WHEN position('ไทยพาณิชย์' in n.folded) > 0 OR position('siam commercial' in n.folded) > 0 OR position('scb' in n.folded) > 0 THEN '014'
      WHEN position('ซิตี้' in n.folded) > 0 OR position('citibank' in n.folded) > 0 THEN '017'
      WHEN position('สแตนดาร์ด' in n.folded) > 0 OR position('standard chartered' in n.folded) > 0 THEN '020'
      WHEN position('ซีไอเอ็มบี' in n.folded) > 0 OR position('cimb' in n.folded) > 0 THEN '022'
      WHEN position('ยูโอบี' in n.folded) > 0 OR position('uob' in n.folded) > 0 THEN '024'
      WHEN position('กรุงศรี' in n.folded) > 0 OR position('ayudhya' in n.folded) > 0 OR position('bay' in n.folded) > 0 THEN '025'
      WHEN position('ออมสิน' in n.folded) > 0 OR position('government savings' in n.folded) > 0 OR position('gsb' in n.folded) > 0 THEN '030'
      WHEN position('อาคารสงเคราะห์' in n.folded) > 0 OR position('ghb' in n.folded) > 0 OR position('government housing' in n.folded) > 0 THEN '033'
      WHEN position('เกษตร' in n.folded) > 0 OR position('baac' in n.folded) > 0 THEN '034'
      WHEN position('thanachart' in n.folded) > 0 THEN '065'
      WHEN position('อิสลาม' in n.folded) > 0 OR position('islamic' in n.folded) > 0 THEN '066'
      WHEN position('ทิสโก้' in n.folded) > 0 OR position('tisco' in n.folded) > 0 THEN '067'
      WHEN position('เกียรตินาคิน' in n.folded) > 0 OR position('kiatnakin' in n.folded) > 0 OR position('kkp' in n.folded) > 0 THEN '069'
      WHEN position('ไอซีบีซี' in n.folded) > 0 OR position('icbc' in n.folded) > 0 THEN '070'
      WHEN position('ไทยเครดิต' in n.folded) > 0 OR position('thai credit' in n.folded) > 0 THEN '071'
      WHEN position('แลนด์' in n.folded) > 0 OR position('land and houses' in n.folded) > 0 OR position('lh bank' in n.folded) > 0 OR position('lhbank' in n.folded) > 0 THEN '073'
      ELSE NULL
    END
  FROM (SELECT lower(btrim(regexp_replace(f.bank_name, '\s+', ' ', 'g'))) AS folded) n
);

UPDATE bank_file_formats f
SET bank_name = b.name
FROM (VALUES
    ('002', 'ธนาคารกรุงเทพ'),
    ('004', 'ธนาคารกสิกรไทย'),
    ('006', 'ธนาคารกรุงไทย'),
    ('011', 'ธนาคารทหารไทยธนชาต'),
    ('014', 'ธนาคารไทยพาณิชย์'),
    ('017', 'ธนาคารซิตี้แบงก์'),
    ('020', 'ธนาคารสแตนดาร์ดชาร์เตอร์ด'),
    ('022', 'ธนาคารซีไอเอ็มบีไทย'),
    ('024', 'ธนาคารยูโอบี'),
    ('025', 'ธนาคารกรุงศรีอยุธยา'),
    ('030', 'ธนาคารออมสิน'),
    ('033', 'ธนาคารอาคารสงเคราะห์'),
    ('034', 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร'),
    ('065', 'ธนาคารธนชาต'),
    ('066', 'ธนาคารอิสลามแห่งประเทศไทย'),
    ('067', 'ธนาคารทิสโก้'),
    ('069', 'ธนาคารเกียรตินาคินภัทร'),
    ('070', 'ธนาคารไอซีบีซี (ไทย)'),
    ('071', 'ธนาคารไทยเครดิต'),
    ('073', 'ธนาคารแลนด์ แอนด์ เฮ้าส์')
) AS b(code, name)
WHERE f.bank_code = b.code;

CREATE INDEX idx_bank_accounts_statement_format ON bank_accounts (organization_id, statement_format_id);
CREATE INDEX idx_bank_accounts_payment_file_format ON bank_accounts (organization_id, payment_file_format_id);
