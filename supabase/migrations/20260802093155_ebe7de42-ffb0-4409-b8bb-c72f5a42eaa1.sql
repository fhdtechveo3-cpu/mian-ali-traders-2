
-- ROLES
create type public.app_role as enum ('admin','cashier');

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  phone text,
  address text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.branches to authenticated;
grant all on public.branches to service_role;
alter table public.branches enable row level security;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  branch_id uuid references public.branches(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

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

-- SUPPLIERS
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  city text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.suppliers to authenticated;
grant all on public.suppliers to service_role;
alter table public.suppliers enable row level security;

-- PRODUCTS
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  generic_name text,
  brand text,
  company text,
  category text,
  purchase_price numeric(12,2) not null default 0,
  selling_price numeric(12,2) not null default 0,
  stock_quantity numeric(12,2) not null default 0,
  unit text not null default 'Pcs',
  batch_number text,
  expiry_date date,
  supplier_id uuid references public.suppliers(id) on delete set null,
  branch_id uuid not null references public.branches(id) on delete cascade,
  low_stock_level numeric(12,2) not null default 10,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  branch_id uuid references public.branches(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;

create table public.sales (
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
grant select, insert, update, delete on public.sales to authenticated;
grant all on public.sales to service_role;
alter table public.sales enable row level security;

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(12,2) not null,
  price numeric(12,2) not null,
  purchase_price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sale_items to authenticated;
grant all on public.sale_items to service_role;
alter table public.sale_items enable row level security;

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  movement_type text not null, -- purchase | sale | adjustment_in | adjustment_out
  quantity numeric(12,2) not null,
  purchase_price numeric(12,2),
  supplier_id uuid references public.suppliers(id) on delete set null,
  reference text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;
alter table public.stock_movements enable row level security;

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  old_purchase_price numeric(12,2),
  new_purchase_price numeric(12,2),
  old_selling_price numeric(12,2),
  new_selling_price numeric(12,2),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert on public.price_history to authenticated;
grant all on public.price_history to service_role;
alter table public.price_history enable row level security;

-- POLICIES
create policy "branches readable" on public.branches for select to authenticated using (true);
create policy "branches admin write" on public.branches for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "profiles self or admin read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "profiles admin insert" on public.profiles for insert to authenticated with check (public.is_admin());

create policy "roles self or admin read" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "suppliers read" on public.suppliers for select to authenticated using (true);
create policy "suppliers write" on public.suppliers for all to authenticated using (true) with check (true);

create policy "products read" on public.products for select to authenticated using (public.is_admin() or branch_id = public.my_branch());
create policy "products insert" on public.products for insert to authenticated with check (public.is_admin() or branch_id = public.my_branch());
create policy "products update" on public.products for update to authenticated using (public.is_admin() or branch_id = public.my_branch()) with check (public.is_admin() or branch_id = public.my_branch());
create policy "products delete admin" on public.products for delete to authenticated using (public.is_admin());

create policy "customers read" on public.customers for select to authenticated using (public.is_admin() or branch_id is null or branch_id = public.my_branch());
create policy "customers write" on public.customers for insert to authenticated with check (true);
create policy "customers update" on public.customers for update to authenticated using (public.is_admin() or branch_id = public.my_branch()) with check (true);
create policy "customers delete admin" on public.customers for delete to authenticated using (public.is_admin());

create policy "sales read" on public.sales for select to authenticated using (public.is_admin() or branch_id = public.my_branch());
create policy "sales insert" on public.sales for insert to authenticated with check (public.is_admin() or branch_id = public.my_branch());
create policy "sales delete admin" on public.sales for delete to authenticated using (public.is_admin());

create policy "sale items read" on public.sale_items for select to authenticated using (exists (select 1 from public.sales s where s.id = sale_id and (public.is_admin() or s.branch_id = public.my_branch())));
create policy "sale items insert" on public.sale_items for insert to authenticated with check (exists (select 1 from public.sales s where s.id = sale_id and (public.is_admin() or s.branch_id = public.my_branch())));
create policy "sale items delete admin" on public.sale_items for delete to authenticated using (public.is_admin());

create policy "movements read" on public.stock_movements for select to authenticated using (public.is_admin() or branch_id = public.my_branch());
create policy "movements insert" on public.stock_movements for insert to authenticated with check (public.is_admin() or branch_id = public.my_branch());

create policy "price history read" on public.price_history for select to authenticated using (true);
create policy "price history insert" on public.price_history for insert to authenticated with check (true);

-- TRIGGERS
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();

create or replace function public.log_price_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.purchase_price is distinct from old.purchase_price or new.selling_price is distinct from old.selling_price then
    insert into public.price_history(product_id, old_purchase_price, new_purchase_price, old_selling_price, new_selling_price, changed_by)
    values (new.id, old.purchase_price, new.purchase_price, old.selling_price, new.selling_price, auth.uid());
  end if;
  return new;
end; $$;
create trigger products_price_history after update on public.products for each row execute function public.log_price_change();

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
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- SALE RPC (atomic)
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

-- SEED
insert into public.branches (id, name, city, phone, address) values
  ('11111111-1111-1111-1111-111111111111','Mian Ali Traders - Main Branch','Lahore','0300-1234567','Ferozepur Road, Lahore'),
  ('22222222-2222-2222-2222-222222222222','Mian Ali Traders - City Branch','Faisalabad','0301-7654321','Jail Road, Faisalabad');

insert into public.suppliers (id, name, phone, city) values
  ('33333333-3333-3333-3333-333333333331','Al-Shifa Distributors','0321-1112223','Lahore'),
  ('33333333-3333-3333-3333-333333333332','Noor Pharma Supplies','0333-4445556','Faisalabad');

insert into public.products (name, generic_name, brand, company, category, purchase_price, selling_price, stock_quantity, unit, batch_number, expiry_date, supplier_id, branch_id, low_stock_level, notes) values
  ('Panadol 500mg','Paracetamol','Panadol','GSK','Tablet',180.00,220.00,120,'Pack','B-1023','2027-05-31','33333333-3333-3333-3333-333333333331','11111111-1111-1111-1111-111111111111',20,'Fast moving fever medicine'),
  ('Augmentin 625mg','Amoxicillin + Clavulanic Acid','Augmentin','GSK','Antibiotic',520.00,640.00,8,'Pack','B-2087','2026-11-30','33333333-3333-3333-3333-333333333331','11111111-1111-1111-1111-111111111111',15,'Keep refrigerated after opening'),
  ('Brufen 400mg','Ibuprofen','Brufen','Abbott','Tablet',150.00,195.00,60,'Pack','B-3341','2027-02-28','33333333-3333-3333-3333-333333333332','22222222-2222-2222-2222-222222222222',20,'Pain relief');
