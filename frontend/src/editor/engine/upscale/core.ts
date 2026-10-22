/**
 * Pure-code image upscaling.
 *
 * The photo path is a separable Lanczos-3 resampler. Two details matter for quality:
 *
 * - Resampling happens in linear light and with premultiplied alpha. Doing the arithmetic on sRGB
 *   bytes darkens gradients and lets the colour of transparent pixels bleed into edges.
 * - The result of each tap is clamped to the range of the two-by-two source pixels it came from.
 *   Lanczos has negative lobes, and this anti-ringing clamp removes the bright/dark halo around hard
 *   edges without giving up the sharpness in the rest of the picture.
 *
 * A small luminance unsharp pass restores the micro-contrast that any low-pass interpolation removes.
 * `pixel` mode skips both and uses nearest-neighbour, which is what pixel art wants.
 */
import {
  DEFAULT_DETAIL,
  assertOutput,
  targetSize,
  UpscaleError,
  type UpscaleOptions,
} from './types'

/** Lanczos window radius: 3 is the usual quality/speed choice for photographs. */
const RADIUS = 3
const MIN_SHARPEN_DELTA = 1.5

const SRGB_TO_LINEAR = (() => {
  const table = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const v = i / 255
    table[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return table
})()

/** Linear light to an 8-bit sRGB value, quantised to 16 bits of input precision. */
const LINEAR_TO_SRGB_BYTE = (() => {
  const table = new Uint8Array(65_536)
  for (let i = 0; i < 65_536; i++) {
    const v = i / 65_535
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
    table[i] = Math.round(Math.min(1, Math.max(0, s)) * 255)
  }
  return table
})()

interface AxisWeights {
  /** Source index of every tap, already clamped to the edge. */
  indices: Int32Array
  /** Number of taps of each output position. */
  count: Int32Array
  /** Where each output position's taps begin in `indices` / `weights`. */
  offset: Int32Array
  weights: Float32Array
}

interface EdgeMap {
  left: Int32Array
  right: Int32Array
}

function lanczos(x: number): number {
  if (x === 0) return 1
  if (x <= -RADIUS || x >= RADIUS) return 0
  const pix = Math.PI * x
  return (RADIUS * Math.sin(pix) * Math.sin(pix / RADIUS)) / (pix * pix)
}

/** Filter weights for enlarging one axis. Output pixels are centred on source pixels. */
export function axisWeights(source: number, target: number): AxisWeights {
  const indices: number[] = []
  const count = new Int32Array(target)
  const offset = new Int32Array(target)
  const weights: number[] = []
  const scale = target / source
  if (!(scale >= 1)) throw new UpscaleError('The resampler only enlarges images.')

  for (let d = 0; d < target; d++) {
    offset[d] = weights.length
    const centre = (d + 0.5) / scale - 0.5
    const first = Math.ceil(centre - RADIUS)
    const last = Math.floor(centre + RADIUS)
    let sum = 0
    let kept = 0
    for (let i = first; i <= last; i++) {
      const weight = lanczos(i - centre)
      if (weight === 0) continue
      indices.push(Math.min(source - 1, Math.max(0, i)))
      weights.push(weight)
      sum += weight
      kept++
    }
    count[d] = kept
    if (sum !== 0) {
      const at = offset[d]
      for (let t = 0; t < kept; t++) weights[at + t] /= sum
    }
  }
  return { indices: Int32Array.from(indices), count, offset, weights: Float32Array.from(weights) }
}

/**
 * The two source pixels that an output position covers on one axis (clamped at the borders).
 * These are the neighbours the anti-ringing clamp uses.
 */
function edgeMap(source: number, target: number): EdgeMap {
  const left = new Int32Array(target)
  const right = new Int32Array(target)
  const scale = target / source
  for (let d = 0; d < target; d++) {
    const centre = (d + 0.5) / scale - 0.5
    const a = Math.floor(centre)
    left[d] = Math.min(source - 1, Math.max(0, a))
    right[d] = Math.min(source - 1, Math.max(0, a + 1))
  }
  return { left, right }
}

/** Horizontal pass for one channel, in linear light. RGB is premultiplied by alpha. */
function horizontalPass(source: Uint8ClampedArray, sourceWidth: number, sourceHeight: number, targetWidth: number, columns: AxisWeights, channel: number, out: Float32Array): void {
  const premultiply = channel !== 3
  for (let y = 0; y < sourceHeight; y++) {
    const sourceRow = y * sourceWidth * 4
    const outRow = y * targetWidth
    for (let x = 0; x < targetWidth; x++) {
      const taps = columns.count[x]
      const at = columns.offset[x]
      let sum = 0
      for (let t = 0; t < taps; t++) {
        const pixel = sourceRow + columns.indices[at + t] * 4
        if (channel === 3) sum += columns.weights[at + t] * (source[pixel + 3] / 255)
        else {
          let value = SRGB_TO_LINEAR[source[pixel + channel]]
          if (premultiply) value *= source[pixel + 3] / 255
          sum += columns.weights[at + t] * value
        }
      }
      out[outRow + x] = sum
    }
  }
}

/** Vertical pass, one output row at a time, so no full target plane is ever allocated. */
function verticalPass(
  across: Float32Array,
  targetWidth: number,
  targetHeight: number,
  rows: AxisWeights,
  onRow: (y: number, row: Float32Array) => void,
): void {
  const row = new Float32Array(targetWidth)
  for (let y = 0; y < targetHeight; y++) {
    row.fill(0)
    const taps = rows.count[y]
    const at = rows.offset[y]
    for (let t = 0; t < taps; t++) {
      const weight = rows.weights[at + t]
      const base = rows.indices[at + t] * targetWidth
      for (let x = 0; x < targetWidth; x++) row[x] += weight * across[base + x]
    }
    onRow(y, row)
  }
}

interface Bounds {
  min: number
  max: number
}

/**
 * Bounds of the four source pixels under an output pixel, in linear light (premultiplied for RGB).
 * Clamping a filtered sample to this range is the anti-ringing step.
 */
function neighbourBounds(
  source: Uint8ClampedArray,
  sourceWidth: number,
  edgesX: EdgeMap,
  edgesY: EdgeMap,
  x: number,
  y: number,
  channel: number,
  bounds: Bounds,
): void {
  const x0 = edgesX.left[x]
  const x1 = edgesX.right[x]
  const y0 = edgesY.left[y]
  const y1 = edgesY.right[y]
  const a = (y0 * sourceWidth + x0) * 4
  const b = (y0 * sourceWidth + x1) * 4
  const c = (y1 * sourceWidth + x0) * 4
  const d = (y1 * sourceWidth + x1) * 4
  let v0: number
  let v1: number
  let v2: number
  let v3: number
  if (channel === 3) {
    v0 = source[a + 3] / 255
    v1 = source[b + 3] / 255
    v2 = source[c + 3] / 255
    v3 = source[d + 3] / 255
  } else {
    v0 = SRGB_TO_LINEAR[source[a + channel]] * (source[a + 3] / 255)
    v1 = SRGB_TO_LINEAR[source[b + channel]] * (source[b + 3] / 255)
    v2 = SRGB_TO_LINEAR[source[c + channel]] * (source[c + 3] / 255)
    v3 = SRGB_TO_LINEAR[source[d + channel]] * (source[d + 3] / 255)
  }
  bounds.min = Math.min(v0, v1, v2, v3)
  bounds.max = Math.max(v0, v1, v2, v3)
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function toSrgbByte(linear: number): number {
  if (!(linear > 0)) return 0
  if (linear >= 1) return 255
  return LINEAR_TO_SRGB_BYTE[(linear * 65_535 + 0.5) | 0]
}

/** Luminance unsharp mask on the final bytes, with a small threshold to leave flat areas alone. */
function sharpen(rgba: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount <= 0 || width < 3 || height < 3) return
  const rowBytes = width * 4
  const previous = new Uint8ClampedArray(rowBytes)
  const current = new Uint8ClampedArray(rowBytes)
  const following = new Uint8ClampedArray(rowBytes)
  const previousLum = new Float32Array(width)
  const currentLum = new Float32Array(width)
  const followingLum = new Float32Array(width)

  const luminanceRow = (row: Uint8ClampedArray, out: Float32Array): void => {
    for (let x = 0; x < width; x++) {
      const at = x * 4
      out[x] = 0.2126 * row[at] + 0.7152 * row[at + 1] + 0.0722 * row[at + 2]
    }
  }

  previous.set(rgba.subarray(0, rowBytes))
  current.set(rgba.subarray(0, rowBytes))
  following.set(rgba.subarray(rowBytes, rowBytes * 2))
  luminanceRow(previous, previousLum)
  luminanceRow(current, currentLum)
  luminanceRow(following, followingLum)

  for (let y = 0; y < height; y++) {
    const outRow = y * rowBytes
    for (let x = 0; x < width; x++) {
      const at = x * 4
      // A nearly transparent pixel has no meaningful colour to sharpen and would pick up fringes.
      if (current[at + 3] < 8) continue
      const left = x === 0 ? 0 : x - 1
      const right = x === width - 1 ? width - 1 : x + 1
      // Centre weighted 4, edges 2, corners 1: a 3 x 3 Gaussian.
      const blur =
        (previousLum[left] +
          2 * previousLum[x] +
          previousLum[right] +
          2 * (currentLum[left] + 2 * currentLum[x] + currentLum[right]) +
          followingLum[left] +
          2 * followingLum[x] +
          followingLum[right]) /
        16
      let delta = (currentLum[x] - blur) * amount
      if (Math.abs(delta) < MIN_SHARPEN_DELTA) delta = 0
      rgba[outRow + at] = current[at] + delta
      rgba[outRow + at + 1] = current[at + 1] + delta
      rgba[outRow + at + 2] = current[at + 2] + delta
    }
    // Shift the original rows forward. Rows still ahead in `rgba` have not been written yet.
    previous.set(current)
    current.set(following)
    previousLum.set(currentLum)
    currentLum.set(followingLum)
    if (y + 2 < height) {
      following.set(rgba.subarray((y + 2) * rowBytes, (y + 3) * rowBytes))
      luminanceRow(following, followingLum)
    } else {
      following.set(current)
      followingLum.set(currentLum)
    }
  }
}

function nearestNeighbour(source: Uint8ClampedArray, width: number, height: number, targetWidth: number, targetHeight: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4)
  const scaleX = targetWidth / width
  const scaleY = targetHeight / height
  for (let y = 0; y < targetHeight; y++) {
    const sy = Math.min(height - 1, Math.max(0, Math.floor((y + 0.5) / scaleY)))
    const sourceRow = sy * width * 4
    const outRow = y * targetWidth * 4
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.min(width - 1, Math.max(0, Math.floor((x + 0.5) / scaleX)))
      const from = sourceRow + sx * 4
      const to = outRow + x * 4
      out[to] = source[from]
      out[to + 1] = source[from + 1]
      out[to + 2] = source[from + 2]
      out[to + 3] = source[from + 3]
    }
  }
  return out
}

