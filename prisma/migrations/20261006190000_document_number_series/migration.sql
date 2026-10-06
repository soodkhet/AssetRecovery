-- มติ PO 06/10/2569 (UAT U102) — เลขที่เอกสารตั้งค่าได้ทุกชนิด (คำนำหน้า · รวมปี พ.ศ. · จำนวนหลัก · รีเซ็ตรายปี)
--
-- ก่อนหน้านี้ตัวเดินเลขกระจายอยู่ 5 แบบ:
--   INV  = organizations.tax_invoice_*          (UPDATE … RETURNING บนแถวองค์กร)
--   BL   = organizations.billing_batch_seq*      (trigger → next_billing_batch_number())
--   LOT/DLV = PostgreSQL sequence ต่อ (prefix, ปี) ใช้ร่วมทุกองค์กร (next_handover_number())
--   WHT  = MAX() ของใบที่ออกแล้ว + advisory lock ทั้งระบบ
--   PV/ADV = ไม่มีเลขจริง (derive จากรอบจ่าย / id)
-- ⇒ รวมเป็นตารางเดียว `document_number_series` (1 แถวต่อองค์กรต่อชนิด) + ฟังก์ชันกลาง `next_document_number()`
--   ซึ่ง `SELECT … FOR UPDATE` แถวของชุดเลขก่อนเพิ่มตัวนับ ⇒ ธุรกรรมที่ออกเลขพร้อมกันต่อคิวกันเอง ไม่ซ้ำ ·
--   ธุรกรรมล้ม = ตัวนับ rollback ด้วย (ไม่มีเลขขาด) · ปีในเลข = ปี พ.ศ. ของวันที่เอกสารตามเวลาไทย
--
-- เลขเดิมต่อเนื่อง: ตัวนับของทุกชนิดตั้งจาก max(ตัวนับเดิม, เลขสูงสุดที่มีอยู่จริงในฐาน)

-- ── 1) enum + ตาราง ─────────────────────────────────────────────────────────
CREATE TYPE document_number_type AS ENUM (
  'tax_invoice',         -- INV  ใบเสร็จรับเงิน/ใบกำกับภาษี (เอกสารภาษี)
  'billing_batch',       -- BL   ใบแจ้งหนี้/ใบวางบิล
  'handover_lot',        -- LOT  เลขล็อตส่งมอบ
  'delivery_note',       -- DLV  ใบส่งมอบ
  'payment_voucher',     -- PV   ใบสำคัญจ่าย
  'wht_certificate',     -- WHT  หนังสือรับรองการหักภาษี ณ ที่จ่าย (เอกสารภาษี)
  'advance',             -- ADV  ใบเบิกเงินทดรอง
  'advance_return',      -- RAV  ใบรับคืนเงินทดรอง
  'substitute_receipt'   -- CRT  ใบรับรองแทนใบเสร็จรับเงิน (โครงตัวนับ — ฟีเจอร์ตามมติ U103)
);

CREATE TABLE document_number_series (
  id                 UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID                 NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  doc_type           document_number_type NOT NULL,
  prefix             VARCHAR(10)          NOT NULL,
  include_year       BOOLEAN              NOT NULL,
  digits             INTEGER              NOT NULL,
  reset_yearly       BOOLEAN              NOT NULL,
  -- ตัวนับ: ระบบเดินเองเท่านั้น (ชนิดที่ไม่ใช่เอกสารภาษีตั้ง "เลขถัดไป" ขึ้นได้ ห้ามต่ำกว่าเลขที่ใช้แล้ว)
  current_seq        INTEGER              NOT NULL DEFAULT 0,
  current_year       INTEGER,             -- ปี พ.ศ. ของ current_seq
  last_issued_number TEXT,
  last_issued_at     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  created_by         UUID                 REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,  -- NULL = ระบบสร้างค่าเริ่มต้นเอง
  updated_at         TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_by         UUID                 REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  deleted_at         TIMESTAMPTZ,
  CONSTRAINT uniq_document_number_series UNIQUE (organization_id, doc_type),
  CONSTRAINT document_number_series_prefix_format CHECK (prefix ~ '^([A-Z0-9]+(-[A-Z0-9]+)*)?$'),
  CONSTRAINT document_number_series_digits_range CHECK (digits BETWEEN 3 AND 8),
  CONSTRAINT document_number_series_seq_non_negative CHECK (current_seq >= 0),
  CONSTRAINT document_number_series_year_be CHECK (current_year IS NULL OR current_year BETWEEN 2500 AND 2999),
  -- รีเซ็ตทุกปีแต่ไม่มีปีในเลข = เลขปีใหม่ชนเลขปีเก่า
  CONSTRAINT document_number_series_reset_needs_year CHECK (NOT reset_yearly OR include_year)
);

