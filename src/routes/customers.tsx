import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Download, CreditCard, Printer, Receipt, Building2, FileText, Pencil, Users, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useCustomerPayments, useCustomers, useMovements, useProducts, useReturns, useSaleItems, useSales, useSupplierPayments, useSuppliers } from "@/lib/queries";
import { PKR, NUM, exportRows, formatDateOnly, printReportDocument, openWhatsAppMessage } from "@/lib/pos";
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
      { title: "Parties & Khata — Mian Ali Traders POS" },
      { name: "description", content: "Unified trading parties directory, credit sales, stock purchases and dual-sided debt ledger." },
      { property: "og:title", content: "Parties & Khata — Mian Ali Traders POS" },
      { property: "og:description", content: "Unified customer & supplier parties directory with 360-degree khata ledger." },
    ],
  }),
  component: PartiesAndKhataPage,
});

export type Party = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  branch_id?: string | null;
};

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

function PartiesAndKhataPage() {
  const { activeBranch, profile, branches } = useAuth();
  const qc = useQueryClient();
  const { data: customers = [] } = useCustomers(activeBranch);
  const { data: suppliers = [] } = useSuppliers();
  const { data: sales = [] } = useSales(activeBranch);
  const { data: returns = [] } = useReturns(activeBranch);
  const { data: customerPayments = [] } = useCustomerPayments(activeBranch);
  const { data: saleItems = [] } = useSaleItems();
  const { data: movements = [] } = useMovements("all");
  const { data: supplierPayments = [] } = useSupplierPayments();
  const { data: products = [] } = useProducts("all");

  const [term, setTerm] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");

  // Add / Edit Party Modal States
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [editParty, setEditParty] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState({ name: "", phone: "", address: "", city: "" });

  // 360-Degree Statement Modal State
  const [statementParty, setStatementParty] = useState<Party | null>(null);

  // Payment Recovery (Customer Udhaar) Dialog states
  const [selectedPayCustomer, setSelectedPayCustomer] = useState<Party | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("Cash");
  const [payNotes, setPayNotes] = useState("");

  // Vendor / Supplier Payment Dialog states
  const [selectedPaySupplier, setSelectedPaySupplier] = useState<Party | null>(null);
  const [supplierPayAmount, setSupplierPayAmount] = useState(0);
  const [supplierPayMethod, setSupplierPayMethod] = useState("Bank Transfer");
  const [supplierPayNotes, setSupplierPayNotes] = useState("");

  // Printable Payment Receipt & Vendor Voucher states
  const [receiptModal, setReceiptModal] = useState<PaymentReceiptData | null>(null);
  const [supplierVoucherModal, setSupplierVoucherModal] = useState<PaymentReceiptData | null>(null);

  // Unified Parties List (Merging Customers & Suppliers by ID and Name)
  const parties = useMemo<Party[]>(() => {
    const map = new Map<string, Party>();

    customers.forEach((c) => {
      map.set(c.id, {
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        city: (c as unknown as { city?: string }).city || null,
        branch_id: c.branch_id,
      });
    });

    suppliers.forEach((s) => {
      const existing = map.get(s.id);
      if (existing) {
        existing.city = existing.city || s.city;
        if (!existing.phone && s.phone) existing.phone = s.phone;
      } else {
        map.set(s.id, {
          id: s.id,
          name: s.name,
          phone: s.phone,
          address: (s as unknown as { address?: string }).address || null,
          city: s.city,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, suppliers]);

  const refundedBySaleMap = useMemo(() => {
    const map = new Map<string, number>();
    returns.forEach((r) => {
      if (r.sale_id) {
        const prev = map.get(r.sale_id) || 0;
        map.set(r.sale_id, prev + Number(r.refund_amount));
      }
      if (r.invoice_number) {
        const prev = map.get(r.invoice_number) || 0;
        map.set(r.invoice_number, prev + Number(r.refund_amount));
      }
    });
    return map;
  }, [returns]);

  // Dual-Sided Khata Stats for Each Party
  const partyStats = useMemo(() => {
    const m = new Map<
      string,
      {
        salesCount: number;
        salesBilled: number;
        salesPaid: number;
        receivableDue: number;
        earliestDueDate: string | null;
        overdueDays: number;
        purchasedValue: number;
        purchasesPaid: number;
        payableDue: number;
        netKhataBalance: number; // positive = we receive (+ Lene Hain), negative = we owe (- Dene Hain)
      }
    >();

    const getRow = (id: string) => {
      let r = m.get(id);
      if (!r) {
        r = {
          salesCount: 0,
          salesBilled: 0,
          salesPaid: 0,
          receivableDue: 0,
          earliestDueDate: null,
          overdueDays: 0,
          purchasedValue: 0,
          purchasesPaid: 0,
          payableDue: 0,
          netKhataBalance: 0,
        };
        m.set(id, r);
      }
      return r;
    };

    // 1. Sales & Customer Udhaar
    sales.forEach((s) => {
      if (!s.customer_id) return;
      const row = getRow(s.customer_id);
      const refSum = Math.max(
        refundedBySaleMap.get(s.id) || 0,
        refundedBySaleMap.get(s.invoice_number) || 0,
      );
      const effTotal = Math.max(0, Number(s.total) - refSum);
      const effRemaining = refSum >= Number(s.total) ? 0 : Math.max(0, Number(s.remaining_amount) - refSum);

      row.salesBilled += effTotal;
      row.receivableDue += effRemaining;
      row.salesCount += 1;

      if (s.due_date && effRemaining > 0) {
        if (!row.earliestDueDate || new Date(s.due_date) < new Date(row.earliestDueDate)) {
          row.earliestDueDate = s.due_date;
        }
      }
    });

    // 2. Customer Payments Received
    customerPayments.forEach((p) => {
      const row = getRow(p.customer_id);
      row.salesPaid += Number(p.amount);
    });

    // 3. Stock Purchases (from movements)
    movements.forEach((mov) => {
      if (mov.supplier_id && mov.movement_type === "purchase") {
        const row = getRow(mov.supplier_id);
        const cost = Number(mov.quantity) * (Number(mov.purchase_price) || 0);
        row.purchasedValue += cost;
      }
    });

    // 4. Supplier Payments Made
    supplierPayments.forEach((sp) => {
      const row = getRow(sp.supplier_id);
      row.purchasesPaid += Number(sp.amount);
    });

    const now = new Date();
    m.forEach((row) => {
      // Net receivable from sales
      const netCustReceivable = row.receivableDue - row.salesPaid;
      // Net payable from purchases
      const netSupPayable = Math.max(0, row.purchasedValue - row.purchasesPaid);
      row.payableDue = netSupPayable;

      // Net Khata Position: (Sales Due) - (Purchases Due)
      row.netKhataBalance = netCustReceivable - netSupPayable;

      if (netCustReceivable > 0 && row.earliestDueDate) {
        const diffTime = now.getTime() - new Date(row.earliestDueDate).getTime();
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
        row.overdueDays = diffDays > 0 ? diffDays : 0;
      } else {
        row.overdueDays = 0;
      }
    });

    return m;
  }, [sales, customerPayments, movements, supplierPayments, refundedBySaleMap]);

  // Filters
  const filteredParties = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return parties;
    return parties.filter((p) =>
      [p.name, p.phone, p.city, p.address].some((f) => (f ?? "").toLowerCase().includes(t)),
    );
  }, [parties, term]);

  const receivableParties = useMemo(() => {
    return filteredParties.filter((p) => {
      const st = partyStats.get(p.id);
      return (st?.receivableDue ?? 0) > 0 || (st?.netKhataBalance ?? 0) > 0;
    });
  }, [filteredParties, partyStats]);

  const payableParties = useMemo(() => {
    return filteredParties.filter((p) => {
      const st = partyStats.get(p.id);
      return (st?.payableDue ?? 0) > 0 || (st?.netKhataBalance ?? 0) < 0;
    });
  }, [filteredParties, partyStats]);

  // Unified 360-Degree Party Ledger Timeline
  const unifiedPartyTimeline = useMemo(() => {
    if (!statementParty) return [];
    const pId = statementParty.id;

    const timeline: Array<{
      id: string;
      date: string;
      type: "sale" | "cust_payment" | "purchase" | "sup_payment";
      refNo: string;
      particulars: string;
      debit: number;  // Humne Lene Hain (+ Receivable)
      credit: number; // Humne Dene Hain / Paid (- Payable / Received)
      runningBalance: number;
    }> = [];

    // 1. Sales to this party
    sales.filter((s) => s.customer_id === pId).forEach((s) => {
      const sItems = saleItems.filter((i) => (i as unknown as { sale_id: string }).sale_id === s.id);
      const itemDesc = sItems.length
        ? sItems.map((i) => `${i.product_name} (${NUM(i.quantity)} × Rs ${i.price})`).join(", ")
        : "Credit Sale";
      timeline.push({
        id: `sale-${s.id}`,
        date: s.created_at,
        type: "sale",
        refNo: s.invoice_number,
        particulars: `Farokht / Sale: ${itemDesc}`,
        debit: Number(s.total),
        credit: 0,
        runningBalance: 0,
      });
    });

    // 2. Customer Payments received from this party
    customerPayments.filter((p) => p.customer_id === pId).forEach((p) => {
      timeline.push({
        id: `cpay-${p.id}`,
        date: p.created_at,
        type: "cust_payment",
        refNo: `REC-${p.id.slice(0, 8).toUpperCase()}`,
        particulars: `Payment Received (${p.payment_method})${p.notes || p.note ? ` — ${p.notes || p.note}` : ""}`,
        debit: 0,
        credit: Number(p.amount),
        runningBalance: 0,
      });
    });

    // 3. Stock Purchases from this party
    const prodMap = new Map(products.map((p) => [p.id, p.name]));
    movements.filter((m) => m.supplier_id === pId && m.movement_type === "purchase").forEach((m) => {
      const prodName = prodMap.get(m.product_id) || "Stock Purchase";
      const cost = Number(m.quantity) * (Number(m.purchase_price) || 0);
      timeline.push({
        id: `mov-${m.id}`,
        date: m.created_at,
        type: "purchase",
        refNo: m.reference || "PO-Stock",
        particulars: `Khareedari / Stock In: ${prodName} (${NUM(m.quantity)} Qty @ Rs ${NUM(m.purchase_price || 0)})${m.note ? ` · ${m.note}` : ""}`,
        debit: 0,
        credit: cost,
        runningBalance: 0,
      });
    });

    // 4. Payments made to this party
    supplierPayments.filter((sp) => sp.supplier_id === pId).forEach((sp) => {
      timeline.push({
        id: `spay-${sp.id}`,
        date: sp.created_at,
        type: "sup_payment",
        refNo: "PAY-VOUCHER",
        particulars: `Vendor Payment Paid (${sp.payment_method})${sp.notes ? ` — ${sp.notes}` : ""}`,
        debit: Number(sp.amount),
        credit: 0,
        runningBalance: 0,
      });
    });

    timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    timeline.forEach((row) => {
      running += row.debit - row.credit;
      row.runningBalance = running;
    });

    return timeline;
  }, [statementParty, sales, customerPayments, movements, supplierPayments, saleItems, products]);

  const sharePartyStatementWhatsApp = (party: Party) => {
    const st = partyStats.get(party.id);
    const netBal = st?.netKhataBalance ?? 0;
    const salesVal = st?.salesBilled ?? 0;
    const purchVal = st?.purchasedValue ?? 0;
    const salesPaid = st?.salesPaid ?? 0;
    const purchasesPaid = st?.purchasesPaid ?? 0;

    let balanceText = "🟢 *Hisaab Barabar Hai (Rs 0)*";
    if (netBal > 0) {
      balanceText = `🔴 *Aapki Taraf Baqaya (Lene Hain):* ${PKR(netBal)}`;
    } else if (netBal < 0) {
      balanceText = `🔵 *Hamari Taraf Baqaya (Dene Hain):* ${PKR(Math.abs(netBal))}`;
    }

    const todayStr = new Date().toLocaleDateString("en-GB");

    let msg = `🏥 *MIAN ALI TRADERS — KHATA STATEMENT*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `👤 *Party / Khata:* ${party.name}\n`;
    if (party.city) msg += `📍 *City:* ${party.city}\n`;
    if (party.phone) msg += `📞 *Phone:* ${party.phone}\n`;
    msg += `📅 *Date:* ${todayStr}\n\n`;

    msg += `📦 *Sales (Maal Baicha):* ${PKR(salesVal)}\n`;
    msg += `📥 *Payments Received:* ${PKR(salesPaid)}\n`;
    msg += `🚚 *Purchases (Maal Khareeda):* ${PKR(purchVal)}\n`;
    msg += `📤 *Payments Made:* ${PKR(purchasesPaid)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚖️ *NET POSITION (صاف کھاتہ):*\n${balanceText}\n`;
    if (st?.earliestDueDate && netBal > 0) {
      msg += `🗓️ *Promised Due Date:* ${formatDateOnly(st.earliestDueDate)}\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Tafseeli hisaab ya kisi ghalti ki soorat me foran rabta farmayein.\n`;
    msg += `*Mian Ali Traders, Kasur*`;

    openWhatsAppMessage(party.phone, msg);
  };

  const sendQuickWhatsAppReminder = (party: Party) => {
    const st = partyStats.get(party.id);
    const netBal = st?.netKhataBalance ?? 0;
    if (netBal <= 0) {
      toast.info("Is party ka koi baqaya udhaar nahi hai.");
      return;
    }
    let msg = `Assalam-o-Alaikum *${party.name}* Sahab!\n\n`;
    msg += `Mian Ali Traders ki taraf se aapka baqaya udhaar *${PKR(netBal)}* hai.\n`;
    if (st?.earliestDueDate) {
      msg += `Aapki promised date *${formatDateOnly(st.earliestDueDate)}* thi.\n`;
    }
    msg += `Baraye meharbani baqaya raqam jald az jald ada farma kar shukriya ka moqa dein.\n\n`;
    msg += `*Mian Ali Traders, Kasur*`;

    openWhatsAppMessage(party.phone, msg);
  };

  const sharePaymentReceiptWhatsApp = (r: NonNullable<typeof receiptModal>) => {
    let msg = `🧾 *MIAN ALI TRADERS — PAYMENT RECEIPT*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `👤 *Customer / Party:* ${r.customerName}\n`;
    msg += `💵 *Payment Received:* ${PKR(r.amountPaid)}\n`;
    msg += `💳 *Method:* ${r.paymentMethod}\n`;
    msg += `📅 *Date:* ${new Date(r.date).toLocaleString("en-PK")}\n`;
    msg += `📉 *Remaining Udhaar Due:* ${PKR(r.remainingDue)}\n`;
    if (r.notes) msg += `📝 *Note:* ${r.notes}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Aapki adaigi wasool paayi gayi. Shukriya!\n`;
    msg += `*Mian Ali Traders*`;

    openWhatsAppMessage(r.customerPhone, msg);
  };

  // Save Party (Creates both customer and supplier entries with identical UUID)
  const saveParty = async () => {
    if (!partyForm.name.trim()) {
      toast.error("Party name is required");
      return;
    }
    const targetBranch = activeBranch !== "all" ? activeBranch : (profile?.branch_id ?? branches[0]?.id ?? null);
    const partyId = editParty?.id || crypto.randomUUID();

    // 1. Upsert into customers table
    const { error: custErr } = await supabase.from("customers").upsert({
      id: partyId,
      name: partyForm.name.trim(),
      phone: partyForm.phone.trim() || null,
      address: partyForm.address.trim() || null,
      city: partyForm.city.trim() || null,
      branch_id: targetBranch,
    });

    if (custErr) {
      toast.error("Failed to save party: " + custErr.message);
      return;
    }

    // 2. Mirror into suppliers table with same ID
    const { error: supErr } = await supabase.from("suppliers").upsert({
      id: partyId,
      name: partyForm.name.trim(),
      phone: partyForm.phone.trim() || null,
      city: partyForm.city.trim() || null,
    });

    if (supErr) {
      console.warn("Supplier mirror notice:", supErr.message);
    }

    toast.success(editParty ? "Party updated successfully" : "New Party registered successfully");
    setPartyModalOpen(false);
    setEditParty(null);
    setPartyForm({ name: "", phone: "", address: "", city: "" });
    void qc.invalidateQueries({ queryKey: ["customers"] });
    void qc.invalidateQueries({ queryKey: ["suppliers"] });
  };

  const handleSavePayment = async () => {
    if (!selectedPayCustomer || payAmount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }

    const currentDue = partyStats.get(selectedPayCustomer.id)?.receivableDue ?? 0;
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
      note: payNotes || null,
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

    const currentPayable = partyStats.get(selectedPaySupplier.id)?.payableDue ?? 0;
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

  const renderPartyTable = (partyList: Party[]) => (
    <Card>
      <CardContent className="overflow-x-auto p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Party / Business Name</TableHead>
              <TableHead>Phone & City</TableHead>
              <TableHead className="text-right">Sales (Baicha)</TableHead>
              <TableHead className="text-right">Purchases (Khareeda)</TableHead>
              <TableHead className="text-right font-bold">Net Khata (صاف کھاتہ)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partyList.map((p) => {
              const st = partyStats.get(p.id);
              const netBal = st?.netKhataBalance ?? 0;
              const salesVal = st?.salesBilled ?? 0;
              const purchVal = st?.purchasedValue ?? 0;
              const isOverdue = (st?.overdueDays ?? 0) > 0;

              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-primary" /> {p.name}
                      </span>
                      {p.address && <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{p.address}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-xs">
                      <span>{p.phone ?? "—"}</span>
                      <span className="text-muted-foreground">{p.city ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium text-xs">
                    {PKR(salesVal)}
                    {st?.receivableDue ? (
                      <span className="block text-[10px] text-red-600 font-semibold">Due: {PKR(st.receivableDue)}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-medium text-xs">
                    {PKR(purchVal)}
                    {st?.payableDue ? (
                      <span className="block text-[10px] text-blue-600 font-semibold">Due: {PKR(st.payableDue)}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {netBal > 0 ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <Badge variant="destructive" className="bg-red-600 text-white font-bold">
                          🔴 {PKR(netBal)} Lene Hain
                        </Badge>
                        {isOverdue && (
                          <span className="text-[9px] font-bold text-red-600">
                            {st?.overdueDays}d Overdue!
                          </span>
                        )}
                      </div>
                    ) : netBal < 0 ? (
                      <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                        🔵 {PKR(Math.abs(netBal))} Dene Hain
                      </Badge>
                    ) : (
                      <span className="text-emerald-600 font-semibold text-xs">🟢 Clean (Rs 0)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setStatementParty(p)}
                        title="View 360° Complete Khata Statement"
                      >
                        <FileText className="mr-1 h-3.5 w-3.5 text-primary" /> Statement
                      </Button>

                      <Button
                        size="xs"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        title={netBal > 0 ? "Send WhatsApp Udhaar Reminder" : "Share Khata on WhatsApp"}
                        onClick={() => (netBal > 0 ? sendQuickWhatsAppReminder(p) : sharePartyStatementWhatsApp(p))}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>

                      {netBal > 0 ? (
                        <Button
                          size="xs"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => {
                            setSelectedPayCustomer(p);
                            setPayAmount(netBal);
                          }}
                        >
                          <CreditCard className="mr-1 h-3.5 w-3.5" /> Receive
                        </Button>
                      ) : netBal < 0 ? (
                        <Button
                          size="xs"
                          className="bg-primary hover:bg-primary/90 text-white"
                          onClick={() => {
                            setSelectedPaySupplier(p);
                            setSupplierPayAmount(Math.abs(netBal));
                          }}
                        >
                          <CreditCard className="mr-1 h-3.5 w-3.5" /> Pay
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            setSelectedPayCustomer(p);
                            setPayAmount(0);
                          }}
                        >
                          <CreditCard className="mr-1 h-3.5 w-3.5" /> Pay/Rec
                        </Button>
                      )}

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditParty(p);
                          setPartyForm({
                            name: p.name,
                            phone: p.phone ?? "",
                            address: p.address ?? "",
                            city: p.city ?? "",
                          });
                          setPartyModalOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!partyList.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No parties found matching your search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <AppShell
      title="Parties & Khata (پارٹیاں اور کھاتہ جات)"
      subtitle={`${parties.length} Total Parties · ${receivableParties.length} Receivables (Lene Hain) · ${payableParties.length} Payables (Dene Hain)`}
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportRows(
                parties.map((p) => {
                  const st = partyStats.get(p.id);
                  return {
                    "Party Name": p.name,
                    Phone: p.phone ?? "",
                    City: p.city ?? "",
                    Address: p.address ?? "",
                    "Sales Total": st?.salesBilled ?? 0,
                    "Purchases Total": st?.purchasedValue ?? 0,
                    "Receivable (Lene Hain)": st?.receivableDue ?? 0,
                    "Payable (Dene Hain)": st?.payableDue ?? 0,
                    "Net Balance": st?.netKhataBalance ?? 0,
                  };
                }),
                "parties_complete_khata",
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Export Khata
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditParty(null);
              setPartyForm({ name: "", phone: "", address: "", city: "" });
              setPartyModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add New Party
          </Button>
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="all">
              All Parties ({parties.length})
            </TabsTrigger>
            <TabsTrigger value="receivables">
              Receivables / Udhaar (ہم نے لینے ہیں){" "}
              <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-[10px] bg-red-600 text-white">
                {receivableParties.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="payables">
              Payables (ہم نے دینے ہیں){" "}
              <Badge className="ml-1.5 px-1.5 py-0 text-[10px] bg-blue-600 text-white">
                {payableParties.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-[240px] pl-9"
                placeholder="Search name, phone, city…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <TabsContent value="all" className="mt-4">
          {renderPartyTable(filteredParties)}
        </TabsContent>

        <TabsContent value="receivables" className="mt-4">
          {renderPartyTable(receivableParties)}
        </TabsContent>

        <TabsContent value="payables" className="mt-4">
          {renderPartyTable(payableParties)}
        </TabsContent>
      </Tabs>

      {/* Add / Edit Party Dialog */}
      <Dialog open={partyModalOpen} onOpenChange={setPartyModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {editParty ? "Edit Trading Party" : "Add New Trading Party (پارٹی شامل کریں)"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm pt-2">
            <div className="space-y-1.5">
              <Label>Party / Business Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Al-Madina Pharma or Bilal Traders"
                value={partyForm.name}
                onChange={(e) => setPartyForm({ ...partyForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input
                placeholder="03001234567"
                value={partyForm.phone}
                onChange={(e) => setPartyForm({ ...partyForm, phone: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input
                  placeholder="Kasur / Talwandi"
                  value={partyForm.city}
                  onChange={(e) => setPartyForm({ ...partyForm, city: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Address / Location</Label>
                <Input
                  placeholder="e.g. Grain Market"
                  value={partyForm.address}
                  onChange={(e) => setPartyForm({ ...partyForm, address: e.target.value })}
                />
              </div>
            </div>
            <div className="rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              💡 Yeh party sale (customer) aur purchase (supplier) dono ke liye automatically use ho sakegi.
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setPartyModalOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveParty()}>Save Party</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 360-Degree Unified Party Statement & Dual-Sided Ledger Modal */}
      <Dialog open={!!statementParty} onOpenChange={(v) => !v && setStatementParty(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>360° Complete Party Statement & Khata Ledger</span>
              <Button
                size="xs"
                variant="outline"
                onClick={() => statementParty && printReportDocument("printable-party-statement", `Statement_${statementParty.name}`)}
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Print Statement
              </Button>
            </DialogTitle>
          </DialogHeader>

          {statementParty && (
            <div id="printable-party-statement" className="space-y-4 py-2">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div>
                  <h2 className="text-xl font-bold text-foreground">MIAN ALI TRADERS</h2>
                  <p className="text-xs text-muted-foreground">Animal Medicines, Feed & Wanda · 360° Complete Khata Statement</p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-bold text-base text-foreground">{statementParty.name}</p>
                  <p className="text-muted-foreground">{statementParty.phone || "No Phone"}</p>
                  <p className="text-muted-foreground">{statementParty.city ? `${statementParty.city} · ` : ""}{statementParty.address || "Kasur / Talwandi"}</p>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-2.5">
                <div className="rounded-md border bg-muted/30 p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Total Sales (Baicha)</p>
                  <p className="text-base font-bold text-foreground">{PKR(partyStats.get(statementParty.id)?.salesBilled ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">Paid: {PKR(partyStats.get(statementParty.id)?.salesPaid ?? 0)}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Total Purchases (Khareeda)</p>
                  <p className="text-base font-bold text-foreground">{PKR(partyStats.get(statementParty.id)?.purchasedValue ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">Paid: {PKR(partyStats.get(statementParty.id)?.purchasesPaid ?? 0)}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Side-by-Side Balance</p>
                  <p className="text-xs font-semibold text-red-600">Udhaar: {PKR(partyStats.get(statementParty.id)?.receivableDue ?? 0)}</p>
                  <p className="text-xs font-semibold text-blue-600">Payable: {PKR(partyStats.get(statementParty.id)?.payableDue ?? 0)}</p>
                </div>
                <div className="rounded-md border bg-card p-2.5 text-center border-primary/40">
                  <p className="text-xs text-muted-foreground font-medium">Net Position (صاف کھاتہ)</p>
                  <p className="text-sm font-bold pt-0.5">
                    {(partyStats.get(statementParty.id)?.netKhataBalance ?? 0) > 0 ? (
                      <span className="text-red-600">🔴 {PKR(partyStats.get(statementParty.id)?.netKhataBalance)} Lene Hain</span>
                    ) : (partyStats.get(statementParty.id)?.netKhataBalance ?? 0) < 0 ? (
                      <span className="text-blue-600">🔵 {PKR(Math.abs(partyStats.get(statementParty.id)?.netKhataBalance ?? 0))} Dene Hain</span>
                    ) : (
                      <span className="text-emerald-600">🟢 Clean (Rs 0)</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Dual-Sided Combined Ledger Timeline Table */}
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Ref #</TableHead>
                      <TableHead>Particulars & Item Details</TableHead>
                      <TableHead className="text-right">Billed / Lene (+)</TableHead>
                      <TableHead className="text-right">Paid / Diye (-)</TableHead>
                      <TableHead className="text-right">Running Net Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unifiedPartyTimeline.map((row) => (
                      <TableRow key={row.id} className="text-xs">
                        <TableCell className="font-medium whitespace-nowrap">{formatDateOnly(row.date)}</TableCell>
                        <TableCell className="font-bold">
                          <Badge variant="outline" className="text-[10px]">
                            {row.refNo}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs">{row.particulars}</TableCell>
                        <TableCell className="text-right font-semibold text-red-600">
                          {row.debit > 0 ? PKR(row.debit) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">
                          {row.credit > 0 ? PKR(row.credit) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {row.runningBalance > 0 ? (
                            <span className="text-red-600">{PKR(row.runningBalance)} Lene</span>
                          ) : row.runningBalance < 0 ? (
                            <span className="text-blue-600">{PKR(Math.abs(row.runningBalance))} Dene</span>
                          ) : (
                            "Rs 0"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!unifiedPartyTimeline.length && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                          No transactions found for this party.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setStatementParty(null)}>Close</Button>
            <div className="flex items-center gap-2">
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => statementParty && sharePartyStatementWhatsApp(statementParty)}
              >
                <MessageCircle className="mr-2 h-4 w-4" /> Share on WhatsApp
              </Button>
              <Button onClick={() => statementParty && printReportDocument("printable-party-statement", `Statement_${statementParty.name}`)}>
                <Printer className="mr-2 h-4 w-4" /> Print / Save PDF
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <p><span className="font-semibold">Party / Customer:</span> {selectedPayCustomer.name}</p>
                <p><span className="font-semibold">Phone:</span> {selectedPayCustomer.phone || "—"}</p>
                <p className="text-sm font-bold text-red-600 pt-1">
                  Current Udhaar Due: {PKR(partyStats.get(selectedPayCustomer.id)?.receivableDue ?? 0)}
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

          <DialogFooter className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setReceiptModal(null)}>Close</Button>
            <div className="flex items-center gap-2">
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => receiptModal && sharePaymentReceiptWhatsApp(receiptModal)}
              >
                <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
              </Button>
              <Button onClick={() => printReportDocument("udhaar-receipt-print", `Receipt_${receiptModal?.customerName}`)}>
                <Printer className="mr-1.5 h-4 w-4" /> Print Receipt
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  Outstanding Payable (Dene Hain): {PKR(partyStats.get(selectedPaySupplier.id)?.payableDue ?? 0)}
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
                    <SelectItem value="EasyPaisa">EasyPaisa</SelectItem>
                    <SelectItem value="JazzCash">JazzCash</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Reference Note / Transaction ID (Optional)</Label>
                <Input placeholder="e.g. Bank slip #9821" value={supplierPayNotes} onChange={(e) => setSupplierPayNotes(e.target.value)} />
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
                <p className="text-xs text-muted-foreground">{supplierVoucherModal.branchName}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(supplierVoucherModal.date).toLocaleString()}</p>
              </div>

              <div className="border-t border-b py-2 space-y-1 text-xs">
                <p><span className="font-semibold">Paid To:</span> {supplierVoucherModal.customerName}</p>
                {supplierVoucherModal.customerPhone && <p><span className="font-semibold">Phone:</span> {supplierVoucherModal.customerPhone}</p>}
                <p><span className="font-semibold">Payment Method:</span> {supplierVoucherModal.paymentMethod}</p>
                {supplierVoucherModal.notes && <p><span className="font-semibold">Note:</span> {supplierVoucherModal.notes}</p>}
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between font-bold text-sm text-primary">
                  <span>Amount Paid:</span>
                  <span>{PKR(supplierVoucherModal.amountPaid)}</span>
                </div>
                <div className="flex justify-between font-semibold pt-1">
                  <span>Remaining Payable (Dene Hain):</span>
                  <span className={supplierVoucherModal.remainingDue > 0 ? "text-red-600" : "text-emerald-600"}>
                    {PKR(supplierVoucherModal.remainingDue)}
                  </span>
                </div>
              </div>

              <div className="text-center pt-3 text-[11px] text-muted-foreground border-t">
                Vendor Payment Voucher
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
    </AppShell>
  );
}
