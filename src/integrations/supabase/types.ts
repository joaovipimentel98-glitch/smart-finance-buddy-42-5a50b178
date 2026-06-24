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
  public: {
    Tables: {
      categories: {
        Row: {
          color: string | null
          icon: string | null
          id: string
          is_default: boolean
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      category_rules: {
        Row: {
          category: string
          confidence: number
          created_at: string
          id: string
          merchant_pattern: string
          subcategory: string | null
          user_id: string
        }
        Insert: {
          category: string
          confidence?: number
          created_at?: string
          id?: string
          merchant_pattern: string
          subcategory?: string | null
          user_id: string
        }
        Update: {
          category?: string
          confidence?: number
          created_at?: string
          id?: string
          merchant_pattern?: string
          subcategory?: string | null
          user_id?: string
        }
        Relationships: []
      }
      financial_insights: {
        Row: {
          created_at: string
          description: string
          id: string
          severity: Database["public"]["Enums"]["insight_severity"]
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          severity?: Database["public"]["Enums"]["insight_severity"]
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          severity?: Database["public"]["Enums"]["insight_severity"]
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          current_amount: number
          end_date: string | null
          id: string
          start_date: string
          status: Database["public"]["Enums"]["goal_status"]
          target_amount: number
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_amount?: number
          end_date?: string | null
          id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["goal_status"]
          target_amount: number
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_amount?: number
          end_date?: string | null
          id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["goal_status"]
          target_amount?: number
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_provider: string
          ai_tone: string
          alert_threshold: number | null
          avatar_url: string | null
          banks: string[]
          created_at: string
          display_name: string | null
          id: string
          monthly_budget: number | null
          notify_spending: boolean
          updated_at: string
        }
        Insert: {
          ai_provider?: string
          ai_tone?: string
          alert_threshold?: number | null
          avatar_url?: string | null
          banks?: string[]
          created_at?: string
          display_name?: string | null
          id: string
          monthly_budget?: number | null
          notify_spending?: boolean
          updated_at?: string
        }
        Update: {
          ai_provider?: string
          ai_tone?: string
          alert_threshold?: number | null
          avatar_url?: string | null
          banks?: string[]
          created_at?: string
          display_name?: string | null
          id?: string
          monthly_budget?: number | null
          notify_spending?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          active: boolean
          amount: number
          first_detected: string
          frequency: Database["public"]["Enums"]["subscription_frequency"]
          id: string
          last_detected: string
          service_name: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount: number
          first_detected: string
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          id?: string
          last_detected: string
          service_name: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount?: number
          first_detected?: string
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          id?: string
          last_detected?: string
          service_name?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          category: string
          confidence: number | null
          created_at: string
          date: string
          description: string
          id: string
          import_batch: string | null
          merchant: string | null
          source_file: string | null
          subcategory: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Insert: {
          amount: number
          category?: string
          confidence?: number | null
          created_at?: string
          date: string
          description: string
          id?: string
          import_batch?: string | null
          merchant?: string | null
          source_file?: string | null
          subcategory?: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          confidence?: number | null
          created_at?: string
          date?: string
          description?: string
          id?: string
          import_batch?: string | null
          merchant?: string | null
          source_file?: string | null
          subcategory?: string | null
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string
        }
        Relationships: []
      }
      uploaded_files: {
        Row: {
          file_name: string
          file_type: string
          id: string
          import_batch: string
          observations: string | null
          processed: boolean
          records_found: number
          upload_date: string
          user_id: string
        }
        Insert: {
          file_name: string
          file_type: string
          id?: string
          import_batch?: string
          observations?: string | null
          processed?: boolean
          records_found?: number
          upload_date?: string
          user_id: string
        }
        Update: {
          file_name?: string
          file_type?: string
          id?: string
          import_batch?: string
          observations?: string | null
          processed?: boolean
          records_found?: number
          upload_date?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      goal_status: "active" | "completed" | "failed" | "paused"
      insight_severity: "info" | "warning" | "critical" | "success"
      subscription_frequency: "weekly" | "monthly" | "quarterly" | "yearly"
      transaction_type: "credit" | "debit"
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
      goal_status: ["active", "completed", "failed", "paused"],
      insight_severity: ["info", "warning", "critical", "success"],
      subscription_frequency: ["weekly", "monthly", "quarterly", "yearly"],
      transaction_type: ["credit", "debit"],
    },
  },
} as const
