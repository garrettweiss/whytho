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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_audit_log: {
        Row: {
          created_at: string
          id: string
          input_tokens: number | null
          model: string
          operation: string
          output_tokens: number | null
          prompt_hash: string | null
          related_id: string | null
          related_type: string | null
          result_summary: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          input_tokens?: number | null
          model: string
          operation: string
          output_tokens?: number | null
          prompt_hash?: string | null
          related_id?: string | null
          related_type?: string | null
          result_summary?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          input_tokens?: number | null
          model?: string
          operation?: string
          output_tokens?: number | null
          prompt_hash?: string | null
          related_id?: string | null
          related_type?: string | null
          result_summary?: string | null
        }
        Relationships: []
      }
      answers: {
        Row: {
          ai_confidence: Database["public"]["Enums"]["ai_confidence"] | null
          answer_type: Database["public"]["Enums"]["answer_type"]
          body: string
          created_at: string
          disputed_at: string | null
          id: string
          is_ai_generated: boolean
          is_disputed: boolean
          politician_id: string
          published_by: string | null
          question_id: string
          sources: Json
          updated_at: string
          week_number: number
        }
        Insert: {
          ai_confidence?: Database["public"]["Enums"]["ai_confidence"] | null
          answer_type: Database["public"]["Enums"]["answer_type"]
          body: string
          created_at?: string
          disputed_at?: string | null
          id?: string
          is_ai_generated?: boolean
          is_disputed?: boolean
          politician_id: string
          published_by?: string | null
          question_id: string
          sources?: Json
          updated_at?: string
          week_number: number
        }
        Update: {
          ai_confidence?: Database["public"]["Enums"]["ai_confidence"] | null
          answer_type?: Database["public"]["Enums"]["answer_type"]
          body?: string
          created_at?: string
          disputed_at?: string | null
          id?: string
          is_ai_generated?: boolean
          is_disputed?: boolean
          politician_id?: string
          published_by?: string | null
          question_id?: string
          sources?: Json
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "answers_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      politician_aliases: {
        Row: {
          alias: string
          alias_type: Database["public"]["Enums"]["alias_type"]
          created_at: string
          id: string
          politician_id: string
        }
        Insert: {
          alias: string
          alias_type: Database["public"]["Enums"]["alias_type"]
          created_at?: string
          id?: string
          politician_id: string
        }
        Update: {
          alias?: string
          alias_type?: Database["public"]["Enums"]["alias_type"]
          created_at?: string
          id?: string
          politician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "politician_aliases_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
        ]
      }
      politician_team: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          politician_id: string
          role: Database["public"]["Enums"]["politician_team_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          politician_id: string
          role?: Database["public"]["Enums"]["politician_team_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          politician_id?: string
          role?: Database["public"]["Enums"]["politician_team_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "politician_team_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
        ]
      }
      politician_verifications: {
        Row: {
          code_expires_at: string | null
          created_at: string
          id: string
          metadata: Json
          method: Database["public"]["Enums"]["verification_method"]
          politician_id: string
          status: Database["public"]["Enums"]["verification_status"]
          user_id: string
          verification_code: string | null
          verified_at: string | null
        }
        Insert: {
          code_expires_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          method: Database["public"]["Enums"]["verification_method"]
          politician_id: string
          status?: Database["public"]["Enums"]["verification_status"]
          user_id: string
          verification_code?: string | null
          verified_at?: string | null
        }
        Update: {
          code_expires_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          method?: Database["public"]["Enums"]["verification_method"]
          politician_id?: string
          status?: Database["public"]["Enums"]["verification_status"]
          user_id?: string
          verification_code?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "politician_verifications_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
        ]
      }
      politicians: {
        Row: {
          aliases: string[]
          bio: string | null
          bioguide_id: string | null
          created_at: string
          district: string | null
          fec_id: string | null
          full_name: string
          govtrack_id: string | null
          id: string
          is_active: boolean
          office: string | null
          openstates_id: string | null
          party: string | null
          photo_url: string | null
          slug: string
          social_handles: Json
          state: string | null
          updated_at: string
          verification_tier: Database["public"]["Enums"]["verification_tier"]
          votesmart_id: string | null
          website_url: string | null
        }
        Insert: {
          aliases?: string[]
          bio?: string | null
          bioguide_id?: string | null
          created_at?: string
          district?: string | null
          fec_id?: string | null
          full_name: string
          govtrack_id?: string | null
          id?: string
          is_active?: boolean
          office?: string | null
          openstates_id?: string | null
          party?: string | null
          photo_url?: string | null
          slug: string
          social_handles?: Json
          state?: string | null
          updated_at?: string
          verification_tier?: Database["public"]["Enums"]["verification_tier"]
          votesmart_id?: string | null
          website_url?: string | null
        }
        Update: {
          aliases?: string[]
          bio?: string | null
          bioguide_id?: string | null
          created_at?: string
          district?: string | null
          fec_id?: string | null
          full_name?: string
          govtrack_id?: string | null
          id?: string
          is_active?: boolean
          office?: string | null
          openstates_id?: string | null
          party?: string | null
          photo_url?: string | null
          slug?: string
          social_handles?: Json
          state?: string | null
          updated_at?: string
          verification_tier?: Database["public"]["Enums"]["verification_tier"]
          votesmart_id?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      question_reports: {
        Row: {
          created_at: string
          id: string
          question_id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_reports_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          body: string
          created_at: string
          id: string
          is_seeded: boolean
          net_upvotes: number
          politician_id: string
          status: Database["public"]["Enums"]["question_status"]
          submitted_by: string | null
          updated_at: string
          week_number: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_seeded?: boolean
          net_upvotes?: number
          politician_id: string
          status?: Database["public"]["Enums"]["question_status"]
          submitted_by?: string | null
          updated_at?: string
          week_number: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_seeded?: boolean
          net_upvotes?: number
          politician_id?: string
          status?: Database["public"]["Enums"]["question_status"]
          submitted_by?: string | null
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "questions_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_anonymous: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          is_anonymous?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_anonymous?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string
          id: string
          question_id: string
          user_id: string
          value: number
          week_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          user_id: string
          value?: number
          week_number: number
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
          value?: number
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "votes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_snapshots: {
        Row: {
          answered_qualifying: number
          created_at: string
          id: string
          participation_rate: number | null
          politician_id: string
          qualifying_questions: number
          snapshot_data: Json
          top_question_id: string | null
          total_questions: number
          week_number: number
        }
        Insert: {
          answered_qualifying?: number
          created_at?: string
          id?: string
          participation_rate?: number | null
          politician_id: string
          qualifying_questions?: number
          snapshot_data?: Json
          top_question_id?: string | null
          total_questions?: number
          week_number: number
        }
        Update: {
          answered_qualifying?: number
          created_at?: string
          id?: string
          participation_rate?: number | null
          politician_id?: string
          qualifying_questions?: number
          snapshot_data?: Json
          top_question_id?: string | null
          total_questions?: number
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_snapshots_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_snapshots_top_question_id_fkey"
            columns: ["top_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_week_number: { Args: never; Returns: number }
      generate_slug: {
        Args: { p_full_name: string; p_state?: string }
        Returns: string
      }
      participation_rate: {
        Args: { p_politician_id: string; p_week_number: number }
        Returns: number
      }
      search_politicians: {
        Args: { query: string; result_limit?: number }
        Returns: {
          full_name: string
          id: string
          office: string
          party: string
          photo_url: string
          slug: string
          state: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      weekly_reset: { Args: never; Returns: undefined }
    }
    Enums: {
      ai_confidence: "high" | "medium" | "low" | "insufficient"
      alias_type:
        | "nickname"
        | "title"
        | "informal"
        | "misspelling"
        | "former_title"
      answer_type: "direct" | "ai_analysis" | "team_statement"
      politician_team_role: "admin" | "editor" | "responder"
      question_status: "active" | "removed" | "merged"
      verification_method:
        | "gov_email"
        | "fec_id"
        | "social_code"
        | "stripe_identity"
        | "meta_tag"
      verification_status: "pending" | "completed" | "expired" | "failed"
      verification_tier: "0" | "1" | "2" | "3"
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
      ai_confidence: ["high", "medium", "low", "insufficient"],
      alias_type: ["nickname", "title", "informal", "misspelling", "former_title"],
      answer_type: ["direct", "ai_analysis", "team_statement"],
      politician_team_role: ["admin", "editor", "responder"],
      question_status: ["active", "removed", "merged"],
      verification_method: ["gov_email", "fec_id", "social_code", "stripe_identity", "meta_tag"],
      verification_status: ["pending", "completed", "expired", "failed"],
      verification_tier: ["0", "1", "2", "3"],
    },
  },
} as const
