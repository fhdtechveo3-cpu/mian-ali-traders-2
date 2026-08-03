# Deploying to your own Supabase + Cloudflare

The app contains **no hardcoded keys**. Every Supabase credential is read from
environment variables (`src/integrations/supabase/client.ts` reads
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, falling back to
`SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` on the server). Point those at your
project and the app talks to your Supabase — nothing else changes.

## 1. Create the schema in your Supabase project

Open **SQL Editor** in your Supabase project and run `supabase/schema.sql`
(the same statements also exist as individual migrations in
`supabase/migrations/`, so `supabase db push` works too).

It creates:

| Table | Purpose |
|---|---|
| `branches` | Talwandi, Kasur |
| `profiles` | user name, email, branch |
| `user_roles` | `admin` / `cashier` (separate table — never on profiles) |
| `suppliers`, `customers` | contacts, `customers.opening_balance` for old udhaar |
| `products` | name, generic, brand, company, category, barcode, pack size, rack no, prices, stock, unit, batch, expiry, branch, low-stock level |
| `sales`, `sale_items` | invoices (insert + read only — no update/delete) |
| `stock_movements`, `price_history` | audit trails |
| `expenses`, `customer_payments` | shop expenses and udhaar recovery |

Plus RLS on every table, the `has_role` / `is_admin` / `my_branch` security-definer
helpers, the `handle_new_user` trigger and the `create_sale()` transaction function.

## 2. Configure Supabase Auth

- **Authentication → Providers → Email**: enable. Turn *Confirm email* off if you
  want instant logins (that is how the app is used today).
- **Authentication → URL Configuration**: set Site URL and Redirect URLs to your
  Cloudflare domain (and `http://localhost:8080` for local dev).
- Create your first user, then in SQL Editor:

```sql
insert into public.user_roles (user_id, role) values ('<user-uuid>', 'admin');
update public.profiles set branch_id = (select id from public.branches where name = 'Talwandi') where id = '<user-uuid>';
```

## 3. Environment variables

Copy `.env.example` → `.env` for local dev and fill in your values.

In Cloudflare (Workers/Pages → Settings → Variables) set:

- Build/plaintext: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
- Secret: `SUPABASE_SERVICE_ROLE_KEY` (`wrangler secret put SUPABASE_SERVICE_ROLE_KEY`)

`VITE_*` values are inlined at build time, so a rebuild is required after changing them.

## 4. Build & deploy

```bash
npm install
npm run build
npx wrangler deploy      # or connect the repo to Cloudflare Pages/Workers
```

## Notes

- Rotate any key that has ever been pasted into a chat or committed.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — server-side only, never `VITE_`.
- Invoices are immutable by design: `UPDATE`/`DELETE` are revoked on `sales`
  and `sale_items` at the database level.
