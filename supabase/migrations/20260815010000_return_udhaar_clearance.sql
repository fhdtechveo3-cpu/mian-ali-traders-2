-- Migration: Auto-clear remaining_amount in sales when returns occur
CREATE OR REPLACE FUNCTION public.process_return(
  _sale_id UUID,
  _items JSONB,
  _reason TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_return_id UUID;
  v_sale public.sales%ROWTYPE;
  v_total_refund NUMERIC := 0;
  v_total_previously_refunded NUMERIC := 0;
  v_new_total_refunded NUMERIC := 0;
  v_net_due NUMERIC := 0;
  it JSONB;
  v_pid UUID;
  v_qty NUMERIC;
  v_price NUMERIC;
  v_item_total NUMERIC;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := (it->>'quantity')::NUMERIC;
    v_price := (it->>'price')::NUMERIC;
    v_total_refund := v_total_refund + (v_qty * v_price);
  END LOOP;

  INSERT INTO public.returns(sale_id, invoice_number, branch_id, customer_id, refund_amount, reason, created_by)
  VALUES (_sale_id, v_sale.invoice_number, v_sale.branch_id, v_sale.customer_id, v_total_refund, _reason, auth.uid())
  RETURNING id INTO v_return_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_pid := (it->>'product_id')::UUID;
    v_qty := (it->>'quantity')::NUMERIC;
    v_price := (it->>'price')::NUMERIC;
    v_item_total := v_qty * v_price;

    INSERT INTO public.return_items(return_id, product_id, product_name, quantity, price, line_total)
    VALUES (v_return_id, v_pid, it->>'product_name', v_qty, v_price, v_item_total);

    UPDATE public.products SET stock_quantity = stock_quantity + v_qty WHERE id = v_pid;

    INSERT INTO public.stock_movements(product_id, branch_id, movement_type, quantity, reference, note, created_by)
    VALUES (v_pid, v_sale.branch_id, 'return', v_qty, v_sale.invoice_number, _reason, auth.uid());
  END LOOP;

  -- Reconcile remaining_amount on sales
  SELECT COALESCE(SUM(refund_amount), 0) INTO v_total_previously_refunded
  FROM public.returns
  WHERE sale_id = _sale_id;

  v_net_due := GREATEST(0, (v_sale.total - v_total_previously_refunded) - v_sale.paid_amount);

  UPDATE public.sales
  SET remaining_amount = v_net_due
  WHERE id = _sale_id;

  RETURN v_return_id;
END; $$;
