/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--nd-background) / <alpha-value>)',
        foreground: 'hsl(var(--nd-foreground) / <alpha-value>)',
        muted: {
          DEFAULT: 'hsl(var(--nd-muted) / <alpha-value>)',
          foreground: 'hsl(var(--nd-muted-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--nd-card) / <alpha-value>)',
          foreground: 'hsl(var(--nd-card-foreground) / <alpha-value>)',
        },
        border: 'hsl(var(--nd-border) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--nd-primary) / <alpha-value>)',
          foreground: 'hsl(var(--nd-primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--nd-secondary) / <alpha-value>)',
          foreground: 'hsl(var(--nd-secondary-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--nd-accent) / <alpha-value>)',
          foreground: 'hsl(var(--nd-accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--nd-destructive) / <alpha-value>)',
          foreground: 'hsl(var(--nd-destructive-foreground) / <alpha-value>)',
        },
        ring: 'hsl(var(--nd-ring) / <alpha-value>)',
      },
      borderRadius: {
        nd: '0px',
        'nd-lg': '0px',
        'nd-xl': '0px',
      },
      fontFamily: {
        sans: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        display: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glass: '0 8px 32px hsl(222 47% 11% / 0.12)',
        'glass-sm': '0 1px 2px hsl(222 47% 11% / 0.04), 0 4px 16px hsl(222 47% 11% / 0.06)',
        'glass-dark': '0 8px 32px hsl(0 0% 0% / 0.35)',
      },
      backdropBlur: {
        glass: '16px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
