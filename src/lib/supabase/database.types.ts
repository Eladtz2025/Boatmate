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
      boat_members: {
        Row: {
          boat_id: string
          color: string
          display_name: string | null
          is_remote: boolean
          joined_at: string
          user_id: string
        }
        Insert: {
          boat_id: string
          color?: string
          display_name?: string | null
          is_remote?: boolean
          joined_at?: string
          user_id: string
        }
        Update: {
          boat_id?: string
          color?: string
          display_name?: string | null
          is_remote?: boolean
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boat_members_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boat_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boats: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          home_port: string | null
          id: string
          latitude: number | null
          longitude: number | null
          model: string | null
          name: string
          photo_path: string | null
          status_text: string | null
          tagline: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          home_port?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          model?: string | null
          name: string
          photo_path?: string | null
          status_text?: string | null
          tagline?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          home_port?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          model?: string | null
          name?: string
          photo_path?: string | null
          status_text?: string | null
          tagline?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          boat_id: string
          category: string
          created_at: string
          expires_on: string | null
          file_path: string
          id: string
          issued_on: string | null
          mime_type: string | null
          notes: string | null
          original_name: string | null
          reminder_days: number
          size_bytes: number | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          boat_id: string
          category?: string
          created_at?: string
          expires_on?: string | null
          file_path: string
          id?: string
          issued_on?: string | null
          mime_type?: string | null
          notes?: string | null
          original_name?: string | null
          reminder_days?: number
          size_bytes?: number | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          boat_id?: string
          category?: string
          created_at?: string
          expires_on?: string | null
          file_path?: string
          id?: string
          issued_on?: string | null
          mime_type?: string | null
          notes?: string | null
          original_name?: string | null
          reminder_days?: number
          size_bytes?: number | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          all_day: boolean
          boat_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          kind: string
          location: string | null
          notes: string | null
          starts_at: string
          title: string
          user_id: string | null
        }
        Insert: {
          all_day?: boolean
          boat_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          starts_at: string
          title: string
          user_id?: string | null
        }
        Update: {
          all_day?: boolean
          boat_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          starts_at?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_shares: {
        Row: {
          expense_id: string
          share_agorot: number
          user_id: string
        }
        Insert: {
          expense_id: string
          share_agorot: number
          user_id: string
        }
        Update: {
          expense_id?: string
          share_agorot?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_shares_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_agorot: number
          boat_id: string
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          note: string | null
          paid_by: string
          receipt_path: string | null
          source: string
          spent_on: string
          split_mode: string
        }
        Insert: {
          amount_agorot: number
          boat_id: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          note?: string | null
          paid_by: string
          receipt_path?: string | null
          source?: string
          spent_on?: string
          split_mode?: string
        }
        Update: {
          amount_agorot?: number
          boat_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          note?: string | null
          paid_by?: string
          receipt_path?: string | null
          source?: string
          spent_on?: string
          split_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          boat_id: string
          caption: string | null
          created_at: string
          id: string
          path: string
          taken_on: string | null
          trip_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          boat_id: string
          caption?: string | null
          created_at?: string
          id?: string
          path: string
          taken_on?: string | null
          trip_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          boat_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          path?: string
          taken_on?: string | null
          trip_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      // Hand-written to match supabase/migrations/20260902130000_gmail_invoice_import.sql,
      // for the same reason push_subscriptions is: the migration has not been
      // applied to the live project yet, so there is nothing to generate from.
      google_credentials: {
        Row: {
          boat_id: string
          connected_by: string | null
          created_at: string
          google_email: string | null
          id: string
          refresh_token: string
          scope: string
          updated_at: string
        }
        Insert: {
          boat_id: string
          connected_by?: string | null
          created_at?: string
          google_email?: string | null
          id?: string
          refresh_token: string
          scope: string
          updated_at?: string
        }
        Update: {
          boat_id?: string
          connected_by?: string | null
          created_at?: string
          google_email?: string | null
          id?: string
          refresh_token?: string
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_credentials_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: true
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_imports: {
        Row: {
          boat_id: string
          customer_name: string | null
          expense_id: string | null
          gmail_message_id: string
          id: string
          imported_at: string
          imported_by: string | null
          invoice_date: string | null
          invoice_number: string | null
          net_agorot: number | null
          reason: string | null
          status: string
          total_agorot: number | null
        }
        Insert: {
          boat_id: string
          customer_name?: string | null
          expense_id?: string | null
          gmail_message_id: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          net_agorot?: number | null
          reason?: string | null
          status?: string
          total_agorot?: number | null
        }
        Update: {
          boat_id?: string
          customer_name?: string | null
          expense_id?: string | null
          gmail_message_id?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          net_agorot?: number | null
          reason?: string | null
          status?: string
          total_agorot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_imports_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_imports_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      // Hand-written to match supabase/migrations/20260902120000_push_subscriptions.sql.
      // Everything else in this file comes from `supabase gen types`; this block
      // does not, because the migration has not been applied to the live project
      // yet and there is nothing to generate from. Re-run the generator once it
      // has been, and this entry should come back byte-identical in shape.
      push_subscriptions: {
        Row: {
          auth: string
          boat_id: string
          created_at: string
          endpoint: string
          expired_at: string | null
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          boat_id: string
          created_at?: string
          endpoint: string
          expired_at?: string | null
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          boat_id?: string
          created_at?: string
          endpoint?: string
          expired_at?: string | null
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      recurring_occurrences: {
        Row: {
          amount_agorot: number
          boat_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          due_on: string
          expense_id: string | null
          id: string
          recurring_payment_id: string
          status: string
          transfer_id: string | null
        }
        Insert: {
          amount_agorot: number
          boat_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          due_on: string
          expense_id?: string | null
          id?: string
          recurring_payment_id: string
          status?: string
          transfer_id?: string | null
        }
        Update: {
          amount_agorot?: number
          boat_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          due_on?: string
          expense_id?: string | null
          id?: string
          recurring_payment_id?: string
          status?: string
          transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_occurrences_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_occurrences_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: true
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_occurrences_recurring_payment_id_fkey"
            columns: ["recurring_payment_id"]
            isOneToOne: false
            referencedRelation: "recurring_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_occurrences_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: true
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_payments: {
        Row: {
          active: boolean
          amount_agorot: number
          boat_id: string
          cadence: string
          category: string
          created_at: string
          created_by: string | null
          day_of_month: number
          default_paid_by: string | null
          document_id: string | null
          end_on: string | null
          from_user: string | null
          id: string
          kind: string
          notes: string | null
          split_mode: string
          start_on: string
          title: string
          to_user: string | null
        }
        Insert: {
          active?: boolean
          amount_agorot: number
          boat_id: string
          cadence?: string
          category?: string
          created_at?: string
          created_by?: string | null
          day_of_month?: number
          default_paid_by?: string | null
          document_id?: string | null
          end_on?: string | null
          from_user?: string | null
          id?: string
          kind?: string
          notes?: string | null
          split_mode?: string
          start_on?: string
          title: string
          to_user?: string | null
        }
        Update: {
          active?: boolean
          amount_agorot?: number
          boat_id?: string
          cadence?: string
          category?: string
          created_at?: string
          created_by?: string | null
          day_of_month?: number
          default_paid_by?: string | null
          document_id?: string | null
          end_on?: string | null
          from_user?: string | null
          id?: string
          kind?: string
          notes?: string | null
          split_mode?: string
          start_on?: string
          title?: string
          to_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_payments_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_payments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          boat_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          done: boolean
          due_on: string | null
          id: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          boat_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          due_on?: string | null
          id?: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          boat_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          due_on?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          amount_agorot: number
          boat_id: string
          created_at: string
          created_by: string | null
          from_user: string
          id: string
          method: string | null
          note: string | null
          to_user: string
          transferred_on: string
        }
        Insert: {
          amount_agorot: number
          boat_id: string
          created_at?: string
          created_by?: string | null
          from_user: string
          id?: string
          method?: string | null
          note?: string | null
          to_user: string
          transferred_on?: string
        }
        Update: {
          amount_agorot?: number
          boat_id?: string
          created_at?: string
          created_by?: string | null
          from_user?: string
          id?: string
          method?: string | null
          note?: string | null
          to_user?: string
          transferred_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          boat_id: string
          cover_path: string | null
          created_at: string
          created_by: string | null
          crew_count: number | null
          engine_hours: number | null
          happened_on: string
          id: string
          kind: string
          location: string | null
          notes: string | null
          title: string
        }
        Insert: {
          boat_id: string
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          crew_count?: number | null
          engine_hours?: number | null
          happened_on?: string
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          title: string
        }
        Update: {
          boat_id?: string
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          crew_count?: number | null
          engine_hours?: number | null
          happened_on?: string
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_calendar_items: {
        Row: {
          all_day: boolean | null
          amount_agorot: number | null
          boat_id: string | null
          ends_at: string | null
          id: string | null
          kind: string | null
          location: string | null
          source_id: string | null
          starts_at: string | null
          title: string | null
        }
        Relationships: []
      }
      v_member_balances: {
        Row: {
          balance_agorot: number | null
          boat_id: string | null
          owed_agorot: number | null
          paid_agorot: number | null
          received_agorot: number | null
          sent_agorot: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boat_members_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boat_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_partner_by_email: {
        Args: {
          p_boat_id: string
          p_display_name?: string
          p_email: string
          p_is_remote?: boolean
        }
        Returns: string
      }
      confirm_recurring_occurrence: {
        Args: {
          p_amount_agorot?: number
          p_occurrence_id: string
          p_paid_by?: string
          p_paid_on?: string
          p_receipt_path?: string
          p_shares: Json
        }
        Returns: string
      }
      confirm_recurring_transfer: {
        Args: {
          p_amount_agorot?: number
          p_note?: string
          p_occurrence_id: string
          p_paid_on?: string
        }
        Returns: string
      }
      create_expense: {
        Args: {
          p_amount_agorot: number
          p_boat_id: string
          p_category?: string
          p_description?: string
          p_note?: string
          p_paid_by: string
          p_receipt_path?: string
          p_shares: Json
          p_source?: string
          p_spent_on?: string
          p_split_mode?: string
        }
        Returns: string
      }
      generate_recurring_occurrences: {
        Args: { p_boat_id: string; p_until?: string }
        Returns: number
      }
      is_boat_member: { Args: { p_boat_id: string }; Returns: boolean }
      my_boat_ids: { Args: never; Returns: string[] }
      partner_for_email: {
        Args: { p_email: string }
        Returns: { user_id: string; user_email: string }[]
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
    Enums: {},
  },
} as const