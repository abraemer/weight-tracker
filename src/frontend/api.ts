import type {
  User,
  Entry,
  NewUser,
  NewEntry,
  UpdateEntry,
  ApiError,
  UpdateEntryResult,
  DeleteEntryResult,
} from './types/index.js'

export function localToUtc(localDateTime: string): string {
  const date = new Date(localDateTime)
  return date.toISOString()
}

function formatDateParts(date: Date): {
  year: string
  month: string
  day: string
  hours: string
  minutes: string
} {
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    day: String(date.getDate()).padStart(2, '0'),
    hours: String(date.getHours()).padStart(2, '0'),
    minutes: String(date.getMinutes()).padStart(2, '0'),
  }
}

export function utcToLocal(utcTimestamp: string): string {
  const { year, month, day, hours, minutes } = formatDateParts(new Date(utcTimestamp))
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function formatLocalDateTime(utcTimestamp: string): { date: string; time: string } {
  const { year, month, day, hours, minutes } = formatDateParts(new Date(utcTimestamp))
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  }
}

export function getCurrentLocalDateTime(): string {
  const { year, month, day, hours, minutes } = formatDateParts(new Date())
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

let showError: ((message: string) => void) | null = null
let onSessionExpired: (() => void) | null = null

export function setErrorHandler(handler: (message: string) => void): void {
  showError = handler
}

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler
}

const SESSION_RELOADED_KEY = 'wt_session_reloaded'

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || !!(navigator as unknown as { standalone: boolean }).standalone
}

function handleSessionExpired(): never {
  if (!window.sessionStorage.getItem(SESSION_RELOADED_KEY)) {
    window.sessionStorage.setItem(SESSION_RELOADED_KEY, '1')
    window.location.href = window.location.origin + window.location.pathname + window.location.search
    throw new Error('Session expired')
  }
  window.sessionStorage.removeItem(SESSION_RELOADED_KEY)
  onSessionExpired?.()
  throw new Error('Session expired')
}

export async function checkSession(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', { redirect: 'manual' })
    return !isAuthRedirect(response) && response.ok
  } catch {
    return false
  }
}

export async function fetchState(): Promise<{ users: User[]; entries: Entry[] }> {
  const response = await fetch('/api/state', { redirect: 'manual' })
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  const payload = (await response.json()) as { users: User[]; entries: Entry[] }
  if (!Array.isArray(payload.users) || !Array.isArray(payload.entries)) {
    throw new Error('Invalid state payload')
  }
  return payload
}

function isAuthRedirect(response: Response): boolean {
  if (response.status === 401 || response.status === 403) return true
  if (response.type === 'opaqueredirect') return true
  if (response.redirected && !response.url.includes('/api/')) return true
  return false
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (isAuthRedirect(response)) handleSessionExpired()
  if (!response.ok) {
    let message = 'An error occurred'
    try {
      const errorData = (await response.json()) as ApiError
      message = errorData.error || message
    } catch {
      message = `Request failed with status ${response.status}`
    }
    showError?.(message)
    throw new Error(message)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { redirect: 'manual', ...init })
}

function isEntryRow(value: unknown): value is Entry {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'number' &&
    typeof record.user_id === 'number' &&
    typeof record.timestamp === 'string' &&
    typeof record.weight_kg === 'number' &&
    typeof record.created_at === 'string' &&
    typeof record.updated_at === 'string' &&
    typeof record.deleted === 'boolean'
  )
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function conflictEntry(body: unknown): Entry | null {
  if (typeof body !== 'object' || body === null) return null
  const record = body as Record<string, unknown>
  if (record.error !== 'conflict') return null
  if (!isEntryRow(record.row)) return null
  return record.row
}

function bodyErrorMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>
    if (typeof record.error === 'string' && record.error !== '') {
      return record.error
    }
    return 'An error occurred'
  }
  return `Request failed with status ${status}`
}

async function failMutation(response: Response, body: unknown): Promise<never> {
  const message = bodyErrorMessage(body, response.status)
  showError?.(message)
  throw new Error(message)
}

export async function fetchUsers(): Promise<User[]> {
  const response = await apiFetch('/api/users')
  return handleResponse<User[]>(response)
}

export async function createUser(data: NewUser): Promise<User> {
  const response = await apiFetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<User>(response)
}

export async function fetchEntries(userId: number): Promise<Entry[]> {
  const response = await apiFetch(`/api/users/${userId}/entries`)
  return handleResponse<Entry[]>(response)
}

export async function createEntry(userId: number, data: NewEntry): Promise<Entry> {
  const response = await apiFetch(`/api/users/${userId}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Entry>(response)
}

export async function updateEntry(
  id: number,
  data: UpdateEntry,
  updatedAt?: string
): Promise<UpdateEntryResult> {
  const response = await apiFetch(`/api/entries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedAt === undefined ? data : { ...data, updated_at: updatedAt }),
  })
  if (isAuthRedirect(response)) handleSessionExpired()
  if (response.status === 404) return { kind: 'gone' }
  if (!response.ok) {
    const body = await readBody(response)
    if (response.status === 409) {
      const entry = conflictEntry(body)
      if (entry !== null) return { kind: 'conflict', entry }
    }
    return failMutation(response, body)
  }
  const entry = (await response.json()) as Entry
  return { kind: 'ok', entry }
}

export async function deleteEntry(id: number, updatedAt?: string): Promise<DeleteEntryResult> {
  const query = updatedAt === undefined ? '' : `?updated_at=${encodeURIComponent(updatedAt)}`
  const response = await apiFetch(`/api/entries/${id}${query}`, {
    method: 'DELETE',
  })
  if (isAuthRedirect(response)) handleSessionExpired()
  if (response.status === 404) return { kind: 'gone' }
  if (!response.ok) {
    const body = await readBody(response)
    if (response.status === 409) {
      const entry = conflictEntry(body)
      if (entry !== null) return { kind: 'conflict', entry }
    }
    return failMutation(response, body)
  }
  return { kind: 'ok' }
}