-- ── 2) ฟังก์ชัน ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION document_number_be_year(p_at timestamptz)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT (EXTRACT(YEAR FROM p_at AT TIME ZONE 'Asia/Bangkok'))::int + 543
$$;

-- ส่วนหน้าของเลข (ก่อนลำดับ) — `INV-2569-` / `INV-` / `2569-` / ''
CREATE OR REPLACE FUNCTION document_number_head(p_prefix text, p_include_year boolean, p_year int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    NULLIF(concat_ws('-', NULLIF(p_prefix, ''), CASE WHEN p_include_year THEN p_year::text END), '') || '-',
    ''
  )
$$;

CREATE OR REPLACE FUNCTION format_document_number(
  p_prefix text, p_include_year boolean, p_digits int, p_year int, p_seq int
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  -- lpad ตัดสตริงที่ยาวเกิน ⇒ ลำดับที่เกินจำนวนหลักต้องพิมพ์เต็ม ห้ามตัดทิ้ง
  SELECT document_number_head(p_prefix, p_include_year, p_year)
      || CASE WHEN length(p_seq::text) < p_digits THEN lpad(p_seq::text, p_digits, '0') ELSE p_seq::text END
$$;

-- ค่าเริ่มต้นต่อชนิด (ต้องตรงกับ `DOCUMENT_NUMBER_DEFAULTS` ใน lib/document-numbering/format.ts — มีเทสต์เทียบ)
CREATE OR REPLACE FUNCTION ensure_document_number_series(p_organization_id uuid, p_doc_type document_number_type)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO document_number_series (organization_id, doc_type, prefix, include_year, digits, reset_yearly)
  SELECT p_organization_id, p_doc_type, d.prefix, d.include_year, d.digits, d.reset_yearly
    FROM (VALUES
      ('tax_invoice'::document_number_type,        'INV', false, 4, false),
      ('billing_batch'::document_number_type,      'BL',  true,  3, true),
      ('handover_lot'::document_number_type,       'LOT', true,  3, true),
      ('delivery_note'::document_number_type,      'DLV', true,  3, true),
      ('payment_voucher'::document_number_type,    'PV',  true,  4, true),
      ('wht_certificate'::document_number_type,    'WHT', true,  3, true),
      ('advance'::document_number_type,            'ADV', true,  4, true),
      ('advance_return'::document_number_type,     'RAV', true,  4, true),
      ('substitute_receipt'::document_number_type, 'CRT', true,  4, true)
    ) AS d(doc_type, prefix, include_year, digits, reset_yearly)
   WHERE d.doc_type = p_doc_type
  ON CONFLICT (organization_id, doc_type) DO NOTHING
$$;

-- ลำดับสูงสุดที่มีอยู่จริงของเลขที่ขึ้นต้นด้วย `p_head` (ใช้ตอนขึ้นปีใหม่/ลงวันที่ย้อนปี/ย้ายตัวนับ)
CREATE OR REPLACE FUNCTION document_number_max_seq(
  p_organization_id uuid, p_doc_type document_number_type, p_head text
) RETURNS int LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_table  text;
  v_column text;
  v_max    int;
BEGIN
  CASE p_doc_type
    WHEN 'tax_invoice'     THEN v_table := 'tax_invoices';       v_column := 'invoice_number';
    WHEN 'billing_batch'   THEN v_table := 'billing_batches';    v_column := 'batch_number';
    WHEN 'handover_lot'    THEN v_table := 'handover_lots';      v_column := 'lot_number';
    WHEN 'delivery_note'   THEN v_table := 'handover_lots';      v_column := 'doc_ref';
    WHEN 'payment_voucher' THEN v_table := 'payout_batch_items'; v_column := 'voucher_number';
    WHEN 'wht_certificate' THEN v_table := 'wht_certificates';   v_column := 'certificate_number';
    WHEN 'advance'         THEN v_table := 'advances';           v_column := 'advance_number';
    WHEN 'advance_return'  THEN v_table := 'advance_returns';    v_column := 'return_number';
    ELSE RETURN 0;  -- substitute_receipt: ยังไม่มีตารางเอกสาร
  END CASE;

  -- head มีแค่ A-Z/0-9/- (CHECK ของ prefix + ปีตัวเลข) ⇒ ใช้ใน regex/LIKE ได้ตรง ๆ ไม่มีอักขระพิเศษ
  EXECUTE format(
    'SELECT COALESCE(MAX((substring(%1$I FROM %2$L))::int), 0) FROM %3$I
      WHERE organization_id = $1 AND %1$I LIKE $2',
    v_column, '^' || p_head || '([0-9]+)$', v_table
  ) INTO v_max USING p_organization_id, p_head || '%';
  RETURN v_max;
END;
$$;

/**
 * ตัวเดินเลขกลาง — เรียกภายในธุรกรรมเดียวกับการ INSERT เอกสารเสมอ
 *   · ล็อกแถวชุดเลข (`FOR UPDATE`) ⇒ คำขอพร้อมกันต่อคิว · READ COMMITTED เห็นตัวนับล่าสุดหลังได้ล็อก
 *   · รีเซ็ตรายปี: ปีเดียวกับตัวนับ = ต่อเลข · ปีอื่น (ขึ้นปีใหม่/ลงวันที่ย้อนปี) = ต่อจากเลขสูงสุดที่มีจริงของปีนั้น
 *     และตัวนับเดินตามปีที่ใหม่ที่สุดเท่านั้น (เอกสารย้อนปีไม่ดึงตัวนับถอยหลัง)
 */
CREATE OR REPLACE FUNCTION next_document_number_full(
  p_organization_id uuid, p_doc_type document_number_type, p_at timestamptz
) RETURNS TABLE (number text, seq int, be_year int)
LANGUAGE plpgsql AS $$
DECLARE
  v_year   int := document_number_be_year(p_at);
  v_series document_number_series%ROWTYPE;
  v_next   int;
  v_number text;
BEGIN
  IF v_year IS NULL OR v_year < 2500 OR v_year > 2999 THEN
    RAISE EXCEPTION 'ปีของเลขเอกสารต้องเป็น พ.ศ. (2500–2999) — ได้รับ %', v_year USING ERRCODE = '22023';
  END IF;

  PERFORM ensure_document_number_series(p_organization_id, p_doc_type);
  SELECT * INTO v_series
    FROM document_number_series
   WHERE organization_id = p_organization_id AND doc_type = p_doc_type
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบชุดเลขเอกสาร % ขององค์กร %', p_doc_type, p_organization_id USING ERRCODE = '23503';
  END IF;

  IF NOT v_series.reset_yearly OR v_series.current_year IS NOT DISTINCT FROM v_year THEN
    v_next := v_series.current_seq + 1;
  ELSE
    v_next := document_number_max_seq(
      p_organization_id, p_doc_type,
      document_number_head(v_series.prefix, v_series.include_year, v_year)
    ) + 1;
  END IF;

  v_number := format_document_number(v_series.prefix, v_series.include_year, v_series.digits, v_year, v_next);

  IF NOT v_series.reset_yearly OR v_series.current_year IS NULL OR v_year >= v_series.current_year THEN
    UPDATE document_number_series
       SET current_seq = v_next,
           current_year = CASE WHEN v_series.reset_yearly THEN v_year
                               ELSE GREATEST(COALESCE(v_series.current_year, v_year), v_year) END,
           last_issued_number = v_number,
           last_issued_at = NOW(),
           updated_at = NOW()
     WHERE id = v_series.id;
  END IF;

  RETURN QUERY SELECT v_number, v_next, v_year;
END;
$$;

CREATE OR REPLACE FUNCTION next_document_number(
  p_organization_id uuid, p_doc_type document_number_type, p_at timestamptz
) RETURNS text LANGUAGE sql AS $$
  SELECT number FROM next_document_number_full(p_organization_id, p_doc_type, p_at)
$$;

-- ── 3) คอลัมน์เลขของเอกสารที่ยังไม่มีเลขจริง + backfill ────────────────────
-- 3.1 ใบสำคัญจ่าย: 1 เลขต่อผู้รับเงินต่อรอบ (snapshot ลงทุกรายการของผู้รับในรอบ) — ออกตอนสร้างไฟล์โอนครั้งแรก
ALTER TABLE payout_batch_items ADD COLUMN voucher_number TEXT;

