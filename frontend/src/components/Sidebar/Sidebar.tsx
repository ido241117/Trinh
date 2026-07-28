import './Sidebar.css'

export type Tab = 'dashboard' | 'music' | 'watchlist' | 'local-library' | 'journal' | 'ai-quota'
export type AppTheme = 'light' | 'dark'

interface Props {
  activeTab: Tab
  appTheme?: AppTheme
  onTabChange: (tab: Tab) => void
  onThemeChange?: (theme: AppTheme) => void
}

interface NavItem {
  tab: Tab
  title: string
  shortLabel: string
  icon: React.ReactNode
}


function ThemeIcon({ theme }: { theme: AppTheme }) {
  if (theme === 'dark') {
    return (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 14.6A8.6 8.6 0 0 1 9.4 3a8.9 8.9 0 1 0 11.6 11.6z" />
      </svg>
    )
  }

  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0 4a1 1 0 0 0 1-1v-1.1a1 1 0 1 0-2 0V21a1 1 0 0 0 1 1zm0-18.9a1 1 0 0 0 1-1V1a1 1 0 1 0-2 0v1.1a1 1 0 0 0 1 1zM4.2 5.6a1 1 0 0 0 1.4-1.4l-.8-.8a1 1 0 1 0-1.4 1.4l.8.8zm15.6 14.9a1 1 0 0 0 .7-1.7l-.8-.8a1 1 0 1 0-1.4 1.4l.8.8c.2.2.4.3.7.3zM3.1 12a1 1 0 0 0-1-1H1a1 1 0 1 0 0 2h1.1a1 1 0 0 0 1-1zM23 11h-1.1a1 1 0 1 0 0 2H23a1 1 0 1 0 0-2zM4.2 18.4l-.8.8a1 1 0 1 0 1.4 1.4l.8-.8a1 1 0 0 0-1.4-1.4zM19.8 5.6l.8-.8a1 1 0 1 0-1.4-1.4l-.8.8a1 1 0 1 0 1.4 1.4z" />
    </svg>
  )
}

export default function Sidebar({
  activeTab,
  appTheme = 'light',
  onTabChange,
  onThemeChange,
}: Props) {
  const items: NavItem[] = [
    {
      tab: 'dashboard',
      title: 'Dashboard',
      shortLabel: 'Home',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
        </svg>
      ),
    },
    {
      tab: 'music',
      title: 'Music',
      shortLabel: 'Music',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
        </svg>
      ),
    },
    {
      tab: 'watchlist',
      title: 'Watchlist',
      shortLabel: 'Watch',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
        </svg>
      ),
    },
    {
      tab: 'local-library',
      title: 'Offline Library',
      shortLabel: 'Books',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.41.21.75-.19.75-.45V6c-1.49-1.12-3.63-1.5-4.5-1.5zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" />
        </svg>
      ),
    },
    {
      tab: 'journal',
      title: 'Journal',
      shortLabel: 'Journal',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
        </svg>
      ),
    },
    {
      tab: 'ai-quota',
      title: 'AI Quota',
      shortLabel: 'AI',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-5.5-2.5l7.51-3.49L17.5 6.5 9.99 9.99 6.5 17.5zm5.5-6.6c.61 0 1.1.49 1.1 1.1s-.49 1.1-1.1 1.1-1.1-.49-1.1-1.1.49-1.1 1.1-1.1z" />
        </svg>
      ),
    },
  ]

  return (
    <nav className="app-nav" aria-label="Main">
      <div className="app-nav-tabs">
        {items.map(({ tab, title, shortLabel, icon }) => (
          <button
            key={tab}
            type="button"
            title={title}
            aria-label={title}
            aria-current={activeTab === tab ? 'page' : undefined}
            onClick={() => onTabChange(tab)}
            className={`app-nav-tab${activeTab === tab ? ' is-active' : ''}`}
          >
            {icon}
            <span className="app-nav-tab-label">{shortLabel}</span>
          </button>
        ))}
      </div>

      <div className="app-nav-utils">
        <button
          type="button"
          title={appTheme === 'dark' ? 'Light mode' : 'Dark mode'}
          aria-label={appTheme === 'dark' ? 'Light mode' : 'Dark mode'}
          onClick={() => onThemeChange?.(appTheme === 'dark' ? 'light' : 'dark')}
          className="app-nav-util is-ghost"
        >
          <ThemeIcon theme={appTheme} />
        </button>
      </div>
    </nav>
  )
}
