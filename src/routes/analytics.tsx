import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/lib/auth";
import { useProducts, useSaleItems, useSales } from "@/lib/queries";
import { PKR, startOf } from "@/lib/pos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics & Insights — Mian Ali Traders POS" },
      { name: "description", content: "Daily, weekly, monthly and yearly sales trends, profit analysis, best sellers and branch comparison." },
      { property: "og:title", content: "Analytics & Insights — Mian Ali Traders POS" },
      { property: "og:description", content: "Sales trend, profit and product performance analytics for both medical stores." },
    ],
  }),
  component: AnalyticsPage,
});

type Range = "day" | "week" | "month" | "year";

function AnalyticsPage() {
  const { activeBranch, branches, isAdmin } = useAuth();
  const { data: sales = [] } = useSales(activeBranch);
  const { data: items = [] } = useSaleItems();
  const { data: products = [] } = useProducts(activeBranch);
  const [range, setRange] = useState<Range>("month");

  const start = startOf(range);
  const scoped = sales.filter((s) => new Date(s.created_at) >= start);

  const revenue = scoped.reduce((a, s) => a + Number(s.total), 0);
  const profit = scoped.reduce((a, s) => a + Number(s.profit), 0);
  const discount = scoped.reduce((a, s) => a + Number(s.discount), 0);
  const avg = scoped.length ? revenue / scoped.length : 0;

  const trend = useMemo(() => {
    const map = new Map<string, { date: string; revenue: number; profit: number }>();
    scoped.forEach((s) => {
      const key = new Date(s.created_at).toLocaleDateString("en-CA");
      const row = map.get(key) ?? { date: key, revenue: 0, profit: 0 };
      row.revenue += Number(s.total);
      row.profit += Number(s.profit);
      map.set(key, row);
    });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [scoped]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    items
      .filter((i) => {
        const branchOk = activeBranch === "all" || i.sales?.branch_id === activeBranch;
        return branchOk && new Date(i.created_at) >= start;
      })
      .forEach((i) => {
        const row = map.get(i.product_name) ?? { name: i.product_name, qty: 0, revenue: 0, profit: 0 };
        row.qty += Number(i.quantity);
        row.revenue += Number(i.line_total);
        row.profit += (Number(i.price) - Number(i.purchase_price)) * Number(i.quantity);
        map.set(i.product_name, row);
      });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [items, activeBranch, start]);

  const byBranch = branches.map((b) => {
    const bs = sales.filter((s) => s.branch_id === b.id && new Date(s.created_at) >= start);
    return {
      name: b.city ?? b.name,
      revenue: bs.reduce((a, s) => a + Number(s.total), 0),
      profit: bs.reduce((a, s) => a + Number(s.profit), 0),
    };
  });

  const deadStock = products
    .filter((p) => !topProducts.some((t) => t.name === p.name) && Number(p.stock_quantity) > 0)
    .slice(0, 10);

  return (
    <AppShell
      title="Analytics"
      subtitle="Sales trends, profit and product performance"
      actions={
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="day">Today</TabsTrigger>
            <TabsTrigger value="week">7 days</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="year">Year</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={PKR(revenue)} tone="success" />
        {isAdmin && <StatCard label="Profit" value={PKR(profit)} tone="success" hint={revenue ? `${((profit / revenue) * 100).toFixed(1)}% margin` : "No sales yet"} />}
        <StatCard label="Invoices" value={scoped.length} />
        <StatCard label="Average bill" value={PKR(avg)} hint={`Discounts given ${PKR(discount)}`} />
      </div>

      <Card className="mt-5">
        <CardHeader className="pb-2"><CardTitle className="text-base">Revenue & profit trend</CardTitle></CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => PKR(v)} />
              <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} />
              <Area type="monotone" dataKey="profit" stroke="var(--color-success)" fill="var(--color-success)" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Branch comparison</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byBranch}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: number) => PKR(v)} />
                <Bar dataKey="revenue" fill="var(--color-primary)" radius={4} />
                <Bar dataKey="profit" fill="var(--color-success)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Best selling products</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-4 pt-0">
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead>{isAdmin && <TableHead className="text-right">Profit</TableHead>}</TableRow></TableHeader>
              <TableBody>
                {topProducts.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-right">{t.qty}</TableCell>
                    <TableCell className="text-right">{PKR(t.revenue)}</TableCell>
                    {isAdmin && <TableCell className="text-right">{PKR(t.profit)}</TableCell>}
                  </TableRow>
                ))}
                {!topProducts.length && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No sales in this period.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader className="pb-2"><CardTitle className="text-base">Slow moving / dead stock</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-4 pt-0">
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Company</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Locked value</TableHead></TableRow></TableHeader>
            <TableBody>
              {deadStock.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-sm">{p.company ?? "—"}</TableCell>
                  <TableCell className="text-right">{p.stock_quantity} {p.unit}</TableCell>
                  <TableCell className="text-right">{PKR(Number(p.purchase_price) * Number(p.stock_quantity))}</TableCell>
                </TableRow>
              ))}
              {!deadStock.length && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Everything is moving well.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
