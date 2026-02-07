module.exports = {
	darkMode: ['class'],
	content: ['./src/**/*.{js,ts,jsx,tsx}', './src/app/**/*.{js,ts,jsx,tsx}'],
	theme: {
		extend: {
			borderRadius: {
				lg: 'var(--radius-lg)',
				md: 'var(--radius-md)',
				sm: 'var(--radius-sm)',
				DEFAULT: 'var(--radius)'
			},
			colors: {
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',

				surface: 'hsl(var(--surface))',
				'surface-2': 'hsl(var(--surface-2))',
				elevated: 'hsl(var(--elevated))',

				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
					2: 'hsl(var(--muted-2))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},

				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				danger: {
					DEFAULT: 'hsl(var(--danger))',
					foreground: 'hsl(var(--danger-foreground))'
				},
				info: {
					DEFAULT: 'hsl(var(--info))',
					foreground: 'hsl(var(--info-foreground))'
				},

				'faint-foreground': 'hsl(var(--faint-foreground))',
				border: 'hsl(var(--border))',
				'border-subtle': 'hsl(var(--border-subtle))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',

				reader: {
					DEFAULT: 'hsl(var(--reader-bg))',
					foreground: 'hsl(var(--reader-foreground))'
				},
				raw: {
					DEFAULT: 'hsl(var(--raw-bg))',
					foreground: 'hsl(var(--raw-foreground))'
				},

				'quote-bg': 'hsl(var(--quote-bg))',
				'quote-border': 'hsl(var(--quote-border))',
				'quote-text': 'hsl(var(--quote-text))',

				'selection-bg': 'hsl(var(--selection-bg))',
				'selection-text': 'hsl(var(--selection-text))',

				'fact-hover': 'hsl(var(--fact-hover))',
				'fact-selected': 'hsl(var(--fact-selected))',
				'fact-selected-border': 'hsl(var(--fact-selected-border))',

				chart: {
					'1': 'hsl(var(--chart-1))',
					'2': 'hsl(var(--chart-2))',
					'3': 'hsl(var(--chart-3))',
					'4': 'hsl(var(--chart-4))',
					'5': 'hsl(var(--chart-5))'
				}
			},
			boxShadow: {
				xs: 'var(--shadow-xs)',
				sm: 'var(--shadow-sm)',
				md: 'var(--shadow-md)',
				lg: 'var(--shadow-lg)'
			}
		}
	},
	plugins: [
		require("tailwindcss-animate"),
		require("@tailwindcss/typography"),
	],
}
