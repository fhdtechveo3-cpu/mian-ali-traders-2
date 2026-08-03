
revoke execute on function public.has_role(uuid, public.app_role) from anon, public;
revoke execute on function public.is_admin() from anon, public;
revoke execute on function public.my_branch() from anon, public;
revoke execute on function public.create_sale(uuid,uuid,text,numeric,numeric,text,text,jsonb) from anon, public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_branch() to authenticated;
grant execute on function public.create_sale(uuid,uuid,text,numeric,numeric,text,text,jsonb) to authenticated;

drop policy "suppliers write" on public.suppliers;
create policy "suppliers insert" on public.suppliers for insert to authenticated with check (auth.uid() is not null);
create policy "suppliers update" on public.suppliers for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "suppliers delete admin" on public.suppliers for delete to authenticated using (public.is_admin());

drop policy "customers write" on public.customers;
drop policy "customers update" on public.customers;
create policy "customers insert" on public.customers for insert to authenticated with check (public.is_admin() or branch_id = public.my_branch());
create policy "customers update scoped" on public.customers for update to authenticated using (public.is_admin() or branch_id = public.my_branch()) with check (public.is_admin() or branch_id = public.my_branch());
