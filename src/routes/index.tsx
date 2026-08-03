import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import {
  Banknote,
  TrendingUp,
  ShoppingBag,
  PackageX,
  PackageMinus,
  PackagePlus,
  CalendarClock,
  Trophy,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/lib/auth";
import { useProducts, useSales } from "@/lib/queries";
import { PKR, NUM, startOf, daysToExpiry, type Sale } from "@/lib/pos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Mian Ali Traders POS" },
      { name: "description", content: "Live sales, profit, stock and branch performance for Mian Ali Traders medical stores in Talwandi and Kasur." },
      { property: "og:title", content: "Dashboard — Mian Ali Traders POS" },
      { property: "og:description", content: "Live sales, profit and inventory overview across both medical store branches." },
    ],
  }),
  component: Dashboard,
});

const sum = (rows: Sale[], key: keyof Sale) => rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);

function Dashboard() {
  const { activeBranch, branches, isAdmin } = useAuth();
  const { data: products = [] } = useProducts(activeBranch);
  const { data: sales = [] } = useSales(activeBranch);

  const since = (d: Date) => sales.filter((s) => new Date(s.created_at) >= d);
  const today = since(startOf("day"));
  const week = since(startOf("week"));
  const month = since(startOf("month"));
  const year = since(startOf("year"));

  const low = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_level);
  const out = products.filter((p) => p.stock_quantity <= 0);
  const nearExpiry = products.filter((p) => {
    const d = daysToExpiry(p.expiry_date);
    return d !== null && d >= 0 && d <= 90;
  });
  const newProducts = products.filter((p) => new Date(p.created_at) >= startOf("month"));

  const topProduct = (() => {
    const counts = new Map<string, number>();
    products.forEach((p) => counts.set(p.name, 0));
    return products.slice().sort((a, b) => b.selling_price - a.selling_price)[0]?.name ?? "—";
  })();

  return (
    <AppShell
      title="Company Dashboard"
      subtitle={activeBranch === "all" ? "Combined view · all branches" : branches.find((b) => b.id === activeBranch)?.name}
      actions={
        <Button asChild>
          <Link to="/pos">New Sale</Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's Revenue" value={PKR(sum(today, "total"))} icon={Banknote} hint={`${today.length} orders today`} />
        <StatCard label="Today's Profit" value={PKR(sum(today, "profit"))} icon={TrendingUp} tone="success" />
        <StatCard label="Monthly Revenue" value={PKR(sum(month, "total"))} icon={ShoppingBag} hint={`${month.length} orders`} />
        <StatCard
          label="Average Order Value"
          value={PKR(month.length ? sum(month, "total") / month.length : 0)}
          icon={Trophy}
        />
        <StatCard label="Weekly Sales" value={PKR(sum(week, "total"))} icon={Banknote} hint="Last 7 days" />
        <StatCard label="Yearly Sales" value={PKR(sum(year, "total"))} icon={Banknote} />
        <StatCard label="Low Stock" value={low.length} icon={PackageMinus} tone="warning" hint="Needs re-order" />
        <StatCard label="Out of Stock" value={out.length} icon={PackageX} tone="destructive" />
        <StatCard label="New Products (this month)" value={newProducts.length} icon={PackagePlus} />
        <StatCard label="Near Expiry (90 days)" value={nearExpiry.length} icon={CalendarClock} tone="warning" />
        <StatCard label="Total Products" value={products.length} icon={ShoppingBag} />
        <StatCard label="Top Priced Medicine" value={topProduct} icon={Trophy} />
      </div>

      {isAdmin && activeBranch === "all" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Branch Performance</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {branches.map((b) => {
              const bs = sales.filter((s) => s.branch_id === b.id);
              const bp = products.filter((p) => p.branch_id === b.id);
              return (
                <div key={b.id} className="rounded-lg border p-4">
                  <p className="font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.city}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                      <p className="font-semibold">{PKR(sum(bs, "total"))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Profit</p>
                      <p className="font-semibold text-success">{PKR(sum(bs, "profit"))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Products</p>
                      <p className="font-semibold">{NUM(bp.length)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...out, ...low].slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="truncate">{p.name}</span>
                <Badge variant={p.stock_quantity <= 0 ? "destructive" : "secondary"}>
                  {p.stock_quantity <= 0 ? "Out of stock" : `${NUM(p.stock_quantity)} ${p.unit} left`}
                </Badge>
              </div>
            ))}
            {!out.length && !low.length && <p className="text-sm text-muted-foreground">All stock levels are healthy.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sales.slice(0, 8).map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.invoice_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()} · {s.customer_name || "Walk-in"}
                  </p>
                </div>
                <span className="font-semibold">{PKR(s.total)}</span>
              </div>
            ))}
            {!sales.length && <p className="text-sm text-muted-foreground">No sales recorded yet.</p>}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
