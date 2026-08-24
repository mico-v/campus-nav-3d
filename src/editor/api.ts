import type { CampusData } from '../data/campusData.ts'
import { assertValidCampusData } from '../data/campusValidation.ts'
import { normalizeCampusData } from '../data/roadNormalization.ts'

const ENDPOINT = '/api/campus'

export class ApiUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiUnavailableError'
  }
}

export interface SaveResponse {
  ok: true
  backupPath: string | null
}

/** Load campus data from the dev backend. Throws ApiUnavailableError when the backend is absent. */
export async function loadCampus(): Promise<CampusData> {
  let response: Response
  try {
    response = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } })
  } catch (error) {
    throw new ApiUnavailableError(`无法连接编辑后端：${(error as Error).message}`)
  }
  if (!response.ok) {
    throw new ApiUnavailableError(`编辑后端返回 ${response.status}`)
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    // The static preview server returns index.html for unknown routes.
    throw new ApiUnavailableError('编辑后端不可用（未返回 JSON）')
  }
  const raw: unknown = await response.json()
  assertValidCampusData(raw)
  return normalizeCampusData(raw)
}

/** Persist campus data via the dev backend. Throws Error with the server message on failure. */
export async function saveCampus(data: CampusData): Promise<SaveResponse> {
  const response = await fetch(ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const message = (payload as { error?: string } | null)?.error ?? `保存失败（${response.status}）`
    throw new Error(message)
  }
  return payload as SaveResponse
}
