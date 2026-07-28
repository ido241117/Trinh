export interface DashboardThemeInput {
	isDarkMode: boolean
	hasBackground: boolean
}

type DashTokens = Record<string, string>

const DARK_TOKENS: DashTokens = {
	'--dash-root-bg': '#11131b',
	'--dash-text': '#ffffff',
	'--dash-text-muted': 'rgb(255 255 255 / 72%)',
	'--dash-text-subtle': 'rgb(255 255 255 / 58%)',
	'--dash-text-faint': 'rgb(255 255 255 / 30%)',
	'--dash-clock-shadow': '0 2px 0 rgb(0 0 0 / 80%), 0 8px 28px rgb(0 0 0 / 70%), 0 0 48px rgb(0 0 0 / 55%)',
	'--dash-surface': 'rgb(255 255 255 / 8%)',
	'--dash-surface-border': 'rgb(255 255 255 / 12%)',
	'--dash-surface-border-hover': 'rgb(10 132 255 / 35%)',
	'--dash-surface-blur': '24px',
	'--dash-divider': 'rgb(255 255 255 / 10%)',
	'--dash-progress-track': 'rgb(255 255 255 / 12%)',
	'--dash-fab-bg': 'rgb(255 255 255 / 10%)',
	'--dash-fab-border': 'rgb(255 255 255 / 16%)',
	'--dash-fab-text': 'rgb(255 255 255 / 88%)',
	'--dash-fab-hover-bg': 'rgb(255 255 255 / 18%)',
	'--dash-fab-hover-border': 'rgb(255 255 255 / 34%)',
	'--dash-fab-shadow': '0 10px 24px rgb(0 0 0 / 20%)',
	'--dash-cover-bg': '#282a32',
	'--dash-cover-placeholder': '#87938f',
	'--dash-cover-shadow': '0 4px 12px rgb(0 0 0 / 30%)',
	'--dash-control-text': '#bdc9c5',
	'--dash-empty-text': '#87938f',
}

const LIGHT_TOKENS: DashTokens = {
	'--dash-root-bg': '#f5f7fb',
	'--dash-text': '#0f172a',
	'--dash-text-muted': '#64748b',
	'--dash-text-subtle': '#94a3b8',
	'--dash-text-faint': '#94a3b8',
	'--dash-clock-shadow': '0 2px 0 rgb(255 255 255 / 60%), 0 6px 24px rgb(0 0 0 / 64%), 0 0 40px rgb(0 0 0 / 48%)',
	'--dash-surface': 'rgb(255 255 255 / 72%)',
	'--dash-surface-border': 'rgb(15 23 42 / 8%)',
	'--dash-surface-border-hover': 'rgb(10 132 255 / 40%)',
	'--dash-surface-blur': '20px',
	'--dash-divider': 'rgb(15 23 42 / 8%)',
	'--dash-progress-track': '#eef2f7',
	'--dash-fab-bg': 'rgb(255 255 255 / 82%)',
	'--dash-fab-border': 'rgb(15 23 42 / 10%)',
	'--dash-fab-text': '#111827',
	'--dash-fab-hover-bg': 'rgb(255 255 255 / 94%)',
	'--dash-fab-hover-border': '#dbe7f5',
	'--dash-fab-shadow': '0 2px 8px rgb(15 23 42 / 8%)',
	'--dash-cover-bg': 'rgb(67 89 113 / 6%)',
	'--dash-cover-placeholder': '#94a3b8',
	'--dash-cover-shadow': '0 4px 12px rgb(15 23 42 / 8%)',
	'--dash-control-text': '#64748b',
	'--dash-empty-text': '#94a3b8',
}

function buildTokens(input: DashboardThemeInput): DashTokens {
	const base = input.isDarkMode ? DARK_TOKENS : LIGHT_TOKENS

	if (input.hasBackground) {
		return base
	}

	if (input.isDarkMode) {
		return base
	}

	return {
		...base,
		'--dash-surface': '#ffffff',
		'--dash-surface-blur': '0',
	}
}

export function applyDashboardTheme(root: HTMLElement | null, input: DashboardThemeInput): void {
	if (!root) return

	const tokens = buildTokens(input)
	for (const [key, value] of Object.entries(tokens)) {
		root.style.setProperty(key, value)
	}

	root.dataset.dashTheme = input.isDarkMode ? 'dark' : 'light'
	root.dataset.dashBg = input.hasBackground ? 'image' : 'none'
}
