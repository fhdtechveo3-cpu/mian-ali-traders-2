-- Migration for Customer Udhaar Recovery & Payments Ledger
CREATE TABLE IF NOT EXISTS public.customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.customer_payments TO authenticated;
GRANT ALL ON public.customer_payments TO service_role;

DROP POLICY IF EXISTS "customer_payments_read" ON public.customer_payments;
CREATE POLICY "customer_payments_read" ON public.customer_payments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "customer_payments_write" ON public.customer_payments;
CREATE POLICY "customer_payments_write" ON public.customer_payments FOR ALL TO authenticated USING (true);
