-- ============================================================================
-- Mian Ali Traders POS — complete schema for a FRESH Supabase project
-- Run once in the SQL Editor of a brand-new project. Idempotent & self-contained.
-- Contains: types, tables, constraints, indexes, functions, triggers, grants, RLS.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- types -----
do $$ begin
  create type public.app_role as enum ('admin','cashier');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------- tables -----
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  branch_id uuid references public.branches(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  city text,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  branch_id uuid references public.branches(id) on delete set null,
  opening_balance numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  generic_name text,
  brand text,
  company text,
  category text,
  purchase_price numeric(12,2) not null default 0 check (purchase_price >= 0),
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  stock_quantity numeric(12,2) not null default 0,
  unit text not null default 'Pcs',
  pack_size text,
  barcode text,
  rack_no text,
  batch_number text,
  expiry_date date,
  supplier_id uuid references public.suppliers(id) on delete set null,
  branch_id uuid not null references public.branches(id) on delete cascade,
  low_stock_level numeric(12,2) not null default 10 check (low_stock_level >= 0),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  cost_total numeric(12,2) not null default 0,
  profit numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  remaining_amount numeric(12,2) not null default 0,
  payment_method text not null default 'Cash',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  price numeric(12,2) not null check (price >= 0),
  purchase_price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  movement_type text not null check (movement_type in ('purchase','sale','adjustment_in','adjustment_out','return')),
  quantity numeric(12,2) not null,
  purchase_price numeric(12,2),
  supplier_id uuid references public.suppliers(id) on delete set null,
  reference text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  old_purchase_price numeric(12,2),
  new_purchase_price numeric(12,2),
  old_selling_price numeric(12,2),
  new_selling_price numeric(12,2),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  category text not null default 'General',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  note text,
  expense_date date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  payment_method text not null default 'Cash',
  note text,
  payment_date date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------- indexes -----
create index if not exists idx_profiles_branch on public.profiles (branch_id);
create index if not exists idx_user_roles_user on public.user_roles (user_id);
create index if not exists idx_products_branch on public.products (branch_id);
create index if not exists idx_products_name on public.products (lower(name));
create index if not exists idx_products_generic on public.products (lower(generic_name));
create index if not exists idx_products_brand on public.products (lower(brand));
create index if not exists idx_products_barcode on public.products (barcode);
create index if not exists idx_products_expiry on public.products (expiry_date);
create index if not exists idx_customers_branch on public.customers (branch_id);
create index if not exists idx_sales_branch_date on public.sales (branch_id, created_at desc);
create index if not exists idx_sales_customer on public.sales (customer_id);
create index if not exists idx_sale_items_sale on public.sale_items (sale_id);
create index if not exists idx_stock_movements_product on public.stock_movements (product_id, created_at desc);
create index if not exists idx_stock_movements_branch on public.stock_movements (branch_id, created_at desc);
create index if not exists idx_price_history_product on public.price_history (product_id, created_at desc);
create index if not exists idx_expenses_branch_date on public.expenses (branch_id, expense_date desc);
create index if not exists idx_customer_payments_customer on public.customer_payments (customer_id, payment_date desc);

-- ------------------------------------------------------------- security -----
-- Roles live in their own table; never on profiles (prevents privilege escalation).
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin')
$$;

create or replace function public.my_branch()
returns uuid language sql stable security definer set search_path = public as $$
  select branch_id from public.profiles where id = auth.uid()
$$;

-- --------------------------------------------------------------- grants -----
grant select, insert, update, delete on public.branches to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert on public.sales to authenticated;          -- invoices are immutable
grant select, insert on public.sale_items to authenticated;     -- invoices are immutable
grant select, insert on public.stock_movements to authenticated;
grant select, insert on public.price_history to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert on public.customer_payments to authenticated;

grant all on public.branches, public.profiles, public.user_roles, public.suppliers,
  public.customers, public.products, public.sales, public.sale_items,
  public.stock_movements, public.price_history, public.expenses,
  public.customer_payments to service_role;

revoke execute on function public.has_role(uuid, public.app_role) from anon, public;
revoke execute on function public.is_admin() from anon, public;
revoke execute on function public.my_branch() from anon, public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_branch() to authenticated;

-- ------------------------------------------------------------------ RLS -----
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.suppliers enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.price_history enable row level security;
alter table public.expenses enable row level security;
alter table public.customer_payments enable row level security;

drop policy if exists "branches readable" on public.branches;
create policy "branches readable" on public.branches for select to authenticated using (true);
drop policy if exists "branches admin write" on public.branches;
create policy "branches admin write" on public.branches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "profiles self or admin read" on public.profiles;
create policy "profiles self or admin read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
drop policy if exists "profiles admin insert" on public.profiles;
create policy "profiles admin insert" on public.profiles for insert to authenticated
  with check (public.is_admin());

drop policy if exists "roles self or admin read" on public.user_roles;
create policy "roles self or admin read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- No insert/update/delete policies: roles change only via service_role / SQL editor.

drop policy if exists "suppliers read" on public.suppliers;
create policy "suppliers read" on public.suppliers for select to authenticated using (true);
drop policy if exists "suppliers insert" on public.suppliers;
create policy "suppliers insert" on public.suppliers for insert to authenticated
  with check (auth.uid() is not null);
drop policy if exists "suppliers update" on public.suppliers;
create policy "suppliers update" on public.suppliers for update to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "suppliers delete admin" on public.suppliers;
create policy "suppliers delete admin" on public.suppliers for delete to authenticated
  using (public.is_admin());

drop policy if exists "customers read" on public.customers;
create policy "customers read" on public.customers for select to authenticated
  using (public.is_admin() or branch_id is null or branch_id = public.my_branch());
drop policy if exists "customers insert" on public.customers;
create policy "customers insert" on public.customers for insert to authenticated
  with check (public.is_admin() or branch_id = public.my_branch());
drop policy if exists "customers update scoped" on public.customers;
create policy "customers update scoped" on public.customers for update to authenticated
  using (public.is_admin() or branch_id = public.my_branch())
  with check (public.is_admin() or branch_id = public.my_branch());
drop policy if exists "customers delete admin" on public.customers;
create policy "customers delete admin" on public.customers for delete to authenticated
  using (public.is_admin());

drop policy if exists "products read" on public.products;
create policy "products read" on public.products for select to authenticated
  using (public.is_admin() or branch_id = public.my_branch());
drop policy if exists "products insert" on public.products;
create policy "products insert" on public.products for insert to authenticated
  with check (public.is_admin() or branch_id = public.my_branch());
drop policy if exists "products update" on public.products;
create policy "products update" on public.products for update to authenticated
  using (public.is_admin() or branch_id = public.my_branch())
  with check (public.is_admin() or branch_id = public.my_branch());
drop policy if exists "products delete admin" on public.products;
create policy "products delete admin" on public.products for delete to authenticated
  using (public.is_admin());

drop policy if exists "sales read" on public.sales;
create policy "sales read" on public.sales for select to authenticated
  using (public.is_admin() or branch_id = public.my_branch());
drop policy if exists "sales insert" on public.sales;
create policy "sales insert" on public.sales for insert to authenticated
  with check (public.is_admin() or branch_id = public.my_branch());
-- No update/delete policies: invoices are permanent.

drop policy if exists "sale items read" on public.sale_items;
create policy "sale items read" on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id
                 and (public.is_admin() or s.branch_id = public.my_branch())));
