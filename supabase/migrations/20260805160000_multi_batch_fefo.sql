-- Multi-batch and FEFO (First Expiring First Out) Migration
CREATE TABLE IF NOT EXISTS public.product_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  batch_number TEXT,
  expiry_date DATE,
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_batches readable" ON public.product_batches;
CREATE POLICY "product_batches readable" ON public.product_batches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "product_batches writeable" ON public.product_batches;
CREATE POLICY "product_batches writeable" ON public.product_batches FOR ALL TO authenticated USING (true);

GRANT ALL ON public.product_batches TO authenticated;
GRANT ALL ON public.product_batches TO service_role;

-- Update create_sale RPC to handle FEFO batch deduction
CREATE OR REPLACE FUNCTION public.create_sale(
  _branch_id UUID,
  _customer_id UUID,
  _customer_name TEXT,
  _discount NUMERIC,
  _paid_amount NUMERIC,
  _payment_method TEXT,
  _notes TEXT,
  _items JSONB,
  _customer_phone TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale_id UUID;
  v_invoice TEXT;
  v_sub NUMERIC := 0;
  v_cost NUMERIC := 0;
  it JSONB;
  v_pid UUID;
  v_req_qty NUMERIC;
  v_rem_qty NUMERIC;
  v_batch RECORD;
  v_deduct NUMERIC;
BEGIN
  IF NOT (public.is_admin() OR _branch_id = public.my_branch()) THEN
    RAISE EXCEPTION 'Not allowed for this branch';
  END IF;

  v_invoice := 'INV-' || TO_CHAR(NOW(),'YYMMDD') || '-' || LPAD((FLOOR(RANDOM()*100000))::TEXT, 5, '0');

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_sub := v_sub + ((it->>'quantity')::NUMERIC * (it->>'price')::NUMERIC);
    v_cost := v_cost + ((it->>'quantity')::NUMERIC * COALESCE((it->>'purchase_price')::NUMERIC,0));
  END LOOP;

  INSERT INTO public.sales(
    invoice_number, branch_id, customer_id, customer_name, customer_phone, subtotal, discount, total,
    cost_total, profit, paid_amount, remaining_amount, payment_method, notes, created_by
  )
  VALUES (
    v_invoice, _branch_id, _customer_id, _customer_name, _customer_phone, v_sub, COALESCE(_discount,0), v_sub - COALESCE(_discount,0),
    v_cost, (v_sub - COALESCE(_discount,0)) - v_cost, COALESCE(_paid_amount,0),
    GREATEST((v_sub - COALESCE(_discount,0)) - COALESCE(_paid_amount,0), 0),
    COALESCE(_payment_method,'Cash'), _notes, auth.uid()
  )
  RETURNING id INTO v_sale_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_pid := (it->>'product_id')::UUID;
    v_req_qty := (it->>'quantity')::NUMERIC;

    INSERT INTO public.sale_items(sale_id, product_id, product_name, quantity, price, purchase_price, line_total)
    VALUES (v_sale_id, v_pid, it->>'product_name', v_req_qty,
      (it->>'price')::NUMERIC, COALESCE((it->>'purchase_price')::NUMERIC,0),
      v_req_qty * (it->>'price')::NUMERIC);

    -- Reduce overall product stock
    UPDATE public.products SET stock_quantity = stock_quantity - v_req_qty WHERE id = v_pid;

    -- FEFO Batch Reduction
    v_rem_qty := v_req_qty;
    FOR v_batch IN 
      SELECT id, stock_quantity 
      FROM public.product_batches 
      WHERE product_id = v_pid AND branch_id = _branch_id AND stock_quantity > 0 
      ORDER BY expiry_date ASC NULLS LAST, created_at ASC
    LOOP
      IF v_rem_qty <= 0 THEN EXIT; END IF;

      IF v_batch.stock_quantity >= v_rem_qty THEN
        UPDATE public.product_batches SET stock_quantity = stock_quantity - v_rem_qty WHERE id = v_batch.id;
        v_rem_qty := 0;
      ELSE
        v_deduct := v_batch.stock_quantity;
        UPDATE public.product_batches SET stock_quantity = 0 WHERE id = v_batch.id;
        v_rem_qty := v_rem_qty - v_deduct;
      END IF;
    END LOOP;

    -- Log stock movement
    INSERT INTO public.stock_movements(product_id, branch_id, movement_type, quantity, reference, created_by)
    VALUES (v_pid, _branch_id, 'sale', -v_req_qty, v_invoice, auth.uid());
  END LOOP;

  RETURN v_sale_id;
END; $$;
