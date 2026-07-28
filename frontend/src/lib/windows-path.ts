export function trimWindowsFilePathToFolder(filePath: string): string | null {
  const normalized = filePath.trim().replace(/\//g, '\\').replace(/\\+$/, '')
  if (!normalized) return null

  const lastSeparator = normalized.lastIndexOf('\\')
  if (lastSeparator <= 2) return null

  return normalized.slice(0, lastSeparator)
}
