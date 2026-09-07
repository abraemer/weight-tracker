import type { Entry, User } from '../types/index.js'

export const EPOCH = '1970-01-01T00:00:00.000Z'

export interface RawEntry extends Omit<Entry, 'updated_at' | 'deleted'> {
  updated_at: string | null
  deleted: number
}

export interface RawUser extends Omit<User, 'updated_at' | 'deleted'> {
  updated_at: string | null
  deleted: number
}

export function serializeEntry(row: RawEntry): Entry {
  return { ...row, updated_at: row.updated_at ?? EPOCH, deleted: row.deleted === 1 }
}

export function serializeUser(row: RawUser): User & { updated_at: string; deleted: boolean } {
  return { ...row, updated_at: row.updated_at ?? EPOCH, deleted: row.deleted === 1 }
}
