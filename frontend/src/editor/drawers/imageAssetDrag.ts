import { uuid } from '@/lib/uuid'
import type { AssetRef } from '@/types/adapter'

export const IMAGE_ASSET_DRAG_TYPE = 'application/x-doory-image-asset'

interface ActiveImageAssetDrag {
  token: string
  asset: AssetRef
}

let active: ActiveImageAssetDrag | null = null

function imageAsset(asset: AssetRef): boolean {
  return asset.kind === 'image' || asset.kind === 'svg'
}

/** Starts an in-page image-asset drag without exposing a serialised asset reference to arbitrary drop targets. */
export function beginImageAssetDrag(transfer: DataTransfer, asset: AssetRef): boolean {
  if (!imageAsset(asset)) return false
  const token = uuid()
  try {
    transfer.effectAllowed = 'copy'
    transfer.setData(IMAGE_ASSET_DRAG_TYPE, token)
    active = { token, asset }
    return true
  } catch {
    active = null
    return false
  }
}

export function hasImageAssetDrag(transfer: DataTransfer): boolean {
  return transfer.types.includes(IMAGE_ASSET_DRAG_TYPE)
}

/** Returns only the asset registered by this page for the matching opaque drag token. */
export function readImageAssetDrag(transfer: DataTransfer): AssetRef | null {
  if (!active || !hasImageAssetDrag(transfer)) return null
  try {
    return transfer.getData(IMAGE_ASSET_DRAG_TYPE) === active.token ? active.asset : null
  } catch {
    return null
  }
}

export function endImageAssetDrag(): void {
  active = null
}
