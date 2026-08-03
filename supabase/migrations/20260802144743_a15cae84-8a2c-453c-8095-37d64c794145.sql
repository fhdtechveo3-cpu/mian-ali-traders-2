DROP POLICY IF EXISTS "sales delete admin" ON public.sales;
DROP POLICY IF EXISTS "sale items delete admin" ON public.sale_items;
REVOKE DELETE, UPDATE ON public.sales FROM authenticated;
REVOKE DELETE, UPDATE ON public.sale_items FROM authenticated;