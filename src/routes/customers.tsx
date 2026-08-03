import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useCustomers, useSales, useSuppliers } from "@/lib/queries";
import { PKR, exportRows } from "@/lib/pos";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Customers & Suppliers — Mian Ali Traders POS" },
      { name: "description", content: "Maintain customer contacts with purchase history and outstanding balances, plus supplier records for both branches." },
      { property: "og:title", content: "Customers & Suppliers — Mian Ali Traders POS" },
      { property: "og:description", content: "Customer purchase history, dues and supplier directory." },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { activeBranch, profile, branches } = useAuth();
  const qc = useQueryClient();
  const { data: customers = [] } = useCustomers(activeBranch);
  const { data: suppliers = [] } = useSuppliers();
  const { data: sales = [] } = useSales(activeBranch);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<"customer" | "supplier" | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", city: "" });

  const stats = useMemo(() => {
    const m = new Map<string, { spent: number; due: number; count: number }>();
    sales.forEach((s) => {
      if (!s.customer_id) return;
      const row = m.get(s.customer_id) ?? { spent: 0, due: 0, count: 0 };
      row.spent += Number(s.total);
      row.due += Number(s.remaining_amount);
      row.count += 1;
      m.set(s.customer_id, row);
    });
    return m;
  }, [sales]);

  const filtered = customers.filter((c) =>
    !term.trim() || [c.name, c.phone].some((f) => (f ?? "").toLowerCase().includes(term.toLowerCase())),
  );

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const { error } =
      open === "supplier"
        ? await supabase.from("suppliers").insert({ name: form.name, phone: form.phone || null, city: form.city || null })
        : await supabase.from("customers").insert({
            name: form.name,
            phone: form.phone || null,
            address: form.address || null,
            branch_id: activeBranch !== "all" ? activeBranch : (profile?.branch_id ?? branches[0]?.id ?? null),
          });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(open === "supplier" ? "Supplier added" : "Customer added");
    setForm({ name: "", phone: "", address: "", city: "" });
    setOpen(null);
    void qc.invalidateQueries();
  };

  return (
    <AppShell
      title="Customers & Suppliers"
      subtitle={`${customers.length} customers · ${suppliers.length} suppliers`}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportRows(
              filtered.map((c) => ({
                Name: c.name,
                Phone: c.phone,
                Address: c.address,
                Purchases: stats.get(c.id)?.count ?? 0,
                "Total Spent": stats.get(c.id)?.spent ?? 0,
                Outstanding: stats.get(c.id)?.due ?? 0,
              })),
              "customers",
            )
          }
        >
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      }
    >
      <Tabs defaultValue="customers">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="w-[220px] pl-9" placeholder="Search name or phone" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <Button size="sm" onClick={() => setOpen("customer")}><Plus className="mr-2 h-4 w-4" /> Customer</Button>
            <Button size="sm" variant="outline" onClick={() => setOpen("supplier")}><Plus className="mr-2 h-4 w-4" /> Supplier</Button>
          </div>
        </div>

        <TabsContent value="customers">
          <Card><CardContent className="overflow-x-auto p-4">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Address</TableHead><TableHead className="text-right">Invoices</TableHead><TableHead className="text-right">Total spent</TableHead><TableHead className="text-right">Outstanding</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.address ?? "—"}</TableCell>
                    <TableCell className="text-right">{stats.get(c.id)?.count ?? 0}</TableCell>
                    <TableCell className="text-right">{PKR(stats.get(c.id)?.spent ?? 0)}</TableCell>
                    <TableCell className="text-right">{PKR(stats.get(c.id)?.due ?? 0)}</TableCell>
                  </TableRow>
                ))}
                {!filtered.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No customers yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="suppliers">
          <Card><CardContent className="overflow-x-auto p-4">
            <Table>
              <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead>Phone</TableHead><TableHead>City</TableHead></TableRow></TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.phone ?? "—"}</TableCell>
                    <TableCell>{s.city ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {!suppliers.length && <TableRow><TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">No suppliers yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{open === "supplier" ? "Add supplier" : "Add customer"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            {open === "supplier" && (
              <div className="space-y-1.5"><Label className="text-xs">City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
            <Button onClick={() => void save()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
