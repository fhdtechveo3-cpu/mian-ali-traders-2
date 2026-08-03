-- 1) Fresh start: clear all transactional/catalog data
DELETE FROM public.sale_items;
DELETE FROM public.sales;
DELETE FROM public.stock_movements;
DELETE FROM public.price_history;
DELETE FROM public.products;
DELETE FROM public.customers;
DELETE FROM public.suppliers;

-- 2) Product improvements
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS pack_size text,
  ADD COLUMN IF NOT EXISTS rack_no text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_products_branch ON public.products (branch_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products (lower(name));
CREATE INDEX IF NOT EXISTS idx_products_generic ON public.products (lower(generic_name));
CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products (lower(brand));
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products (barcode);
CREATE INDEX IF NOT EXISTS idx_products_expiry ON public.products (expiry_date);
CREATE INDEX IF NOT EXISTS idx_sales_branch_date ON public.sales (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements (product_id, created_at DESC);

-- 3) Customer opening balance (purana udhaar)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0;

-- 4) Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  category text NOT NULL DEFAULT 'General',
  amount numeric NOT NULL DEFAULT 0,
  note text,
  expense_date date NOT NULL DEFAULT current_date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses read" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_admin() OR branch_id = public.my_branch());
CREATE POLICY "expenses insert" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR branch_id = public.my_branch());
CREATE POLICY "expenses update" ON public.expenses FOR UPDATE TO authenticated
  USING (public.is_admin() OR branch_id = public.my_branch())
  WITH CHECK (public.is_admin() OR branch_id = public.my_branch());
CREATE POLICY "expenses delete admin" ON public.expenses FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_expenses_branch_date ON public.expenses (branch_id, expense_date DESC);

-- 5) Customer payments (udhaar recovery)
CREATE TABLE IF NOT EXISTS public.customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  sale_id uuid REFERENCES public.sales(id),
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Cash',
  note text,
  payment_date date NOT NULL DEFAULT current_date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.customer_payments TO authenticated;
GRANT ALL ON public.customer_payments TO service_role;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer payments read" ON public.customer_payments FOR SELECT TO authenticated
  USING (public.is_admin() OR branch_id = public.my_branch());
CREATE POLICY "customer payments insert" ON public.customer_payments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR branch_id = public.my_branch());

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON public.customer_payments (customer_id, payment_date DESC);