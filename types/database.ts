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
      answer_media: {
        Row: {
          id: string
          answer_id: string
          politician_id: string
          media_type: string
          storage_path: string
          public_url: string
          file_name: string | null
          file_size_bytes: number | null
          mime_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          answer_id: string
          politician_id: string
          media_type: string
          storage_path: string
          public_url: string
          file_name?: string | null
          file_size_bytes?: number | null
          mime_type?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          answer_id?: string
          politician_id?: string
          media_type?: string
          storage_path?: string
          public_url?: string
          file_name?: string | null
          file_size_bytes?: number | null
          mime_type?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "answer_media_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answer_media_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          }
        ]
      }
      anon_session_log: {
        Row: {
          created_at: string | null
          id: string
          ip_address: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_address: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_address?: string
          user_id?: string | null
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
          is_draft: boolean
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
          is_draft?: boolean
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
          is_draft?: boolean
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
          {
            foreignKeyName: "answer_media_answer_id_fkey"
            columns: ["id"]
            isOneToOne: false
            referencedRelation: "answer_media"
            referencedColumns: ["answer_id"]
          },
        ]
      }
      jack_config: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      jack_reports: {
        Row: {
          created_at: string | null
          id: string
          report: Json
          week_number: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          report: Json
          week_number: number
        }
        Update: {
          created_at?: string | null
          id?: string
          report?: Json
          week_number?: number
        }
        Relationships: []
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
          candidate_election_year: number | null
          candidate_fec_id: string | null
          candidate_office: string | null
          candidate_status: string | null
          created_at: string
          district: string | null
          election_date: string | null
          fec_candidate_id: string | null
          fec_id: string | null
          full_name: string
          govtrack_id: string | null
          id: string
          incumbent_challenge: "I" | "C" | "O" | null
          is_active: boolean
          is_candidate: boolean
          is_test: boolean
          office: string | null
          openstates_id: string | null
          party: string | null
          photo_url: string | null
          politician_type: string
          race_id: string | null
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
          candidate_election_year?: number | null
          candidate_fec_id?: string | null
          candidate_office?: string | null
          candidate_status?: string | null
          created_at?: string
          district?: string | null
          election_date?: string | null
          fec_candidate_id?: string | null
          fec_id?: string | null
          full_name: string
          govtrack_id?: string | null
          id?: string
          incumbent_challenge?: "I" | "C" | "O" | null
          is_active?: boolean
          is_candidate?: boolean
          is_test?: boolean
          office?: string | null
          openstates_id?: string | null
          party?: string | null
          photo_url?: string | null
          politician_type?: string
          race_id?: string | null
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
          candidate_election_year?: number | null
          candidate_fec_id?: string | null
          candidate_office?: string | null
          candidate_status?: string | null
          created_at?: string
          district?: string | null
          election_date?: string | null
          fec_candidate_id?: string | null
          fec_id?: string | null
          full_name?: string
          govtrack_id?: string | null
          id?: string
          incumbent_challenge?: "I" | "C" | "O" | null
          is_active?: boolean
          is_candidate?: boolean
          is_test?: boolean
          office?: string | null
          openstates_id?: string | null
          party?: string | null
          photo_url?: string | null
          politician_type?: string
          race_id?: string | null
          slug?: string
          social_handles?: Json
          state?: string | null
          updated_at?: string
          verification_tier?: Database["public"]["Enums"]["verification_tier"]
          votesmart_id?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "politicians_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
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
          parent_question_id: string | null
          politician_id: string
          source: string
          status: Database["public"]["Enums"]["question_status"]
          submitted_by: string | null
          updated_at: string
          week_number: number
          x_post_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_seeded?: boolean
          net_upvotes?: number
          parent_question_id?: string | null
          politician_id: string
          source?: string
          status?: Database["public"]["Enums"]["question_status"]
          submitted_by?: string | null
          updated_at?: string
          week_number: number
          x_post_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_seeded?: boolean
          net_upvotes?: number
          parent_question_id?: string | null
          politician_id?: string
          source?: string
          status?: Database["public"]["Enums"]["question_status"]
          submitted_by?: string | null
          updated_at?: string
          week_number?: number
          x_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_parent_question_id_fkey"
            columns: ["parent_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_x_post_id_fkey"
            columns: ["x_post_id"]
            isOneToOne: false
            referencedRelation: "x_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      races: {
        Row: {
          created_at: string
          district: string | null
          election_date: string
          election_type: string
          id: string
          incumbent_id: string | null
          name: string
          office: string
          party: string | null
          slug: string
          state: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          district?: string | null
          election_date: string
          election_type?: string
          id?: string
          incumbent_id?: string | null
          name: string
          office: string
          party?: string | null
          slug: string
          state: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          district?: string | null
          election_date?: string
          election_type?: string
          id?: string
          incumbent_id?: string | null
          name?: string
          office?: string
          party?: string | null
          slug?: string
          state?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "races_incumbent_id_fkey"
            columns: ["incumbent_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          city: string | null
          county: string | null
          created_at: string
          display_name: string | null
          id: string
          is_admin: boolean
          is_anonymous: boolean
          notify_answer: boolean
          notify_digest: boolean
          political_affiliation: string | null
          state_code: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          county?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_admin?: boolean
          is_anonymous?: boolean
          notify_answer?: boolean
          notify_digest?: boolean
          political_affiliation?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          county?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_admin?: boolean
          is_anonymous?: boolean
          notify_answer?: boolean
          notify_digest?: boolean
          political_affiliation?: string | null
          state_code?: string | null
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
      x_credit_log: {
        Row: {
          agent: string
          created_at: string | null
          credits_used: number | null
          id: string
          notes: string | null
          politicians_covered: number | null
          run_date: string
          tweets_approved: number | null
          tweets_collected: number | null
        }
        Insert: {
          agent: string
          created_at?: string | null
          credits_used?: number | null
          id?: string
          notes?: string | null
          politicians_covered?: number | null
          run_date?: string
          tweets_approved?: number | null
          tweets_collected?: number | null
        }
        Update: {
          agent?: string
          created_at?: string | null
          credits_used?: number | null
          id?: string
          notes?: string | null
          politicians_covered?: number | null
          run_date?: string
          tweets_approved?: number | null
          tweets_collected?: number | null
        }
        Relationships: []
      }
      x_outreach_log: {
        Row: {
          channel: string
          engagement: Json | null
          id: string
          message: string | null
          politician_id: string | null
          sent_at: string | null
          target_handle: string | null
          target_type: string
          x_post_id: string | null
        }
        Insert: {
          channel: string
          engagement?: Json | null
          id?: string
          message?: string | null
          politician_id?: string | null
          sent_at?: string | null
          target_handle?: string | null
          target_type: string
          x_post_id?: string | null
        }
        Update: {
          channel?: string
          engagement?: Json | null
          id?: string
          message?: string | null
          politician_id?: string | null
          sent_at?: string | null
          target_handle?: string | null
          target_type?: string
          x_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "x_outreach_log_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "x_outreach_log_x_post_id_fkey"
            columns: ["x_post_id"]
            isOneToOne: false
            referencedRelation: "x_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      x_posts: {
        Row: {
          author_handle: string
          author_name: string | null
          body: string | null
          collected_at: string | null
          created_at: string | null
          curator_notes: string | null
          curator_score: number | null
          id: string
          likes: number | null
          oembed_cache: string | null
          oembed_cached_at: string | null
          politician_id: string | null
          rejection_reason: string | null
          reply_count: number | null
          retweets: number | null
          status: string
          theme_tags: string[] | null
          tweet_date: string | null
          tweet_id: string
          tweet_url: string
          updated_at: string | null
          whytho_question_id: string | null
        }
        Insert: {
          author_handle: string
          author_name?: string | null
          body?: string | null
          collected_at?: string | null
          created_at?: string | null
          curator_notes?: string | null
          curator_score?: number | null
          id?: string
          likes?: number | null
          oembed_cache?: string | null
          oembed_cached_at?: string | null
          politician_id?: string | null
          rejection_reason?: string | null
          reply_count?: number | null
          retweets?: number | null
          status?: string
          theme_tags?: string[] | null
          tweet_date?: string | null
          tweet_id: string
          tweet_url: string
          updated_at?: string | null
          whytho_question_id?: string | null
        }
        Update: {
          author_handle?: string
          author_name?: string | null
          body?: string | null
          collected_at?: string | null
          created_at?: string | null
          curator_notes?: string | null
          curator_score?: number | null
          id?: string
          likes?: number | null
          oembed_cache?: string | null
          oembed_cached_at?: string | null
          politician_id?: string | null
          rejection_reason?: string | null
          reply_count?: number | null
          retweets?: number | null
          status?: string
          theme_tags?: string[] | null
          tweet_date?: string | null
          tweet_id?: string
          tweet_url?: string
          updated_at?: string | null
          whytho_question_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "x_posts_politician_id_fkey"
            columns: ["politician_id"]
            isOneToOne: false
            referencedRelation: "politicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "x_posts_whytho_question_id_fkey"
            columns: ["whytho_question_id"]
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
      participation_rate_period: {
        Args: { p_period: string; p_politician_id: string }
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
      alias_type: [
        "nickname",
        "title",
        "informal",
        "misspelling",
        "former_title",
      ],
      answer_type: ["direct", "ai_analysis", "team_statement"],
      politician_team_role: ["admin", "editor", "responder"],
      question_status: ["active", "removed", "merged"],
      verification_method: [
        "gov_email",
        "fec_id",
        "social_code",
        "stripe_identity",
        "meta_tag",
      ],
      verification_status: ["pending", "completed", "expired", "failed"],
      verification_tier: ["0", "1", "2", "3"],
    },
  },
} as const
