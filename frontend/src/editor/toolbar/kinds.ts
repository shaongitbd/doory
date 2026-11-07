/** True when every selected object is of `kind`. */
export const onlyKind = (kinds: readonly string[], kind: string): boolean => kinds.length === 1 && kinds[0] === kind

function size(value: unknown, fallback = 1): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.abs(value)) : fallback
}

function collectColors(obj: Record<string, unknown>, out: Map<string, number>): void {
  if (obj.visible === false || obj.opacity === 0) return
  const width = size(obj.width) * size(obj.scaleX)
  const height = size(obj.height) * size(obj.scaleY)
  // Painted bounds give large fills priority; strokes use their approximate outline area.
  if (typeof obj.origFill === 'string') out.set(obj.origFill, (out.get(obj.origFill) ?? 0) + Math.max(1, width * height))
  if (typeof obj.origStroke === 'string') {
    const outline = 2 * (width + height) * size(obj.strokeWidth)
    out.set(obj.origStroke, (out.get(obj.origStroke) ?? 0) + Math.max(1, outline))
  }
  if (Array.isArray(obj.objects)) for (const child of obj.objects as Record<string, unknown>[]) collectColors(child, out)
}

/** The ten most prominent original colours of a recolourable vector element. */
export function elementColors(obj: Record<string, unknown> | undefined): string[] {
  const colors = new Map<string, number>()
  if (obj) collectColors(obj, colors)
  return [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([color]) => color)
}