drop policy if exists "sale items insert" on public.sale_items;
create policy "sale items insert" on public.sale_items for insert to authenticated
  with check (exists (select 1 from public.sales s where s.id = sale_id
                      and (public.is_admin() or s.branch_id = public.my_branch())));

drop policy if exists "movements read" on public.stock_movements;
create policy "movements read" on public.stock_movements for select to authenticated
  using (public.is_admin() or branch_id = public.my_branch());
drop policy if exists "movements insert" on public.stock_movements;
create policy "movements insert" on public.stock_movements for insert to authenticated
  with check (public.is_admin() or branch_id = public.my_branch());

drop policy if exists "price history read" on public.price_history;
create policy "price history read" on public.price_history for select to authenticated using (true);
drop policy if exists "price history insert" on public.price_history;
create policy "price history insert" on public.price_history for insert to authenticated with check (true);

drop policy if exists "expenses read" on public.expenses;
create policy "expenses read" on public.expenses for select to authenticated
  using (public.is_admin() or branch_id = public.my_branch());
drop policy if exists "expenses insert" on public.expenses;
create policy "expenses insert" on public.expenses for insert to authenticated
  with check (public.is_admin() or branch_id = public.my_branch());
drop policy if exists "expenses update" on public.expenses;
create policy "expenses update" on public.expenses for update to authenticated
  using (public.is_admin() or branch_id = public.my_branch())
  with check (public.is_admin() or branch_id = public.my_branch());
