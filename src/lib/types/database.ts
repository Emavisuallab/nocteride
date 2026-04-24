export type ServiceDayStatus =
  | 'scheduled'
  | 'negotiating'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type NegotiationStatus = 'pending' | 'accepted' | 'rejected'
export type UserRole = 'passenger' | 'driver'

export interface Profile {
  id: string
  role: UserRole
  name: string
  push_token: string | null
  created_at: string
}

export interface ServiceDay {
  id: string
  date: string
  pickup_time: string | null
  status: ServiceDayStatus
  amount: number
  is_paid: boolean
  created_at: string
}

export interface TimeNegotiation {
  id: string
  service_day_id: string
  proposed_by: UserRole
  proposed_time: string
  reason: string | null
  status: NegotiationStatus
  created_at: string
}

export interface TrackingSession {
  id: string
  service_day_id: string
  is_active: boolean
  started_at: string
  ended_at: string | null
}

export interface LocationUpdate {
  id: string
  tracking_session_id: string
  lat: number
  lng: number
  recorded_at: string
}

export interface Payment {
  id: string
  service_day_id: string
  amount: number
  paid_at: string
  marked_by: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
      }
      service_days: {
        Row: ServiceDay
        Insert: Omit<ServiceDay, 'id' | 'created_at'> & { id?: string }
        Update: Partial<Omit<ServiceDay, 'id' | 'created_at'>>
      }
      time_negotiations: {
        Row: TimeNegotiation
        Insert: Omit<TimeNegotiation, 'id' | 'created_at'> & { id?: string }
        Update: Partial<Omit<TimeNegotiation, 'id' | 'created_at'>>
      }
      tracking_sessions: {
        Row: TrackingSession
        Insert: Omit<TrackingSession, 'id'> & { id?: string }
        Update: Partial<Omit<TrackingSession, 'id'>>
      }
      location_updates: {
        Row: LocationUpdate
        Insert: Omit<LocationUpdate, 'id' | 'recorded_at'> & { id?: string }
        Update: Partial<Omit<LocationUpdate, 'id' | 'recorded_at'>>
      }
      payments: {
        Row: Payment
        Insert: Omit<Payment, 'id'> & { id?: string }
        Update: Partial<Omit<Payment, 'id'>>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
