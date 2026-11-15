/** Keep built-in translated metadata lazy until an extension explicitly overrides a property. */
export function writableMetadata<T extends object>(metadata: T): T {
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(metadata))) {
    if (!descriptor.get || descriptor.set) continue
    Object.defineProperty(metadata, key, {
      ...descriptor,
      set(value: unknown) {
        Object.defineProperty(this, key, { value, writable: true, enumerable: descriptor.enumerable, configurable: descriptor.configurable })
      },
    })
  }
  return metadata
}