WITH groups AS (
  SELECT i.organization_id, i.payout_batch_id, i.payee_id,
         b.payment_file_generated_at AS at,
         MIN(i.created_at) AS first_item_at
    FROM payout_batch_items i
    JOIN payout_batches b ON b.id = i.payout_batch_id
   WHERE b.payment_file_generated_at IS NOT NULL
   GROUP BY 1, 2, 3, 4
), numbered AS (
  SELECT g.*, document_number_be_year(g.at) AS be_year,
         ROW_NUMBER() OVER (
           PARTITION BY g.organization_id, document_number_be_year(g.at)
           ORDER BY g.at, g.payout_batch_id, g.first_item_at, g.payee_id
         ) AS seq
    FROM groups g
)
UPDATE payout_batch_items i
   SET voucher_number = format_document_number('PV', true, 4, n.be_year, n.seq::int)
  FROM numbered n
 WHERE i.payout_batch_id = n.payout_batch_id AND i.payee_id = n.payee_id;

CREATE INDEX idx_pbi_org_voucher_number ON payout_batch_items(organization_id, voucher_number)
  WHERE voucher_number IS NOT NULL;

-- 3.2 ใบเบิกเงินทดรอง — เลขตามลำดับ created_at ต่อ (องค์กร, ปี พ.ศ.) รวมแถวที่ soft delete แล้ว
ALTER TABLE advances ADD COLUMN advance_number TEXT;
WITH numbered AS (
  SELECT id, document_number_be_year(created_at) AS be_year,
         ROW_NUMBER() OVER (PARTITION BY organization_id, document_number_be_year(created_at) ORDER BY created_at, id) AS seq
    FROM advances
)
UPDATE advances a SET advance_number = format_document_number('ADV', true, 4, n.be_year, n.seq::int)
  FROM numbered n WHERE n.id = a.id;
