export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: number
          key: string | null
          value: string | null
        }
        Insert: {
          id?: number
          key?: string | null
          value?: string | null
        }
        Update: {
          id?: number
          key?: string | null
          value?: string | null
        }
        Relationships: []
      }
      authors: {
        Row: {
          amazon_asin: string | null
          created_at: string | null
          description: string | null
          id: number
          name: string
          provider: string | null
        }
        Insert: {
          amazon_asin?: string | null
          created_at?: string | null
          description?: string | null
          id?: number
          name: string
          provider?: string | null
        }
        Update: {
          amazon_asin?: string | null
          created_at?: string | null
          description?: string | null
          id?: number
          name?: string
          provider?: string | null
        }
        Relationships: []
      }
      book_authors: {
        Row: {
          author_id: number
          book_id: number
          role: string | null
        }
        Insert: {
          author_id: number
          book_id: number
          role?: string | null
        }
        Update: {
          author_id?: number
          book_id?: number
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_authors_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_authors_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_metadata"
            referencedColumns: ["book_id"]
          },
        ]
      }
      book_metadata: {
        Row: {
          amount_chars: number | null
          asin: string | null
          book_id: number
          cover: string | null
          description: string | null
          isbn_10: string | null
          isbn_13: string | null
          language_code: string | null
          page_count: number | null
          published_date: string | null
          publisher_id: number | null
          series_id: number | null
          subtitle: string | null
          title: string | null
        }
        Insert: {
          amount_chars?: number | null
          asin?: string | null
          book_id: number
          cover?: string | null
          description?: string | null
          isbn_10?: string | null
          isbn_13?: string | null
          language_code?: string | null
          page_count?: number | null
          published_date?: string | null
          publisher_id?: number | null
          series_id?: number | null
          subtitle?: string | null
          title?: string | null
        }
        Update: {
          amount_chars?: number | null
          asin?: string | null
          book_id?: number
          cover?: string | null
          description?: string | null
          isbn_10?: string | null
          isbn_13?: string | null
          language_code?: string | null
          page_count?: number | null
          published_date?: string | null
          publisher_id?: number | null
          series_id?: number | null
          subtitle?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_metadata_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: true
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_metadata_publisher_id_fkey"
            columns: ["publisher_id"]
            isOneToOne: false
            referencedRelation: "publishers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_metadata_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      book_metadata_locks: {
        Row: {
          book_id: number
          field_name: string
          locked: boolean
        }
        Insert: {
          book_id: number
          field_name: string
          locked?: boolean
        }
        Update: {
          book_id?: number
          field_name?: string
          locked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "book_metadata_locks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_metadata"
            referencedColumns: ["book_id"]
          },
        ]
      }
      book_metadata_original: {
        Row: {
          book_id: number
          import_date: string | null
          metadata: Json | null
        }
        Insert: {
          book_id: number
          import_date?: string | null
          metadata?: Json | null
        }
        Update: {
          book_id?: number
          import_date?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "book_metadata_original_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: true
            referencedRelation: "book_metadata"
            referencedColumns: ["book_id"]
          },
        ]
      }
      book_ratings: {
        Row: {
          book_id: number
          created_at: string | null
          rating: number | null
          review: string | null
          user_id: string
        }
        Insert: {
          book_id: number
          created_at?: string | null
          rating?: number | null
          review?: string | null
          user_id: string
        }
        Update: {
          book_id?: number
          created_at?: string | null
          rating?: number | null
          review?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_ratings_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_metadata"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      book_series: {
        Row: {
          book_id: number
          position: number | null
          series_id: number
        }
        Insert: {
          book_id: number
          position?: number | null
          series_id: number
        }
        Update: {
          book_id?: number
          position?: number | null
          series_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "book_series_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_metadata"
            referencedColumns: ["book_id"]
          },
          {
            foreignKeyName: "book_series_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          created_at: string
          filehash: string | null
          filename: string
          filesize_kb: number | null
          id: number
          last_modified: string | null
          library_id: number | null
          library_path_id: number | null
          media_type: string | null
          relative_path: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          filehash?: string | null
          filename: string
          filesize_kb?: number | null
          id?: number
          last_modified?: string | null
          library_id?: number | null
          library_path_id?: number | null
          media_type?: string | null
          relative_path?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          filehash?: string | null
          filename?: string
          filesize_kb?: number | null
          id?: number
          last_modified?: string | null
          library_id?: number | null
          library_path_id?: number | null
          media_type?: string | null
          relative_path?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "books_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_library_path_id_fkey"
            columns: ["library_path_id"]
            isOneToOne: false
            referencedRelation: "library_path"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_books: {
        Row: {
          added_at: string | null
          book_id: number
          collection_id: string
        }
        Insert: {
          added_at?: string | null
          book_id: number
          collection_id: string
        }
        Update: {
          added_at?: string | null
          book_id?: number
          collection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_books_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      external_book_ratings: {
        Row: {
          book_id: number
          last_updated: string | null
          provider: string
          rating: number | null
          review_count: number | null
        }
        Insert: {
          book_id: number
          last_updated?: string | null
          provider: string
          rating?: number | null
          review_count?: number | null
        }
        Update: {
          book_id?: number
          last_updated?: string | null
          provider?: string
          rating?: number | null
          review_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "external_book_ratings_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "book_metadata"
            referencedColumns: ["book_id"]
          },
        ]
      }
      library: {
        Row: {
          created_at: string
          id: number
          is_cron_watch: boolean | null
          is_public: boolean
          name: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          is_cron_watch?: boolean | null
          is_public?: boolean
          name?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          is_cron_watch?: boolean | null
          is_public?: boolean
          name?: string | null
        }
        Relationships: []
      }
      library_path: {
        Row: {
          created_at: string
          id: number
          is_enabled: boolean | null
          library_id: number | null
          path: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          is_enabled?: boolean | null
          library_id?: number | null
          path?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          is_enabled?: boolean | null
          library_id?: number | null
          path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_path_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "library"
            referencedColumns: ["id"]
          },
        ]
      }
      liked_books: {
        Row: {
          book_id: number
          created_at: string
          user_id: string
        }
        Insert: {
          book_id: number
          created_at?: string
          user_id: string
        }
        Update: {
          book_id?: number
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liked_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liked_books_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      publishers: {
        Row: {
          created_at: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      series: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      user_book_progress: {
        Row: {
          book_id: number | null
          created_at: string
          id: string
          last_read: string | null
          percentage: number | null
          user_id: string | null
        }
        Insert: {
          book_id?: number | null
          created_at?: string
          id: string
          last_read?: string | null
          percentage?: number | null
          user_id?: string | null
        }
        Update: {
          book_id?: number | null
          created_at?: string
          id?: string
          last_read?: string | null
          percentage?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_book_progress_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_book_progress_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_library: {
        Row: {
          created_at: string
          id: number
          library_id: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          library_id?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          library_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_library_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_library_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string
          id: number
          setting_key: string | null
          setting_value: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          setting_key?: string | null
          setting_value?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          setting_key?: string | null
          setting_value?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          billing_address: Json | null
          email: string | null
          full_name: string | null
          id: string
          payment_method: Json | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          billing_address?: Json | null
          email?: string | null
          full_name?: string | null
          id: string
          payment_method?: Json | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          billing_address?: Json | null
          email?: string | null
          full_name?: string | null
          id?: string
          payment_method?: Json | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      pgroonga_command: {
        Args:
          | { groongacommand: string }
          | { groongacommand: string; arguments: string[] }
        Returns: string
      }
      pgroonga_command_escape_value: {
        Args: { value: string }
        Returns: string
      }
      pgroonga_condition: {
        Args: {
          query?: string
          weights?: number[]
          scorers?: string[]
          schema_name?: string
          index_name?: string
          column_name?: string
          fuzzy_max_distance_ratio?: number
        }
        Returns: Database["public"]["CompositeTypes"]["pgroonga_condition"]
      }
      pgroonga_equal_query_text_array: {
        Args: { targets: string[]; query: string }
        Returns: boolean
      }
      pgroonga_equal_query_text_array_condition: {
        Args:
          | {
              targets: string[]
              condition: Database["public"]["CompositeTypes"]["pgroonga_condition"]
            }
          | {
              targets: string[]
              condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition"]
            }
        Returns: boolean
      }
      pgroonga_equal_query_varchar_array: {
        Args: { targets: string[]; query: string }
        Returns: boolean
      }
      pgroonga_equal_query_varchar_array_condition: {
        Args:
          | {
              targets: string[]
              condition: Database["public"]["CompositeTypes"]["pgroonga_condition"]
            }
          | {
              targets: string[]
              condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition"]
            }
        Returns: boolean
      }
      pgroonga_equal_text: {
        Args: { target: string; other: string }
        Returns: boolean
      }
      pgroonga_equal_text_condition: {
        Args:
          | {
              target: string
              condition: Database["public"]["CompositeTypes"]["pgroonga_condition"]
            }
          | {
              target: string
              condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition"]
            }
        Returns: boolean
      }
      pgroonga_equal_varchar: {
        Args: { target: string; other: string }
        Returns: boolean
      }
      pgroonga_equal_varchar_condition: {
        Args:
          | {
              target: string
              condition: Database["public"]["CompositeTypes"]["pgroonga_condition"]
            }
          | {
              target: string
              condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition"]
            }
        Returns: boolean
      }
      pgroonga_escape: {
        Args:
          | { value: boolean }
          | { value: number }
          | { value: number }
          | { value: number }
          | { value: number }
          | { value: number }
          | { value: string }
          | { value: string }
          | { value: string }
          | { value: string; special_characters: string }
        Returns: string
      }
      pgroonga_flush: {
        Args: { indexname: unknown }
        Returns: boolean
      }
      pgroonga_handler: {
        Args: { "": unknown }
        Returns: unknown
      }
      pgroonga_highlight_html: {
        Args:
          | { target: string; keywords: string[] }
          | { target: string; keywords: string[]; indexname: unknown }
          | { targets: string[]; keywords: string[] }
          | { targets: string[]; keywords: string[]; indexname: unknown }
        Returns: string
      }
      pgroonga_index_column_name: {
        Args:
          | { indexname: unknown; columnindex: number }
          | { indexname: unknown; columnname: string }
        Returns: string
      }
      pgroonga_is_writable: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      pgroonga_list_broken_indexes: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      pgroonga_list_lagged_indexes: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      pgroonga_match_positions_byte: {
        Args:
          | { target: string; keywords: string[] }
          | { target: string; keywords: string[]; indexname: unknown }
        Returns: number[]
      }
      pgroonga_match_positions_character: {
        Args:
          | { target: string; keywords: string[] }
          | { target: string; keywords: string[]; indexname: unknown }
        Returns: number[]
      }
      pgroonga_match_term: {
        Args:
          | { target: string[]; term: string }
          | { target: string[]; term: string }
          | { target: string; term: string }
          | { target: string; term: string }
        Returns: boolean
      }
      pgroonga_match_text_array_condition: {
        Args:
          | {
              target: string[]
              condition: Database["public"]["CompositeTypes"]["pgroonga_condition"]
            }
          | {
              target: string[]
              condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition"]
            }
        Returns: boolean
      }
      pgroonga_match_text_array_condition_with_scorers: {
        Args: {
          target: string[]
          condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition_with_scorers"]
        }
        Returns: boolean
      }
      pgroonga_match_text_condition: {
        Args:
          | {
              target: string
              condition: Database["public"]["CompositeTypes"]["pgroonga_condition"]
            }
          | {
              target: string
              condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition"]
            }
        Returns: boolean
      }
      pgroonga_match_text_condition_with_scorers: {
        Args: {
          target: string
          condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition_with_scorers"]
        }
        Returns: boolean
      }
      pgroonga_match_varchar_condition: {
        Args:
          | {
              target: string
              condition: Database["public"]["CompositeTypes"]["pgroonga_condition"]
            }
          | {
              target: string
              condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition"]
            }
        Returns: boolean
      }
      pgroonga_match_varchar_condition_with_scorers: {
        Args: {
          target: string
          condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition_with_scorers"]
        }
        Returns: boolean
      }
      pgroonga_normalize: {
        Args: { target: string } | { target: string; normalizername: string }
        Returns: string
      }
      pgroonga_prefix_varchar_condition: {
        Args:
          | {
              target: string
              conditoin: Database["public"]["CompositeTypes"]["pgroonga_condition"]
            }
          | {
              target: string
              conditoin: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition"]
            }
        Returns: boolean
      }
      pgroonga_query_escape: {
        Args: { query: string }
        Returns: string
      }
      pgroonga_query_expand: {
        Args: {
          tablename: unknown
          termcolumnname: string
          synonymscolumnname: string
          query: string
        }
        Returns: string
      }
      pgroonga_query_extract_keywords: {
        Args: { query: string; index_name?: string }
        Returns: string[]
      }
      pgroonga_query_text_array_condition: {
        Args:
          | {
              targets: string[]
              condition: Database["public"]["CompositeTypes"]["pgroonga_condition"]
            }
          | {
              targets: string[]
              condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition"]
            }
        Returns: boolean
      }
      pgroonga_query_text_array_condition_with_scorers: {
        Args: {
          targets: string[]
          condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition_with_scorers"]
        }
        Returns: boolean
      }
      pgroonga_query_text_condition: {
        Args:
          | {
              target: string
              condition: Database["public"]["CompositeTypes"]["pgroonga_condition"]
            }
          | {
              target: string
              condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition"]
            }
        Returns: boolean
      }
      pgroonga_query_text_condition_with_scorers: {
        Args: {
          target: string
          condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition_with_scorers"]
        }
        Returns: boolean
      }
      pgroonga_query_varchar_condition: {
        Args:
          | {
              target: string
              condition: Database["public"]["CompositeTypes"]["pgroonga_condition"]
            }
          | {
              target: string
              condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition"]
            }
        Returns: boolean
      }
      pgroonga_query_varchar_condition_with_scorers: {
        Args: {
          target: string
          condition: Database["public"]["CompositeTypes"]["pgroonga_full_text_search_condition_with_scorers"]
        }
        Returns: boolean
      }
      pgroonga_regexp_text_array: {
        Args: { targets: string[]; pattern: string }
        Returns: boolean
      }
      pgroonga_regexp_text_array_condition: {
        Args: {
          targets: string[]
          pattern: Database["public"]["CompositeTypes"]["pgroonga_condition"]
        }
        Returns: boolean
      }
      pgroonga_result_to_jsonb_objects: {
        Args: { result: Json }
        Returns: Json
      }
      pgroonga_result_to_recordset: {
        Args: { result: Json }
        Returns: Record<string, unknown>[]
      }
      pgroonga_score: {
        Args:
          | { row: Record<string, unknown> }
          | { tableoid: unknown; ctid: unknown }
        Returns: number
      }
      pgroonga_set_writable: {
        Args: { newwritable: boolean }
        Returns: boolean
      }
      pgroonga_snippet_html: {
        Args: { target: string; keywords: string[]; width?: number }
        Returns: string[]
      }
      pgroonga_table_name: {
        Args: { indexname: unknown }
        Returns: string
      }
      pgroonga_tokenize: {
        Args: { target: string }
        Returns: Json[]
      }
      pgroonga_vacuum: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      pgroonga_wal_apply: {
        Args: Record<PropertyKey, never> | { indexname: unknown }
        Returns: number
      }
      pgroonga_wal_set_applied_position: {
        Args:
          | Record<PropertyKey, never>
          | { block: number; offset: number }
          | { indexname: unknown }
          | { indexname: unknown; block: number; offset: number }
        Returns: boolean
      }
      pgroonga_wal_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          name: string
          oid: unknown
          current_block: number
          current_offset: number
          current_size: number
          last_block: number
          last_offset: number
          last_size: number
        }[]
      }
      pgroonga_wal_truncate: {
        Args: Record<PropertyKey, never> | { indexname: unknown }
        Returns: number
      }
    }
    Enums: {
      pricing_plan_interval: "day" | "week" | "month" | "year"
      pricing_type: "one_time" | "recurring"
      subscription_status:
        | "trialing"
        | "active"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "past_due"
        | "unpaid"
    }
    CompositeTypes: {
      pgroonga_condition: {
        query: string | null
        weigths: number[] | null
        scorers: string[] | null
        schema_name: string | null
        index_name: string | null
        column_name: string | null
        fuzzy_max_distance_ratio: number | null
      }
      pgroonga_full_text_search_condition: {
        query: string | null
        weigths: number[] | null
        indexname: string | null
      }
      pgroonga_full_text_search_condition_with_scorers: {
        query: string | null
        weigths: number[] | null
        scorers: string[] | null
        indexname: string | null
      }
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      pricing_plan_interval: ["day", "week", "month", "year"],
      pricing_type: ["one_time", "recurring"],
      subscription_status: [
        "trialing",
        "active",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "past_due",
        "unpaid",
      ],
    },
  },
} as const

