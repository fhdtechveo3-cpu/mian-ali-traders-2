-- Migration: Create mark_invoice_paid RPC and grant sales update permissions
GRANT UPDATE ON public.sales TO authenticated;
GRANT UPDATE ON public.sales TO service_role;

DROP POLICY IF EXISTS "sales update" ON public.sales;
CREATE POLICY "sales update" ON public.sales FOR UPDATE TO authenticated
  USING (public.is_admin() OR branch_id = public.my_branch())
  WITH CHECK (public.is_admin() OR branch_id = public.my_branch());

CREATE OR REPLACE FUNCTION public.mark_invoice_paid(
  _sale_id UUID,
  _payment_method TEXT DEFAULT 'Cash'
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_due NUMERIC := 0;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  v_due := v_sale.remaining_amount;

  UPDATE public.sales
  SET remaining_amount = 0,
      paid_amount = v_sale.total
  WHERE id = _sale_id;

  IF v_sale.customer_id IS NOT NULL AND v_due > 0 THEN
    INSERT INTO public.customer_payments(customer_id, branch_id, amount, payment_method, notes, note, created_by)
    VALUES (
      v_sale.customer_id,
      v_sale.branch_id,
      v_due,
      COALESCE(_payment_method, 'Cash'),
      'Clearance of Invoice ' || v_sale.invoice_number,
      'Clearance of Invoice ' || v_sale.invoice_number,
      auth.uid()
    );
  END IF;

  RETURN TRUE;
END; $$;