ALTER TABLE advances ALTER COLUMN advance_number SET NOT NULL;
CREATE UNIQUE INDEX uniq_advance_number ON advances(organization_id, advance_number);

-- 3.3 ใบรับคืนเงินทดรอง (รับแยก/หักกลบ) — แถวที่กลับรายการแล้วคงเลขเดิม (ไม่ recycle)
ALTER TABLE advance_returns ADD COLUMN return_number TEXT;
-- backfill ครั้งเดียว: ปิดยามกันแก้แถวชั่วคราว (ยามอนุญาตเฉพาะการกลับรายการ) แล้วเปิดคืนทันทีหลังเติมเลข
ALTER TABLE advance_returns DISABLE TRIGGER trg_advance_returns_guard_update;
WITH numbered AS (
  SELECT id, document_number_be_year(created_at) AS be_year,
         ROW_NUMBER() OVER (PARTITION BY organization_id, document_number_be_year(created_at) ORDER BY created_at, id) AS seq
    FROM advance_returns
)
UPDATE advance_returns r SET return_number = format_document_number('RAV', true, 4, n.be_year, n.seq::int)
  FROM numbered n WHERE n.id = r.id;
ALTER TABLE advance_returns ENABLE TRIGGER trg_advance_returns_guard_update;
ALTER TABLE advance_returns ALTER COLUMN return_number SET NOT NULL;
CREATE UNIQUE INDEX uniq_advance_return_number ON advance_returns(organization_id, return_number);

-- ── 4) ความ unique ของเลขเอกสาร = ต่อองค์กร (เดิม LOT/DLV/WHT/INV unique ทั้งตาราง เพราะตัวนับใช้ร่วมทุกองค์กร) ──
ALTER TABLE tax_invoices     DROP CONSTRAINT IF EXISTS tax_invoices_invoice_number_key;
DROP INDEX IF EXISTS tax_invoices_invoice_number_key;
CREATE UNIQUE INDEX uniq_tax_invoice_number ON tax_invoices(organization_id, invoice_number);

ALTER TABLE wht_certificates DROP CONSTRAINT IF EXISTS wht_certificates_certificate_number_key;
DROP INDEX IF EXISTS wht_certificates_certificate_number_key;
CREATE UNIQUE INDEX uniq_wht_certificate_number ON wht_certificates(organization_id, certificate_number);

ALTER TABLE handover_lots DROP CONSTRAINT IF EXISTS handover_lots_lot_number_key;
DROP INDEX IF EXISTS handover_lots_lot_number_key;
ALTER TABLE handover_lots DROP CONSTRAINT IF EXISTS handover_lots_doc_ref_key;
DROP INDEX IF EXISTS handover_lots_doc_ref_key;
CREATE UNIQUE INDEX uniq_handover_lot_number ON handover_lots(organization_id, lot_number);
CREATE UNIQUE INDEX uniq_handover_doc_ref ON handover_lots(organization_id, doc_ref);

