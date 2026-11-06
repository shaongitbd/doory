import type { AiOption, AiProvider, AiProviderInput, AiProviderModel, AiProviderTestResult, Asset } from '@/types/api'
import { http } from './client'

/** Remote AI image tasks (`/ai/`): the options a user may pick, running a task, and the user's own servers. */
export const aiApi = {
  /** The options the signed-in user may pick for `task`, the in-browser model first. Never URLs or secrets. */
  options: (task: string, signal?: AbortSignal) => http.get<AiOption[]>('/ai/models/', { query: { task }, signal }),
  /** Runs `task` with a server option on one of the user's images (`asset_id`) or on a `prompt` (text-to-image); the result is a new asset. */
  run: (task: string, input: { asset_id?: string; model: string; prompt?: string }, signal?: AbortSignal) => http.post<Asset>(`/ai/${encodeURIComponent(task)}/`, { json: input, signal }),
  providers: {
    list: (signal?: AbortSignal) => http.get<AiProvider[]>('/ai/providers/', { signal }),
    create: (input: AiProviderInput) => http.post<AiProvider>('/ai/providers/', { json: input }),
    update: (id: string, input: AiProviderInput) => http.patch<AiProvider>(`/ai/providers/${id}/`, { json: input }),
    remove: (id: string) => http.delete<void>(`/ai/providers/${id}/`),
    /** Which models to offer, with their labels and order (replaces the list). */
    setModels: (id: string, models: AiProviderModel[]) => http.put<AiProvider>(`/ai/providers/${id}/models/`, { json: { models } }),
    /** Doory-compatible servers: adds the models the server lists. */
    loadModels: (id: string) => http.post<AiProvider>(`/ai/providers/${id}/load-models/`),
    test: (id: string, input: { task?: string; model?: string } = {}) => http.post<AiProviderTestResult>(`/ai/providers/${id}/test/`, { json: input }),
  },
}
