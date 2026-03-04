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

export function setErrorHandler(handler: (message: string) => void): void {
  showError = handler
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = (await response.json()) as ApiError
    const message = errorData.error || 'An error occurred'
    showError?.(message)
    throw new Error(message)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export async function fetchUsers(): Promise<User[]> {
  const response = await fetch('/api/users')
  return handleResponse<User[]>(response)
}

export async function fetchUser(id: number): Promise<User> {
  const response = await fetch(`/api/users/${id}`)
  return handleResponse<User>(response)
}

export async function createUser(data: NewUser): Promise<User> {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<User>(response)
}

export async function fetchEntries(userId: number): Promise<Entry[]> {
  const response = await fetch(`/api/users/${userId}/entries`)
  return handleResponse<Entry[]>(response)
}

export async function createEntry(userId: number, data: NewEntry): Promise<Entry> {
  const response = await fetch(`/api/users/${userId}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Entry>(response)
}

export async function updateEntry(id: number, data: UpdateEntry): Promise<Entry> {
  const response = await fetch(`/api/entries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Entry>(response)
}

export async function deleteEntry(id: number): Promise<void> {
  const response = await fetch(`/api/entries/${id}`, {
    method: 'DELETE',
  })
  return handleResponse<void>(response)
}
