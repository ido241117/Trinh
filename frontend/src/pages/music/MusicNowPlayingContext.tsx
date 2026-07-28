import { createContext, useContext, useDeferredValue, type ReactNode } from 'react'

const NowPlayingContext = createContext<string | null>(null)

export function NowPlayingProvider({
  trackId,
  children,
}: {
  trackId: string | null
  children: ReactNode
}) {
  return (
    <NowPlayingContext.Provider value={trackId}>
      {children}
    </NowPlayingContext.Provider>
  )
}

export function useDeferredNowPlayingId() {
  const trackId = useContext(NowPlayingContext)
  return useDeferredValue(trackId)
}
