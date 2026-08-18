export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      wallets: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallets_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      wallet_events: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_events_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_events_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      invisible_wallets: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invisible_wallets_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invisible_wallets_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      wallet_sessions: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_sessions_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_sessions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      organization_members: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      kyc_status: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_status_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_status_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      users: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      organizations: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      transactions: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      assets: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      liquidity_pools: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "liquidity_pools_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidity_pools_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      yield_vaults: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yield_vaults_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yield_vaults_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      rules: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rules_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      executions: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "executions_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "executions_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      notifications: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      api_keys: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      webhooks: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      rate_limits: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_limits_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_limits_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      subscription_plans: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plans_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plans_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      billing_invoices: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      support_tickets: {
        Row: {
          id: string
          created_at: string
          updated_at: string | null
          user_id: string | null
          action: string | null
          resource: string | null
          ip_address: string | null
          success: boolean | null
          error_code: string | null
          metadata: Json | null
          organization_id: string | null
          status: string | null
          role: string | null
          name: string | null
          description: string | null
          amount: number | null
          currency: string | null
          reference_id: string | null
          is_active: boolean | null
          config: Json | null
          data: Json | null
          version: number | null
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string | null
          user_id?: string | null
          action?: string | null
          resource?: string | null
          ip_address?: string | null
          success?: boolean | null
          error_code?: string | null
          metadata?: Json | null
          organization_id?: string | null
          status?: string | null
          role?: string | null
          name?: string | null
          description?: string | null
          amount?: number | null
          currency?: string | null
          reference_id?: string | null
          is_active?: boolean | null
          config?: Json | null
          data?: Json | null
          version?: number | null
          deleted_at?: string | null
          created_by?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
