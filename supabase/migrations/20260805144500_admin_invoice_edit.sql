-- ============================================================================
-- Admin Invoice Editing & Customer Phone Support
-- ============================================================================

-- 1. Add customer_phone to sales table
alter table public.sales add column if not exists customer_phone text;

-- 2. Update create_sale RPC to include customer_phone
create or replace function public.create_sale(
  _branch_id uuid,
  _customer_id uuid,
  _customer_name text,
  _discount numeric,
  _paid_amount numeric,
  _payment_method text,
  _notes text,
  _items jsonb,
  _customer_phone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_sale_id uuid;
  v_invoice text;
  v_sub numeric := 0;
  v_cost numeric := 0;
  it jsonb;
begin
  if not (public.is_admin() or _branch_id = public.my_branch()) then
    raise exception 'Not allowed for this branch';
  end if;

  v_invoice := 'INV-' || to_char(now(),'YYMMDD') || '-' || lpad((floor(random()*100000))::text, 5, '0');

  for it in select * from jsonb_array_elements(_items) loop
    v_sub := v_sub + ((it->>'quantity')::numeric * (it->>'price')::numeric);
    v_cost := v_cost + ((it->>'quantity')::numeric * coalesce((it->>'purchase_price')::numeric,0));
  end loop;

  insert into public.sales(
    invoice_number, branch_id, customer_id, customer_name, customer_phone, subtotal, discount, total,
    cost_total, profit, paid_amount, remaining_amount, payment_method, notes, created_by
  )
  values (
    v_invoice, _branch_id, _customer_id, _customer_name, _customer_phone, v_sub, coalesce(_discount,0), v_sub - coalesce(_discount,0),
    v_cost, (v_sub - coalesce(_discount,0)) - v_cost, coalesce(_paid_amount,0),
    greatest((v_sub - coalesce(_discount,0)) - coalesce(_paid_amount,0), 0),
    coalesce(_payment_method,'Cash'), _notes, auth.uid()
  )
  returning id into v_sale_id;

  for it in select * from jsonb_array_elements(_items) loop
    insert into public.sale_items(sale_id, product_id, product_name, quantity, price, purchase_price, line_total)
    values (v_sale_id, (it->>'product_id')::uuid, it->>'product_name', (it->>'quantity')::numeric,
      (it->>'price')::numeric, coalesce((it->>'purchase_price')::numeric,0),
      (it->>'quantity')::numeric * (it->>'price')::numeric);

    update public.products
      set stock_quantity = stock_quantity - (it->>'quantity')::numeric
      where id = (it->>'product_id')::uuid;

    insert into public.stock_movements(product_id, branch_id, movement_type, quantity, reference, created_by)
    values ((it->>'product_id')::uuid, _branch_id, 'sale', -(it->>'quantity')::numeric, v_invoice, auth.uid());
  end loop;

  return v_sale_id;
end; $$;

revoke execute on function public.create_sale(uuid,uuid,text,numeric,numeric,text,text,jsonb,text) from anon, public;
grant execute on function public.create_sale(uuid,uuid,text,numeric,numeric,text,text,jsonb,text) to authenticated;


-- 3. Admin Update Invoice RPC
create or replace function public.update_invoice(
  _sale_id uuid,
  _customer_name text,
  _customer_phone text,
  _discount numeric,
  _paid_amount numeric,
  _payment_method text,
  _notes text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_subtotal numeric;
  v_cost_total numeric;
  v_new_total numeric;
  v_new_profit numeric;
  v_new_remaining numeric;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can edit invoices';
  end if;

  select subtotal, cost_total into v_subtotal, v_cost_total
  from public.sales where id = _sale_id;

  if not found then
    raise exception 'Invoice not found';
  end if;

  v_new_total := v_subtotal - coalesce(_discount, 0);
  v_new_profit := v_new_total - v_cost_total;
  v_new_remaining := greatest(v_new_total - coalesce(_paid_amount, 0), 0);

  update public.sales set
    customer_name = _customer_name,
    customer_phone = _customer_phone,
    discount = coalesce(_discount, 0),
    total = v_new_total,
    profit = v_new_profit,
    paid_amount = coalesce(_paid_amount, 0),
    remaining_amount = v_new_remaining,
    payment_method = coalesce(_payment_method, 'Cash'),
    notes = _notes
  where id = _sale_id;

  return true;
end; $$;

revoke execute on function public.update_invoice(uuid,text,text,numeric,numeric,text,text) from anon, public;
grant execute on function public.update_invoice(uuid,text,text,numeric,numeric,text,text) to authenticated;