-- คำนำหน้าตั้งค่าได้แล้ว ⇒ CHECK รูปแบบ `BL-` ตายตัวใช้ไม่ได้อีก (ความไม่ซ้ำยังคุมด้วย uniq_billing_batch_number)
ALTER TABLE billing_batches DROP CONSTRAINT IF EXISTS billing_batch_number_format;

-- ── 5) ย้ายตัวนับเดิม → document_number_series ────────────────────────────
-- 5.1 สร้างแถวค่าเริ่มต้นครบทุกองค์กร × ทุกชนิด
SELECT ensure_document_number_series(o.id, t.doc_type)
  FROM organizations o
 CROSS JOIN unnest(enum_range(NULL::document_number_type)) AS t(doc_type);

-- 5.2 INV: ค่าตั้งเดิมจากองค์กร (คำนำหน้าเหลือเฉพาะอักขระที่อนุญาต · จำนวนหลักบีบเข้าช่วง 3–8)
UPDATE document_number_series s
   SET prefix       = left(regexp_replace(upper(o.tax_invoice_prefix), '[^A-Z0-9]', '', 'g'), 10),
       include_year = (o.tax_invoice_numbering_mode = 'yearly_reset'),
       reset_yearly = (o.tax_invoice_numbering_mode = 'yearly_reset'),
       digits       = LEAST(GREATEST(o.tax_invoice_digit_length, 3), 8),
       current_seq  = o.tax_invoice_seq,
       current_year = CASE WHEN o.tax_invoice_numbering_mode = 'yearly_reset' THEN o.tax_invoice_last_reset_year END
  FROM organizations o
 WHERE s.organization_id = o.id AND s.doc_type = 'tax_invoice';

-- 5.3 BL: ตัวนับเดิมของ trigger
UPDATE document_number_series s
   SET current_seq = o.billing_batch_seq, current_year = o.billing_batch_seq_year
  FROM organizations o
 WHERE s.organization_id = o.id AND s.doc_type = 'billing_batch';

-- 5.4 ชนิดรีเซ็ตรายปี: ปีล่าสุดที่มีเอกสารจริง (อ่านจากเลข `<prefix>-<พ.ศ.>-<ลำดับ>`) แล้วตัวนับ = max(เดิม, เลขสูงสุดของปีนั้น)
WITH docs AS (
  SELECT organization_id, 'handover_lot'::document_number_type AS doc_type, lot_number AS number FROM handover_lots
  UNION ALL SELECT organization_id, 'delivery_note', doc_ref FROM handover_lots
  UNION ALL SELECT organization_id, 'wht_certificate', certificate_number FROM wht_certificates
  UNION ALL SELECT organization_id, 'billing_batch', batch_number FROM billing_batches
  UNION ALL SELECT organization_id, 'payment_voucher', voucher_number FROM payout_batch_items WHERE voucher_number IS NOT NULL
  UNION ALL SELECT organization_id, 'advance', advance_number FROM advances
  UNION ALL SELECT organization_id, 'advance_return', return_number FROM advance_returns
  UNION ALL SELECT organization_id, 'tax_invoice', invoice_number FROM tax_invoices
), parsed AS (
  SELECT d.organization_id, d.doc_type,
         (substring(d.number FROM '^' || s.prefix || '-([0-9]{4})-[0-9]+$'))::int AS be_year,
         (substring(d.number FROM '^' || s.prefix || '-[0-9]{4}-([0-9]+)$'))::int AS seq
    FROM docs d
    JOIN document_number_series s ON s.organization_id = d.organization_id AND s.doc_type = d.doc_type
   WHERE s.include_year AND s.prefix <> ''
), latest AS (
  SELECT DISTINCT ON (organization_id, doc_type) organization_id, doc_type, be_year, seq
    FROM parsed
   WHERE be_year BETWEEN 2500 AND 2999
   ORDER BY organization_id, doc_type, be_year DESC, seq DESC
)
UPDATE document_number_series s
   SET current_year = l.be_year,
       current_seq  = CASE WHEN s.current_year IS NOT DISTINCT FROM l.be_year THEN GREATEST(s.current_seq, l.seq) ELSE l.seq END
  FROM latest l
 WHERE s.organization_id = l.organization_id AND s.doc_type = l.doc_type
   AND s.reset_yearly
   AND (s.current_year IS NULL OR l.be_year >= s.current_year);

