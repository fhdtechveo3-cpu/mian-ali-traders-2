export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      branches: {
        Row: {
          address: string | null
          city: string
          created_at: string
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          city: string
          created_at?: string
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          city?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      customer_payments: {
        Row: {
          amount: number
          branch_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          note: string | null
          payment_date: string
          payment_method: string
          sale_id: string | null
        }
        Insert: {
          amount?: number
          branch_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          note?: string | null
          payment_date?: string
          payment_method?: string
          sale_id?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          note?: string | null
          payment_date?: string
          payment_method?: string
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          branch_id: string | null
          created_at: string
          id: string
          name: string
          opening_balance: number
          phone: string | null
        }
        Insert: {
          address?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          name: string
          opening_balance?: number
          phone?: string | null
        }
        Update: {
          address?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          name?: string
          opening_balance?: number
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string
          category: string
          created_at: string
          created_by: string | null
          expense_date: string
          id: string
          note: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          branch_id: string
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_purchase_price: number | null
          new_selling_price: number | null
          old_purchase_price: number | null
          old_selling_price: number | null
          product_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_purchase_price?: number | null
          new_selling_price?: number | null
          old_purchase_price?: number | null
          old_selling_price?: number | null
          product_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_purchase_price?: number | null
          new_selling_price?: number | null
          old_purchase_price?: number | null
          old_selling_price?: number | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          batch_number: string | null
          branch_id: string
          brand: string | null
          category: string | null
          company: string | null
          created_at: string
          expiry_date: string | null
          generic_name: string | null
          id: string
          is_active: boolean
          low_stock_level: number
          name: string
          notes: string | null
          pack_size: string | null
          purchase_price: number
          rack_no: string | null
          selling_price: number
          stock_quantity: number
          supplier_id: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          batch_number?: string | null
          branch_id: string
          brand?: string | null
          category?: string | null
          company?: string | null
          created_at?: string
          expiry_date?: string | null
          generic_name?: string | null
          id?: string
          is_active?: boolean
          low_stock_level?: number
          name: string
          notes?: string | null
          pack_size?: string | null
          purchase_price?: number
          rack_no?: string | null
          selling_price?: number
          stock_quantity?: number
          supplier_id?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          batch_number?: string | null
          branch_id?: string
          brand?: string | null
          category?: string | null
          company?: string | null
          created_at?: string
          expiry_date?: string | null
          generic_name?: string | null
          id?: string
          is_active?: boolean
          low_stock_level?: number
          name?: string
          notes?: string | null
          pack_size?: string | null
          purchase_price?: number
          rack_no?: string | null
          selling_price?: number
          stock_quantity?: number
          supplier_id?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          discount: number
          id: string
          line_total: number
          price: number
          product_id: string | null
          product_name: string
          purchase_price: number
          quantity: number
          sale_id: string
        }
        Insert: {
          created_at?: string
          discount?: number
          id?: string
          line_total: number
          price: number
          product_id?: string | null
          product_name: string
          purchase_price?: number
          quantity: number
          sale_id: string
        }
        Update: {
          created_at?: string
          discount?: number
          id?: string
          line_total?: number
          price?: number
          product_id?: string | null
          product_name?: string
          purchase_price?: number
          quantity?: number
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          branch_id: string
          cost_total: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          discount: number
          id: string
          invoice_number: string
          notes: string | null
          paid_amount: number
          payment_method: string
          profit: number
          remaining_amount: number
          subtotal: number
          total: number
        }
        Insert: {
          branch_id: string
          cost_total?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          invoice_number: string
          notes?: string | null
          paid_amount?: number
          payment_method?: string
          profit?: number
          remaining_amount?: number
          subtotal?: number
          total?: number
        }
        Update: {
          branch_id?: string
          cost_total?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          invoice_number?: string
          notes?: string | null
          paid_amount?: number
          payment_method?: string
          profit?: number
          remaining_amount?: number
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          note: string | null
          product_id: string
          purchase_price: number | null
          quantity: number
          reference: string | null
          supplier_id: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          note?: string | null
          product_id: string
          purchase_price?: number | null
          quantity: number
          reference?: string | null
          supplier_id?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          note?: string | null
          product_id?: string
          purchase_price?: number | null
          quantity?: number
          reference?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          city: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_sale: {
        Args: {
          _branch_id: string
          _customer_id: string
          _customer_name: string
          _discount: number
          _items: Json
          _notes: string
          _paid_amount: number
          _payment_method: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      my_branch: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "cashier"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "cashier"],
    },
  },
} as const
