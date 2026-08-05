-- ============================================================================
-- Sales Returns table & process_return RPC function
-- ============================================================================

create table if not exists public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id) on delete set null,
  invoice_number text not null,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  product_name text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  refund_amount numeric(12,2) not null default 0,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Index for fast queries
create index if not exists idx_sales_returns_branch_date on public.sales_returns (branch_id, created_at desc);
create index if not exists idx_sales_returns_sale on public.sales_returns (sale_id);

-- RLS & Grants
alter table public.sales_returns enable row level security;
grant select, insert on public.sales_returns to authenticated;
grant all on public.sales_returns to service_role;

drop policy if exists "sales_returns readable" on public.sales_returns;
create policy "sales_returns readable" on public.sales_returns for select to authenticated using (true);

drop policy if exists "sales_returns insertable" on public.sales_returns;
create policy "sales_returns insertable" on public.sales_returns for insert to authenticated with check (true);

-- -------------------------------------------------- Atomic Process Return RPC -----
create or replace function public.process_return(
  _sale_id uuid,
  _invoice_number text,
  _branch_id uuid,
  _product_id uuid,
  _product_name text,
  _quantity numeric,
  _unit_price numeric,
  _refund_amount numeric,
  _reason text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_return_id uuid;
begin
  if not (public.is_admin() or _branch_id = public.my_branch()) then
    raise exception 'Not allowed for this branch';
  end if;

  -- 1. Insert sales_returns record
  insert into public.sales_returns (
    sale_id, invoice_number, branch_id, product_id, product_name,
    quantity, unit_price, refund_amount, reason, created_by
  ) values (
    _sale_id, _invoice_number, _branch_id, _product_id, _product_name,
    _quantity, _unit_price, _refund_amount, _reason, auth.uid()
  ) returning id into v_return_id;

  -- 2. Restock product in branch inventory
  update public.products
    set stock_quantity = stock_quantity + _quantity
    where id = _product_id;

  -- 3. Log stock movement
  insert into public.stock_movements (
    product_id, branch_id, movement_type, quantity, reference, note, created_by
  ) values (
    _product_id, _branch_id, 'return', _quantity, _invoice_number, coalesce(_reason, 'Product Return'), auth.uid()
  );

  return v_return_id;
end; $$;

revoke execute on function public.process_return(uuid,text,uuid,uuid,text,numeric,numeric,numeric,text) from anon, public;
grant execute on function public.process_return(uuid,text,uuid,uuid,text,numeric,numeric,numeric,text) to authenticated;