-- 5.5 INV โหมดต่อเนื่อง: ตัวนับ = max(เดิม, เลขสูงสุดรูปแบบ `<prefix>-<ลำดับ>`)
UPDATE document_number_series s
   SET current_seq = GREATEST(s.current_seq, document_number_max_seq(s.organization_id, s.doc_type,
                                                                     document_number_head(s.prefix, false, NULL)))
 WHERE s.doc_type = 'tax_invoice' AND NOT s.include_year;

-- 5.6 เลขล่าสุดที่ออก (แสดงบนหน้าตั้งค่า)
UPDATE document_number_series s
   SET last_issued_number = format_document_number(s.prefix, s.include_year, s.digits,
                                                   COALESCE(s.current_year, document_number_be_year(NOW())), s.current_seq)
 WHERE s.current_seq > 0;

-- ── 6) trigger เดินเลขตอน INSERT (BL · ADV · RAV) ─────────────────────────
CREATE OR REPLACE FUNCTION billing_batches_assign_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.batch_number IS NULL THEN
      NEW.batch_number := next_document_number(NEW.organization_id, 'billing_batch', COALESCE(NEW.created_at, NOW()));
    END IF;
  ELSIF NEW.batch_number IS DISTINCT FROM OLD.batch_number THEN
    RAISE EXCEPTION 'เลขรอบวางบิล % แก้ไขไม่ได้', OLD.batch_number USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS next_billing_batch_number(uuid, timestamptz);

CREATE OR REPLACE FUNCTION advances_assign_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.advance_number IS NULL THEN
      NEW.advance_number := next_document_number(NEW.organization_id, 'advance', COALESCE(NEW.created_at, NOW()));
    END IF;
  ELSIF NEW.advance_number IS DISTINCT FROM OLD.advance_number THEN
    RAISE EXCEPTION 'เลขที่ใบเบิกเงินทดรอง % แก้ไขไม่ได้', OLD.advance_number USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_advances_number
  BEFORE INSERT OR UPDATE OF advance_number ON advances
  FOR EACH ROW EXECUTE FUNCTION advances_assign_number();

CREATE OR REPLACE FUNCTION advance_returns_assign_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.return_number IS NULL THEN
      NEW.return_number := next_document_number(NEW.organization_id, 'advance_return', COALESCE(NEW.created_at, NOW()));
    END IF;
  ELSIF NEW.return_number IS DISTINCT FROM OLD.return_number THEN
    RAISE EXCEPTION 'เลขที่ใบรับคืนเงินทดรอง % แก้ไขไม่ได้', OLD.return_number USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_advance_returns_number
  BEFORE INSERT OR UPDATE OF return_number ON advance_returns
  FOR EACH ROW EXECUTE FUNCTION advance_returns_assign_number();

-- ใบสำคัญจ่ายที่ออกแล้วแก้เลขไม่ได้ (ตั้งได้ครั้งเดียวจาก NULL)
CREATE OR REPLACE FUNCTION payout_batch_items_voucher_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.voucher_number IS NOT NULL AND NEW.voucher_number IS DISTINCT FROM OLD.voucher_number THEN
    RAISE EXCEPTION 'เลขที่ใบสำคัญจ่าย % แก้ไขไม่ได้', OLD.voucher_number USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payout_batch_items_voucher_immutable
  BEFORE UPDATE OF voucher_number ON payout_batch_items
  FOR EACH ROW EXECUTE FUNCTION payout_batch_items_voucher_immutable();

-- ── 7) ตัวนับเดิมเลิกใช้ ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS next_handover_number(text, int);
-- sequence `seq_handover_<lot|dlv>_<ปี>` ที่สร้างแบบ lazy — ลบทิ้ง (ตัวนับย้ายไป document_number_series แล้ว)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c WHERE c.relkind = 'S' AND c.relname ~ '^seq_handover_(lot|dlv)_[0-9]{4}$' LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS %I', r.relname);
  END LOOP;
END;
$$;

ALTER TABLE organizations
  DROP COLUMN tax_invoice_prefix,
  DROP COLUMN tax_invoice_seq,
  DROP COLUMN tax_invoice_numbering_mode,
  DROP COLUMN tax_invoice_digit_length,
  DROP COLUMN tax_invoice_last_reset_year,
  DROP COLUMN billing_batch_seq,
  DROP COLUMN billing_batch_seq_year;

DROP TYPE invoice_numbering_mode;
