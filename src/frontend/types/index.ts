export interface User {
  id: number
  name: string
  created_at: string
}

export interface Entry {
  id: number
  user_id: number
  timestamp: string
  weight_kg: number
  created_at: string
}

export interface NewUser {
  name: string
}

export interface NewEntry {
  timestamp: string
  weight_kg: number
}

export interface UpdateEntry {
  timestamp?: string
  weight_kg?: number
}

export interface ApiError {
  error: string
}
