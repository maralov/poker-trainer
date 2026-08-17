export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      attempts: {
        Row: {
          answered_at: string
          chosen: string
          client_id: string
          correct: string
          created_at: string
          hand: string
          hero_pos: string
          id: number
          is_control: boolean
          is_correct: boolean
          is_drill: boolean
          limpers: number | null
          scenario: string
          stage: string
          user_id: string
          villain_pos: string | null
        }
        Insert: {
          answered_at: string
          chosen: string
          client_id: string
          correct: string
          created_at?: string
          hand: string
          hero_pos: string
          id?: never
          is_control?: boolean
          is_correct?: boolean
          is_drill?: boolean
          limpers?: number | null
          scenario: string
          stage?: string
          user_id?: string
          villain_pos?: string | null
        }
        Update: {
          answered_at?: string
          chosen?: string
          client_id?: string
          correct?: string
          created_at?: string
          hand?: string
          hero_pos?: string
          id?: never
          is_control?: boolean
          is_correct?: boolean
          is_drill?: boolean
          limpers?: number | null
          scenario?: string
          stage?: string
          user_id?: string
          villain_pos?: string | null
        }
        Relationships: []
      }
      postflop_attempts: {
        Row: {
          answered_at: string
          board: string
          category: string
          chosen: string
          client_id: string
          correct: string
          created_at: string
          episode_id: string
          facing: string
          hand: string
          hero_pos: string
          hole: string
          id: number
          ip: boolean
          is_correct: boolean
          line: string
          n_opps: number
          opp_pos: string
          pot_bb: number
          repeat_aggro: boolean
          scenario: string
          street: string
          texture: string
          user_id: string
        }
        Insert: {
          answered_at: string
          board: string
          category: string
          chosen: string
          client_id: string
          correct: string
          created_at?: string
          episode_id: string
          facing: string
          hand: string
          hero_pos: string
          hole: string
          id?: never
          ip: boolean
          is_correct?: boolean
          line: string
          n_opps: number
          opp_pos: string
          pot_bb: number
          repeat_aggro?: boolean
          scenario: string
          street: string
          texture: string
          user_id?: string
        }
        Update: {
          answered_at?: string
          board?: string
          category?: string
          chosen?: string
          client_id?: string
          correct?: string
          created_at?: string
          episode_id?: string
          facing?: string
          hand?: string
          hero_pos?: string
          hole?: string
          id?: never
          ip?: boolean
          is_correct?: boolean
          line?: string
          n_opps?: number
          opp_pos?: string
          pot_bb?: number
          repeat_aggro?: boolean
          scenario?: string
          street?: string
          texture?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          reset_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          reset_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          reset_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_reset_at: { Args: never; Returns: string }
      delete_all_progress: { Args: never; Returns: number }
      mistakes: {
        Args: { max_rows?: number; target_scenario: string }
        Returns: {
          answered_at: string
          chosen: string
          correct: string
          hand: string
          hero_pos: string
          scenario: string
        }[]
      }
      postflop_mistakes: {
        Args: { max_rows?: number }
        Returns: {
          answered_at: string
          category: string
          chosen: string
          correct: string
          facing: string
          ip: boolean
          n_opps: number
          street: string
          texture: string
        }[]
      }
      postflop_summary: {
        Args: never
        Returns: {
          best_streak: number
          correct: number
          reset_at: string
          total: number
        }[]
      }
      postflop_totals: {
        Args: never
        Returns: {
          bucket: string
          correct: number
          dimension: string
          played: number
        }[]
      }
      recent_attempts: {
        Args: { window_size?: number }
        Returns: {
          hero_pos: string
          is_correct: boolean
          scenario: string
        }[]
      }
      reset_progress: { Args: never; Returns: string }
      stats_summary: {
        Args: never
        Returns: {
          best_streak: number
          correct: number
          reset_at: string
          total: number
        }[]
      }
      stats_totals: {
        Args: never
        Returns: {
          correct: number
          hero_pos: string
          played: number
          scenario: string
        }[]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

