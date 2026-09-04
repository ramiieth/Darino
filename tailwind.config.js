/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', '-apple-system', 'Segoe UI', 'Tahoma', 'sans-serif'],
        mono: ['Vazirmatn', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      colors: {
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        positive: 'rgb(var(--c-positive) / <alpha-value>)',
        negative: 'rgb(var(--c-negative) / <alpha-value>)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        info: 'rgb(var(--c-info) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)'
      },
      borderRadius: {
        // مقیاس کنترل‌شده: کارت = 2xl (1rem)، کنترل = xl (0.75rem)
        '4xl': '1.75rem'
      },
      boxShadow: {
        // سایه‌های ملایم و لایه‌ای — فین‌تک آرام
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.05)',
        'card-hover': '0 2px 4px 0 rgb(15 23 42 / 0.05), 0 4px 12px 0 rgb(15 23 42 / 0.06)',
        pop: '0 8px 24px -6px rgb(15 23 42 / 0.12), 0 2px 6px -2px rgb(15 23 42 / 0.06)',
        accent: '0 1px 2px 0 rgb(var(--c-accent) / 0.3), 0 2px 8px -2px rgb(var(--c-accent) / 0.35)',
        glow: '0 0 0 1px rgb(var(--c-accent) / 0.2), 0 4px 16px -4px rgb(var(--c-accent) / 0.4)'
      },
      fontSize: {
        // مقیاس تایپوگرافی منظم (فارسی)
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
        xs: ['0.6875rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.375rem' }],
        base: ['0.9375rem', { lineHeight: '1.625rem' }],
        lg: ['1.0625rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.5rem', { lineHeight: '2.125rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.5rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.75rem' }]
      },
      backdropBlur: {
        xs: '2px'
      },
      // آلفاهای سفارشی استفاده‌شده در اپ (بازطراحی UI — بدون تغییر منطق)
      opacity: {
        6: '0.06',
        8: '0.08',
        12: '0.12',
        85: '0.85',
        95: '0.95'
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' }
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' }
        },
        'count-in': {
          '0%': { opacity: '0', transform: 'translateY(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        shimmer: 'shimmer 1.8s linear infinite',
        'fade-up': 'fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'count-in': 'count-in 0.3s ease-out both'
      }
    }
  },
  plugins: []
};
