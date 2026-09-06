import type { User, Entry, NewUser, NewEntry, UpdateEntry, ApiError } from './types/index.js'

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

export async function updateEntry(id: number, data: UpdateEntry): Promise<Entry> {
  const response = await apiFetch(`/api/entries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Entry>(response)
}

export async function deleteEntry(id: number): Promise<void> {
  const response = await apiFetch(`/api/entries/${id}`, {
    method: 'DELETE',
  })
  return handleResponse<void>(response)
}
