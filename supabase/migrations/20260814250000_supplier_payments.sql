-- Migration for Supplier / Vendor Payments Ledger
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.supplier_payments TO authenticated, service_role;
CREATE POLICY "supplier_payments_read" ON public.supplier_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "supplier_payments_write" ON public.supplier_payments FOR ALL TO authenticated USING (true);
