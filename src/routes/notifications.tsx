import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, PackageX, Wallet } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useProducts, useSales } from "@/lib/queries";
import { PKR, daysToExpiry, stockStatus } from "@/lib/pos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Alerts & Notifications — Mian Ali Traders POS" },
      { name: "description", content: "Low stock, out of stock, expiry and unpaid invoice alerts collected in one place for both branches." },
      { property: "og:title", content: "Alerts & Notifications — Mian Ali Traders POS" },
      { property: "og:description", content: "Live stock, expiry and payment alerts for the medical stores." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { activeBranch, branches } = useAuth();
  const { data: products = [] } = useProducts(activeBranch);
  const { data: sales = [] } = useSales(activeBranch);

  const low = products.filter((p) => stockStatus(p) === "low");
  const out = products.filter((p) => stockStatus(p) === "out");
  const expiring = products.filter((p) => {
    const d = daysToExpiry(p.expiry_date);
    return d !== null && d <= 90;
  });
  const unpaid = sales.filter((s) => Number(s.remaining_amount) > 0);
  const city = (id: string) => branches.find((b) => b.id === id)?.city ?? "";

  const groups = [
    {
      title: "Out of stock",
      icon: PackageX,
      tone: "destructive" as const,
      rows: out.map((p) => ({ key: p.id, main: p.name, meta: `${city(p.branch_id)} · reorder immediately`, badge: "0" })),
    },
    {
      title: "Low stock",
      icon: AlertTriangle,
      tone: "warning" as const,
      rows: low.map((p) => ({ key: p.id, main: p.name, meta: `${city(p.branch_id)} · min ${p.low_stock_level}`, badge: `${p.stock_quantity} ${p.unit}` })),
    },
    {
      title: "Expiry alerts (90 days)",
      icon: CalendarClock,
      tone: "warning" as const,
      rows: expiring.map((p) => {
        const d = daysToExpiry(p.expiry_date)!;
        return { key: p.id, main: p.name, meta: `${city(p.branch_id)} · expires ${p.expiry_date}`, badge: d < 0 ? "Expired" : `${d} days` };
      }),
    },
    {
      title: "Unpaid / partial invoices",
      icon: Wallet,
      tone: "destructive" as const,
      rows: unpaid.map((s) => ({ key: s.id, main: s.invoice_number, meta: `${s.customer_name || "Walk-in"} · ${city(s.branch_id)}`, badge: PKR(s.remaining_amount) })),
    },
  ];

  const total = groups.reduce((a, g) => a + g.rows.length, 0);

  return (
    <AppShell title="Notifications" subtitle={`${total} alerts need your attention`}>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <g.icon className={`h-4 w-4 ${g.tone === "destructive" ? "text-destructive" : "text-warning"}`} />
                {g.title}
              </CardTitle>
              <Badge variant={g.rows.length ? (g.tone === "destructive" ? "destructive" : "secondary") : "outline"}>{g.rows.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {g.rows.slice(0, 20).map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.main}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.meta}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">{r.badge}</Badge>
                </div>
              ))}
              {!g.rows.length && <p className="py-4 text-center text-sm text-muted-foreground">All clear.</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
