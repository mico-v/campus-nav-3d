import { prepareCampusData, type CampusData } from '../data/campusData.ts'
import { assertValidCampusData } from '../data/campusValidation.ts'
import { apiUrl, authHeaders, isRemoteApi } from '../data/apiClient.ts'

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

/** Load campus data from the backend (dev server 或自托管服务). Throws ApiUnavailableError when absent. */
export async function loadCampus(): Promise<CampusData> {
  let response: Response
  try {
    response = await fetch(apiUrl(ENDPOINT), { headers: { Accept: 'application/json' } })
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
  return prepareCampusData(raw)
}

/** Persist campus data via the backend. Throws Error with the server message on failure. */
export async function saveCampus(data: CampusData): Promise<SaveResponse> {
  const response = await fetch(apiUrl(ENDPOINT), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders('PUT') },
    body: JSON.stringify(data),
  })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const serverMessage = (payload as { error?: string } | null)?.error
    // 503 是「服务端没配 API_TOKEN」，不是网络问题，单独说清楚
    if (response.status === 503) {
      throw new Error(serverMessage ?? '写接口未启用：服务端未启动写权限（未配置 API_TOKEN）')
    }
    if (response.status === 401) {
      throw new Error(serverMessage ?? '写接口拒绝了这次请求：API_TOKEN 不匹配')
    }
    throw new Error(serverMessage ?? `保存失败（${response.status}）`)
  }
  const saved = payload as Partial<SaveResponse> | null
  return { ok: true, backupPath: saved?.backupPath ?? null }
}

/** 保存目标是同源还是独立后端 —— 建模页拿它决定提示文案 */
export function usesRemoteApi(): boolean {
  return isRemoteApi()
}
