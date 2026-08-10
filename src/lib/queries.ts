import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product, Sale } from "@/lib/pos";

const scope = <T extends { eq: (c: string, v: string) => T }>(q: T, branch: string) =>
  branch === "all" ? q : q.eq("branch_id", branch);

export function useProducts(branch: string) {
  return useQuery({
    queryKey: ["products", branch],
    queryFn: async () => {
      const q = supabase.from("products").select("*").order("name");
      const { data, error } = await scope(q as never, branch);
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });
}

export function useSales(branch: string) {
  return useQuery({
    queryKey: ["sales", branch],
    queryFn: async () => {
      const q = supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(1000);
      const { data, error } = await scope(q as never, branch);
      if (error) throw error;
      return (data ?? []) as unknown as Sale[];
    },
  });
}

export function useSaleItems() {
  return useQuery({
    queryKey: ["sale_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("*, sales(branch_id, created_at)")
        .order("created_at", { ascending: false })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        product_id: string | null;
        product_name: string;
        quantity: number;
        price: number;
        purchase_price: number;
        line_total: number;
        created_at: string;
        sales: { branch_id: string; created_at: string } | null;
      }>;
    },
  });
}

export function useCustomers(branch: string) {
  return useQuery({
    queryKey: ["customers", branch],
    queryFn: async () => {
      const q = supabase.from("customers").select("*").order("name");
      const { data, error } = await scope(q as never, branch);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        name: string;
        phone: string | null;
        address: string | null;
        branch_id: string | null;
        created_at: string;
      }>;
    },
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; name: string; phone: string | null; city: string | null }>;
    },
  });
}

export function useMovements(branch: string) {
  return useQuery({
    queryKey: ["movements", branch],
    queryFn: async () => {
      const q = supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(500);
      const { data, error } = await scope(q as never, branch);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        product_id: string;
        branch_id: string;
        movement_type: string;
        quantity: number;
        purchase_price: number | null;
        supplier_id: string | null;
        reference: string | null;
        note: string | null;
        created_at: string;
      }>;
    },
  });
}

export function useReturns(branch: string) {
  return useQuery({
    queryKey: ["sales_returns", branch],
    queryFn: async () => {
      const q = supabase.from("sales_returns").select("*").order("created_at", { ascending: false }).limit(1000);
      const { data, error } = await scope(q as never, branch);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        sale_id: string | null;
        invoice_number: string;
        branch_id: string;
        product_id: string;
        product_name: string;
        quantity: number;
        unit_price: number;
        refund_amount: number;
        reason: string | null;
        created_by: string | null;
        created_at: string;
      }>;
    },
  });
}

export function useProductBatches(branch: string) {
  return useQuery({
    queryKey: ["product_batches", branch],
    queryFn: async () => {
      const q = supabase.from("product_batches").select("*").order("expiry_date", { ascending: true });
      const { data, error } = await scope(q as never, branch);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        product_id: string;
        branch_id: string;
        batch_number: string | null;
        expiry_date: string | null;
        purchase_price: number;
        selling_price: number;
        stock_quantity: number;
        created_at: string;
      }>;
    },
  });
}

export function useInvoiceAuditLogs() {
  return useQuery({
    queryKey: ["invoice_audit_logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_audit_logs").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        sale_id: string | null;
        invoice_number: string;
        old_values: Record<string, unknown>;
        new_values: Record<string, unknown>;
        edited_by: string | null;
        created_at: string;
      }>;
    },
  });
}

export function usePriceOverrideLogs() {
  return useQuery({
    queryKey: ["price_override_logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_override_logs").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        product_id: string | null;
        product_name: string;
        standard_price: number;
        sold_price: number;
        quantity: number;
        cashier_id: string | null;
        created_at: string;
      }>;
    },
  });
}

export function useCancelledCartLogs() {
  return useQuery({
    queryKey: ["cancelled_cart_logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cancelled_cart_logs").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        items: Array<{ product_name: string; quantity: number; price: number }>;
        cart_total: number;
        cashier_id: string | null;
        created_at: string;
      }>;
    },
  });
}

export function useCashReconciliations(branch: string) {
  return useQuery({
    queryKey: ["cash_reconciliations", branch],
    queryFn: async () => {
      const q = supabase.from("cash_reconciliations").select("*").order("created_at", { ascending: false });
      const { data, error } = await scope(q as never, branch);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        branch_id: string;
        expected_cash: number;
        counted_cash: number;
        discrepancy: number;
        notes: string | null;
        created_by: string | null;
        created_at: string;
      }>;
    },
  });
}
