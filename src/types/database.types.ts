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
            users: {
                Row: {
                    id: number
                    username: string
                    display_name: string
                    email: string
                    password: string
                    is_virtual: boolean | null
                    created_at: string
                }
                Insert: {
                    id?: number
                    username: string
                    display_name: string
                    email: string
                    password: string
                    is_virtual?: boolean | null
                    created_at?: string
                }
                Update: {
                    id?: number
                    username?: string
                    display_name?: string
                    email?: string
                    password?: string
                    is_virtual?: boolean | null
                    created_at?: string
                }
            }
            trips: {
                Row: {
                    id: number
                    name: string
                    description: string | null
                    start_date: string | null
                    end_date: string | null
                    location: any
                    hash_code: string
                    created_at: string
                }
                Insert: {
                    id?: number
                    name: string
                    description?: string | null
                    start_date?: string | null
                    end_date?: string | null
                    location?: any
                    hash_code: string
                    created_at?: string
                }
                Update: {
                    id?: number
                    name?: string
                    description?: string | null
                    start_date?: string | null
                    end_date?: string | null
                    location?: any
                    hash_code?: string
                    created_at?: string
                }
            }
            trip_members: {
                Row: {
                    id: number
                    trip_id: number
                    user_id: number
                    role: 'admin' | 'member' | null
                    joined_at: string
                }
                Insert: {
                    id?: number
                    trip_id: number
                    user_id: number
                    role?: 'admin' | 'member' | null
                    joined_at?: string
                }
                Update: {
                    id?: number
                    trip_id?: number
                    user_id?: number
                    role?: 'admin' | 'member' | null
                    joined_at?: string
                }
            }
            expenses: {
                Row: {
                    id: number
                    trip_id: number
                    payer_id: number
                    amount: number
                    original_amount: number
                    currency: string
                    exchange_rate: number
                    description: string
                    category: 'accommodation' | 'transportation' | 'food' | 'shopping' | 'entertainment' | 'tickets' | 'other' | null
                    date: string
                    created_at: string
                }
                Insert: {
                    id?: number
                    trip_id: number
                    payer_id: number
                    amount: number
                    original_amount?: number
                    currency?: string
                    exchange_rate?: number
                    description: string
                    category?: 'accommodation' | 'transportation' | 'food' | 'shopping' | 'entertainment' | 'tickets' | 'other' | null
                    date: string
                    created_at?: string
                }
                Update: {
                    id?: number
                    trip_id?: number
                    payer_id?: number
                    amount?: number
                    original_amount?: number
                    currency?: string
                    exchange_rate?: number
                    description?: string
                    category?: 'accommodation' | 'transportation' | 'food' | 'shopping' | 'entertainment' | 'tickets' | 'other' | null
                    date?: string
                    created_at?: string
                }
            }
            expense_splits: {
                Row: {
                    id: number
                    expense_id: number
                    user_id: number
                    share_amount: number
                }
                Insert: {
                    id?: number
                    expense_id: number
                    user_id: number
                    share_amount: number
                }
                Update: {
                    id?: number
                    expense_id?: number
                    user_id?: number
                    share_amount?: number
                }
            }
        }
        Views: {}
        Functions: {}
        Enums: {}
    }
}
