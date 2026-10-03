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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          reason: string | null
          target_id: string | null
          target_table: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          reason?: string | null
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          reason?: string | null
          target_id?: string | null
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "stock_history_view"
            referencedColumns: ["actor_id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      daily_inventory: {
        Row: {
          created_at: string
          created_by: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          inventory_date: string
          state: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          inventory_date: string
          state?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          inventory_date?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_inventory_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_inventory_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "stock_history_view"
            referencedColumns: ["actor_id"]
          },
          {
            foreignKeyName: "daily_inventory_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_inventory_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "stock_history_view"
            referencedColumns: ["actor_id"]
          },
        ]
      }
      daily_inventory_items: {
        Row: {
          add: number
          am: number
          beg: number
          daily_inventory_id: string
          ending: number | null
          id: string
          item_id: string
          pm: number
          total: number | null
        }
        Insert: {
          add?: number
          am?: number
          beg?: number
          daily_inventory_id: string
          ending?: number | null
          id?: string
          item_id: string
          pm?: number
          total?: number | null
        }
        Update: {
          add?: number
          am?: number
          beg?: number
          daily_inventory_id?: string
          ending?: number | null
          id?: string
          item_id?: string
          pm?: number
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_inventory_items_daily_inventory_id_fkey"
            columns: ["daily_inventory_id"]
            isOneToOne: false
            referencedRelation: "daily_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_inventory_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_inventory_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_inventory_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_history_view"
            referencedColumns: ["item_id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_archived: boolean | null
          min_quantity: number
          name: string
          supplier_a: string | null
          supplier_b: string | null
          unit: string
          unit_cost: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean | null
          min_quantity?: number
          name: string
          supplier_a?: string | null
          supplier_b?: string | null
          unit: string
          unit_cost?: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean | null
          min_quantity?: number
          name?: string
          supplier_a?: string | null
          supplier_b?: string | null
          unit?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          batch_id: string | null
          created_at: string
          dedup_key: string | null
          id: string
          is_read: boolean
          item_id: string | null
          message: string
          read_at: string | null
          target_id: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          dedup_key?: string | null
          id?: string
          is_read?: boolean
          item_id?: string | null
          message: string
          read_at?: string | null
          target_id?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          dedup_key?: string | null
          id?: string
          is_read?: boolean
          item_id?: string | null
          message?: string
          read_at?: string | null
          target_id?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "stock_history_view"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "notifications_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_history_view"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "stock_history_view"
            referencedColumns: ["actor_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      report_items: {
        Row: {
          add: number
          am: number
          beg: number
          category_name: string
          description: string | null
          ending: number
          id: string
          item_name: string
          pm: number
          report_id: string
          supplier_a: string | null
          supplier_b: string | null
          total: number
          unit: string | null
          unit_cost: number | null
        }
        Insert: {
          add: number
          am: number
          beg: number
          category_name: string
          description?: string | null
          ending: number
          id?: string
          item_name: string
          pm: number
          report_id: string
          supplier_a?: string | null
          supplier_b?: string | null
          total: number
          unit?: string | null
          unit_cost?: number | null
        }
        Update: {
          add?: number
          am?: number
          beg?: number
          category_name?: string
          description?: string | null
          ending?: number
          id?: string
          item_name?: string
          pm?: number
          report_id?: string
          supplier_a?: string | null
          supplier_b?: string | null
          total?: number
          unit?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          daily_inventory_id: string | null
          generated_at: string
          generated_by: string | null
          id: string
          report_date: string
          status: string
          version: number
        }
        Insert: {
          daily_inventory_id?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          report_date: string
          status?: string
          version?: number
        }
        Update: {
          daily_inventory_id?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          report_date?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reports_daily_inventory_id_fkey"
            columns: ["daily_inventory_id"]
            isOneToOne: false
            referencedRelation: "daily_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "stock_history_view"
            referencedColumns: ["actor_id"]
          },
        ]
      }
      stock_batches: {
        Row: {
          created_at: string
          expiry_date: string | null
          id: string
          item_id: string
          quantity: number
          received_date: string
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id: string
          quantity?: number
          received_date?: string
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id?: string
          quantity?: number
          received_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_history_view"
            referencedColumns: ["item_id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          item_id: string
          quantity_after: number
          quantity_before: number
          quantity_change: number
          reason: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          item_id: string
          quantity_after: number
          quantity_before: number
          quantity_change: number
          reason?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          item_id?: string
          quantity_after?: number
          quantity_before?: number
          quantity_change?: number
          reason?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "stock_history_view"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_history_view"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "stock_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "stock_history_view"
            referencedColumns: ["actor_id"]
          },
        ]
      }
      visitor_logs: {
        Row: {
          id: string
          user_email: string
          user_id: string | null
          visited_at: string
        }
        Insert: {
          id?: string
          user_email: string
          user_id?: string | null
          visited_at?: string
        }
        Update: {
          id?: string
          user_email?: string
          user_id?: string | null
          visited_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      inventory_stock_view: {
        Row: {
          category_id: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          is_archived: boolean | null
          min_quantity: number | null
          name: string | null
          supplier_a: string | null
          supplier_b: string | null
          total_quantity: number | null
          unit: string | null
          unit_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_history_view: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          batch_id: string | null
          created_at: string | null
          expiry_date: string | null
          item_id: string | null
          item_name: string | null
          movement_id: string | null
          quantity_after: number | null
          quantity_before: number | null
          quantity_change: number | null
          reason: string | null
          received_date: string | null
          type: string | null
          unit: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_stock: {
        Args: {
          p_expiry_date: string
          p_item_id: string
          p_quantity: number
          p_reason: string
          p_received_date: string
        }
        Returns: undefined
      }
      adjust_stock: {
        Args: { p_batch_id: string; p_new_quantity: number; p_reason: string }
        Returns: undefined
      }
      check_expiry_notifications: { Args: never; Returns: undefined }
      consume_stock: {
        Args: { p_item_id: string; p_quantity: number; p_reason: string }
        Returns: undefined
      }
      create_daily_inventory_draft: {
        Args: { p_target_date: string }
        Returns: string
      }
      finalize_daily_inventory: {
        Args: { p_daily_inventory_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      mark_all_notifications_as_read: { Args: never; Returns: undefined }
      mark_notification_as_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      request_password_reset: {
        Args: { p_email: string }
        Returns: { success: boolean; message: string; hotline?: string; admin_email?: string }
      }
      admin_reset_user_password: {
        Args: { p_user_id: string; p_new_password: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
