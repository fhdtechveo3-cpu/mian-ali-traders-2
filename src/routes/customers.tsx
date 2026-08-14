import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Download, CreditCard, Printer, Receipt, Building2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useCustomerPayments, useCustomers, useMovements, useSales, useSupplierPayments, useSuppliers } from "@/lib/queries";
import { PKR, exportRows } from "@/lib/pos";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Customers & Udhaar Recovery — Mian Ali Traders POS" },
      { name: "description", content: "Maintain customer contacts, Udhaar balances, payment recoveries and supplier records for both branches." },
      { property: "og:title", content: "Customers & Udhaar Recovery — Mian Ali Traders POS" },
      { property: "og:description", content: "Customer purchase history, Udhaar recovery payments and supplier directory." },
    ],
  }),
  component: CustomersPage,
});

type PaymentReceiptData = {
  customerName: string;
  customerPhone?: string;
  amountPaid: number;
  remainingDue: number;
  paymentMethod: string;
  date: string;
  branchName: string;
  notes?: string;
};

function CustomersPage() {
  const { activeBranch, profile, branches } = useAuth();
  const qc = useQueryClient();
  const { data: customers = [] } = useCustomers(activeBranch);
  const { data: suppliers = [] } = useSuppliers();
  const { data: sales = [] } = useSales(activeBranch);
  const { data: customerPayments = [] } = useCustomerPayments(activeBranch);
  const { data: movements = [] } = useMovements("all");
  const { data: supplierPayments = [] } = useSupplierPayments();

  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<"customer" | "supplier" | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", city: "" });

  // Payment Recovery Dialog states
  const [selectedPayCustomer, setSelectedPayCustomer] = useState<(typeof customers)[0] | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("Cash");
  const [payNotes, setPayNotes] = useState("");

  // Vendor / Supplier Payment Dialog states
  const [selectedPaySupplier, setSelectedPaySupplier] = useState<(typeof suppliers)[0] | null>(null);
  const [supplierPayAmount, setSupplierPayAmount] = useState(0);
  const [supplierPayMethod, setSupplierPayMethod] = useState("Bank Transfer");
  const [supplierPayNotes, setSupplierPayNotes] = useState("");

  // Printable Payment Receipt & Vendor Voucher states
  const [receiptModal, setReceiptModal] = useState<PaymentReceiptData | null>(null);
  const [supplierVoucherModal, setSupplierVoucherModal] = useState<PaymentReceiptData | null>(null);

  const stats = useMemo(() => {
    const m = new Map<string, { spent: number; due: number; count: number; earliestDueDate: string | null; overdueDays: number }>();
    sales.forEach((s) => {
      if (!s.customer_id) return;
      const row = m.get(s.customer_id) ?? { spent: 0, due: 0, count: 0, earliestDueDate: null, overdueDays: 0 };
      row.spent += Number(s.total);
      row.due += Number(s.remaining_amount);
      row.count += 1;
      if (s.due_date && Number(s.remaining_amount) > 0) {
        if (!row.earliestDueDate || new Date(s.due_date) < new Date(row.earliestDueDate)) {
          row.earliestDueDate = s.due_date;
        }
      }
      m.set(s.customer_id, row);
    });

    const now = new Date();
    m.forEach((row) => {
      if (row.due > 0 && row.earliestDueDate) {
        const diffTime = now.getTime() - new Date(row.earliestDueDate).getTime();
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
        row.overdueDays = diffDays > 0 ? diffDays : 0;
      }
    });

    // Subtract payments received
    customerPayments.forEach((p) => {
      const row = m.get(p.customer_id);
      if (row) {
        row.due = Math.max(0, row.due - Number(p.amount));
        if (row.due === 0) {
          row.overdueDays = 0;
          row.earliestDueDate = null;
        }
      }
    });

    return m;
  }, [sales, customerPayments]);

  const supplierStats = useMemo(() => {
    const m = new Map<string, { purchasedValue: number; totalPaid: number; payableBalance: number }>();
    suppliers.forEach((s) => {
      m.set(s.id, { purchasedValue: 0, totalPaid: 0, payableBalance: 0 });
    });

    movements.forEach((mov) => {
      if (mov.supplier_id && mov.movement_type === "purchase") {
        const row = m.get(mov.supplier_id) ?? { purchasedValue: 0, totalPaid: 0, payableBalance: 0 };
        row.purchasedValue += Number(mov.quantity) * (Number(mov.purchase_price) || 0);
        m.set(mov.supplier_id, row);
      }
    });

    supplierPayments.forEach((sp) => {
      const row = m.get(sp.supplier_id);
      if (row) {
        row.totalPaid += Number(sp.amount);
      }
    });

    m.forEach((row) => {
      row.payableBalance = Math.max(0, row.purchasedValue - row.totalPaid);
    });

    return m;
  }, [suppliers, movements, supplierPayments]);

  const filtered = customers.filter((c) =>
    !term.trim() || [c.name, c.phone].some((f) => (f ?? "").toLowerCase().includes(term.toLowerCase())),
  );

  const udhaarCustomers = useMemo(() => {
    return filtered.filter((c) => (stats.get(c.id)?.due ?? 0) > 0);
  }, [filtered, stats]);

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

  const handleSavePayment = async () => {
    if (!selectedPayCustomer || payAmount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }

    const currentDue = stats.get(selectedPayCustomer.id)?.due ?? 0;
    if (payAmount > currentDue && currentDue > 0) {
      toast.warning(`Received amount PKR ${payAmount} is greater than current due PKR ${currentDue}`);
    }

    const targetBranch = activeBranch !== "all" ? activeBranch : (profile?.branch_id ?? branches[0]?.id ?? "");

    const { error } = await supabase.from("customer_payments").insert({
      customer_id: selectedPayCustomer.id,
      branch_id: targetBranch,
      amount: payAmount,
      payment_method: payMethod,
      notes: payNotes || null,
      created_by: profile?.id ?? null,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Udhaar payment of PKR ${payAmount} received for ${selectedPayCustomer.name}`);

    const newDue = Math.max(0, currentDue - payAmount);
    setReceiptModal({
      customerName: selectedPayCustomer.name,
      customerPhone: selectedPayCustomer.phone ?? undefined,
      amountPaid: payAmount,
      remainingDue: newDue,
      paymentMethod: payMethod,
      date: new Date().toISOString(),
      branchName: branches.find((b) => b.id === targetBranch)?.name ?? "Mian Ali Traders",
      notes: payNotes,
    });

    setSelectedPayCustomer(null);
    setPayAmount(0);
    setPayNotes("");
    void qc.invalidateQueries({ queryKey: ["customer_payments"] });
    void qc.invalidateQueries({ queryKey: ["sales"] });
  };

  const handleSaveSupplierPayment = async () => {
    if (!selectedPaySupplier || supplierPayAmount <= 0) {
      toast.error("Enter a valid supplier payment amount");
      return;
    }

    const currentPayable = supplierStats.get(selectedPaySupplier.id)?.payableBalance ?? 0;
    const targetBranch = activeBranch !== "all" ? activeBranch : (profile?.branch_id ?? branches[0]?.id ?? "");

    const { error } = await supabase.from("supplier_payments").insert({
      supplier_id: selectedPaySupplier.id,
      branch_id: targetBranch || null,
      amount: supplierPayAmount,
      payment_method: supplierPayMethod,
      notes: supplierPayNotes || null,
      created_by: profile?.id ?? null,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Vendor payment of PKR ${supplierPayAmount} paid to ${selectedPaySupplier.name}`);

    const newPayable = Math.max(0, currentPayable - supplierPayAmount);
    setSupplierVoucherModal({
      customerName: selectedPaySupplier.name,
      customerPhone: selectedPaySupplier.phone ?? undefined,
      amountPaid: supplierPayAmount,
      remainingDue: newPayable,
      paymentMethod: supplierPayMethod,
      date: new Date().toISOString(),
      branchName: branches.find((b) => b.id === targetBranch)?.name ?? "Mian Ali Traders",
      notes: supplierPayNotes,
    });

    setSelectedPaySupplier(null);
    setSupplierPayAmount(0);
    setSupplierPayNotes("");
    void qc.invalidateQueries({ queryKey: ["supplier_payments"] });
  };

  return (
    <AppShell
      title="Customers & Udhaar Recovery"
      subtitle={`${customers.length} customers (${udhaarCustomers.length} with pending Udhaar) · ${suppliers.length} suppliers`}
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
                "Outstanding Udhaar": stats.get(c.id)?.due ?? 0,
              })),
              "customers_udhaar_ledger",
            )
          }
        >
          <Download className="mr-2 h-4 w-4" /> Export Ledger
        </Button>
      }
    >
      <Tabs defaultValue="customers">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="customers">All Customers ({customers.length})</TabsTrigger>
            <TabsTrigger value="udhaar">
              Udhaar Customers <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-[10px] bg-red-600 text-white">{udhaarCustomers.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers ({suppliers.length})</TabsTrigger>
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

        {/* All Customers Tab */}
        <TabsContent value="customers">
          <Card><CardContent className="overflow-x-auto p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Total Spent</TableHead>
                  <TableHead className="text-right">Outstanding Udhaar</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const due = stats.get(c.id)?.due ?? 0;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.phone ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.address ?? "—"}</TableCell>
                      <TableCell className="text-right">{stats.get(c.id)?.count ?? 0}</TableCell>
                      <TableCell className="text-right font-medium">{PKR(stats.get(c.id)?.spent ?? 0)}</TableCell>
                      <TableCell className="text-right">
                        {due > 0 ? (
                          <Badge variant="destructive" className="bg-red-600 text-white font-bold">{PKR(due)}</Badge>
                        ) : (
                          <span className="text-emerald-600 font-semibold">Clean (Rs 0)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {due > 0 && (
                          <Button
                            size="xs"
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => {
                              setSelectedPayCustomer(c);
                              setPayAmount(due);
                            }}
                          >
                            <CreditCard className="mr-1 h-3.5 w-3.5" /> Receive Udhaar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filtered.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No customers found.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {/* Dedicated Udhaar Customers Tab */}
        <TabsContent value="udhaar">
          <Card><CardContent className="overflow-x-auto p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead className="text-right">Pending Udhaar Balance</TableHead>
                  <TableHead>Due Date & Overdue Alert</TableHead>
                  <TableHead className="text-right">Quick Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {udhaarCustomers.map((c) => {
                  const st = stats.get(c.id);
                  const due = st?.due ?? 0;
                  const isOverdue = (st?.overdueDays ?? 0) > 0;

                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-semibold text-foreground">{c.name}</TableCell>
                      <TableCell>{c.phone ?? "—"}</TableCell>
                      <TableCell className="text-right font-bold text-red-600 text-sm">{PKR(due)}</TableCell>
                      <TableCell>
                        {isOverdue ? (
                          <Badge variant="destructive" className="bg-red-600 text-white font-bold">
                            🔴 OVERDUE! Due: {st?.earliestDueDate} ({st?.overdueDays} Days Overdue)
                          </Badge>
                        ) : st?.earliestDueDate ? (
                          <Badge variant="outline" className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                            Due Date: {st.earliestDueDate}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Standard Udhaar</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => {
                            setSelectedPayCustomer(c);
                            setPayAmount(due);
                          }}
                        >
                          <CreditCard className="mr-1.5 h-4 w-4" /> Clear Udhaar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!udhaarCustomers.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-emerald-600 font-semibold">
                      🎉 No pending Udhaar customers! All customer accounts are clear.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {/* Suppliers / Vendor Accounts Ledger Tab */}
        <TabsContent value="suppliers">
          <Card><CardContent className="overflow-x-auto p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor / Supplier</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="text-right">Total Stock Purchased</TableHead>
                  <TableHead className="text-right">Total Payments Made</TableHead>
                  <TableHead className="text-right font-bold">Outstanding Payable (Dene Hain)</TableHead>
                  <TableHead className="text-right">Quick Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => {
                  const st = supplierStats.get(s.id);
                  const purchased = st?.purchasedValue ?? 0;
                  const paidVal = st?.totalPaid ?? 0;
                  const payable = st?.payableBalance ?? 0;

                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-semibold text-foreground flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" /> {s.name}
                      </TableCell>
                      <TableCell>{s.phone ?? "—"}</TableCell>
                      <TableCell>{s.city ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">{PKR(purchased)}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">{PKR(paidVal)}</TableCell>
                      <TableCell className="text-right font-bold text-sm">
                        {payable > 0 ? (
                          <Badge variant="destructive" className="bg-red-600 text-white font-bold">{PKR(payable)}</Badge>
                        ) : (
                          <span className="text-emerald-600 font-semibold">Cleared (Rs 0)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="xs"
                          className="bg-primary hover:bg-primary/90 text-white"
                          onClick={() => {
                            setSelectedPaySupplier(s);
                            setSupplierPayAmount(payable > 0 ? payable : 0);
                          }}
                        >
                          <CreditCard className="mr-1 h-3.5 w-3.5" /> Pay Supplier
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!suppliers.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No suppliers registered yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Receive Udhaar Payment Modal */}
      <Dialog open={!!selectedPayCustomer} onOpenChange={(v) => !v && setSelectedPayCustomer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5 text-emerald-600" /> Receive Udhaar Payment
            </DialogTitle>
          </DialogHeader>
          {selectedPayCustomer && (
            <div className="space-y-4 pt-2">
              <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-xs">
                <p><span className="font-semibold">Customer:</span> {selectedPayCustomer.name}</p>
                <p><span className="font-semibold">Phone:</span> {selectedPayCustomer.phone || "—"}</p>
                <p className="text-sm font-bold text-red-600 pt-1">
                  Current Udhaar Due: {PKR(stats.get(selectedPayCustomer.id)?.due ?? 0)}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Amount Received (PKR) *</Label>
                <Input
                  type="number"
                  min={1}
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value) || 0)}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Payment Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="EasyPaisa">EasyPaisa</SelectItem>
                    <SelectItem value="JazzCash">JazzCash</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Reference Note / Cheque # (Optional)</Label>
                <Input placeholder="e.g. Cleared via Cash" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setSelectedPayCustomer(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => void handleSavePayment()}>
              Save Udhaar Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Udhaar Payment Thermal Printable Receipt Dialog */}
      <Dialog open={!!receiptModal} onOpenChange={(v) => !v && setReceiptModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> Udhaar Payment Receipt
            </DialogTitle>
          </DialogHeader>

          {receiptModal && (
            <div id="udhaar-receipt-print" className="space-y-3 text-sm border p-4 rounded-md bg-white text-black">
              <div className="text-center">
                <img src="/logo.png" alt="Mian Ali Traders" className="mx-auto mb-2 h-14 w-auto object-contain" />
                <p className="font-bold text-base">MIAN ALI TRADERS</p>
                <p className="text-xs text-muted-foreground">{receiptModal.branchName}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(receiptModal.date).toLocaleString()}</p>
              </div>

              <div className="border-t border-b py-2 space-y-1 text-xs">
                <p><span className="font-semibold">Customer:</span> {receiptModal.customerName}</p>
                {receiptModal.customerPhone && <p><span className="font-semibold">Phone:</span> {receiptModal.customerPhone}</p>}
                <p><span className="font-semibold">Payment Method:</span> {receiptModal.paymentMethod}</p>
                {receiptModal.notes && <p><span className="font-semibold">Note:</span> {receiptModal.notes}</p>}
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between font-bold text-sm text-emerald-700">
                  <span>Amount Received:</span>
                  <span>{PKR(receiptModal.amountPaid)}</span>
                </div>
                <div className="flex justify-between font-semibold pt-1">
                  <span>Remaining Udhaar Due:</span>
                  <span className={receiptModal.remainingDue > 0 ? "text-red-600" : "text-emerald-600"}>
                    {PKR(receiptModal.remainingDue)}
                  </span>
                </div>
              </div>

              <div className="text-center pt-3 text-[11px] text-muted-foreground border-t">
                Thank you for your payment!
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setReceiptModal(null)}>Close</Button>
            <Button onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      {/* Pay Supplier / Vendor Payment Modal */}
      <Dialog open={!!selectedPaySupplier} onOpenChange={(v) => !v && setSelectedPaySupplier(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-primary" /> Pay Vendor / Supplier Payment
            </DialogTitle>
          </DialogHeader>
          {selectedPaySupplier && (
            <div className="space-y-4 pt-2">
              <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-xs">
                <p><span className="font-semibold">Vendor / Supplier:</span> {selectedPaySupplier.name}</p>
                <p><span className="font-semibold">Phone:</span> {selectedPaySupplier.phone || "—"}</p>
                <p className="text-sm font-bold text-red-600 pt-1">
                  Outstanding Payable (Dene Hain): {PKR(supplierStats.get(selectedPaySupplier.id)?.payableBalance ?? 0)}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Amount Paid to Vendor (PKR) *</Label>
                <Input
                  type="number"
                  min={1}
                  value={supplierPayAmount}
                  onChange={(e) => setSupplierPayAmount(Number(e.target.value) || 0)}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Payment Method</Label>
                <Select value={supplierPayMethod} onValueChange={setSupplierPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="EasyPaisa">EasyPaisa</SelectItem>
                    <SelectItem value="JazzCash">JazzCash</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Reference Note / Cheque # (Optional)</Label>
                <Input placeholder="e.g. Bank Transfer Ref #98765" value={supplierPayNotes} onChange={(e) => setSupplierPayNotes(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setSelectedPaySupplier(null)}>Cancel</Button>
            <Button className="bg-primary text-white" onClick={() => void handleSaveSupplierPayment()}>
              Save Vendor Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor Payment Voucher Printable Dialog */}
      <Dialog open={!!supplierVoucherModal} onOpenChange={(v) => !v && setSupplierVoucherModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> Vendor Payment Voucher
            </DialogTitle>
          </DialogHeader>

          {supplierVoucherModal && (
            <div id="vendor-voucher-print" className="space-y-3 text-sm border p-4 rounded-md bg-white text-black">
              <div className="text-center">
                <img src="/logo.png" alt="Mian Ali Traders" className="mx-auto mb-2 h-14 w-auto object-contain" />
                <p className="font-bold text-base">MIAN ALI TRADERS</p>
                <p className="text-xs text-muted-foreground">{supplierVoucherModal.branchName} — Vendor Payment Voucher</p>
                <p className="text-[11px] text-muted-foreground">{new Date(supplierVoucherModal.date).toLocaleString()}</p>
              </div>

              <div className="border-t border-b py-2 space-y-1 text-xs">
                <p><span className="font-semibold">Paid To Vendor:</span> {supplierVoucherModal.customerName}</p>
                {supplierVoucherModal.customerPhone && <p><span className="font-semibold">Phone:</span> {supplierVoucherModal.customerPhone}</p>}
                <p><span className="font-semibold">Payment Method:</span> {supplierVoucherModal.paymentMethod}</p>
                {supplierVoucherModal.notes && <p><span className="font-semibold">Note / Ref:</span> {supplierVoucherModal.notes}</p>}
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between font-bold text-sm text-emerald-700">
                  <span>Amount Paid:</span>
                  <span>{PKR(supplierVoucherModal.amountPaid)}</span>
                </div>
                <div className="flex justify-between font-semibold pt-1">
                  <span>Remaining Payable Balance:</span>
                  <span className={supplierVoucherModal.remainingDue > 0 ? "text-red-600" : "text-emerald-600"}>
                    {PKR(supplierVoucherModal.remainingDue)}
                  </span>
                </div>
              </div>

              <div className="text-center pt-3 text-[11px] text-muted-foreground border-t">
                Vendor Payment Record Saved.
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setSupplierVoucherModal(null)}>Close</Button>
            <Button onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print Voucher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>

      {/* Add Customer / Supplier Modal */}
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
