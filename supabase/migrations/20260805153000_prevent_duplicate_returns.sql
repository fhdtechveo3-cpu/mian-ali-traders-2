-- Prevent duplicate returns RPC update
CREATE OR REPLACE FUNCTION public.process_return(
  _sale_id UUID,
  _invoice_number TEXT,
  _branch_id UUID,
  _product_id UUID,
  _product_name TEXT,
  _quantity NUMERIC,
  _unit_price NUMERIC,
  _refund_amount NUMERIC,
  _reason TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_return_id UUID;
  v_original_qty NUMERIC := 0;
  v_already_returned NUMERIC := 0;
  v_max_returnable NUMERIC := 0;
BEGIN
  -- Verify permission: admin or staff in the same branch
  IF NOT (public.is_admin() OR _branch_id = public.my_branch()) THEN
    RAISE EXCEPTION 'Not allowed to process returns for this branch';
  END IF;

  -- 1. Check original purchased quantity for this item in sale_items
  SELECT COALESCE(SUM(quantity), 0) INTO v_original_qty
  FROM public.sale_items
  WHERE sale_id = _sale_id AND (product_id = _product_id OR product_name = _product_name);

  IF v_original_qty <= 0 THEN
    RAISE EXCEPTION 'Original purchased item not found in this sale';
  END IF;

  -- 2. Check already returned quantity in sales_returns
  SELECT COALESCE(SUM(quantity), 0) INTO v_already_returned
  FROM public.sales_returns
  WHERE (sale_id = _sale_id OR invoice_number = _invoice_number)
    AND (product_id = _product_id OR product_name = _product_name);

  v_max_returnable := v_original_qty - v_already_returned;

  IF v_max_returnable <= 0 THEN
    RAISE EXCEPTION 'This item has already been fully returned for this invoice!';
  END IF;

  IF _quantity > v_max_returnable THEN
    RAISE EXCEPTION 'Cannot return % units. Only % units remain returnable for this invoice.', _quantity, v_max_returnable;
  END IF;

  -- 3. Record return entry in sales_returns
  INSERT INTO public.sales_returns(
    sale_id, invoice_number, branch_id, product_id, product_name,
    quantity, unit_price, refund_amount, reason, created_by
  )
  VALUES (
    _sale_id, _invoice_number, _branch_id, _product_id, _product_name,
    _quantity, _unit_price, _refund_amount, _reason, auth.uid()
  )
  RETURNING id INTO v_return_id;

  -- 4. Restore product stock in products table
  UPDATE public.products
  SET stock_quantity = stock_quantity + _quantity
  WHERE id = _product_id;

  -- 5. Record stock movement entry for return
  INSERT INTO public.stock_movements(
    product_id, branch_id, movement_type, quantity, reference, note, created_by
  )
  VALUES (
    _product_id, _branch_id, 'adjustment_in', _quantity, _invoice_number,
    'Customer Return: ' || COALESCE(_reason, 'No reason specified'), auth.uid()
  );

  RETURN v_return_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.process_return(UUID,TEXT,UUID,UUID,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT) TO authenticated;