drop policy if exists "expenses delete admin" on public.expenses;
create policy "expenses delete admin" on public.expenses for delete to authenticated
  using (public.is_admin());

drop policy if exists "customer payments read" on public.customer_payments;
create policy "customer payments read" on public.customer_payments for select to authenticated
  using (public.is_admin() or branch_id = public.my_branch());
drop policy if exists "customer payments insert" on public.customer_payments;
create policy "customer payments insert" on public.customer_payments for insert to authenticated
  with check (public.is_admin() or branch_id = public.my_branch());

-- ------------------------------------------------------------- triggers -----
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

create or replace function public.log_price_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.purchase_price is distinct from old.purchase_price
     or new.selling_price is distinct from old.selling_price then
    insert into public.price_history(product_id, old_purchase_price, new_purchase_price,
      old_selling_price, new_selling_price, changed_by)
    values (new.id, old.purchase_price, new.purchase_price,
      old.selling_price, new.selling_price, auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists products_price_history on public.products;
create trigger products_price_history after update on public.products
  for each row execute function public.log_price_change();

-- First signed-up user becomes admin; everyone after is a cashier.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select count(*) = 0 into first_user from public.user_roles;
  insert into public.profiles(id, full_name, email, branch_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email,
          (select id from public.branches order by created_at limit 1));
  insert into public.user_roles(user_id, role)
  values (new.id, case when first_user then 'admin'::public.app_role else 'cashier'::public.app_role end);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------- atomic sale RPC -----
create or replace function public.create_sale(
  _branch_id uuid,
  _customer_id uuid,
  _customer_name text,
  _discount numeric,
  _paid_amount numeric,
  _payment_method text,
  _notes text,
  _items jsonb
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

  insert into public.sales(invoice_number, branch_id, customer_id, customer_name, subtotal, discount, total,
    cost_total, profit, paid_amount, remaining_amount, payment_method, notes, created_by)
  values (v_invoice, _branch_id, _customer_id, _customer_name, v_sub, coalesce(_discount,0), v_sub - coalesce(_discount,0),
    v_cost, (v_sub - coalesce(_discount,0)) - v_cost, coalesce(_paid_amount,0),
    greatest((v_sub - coalesce(_discount,0)) - coalesce(_paid_amount,0), 0),
    coalesce(_payment_method,'Cash'), _notes, auth.uid())
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

revoke execute on function public.create_sale(uuid,uuid,text,numeric,numeric,text,text,jsonb) from anon, public;
grant execute on function public.create_sale(uuid,uuid,text,numeric,numeric,text,text,jsonb) to authenticated;

-- ----------------------------------------------------------------- seed -----
-- Only the two branches; product/customer data is entered through the app.
insert into public.branches (id, name, city, phone, address) values
  ('11111111-1111-1111-1111-111111111111','Talwandi','Talwandi','0300-1234567','Main Bazar, Talwandi'),
  ('22222222-2222-2222-2222-222222222222','Kasur','Kasur','0301-7654321','Main Bazar, Kasur')
on conflict (id) do nothing;
