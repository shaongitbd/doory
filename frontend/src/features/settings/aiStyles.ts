import type { AiProviderStyle } from '@/types/api'

/** How each API style talks to a server, for the form; the backend's `apps.ai.styles` has the rules. */
export interface AiStyleInfo {
  id: AiProviderStyle
  label: string
  /** One line on the requests and answers of the style. */
  summary: string
  /** The settings the style accepts, for the hint under the style settings. */
  settings: string
  /** A starting point shown as the placeholder of the style settings. */
  example: Record<string, unknown>
  /** The server lists its models itself (Load models). */
  canLoadModels: boolean
}

export const AI_STYLES: readonly AiStyleInfo[] = [
  {
    id: 'doory',
    label: 'Doory-compatible',
    summary: 'The server implements Doory’s open contract: GET /v1/models and POST /v1/{task}.',
    settings: 'extra_headers only. Use Load models to list the server’s models.',
    example: {},
    canLoadModels: true,
  },
  {
    id: 'multipart',
    label: 'Multipart → image',
    summary: 'The picture goes up as a file field; the answer is a PNG with transparency. Fits most model servers.',
    settings: 'path, file_field (default "file"), model_field (default "model"; empty: not sent), options_field, extra_fields, extra_headers.',
    example: { path: '/api/remove', file_field: 'file', model_field: 'model' },
    canLoadModels: false,
  },
  {
    id: 'json',
    label: 'JSON → base64',
    summary: 'The picture goes as base64 in a JSON body (or as a file); the answer is JSON with a base64 image.',
    settings: 'path, body ("json" or "multipart"), file_field (default "image"), model_field, options_field, extra_fields, extra_headers, response_path (e.g. "data.image").',
    example: { path: '/v1/segment', file_field: 'image', response_path: 'image_b64' },
    canLoadModels: false,
  },
  {
    id: 'mask',
    label: 'Mask',
    summary: 'Like multipart, but the server answers with a black-and-white mask that Doory applies.',
    settings: 'path, file_field (default "file"), model_field, options_field, extra_fields, extra_headers.',
    example: { path: '/segment', file_field: 'file' },
    canLoadModels: false,
  },
  {
    id: 'custom',
    label: 'Custom',
    summary: 'Every setting: method, path, body, how the picture is sent and what the answer is.',
    settings: 'method (POST or PUT), path (may contain {task} and {model}), body (multipart or json), send_as (file or base64), file_field, model_field, options_field, extra_fields, extra_headers, response (image, mask, json:<path> or json-mask:<path>).',
    example: { method: 'POST', path: '/v1/{task}', body: 'multipart', file_field: 'image', response: 'image' },
    canLoadModels: false,
  },
  {
    id: 'queue',
    label: 'Queue',
    summary: 'For text to image: the prompt goes as a job, Doory checks its status until it is done, then downloads the picture from the link in the answer.',
    settings: 'path (default "/v1/queue/{model}"), status_path and result_path (when the answer has no status_url or response_url), prompt_field (default "prompt"), model_field, options_field, extra_fields, extra_headers, response_path (default "images.0.url").',
    example: { path: '/{model}', extra_fields: { image_size: 'landscape_4_3' } },
    canLoadModels: false,
  },
]

export function styleInfo(id: string): AiStyleInfo {
  return AI_STYLES.find((style) => style.id === id) ?? AI_STYLES[0]
}

/** The AI tasks a server can be set up for, with their names in Settings. */
export const AI_TASKS: readonly { id: string; label: string }[] = [
  { id: 'background-removal', label: 'Background removal' },
  { id: 'text-to-image', label: 'Text to image' },
]

export function taskLabel(id: string): string {
  return AI_TASKS.find((task) => task.id === id)?.label ?? id
}
