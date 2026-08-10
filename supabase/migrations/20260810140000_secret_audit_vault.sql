-- Secret Anti-Fraud Audit Vault Migration
CREATE TABLE IF NOT EXISTS public.invoice_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  old_values JSONB NOT NULL,
  new_values JSONB NOT NULL,
  edited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.price_override_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  standard_price NUMERIC(12,2) NOT NULL,
  sold_price NUMERIC(12,2) NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  cashier_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cancelled_cart_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  items JSONB NOT NULL,
  cart_total NUMERIC(12,2) NOT NULL,
  cashier_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cash_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  expected_cash NUMERIC(12,2) NOT NULL,
  counted_cash NUMERIC(12,2) NOT NULL,
  discrepancy NUMERIC(12,2) NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS & Permissions for Audit Tables
ALTER TABLE public.invoice_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_override_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancelled_cart_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.invoice_audit_logs TO authenticated, service_role;
GRANT ALL ON public.price_override_logs TO authenticated, service_role;
GRANT ALL ON public.cancelled_cart_logs TO authenticated, service_role;
GRANT ALL ON public.cash_reconciliations TO authenticated, service_role;

DROP POLICY IF EXISTS "audit_logs_read" ON public.invoice_audit_logs;
CREATE POLICY "audit_logs_read" ON public.invoice_audit_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "audit_logs_write" ON public.invoice_audit_logs;
CREATE POLICY "audit_logs_write" ON public.invoice_audit_logs FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "price_logs_read" ON public.price_override_logs;
CREATE POLICY "price_logs_read" ON public.price_override_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "price_logs_write" ON public.price_override_logs;
CREATE POLICY "price_logs_write" ON public.price_override_logs FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "cart_logs_read" ON public.cancelled_cart_logs;
CREATE POLICY "cart_logs_read" ON public.cancelled_cart_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cart_logs_write" ON public.cancelled_cart_logs;
CREATE POLICY "cart_logs_write" ON public.cancelled_cart_logs FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "cash_recon_read" ON public.cash_reconciliations;
CREATE POLICY "cash_recon_read" ON public.cash_reconciliations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cash_recon_write" ON public.cash_reconciliations;
CREATE POLICY "cash_recon_write" ON public.cash_reconciliations FOR ALL TO authenticated USING (true);

-- Update update_invoice RPC to write snapshot to invoice_audit_logs
CREATE OR REPLACE FUNCTION public.update_invoice(
  _sale_id UUID,
  _customer_name TEXT,
  _customer_phone TEXT,
  _discount NUMERIC,
  _paid_amount NUMERIC,
  _payment_method TEXT,
  _notes TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old RECORD;
  v_new_subtotal NUMERIC;
  v_new_total NUMERIC;
  v_new_remaining NUMERIC;
  v_old_json JSONB;
  v_new_json JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin users can edit invoices';
  END IF;

  SELECT * INTO v_old FROM public.sales WHERE id = _sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  v_new_subtotal := v_old.subtotal;
  v_new_total := GREATEST(v_new_subtotal - COALESCE(_discount, 0), 0);
  v_new_remaining := GREATEST(v_new_total - COALESCE(_paid_amount, 0), 0);

  v_old_json := jsonb_build_object(
    'customer_name', v_old.customer_name,
    'customer_phone', v_old.customer_phone,
    'discount', v_old.discount,
    'paid_amount', v_old.paid_amount,
    'remaining_amount', v_old.remaining_amount,
    'total', v_old.total,
    'payment_method', v_old.payment_method,
    'notes', v_old.notes
  );

  v_new_json := jsonb_build_object(
    'customer_name', _customer_name,
    'customer_phone', _customer_phone,
    'discount', COALESCE(_discount, 0),
    'paid_amount', COALESCE(_paid_amount, 0),
    'remaining_amount', v_new_remaining,
    'total', v_new_total,
    'payment_method', COALESCE(_payment_method, 'Cash'),
    'notes', _notes
  );

  UPDATE public.sales
  SET customer_name = _customer_name,
      customer_phone = _customer_phone,
      discount = COALESCE(_discount, 0),
      paid_amount = COALESCE(_paid_amount, 0),
      total = v_new_total,
      remaining_amount = v_new_remaining,
      profit = v_new_total - cost_total,
      payment_method = COALESCE(_payment_method, 'Cash'),
      notes = _notes
  WHERE id = _sale_id;

  INSERT INTO public.invoice_audit_logs(sale_id, invoice_number, old_values, new_values, edited_by)
  VALUES (_sale_id, v_old.invoice_number, v_old_json, v_new_json, auth.uid());

  RETURN TRUE;
END; $$;