function lanczosUpscale(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
  detail: number,
  report: (percent: number) => void,
): Uint8ClampedArray {
  const columns = axisWeights(width, targetWidth)
  const rows = axisWeights(height, targetHeight)
  const edgesX = edgeMap(width, targetWidth)
  const edgesY = edgeMap(height, targetHeight)
  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4)
  const alpha = new Uint8ClampedArray(targetWidth * targetHeight)
  const bounds: Bounds = { min: 0, max: 1 }
  const rowStep = Math.max(1, Math.floor(targetHeight / 20))

  report(2)
  const across = new Float32Array(targetWidth * height)
  horizontalPass(source, width, height, targetWidth, columns, 3, across)
  verticalPass(across, targetWidth, targetHeight, rows, (y, row) => {
    for (let x = 0; x < targetWidth; x++) {
      neighbourBounds(source, width, edgesX, edgesY, x, y, 3, bounds)
      const a = clamp(row[x], bounds.min, bounds.max)
      const at = y * targetWidth + x
      const byte = Math.round(Math.min(1, Math.max(0, a)) * 255)
      alpha[at] = byte
      out[at * 4 + 3] = byte
    }
    if (y % rowStep === 0) report(2 + (y / targetHeight) * 23)
  })

  for (let channel = 0; channel < 3; channel++) {
    horizontalPass(source, width, height, targetWidth, columns, channel, across)
    const progressBase = 25 + channel * 22
    verticalPass(across, targetWidth, targetHeight, rows, (y, row) => {
      for (let x = 0; x < targetWidth; x++) {
        const at = y * targetWidth + x
        neighbourBounds(source, width, edgesX, edgesY, x, y, channel, bounds)
        const premultiplied = clamp(row[x], bounds.min, bounds.max)
        const a = alpha[at] / 255
        out[at * 4 + channel] = a > 1 / 255 ? toSrgbByte(premultiplied / a) : 0
      }
      if (y % rowStep === 0) report(progressBase + (y / targetHeight) * 22)
    })
  }

  report(93)
  sharpen(out, targetWidth, targetHeight, detail)
  report(100)
  return out
}

export interface UpscaledImage {
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

export function upscaleImageData(source: Uint8ClampedArray, width: number, height: number, options: UpscaleOptions): UpscaledImage {
  if (width < 1 || height < 1 || source.length < width * height * 4) {
    throw new UpscaleError('The source pixels do not match the image size.')
  }
  const target = targetSize(width, height, options.scale)
  assertOutput(target)
  const report = options.onProgress ?? (() => undefined)
  if (options.method === 'pixel') {
    report(100)
    return { data: nearestNeighbour(source, width, height, target.width, target.height) as Uint8ClampedArray<ArrayBuffer>, ...target }
  }
  const detail = Math.min(1, Math.max(0, options.detail ?? DEFAULT_DETAIL))
  const data = lanczosUpscale(source, width, height, target.width, target.height, detail, report)
  return { data: data as Uint8ClampedArray<ArrayBuffer>, ...target }
}
