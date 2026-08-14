-- Migration for Store to Store Stock Transfer & Inter-Branch Ledger
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number TEXT NOT NULL,
  from_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  to_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.stock_transfers TO authenticated, service_role;
CREATE POLICY "stock_transfers_read" ON public.stock_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_transfers_write" ON public.stock_transfers FOR ALL TO authenticated USING (true);

-- RPC for Executing Store-to-Store Stock Transfer
CREATE OR REPLACE FUNCTION public.process_stock_transfer(
  _from_branch_id UUID,
  _to_branch_id UUID,
  _product_id UUID,
  _quantity NUMERIC,
  _notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_transfer_id UUID;
  v_tnum TEXT;
  v_prod public.products%ROWTYPE;
  v_target_pid UUID;
  v_cost NUMERIC;
BEGIN
  IF _from_branch_id = _to_branch_id THEN
    RAISE EXCEPTION 'Source and target branches must be different';
  END IF;

  SELECT * INTO v_prod FROM public.products WHERE id = _product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source product not found';
  END IF;

  IF v_prod.stock_quantity < _quantity THEN
    RAISE EXCEPTION 'Insufficient stock in source branch (Available: %)', v_prod.stock_quantity;
  END IF;

  v_cost := COALESCE(v_prod.purchase_price, 0);
  v_tnum := 'TRF-' || TO_CHAR(NOW(),'YYMMDD') || '-' || LPAD((FLOOR(RANDOM()*100000))::TEXT, 5, '0');

  -- Log transfer record
  INSERT INTO public.stock_transfers(
    transfer_number, from_branch_id, to_branch_id, product_id, product_name,
    quantity, unit_cost, total_value, notes, created_by
  )
  VALUES (
    v_tnum, _from_branch_id, _to_branch_id, _product_id, v_prod.name,
    _quantity, v_cost, _quantity * v_cost, _notes, auth.uid()
  )
  RETURNING id INTO v_transfer_id;

  -- 1. Deduct stock from source product
  UPDATE public.products SET stock_quantity = stock_quantity - _quantity WHERE id = _product_id;

  -- Log movement for source branch
  INSERT INTO public.stock_movements(product_id, branch_id, movement_type, quantity, purchase_price, reference, note, created_by)
  VALUES (_product_id, _from_branch_id, 'adjustment_out', _quantity, v_cost, v_tnum, 'Store Transfer Out', auth.uid());

  -- 2. Find or create matching product in target branch
  SELECT id INTO v_target_pid 
  FROM public.products 
  WHERE branch_id = _to_branch_id AND LOWER(name) = LOWER(v_prod.name) 
  LIMIT 1;

  IF v_target_pid IS NULL THEN
    INSERT INTO public.products(
      name, generic_name, brand, company, category, purchase_price, selling_price,
      stock_quantity, low_stock_level, unit, barcode, expiry_date, branch_id
    )
    VALUES (
      v_prod.name, v_prod.generic_name, v_prod.brand, v_prod.company, v_prod.category, v_prod.purchase_price, v_prod.selling_price,
      _quantity, v_prod.low_stock_level, v_prod.unit, v_prod.barcode, v_prod.expiry_date, _to_branch_id
    )
    RETURNING id INTO v_target_pid;
  ELSE
    UPDATE public.products SET stock_quantity = stock_quantity + _quantity WHERE id = v_target_pid;
  END IF;

  -- Log movement for target branch
  INSERT INTO public.stock_movements(product_id, branch_id, movement_type, quantity, purchase_price, reference, note, created_by)
  VALUES (v_target_pid, _to_branch_id, 'adjustment_in', _quantity, v_cost, v_tnum, 'Store Transfer In', auth.uid());

  RETURN v_transfer_id;
END; $$;
