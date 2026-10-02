/**
 * Darino Design System — Tailwind token bindings
 *
 * Every colour is a CSS variable defined in src/styles/index.css (light + dark).
 * Scales below mirror the Darino reference system; see DESIGN-REDESIGN-REPORT.md §2
 * and the live /design-system page for usage rules.
 *
 * @type {import('tailwindcss').Config}
 */
const rgb = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        // 1728 = MacBook Pro 16" — wide desktop layouts
        '3xl': '1728px',
        // Touch devices: larger control heights (≥ 44px targets)
        coarse: { raw: '(pointer: coarse)' },
        // Installed PWA
        standalone: { raw: '(display-mode: standalone)' }
      },
      fontFamily: {
        // «Vazirmatn FD»: همهٔ ارقام فارسی رسم می‌شوند (حتی اگر متن رقم لاتین داشته باشد)
        sans: ['Vazirmatn FD', 'Vazirmatn', 'system-ui', '-apple-system', 'Segoe UI', 'Tahoma', 'sans-serif'],
        mono: ['Vazirmatn FD', 'Vazirmatn', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        // فقط برای شناسه‌های فنی لاتین (آدرس کیف پول، هش تراکنش) که باید دقیق خوانده شوند
        latin: ['Vazirmatn', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      colors: {
        /* ---- Brand (reference) ---- */
        brand: {
          50: rgb('brand-50'),
          100: rgb('brand-100'),
          500: rgb('brand-500'),
          600: rgb('brand-600'),
          700: rgb('brand-700'),
          900: rgb('brand-900')
        },
        /* ---- Text ---- */
        ink: rgb('ink'),
        muted: rgb('ink-muted'),
        subtle: rgb('ink-subtle'),
        /* ---- Surfaces ---- */
        canvas: rgb('canvas'),
        surface: rgb('canvas'),
        'surface-2': rgb('surface-2'),
        card: rgb('card'),
        divider: rgb('divider'),
        'divider-strong': rgb('divider-strong'),
        /** Base for translucent lines/scrims (always used with an alpha) */
        line: rgb('line'),
        /* ---- Interaction ---- */
        accent: rgb('brand-500'),
        'accent-strong': rgb('brand-600'),
        'accent-soft': rgb('brand-50'),
        'on-accent': rgb('on-accent'),
        /* ---- Financial semantics ---- */
        gain: rgb('gain'),
        positive: rgb('gain-text'),
        negative: rgb('loss'),
        loss: rgb('loss'),
        gold: rgb('gold'),
        'gold-text': rgb('gold-text'),
        /* ---- System status ---- */
        warn: rgb('warn'),
        info: rgb('info'),
        /* ---- Data visualisation (categorical) ---- */
        chart: {
          1: rgb('chart-1'),
          2: rgb('chart-2'),
          3: rgb('chart-3'),
          4: rgb('chart-4'),
          5: rgb('chart-5'),
          6: rgb('chart-6')
        }
      },
      fontSize: {
        /* Reference type scale. Semantic aliases (.t-*) live in index.css */
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], //       11/16 micro (badges, overlines) — floor
        xs: ['0.75rem', { lineHeight: '1.25rem' }], //          12/20 caption
        sm: ['0.875rem', { lineHeight: '1.375rem' }], //        14/22 label · body-sm
        base: ['1rem', { lineHeight: '1.75rem' }], //           16/28 body
        lg: ['1.125rem', { lineHeight: '1.75rem' }], //         18/28 heading 3 · body large
        xl: ['1.25rem', { lineHeight: '1.875rem' }], //         20/30 page title (mobile)
        '2xl': ['1.5rem', { lineHeight: '2rem' }], //           24/32 figure
        '3xl': ['1.875rem', { lineHeight: '2.5rem' }], //       30/40 heading 2
        '4xl': ['2.25rem', { lineHeight: '2.875rem' }], //      36/46 hero figure
        '5xl': ['3rem', { lineHeight: '3.875rem' }] //          48/62 display
      },
      borderRadius: {
        /* Reference radii: 8 controls/chips · 12 buttons/inputs · 16 cards · 24 panels */
        control: '0.5rem',
        field: '0.75rem',
        card: '1rem',
        panel: '1.5rem'
      },
      boxShadow: {
        /* Limited elevation — three levels only */
        card: '0 1px 2px 0 rgb(var(--c-shadow) / 0.05)',
        'card-hover': '0 2px 8px -2px rgb(var(--c-shadow) / 0.10)',
        pop: '0 16px 40px -12px rgb(var(--c-shadow) / 0.24), 0 2px 8px -2px rgb(var(--c-shadow) / 0.08)',
        none: 'none'
      },
      spacing: {
        /* Page gutter (reference: 20px) and nav metrics */
        gutter: '1.25rem',
        rail: '5rem',
        sidebar: '16rem',
        'sidebar-collapsed': '5rem',
        topbar: '3.5rem',
        bottomnav: '4rem'
      },
      maxWidth: {
        content: '80rem', //  1280
        'content-wide': '90rem', // 1440
        prose: '42rem',
        dialog: '32rem'
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        emphasized: 'cubic-bezier(0.3, 0, 0, 1)'
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '280ms'
      },
      opacity: {
        6: '0.06',
        8: '0.08',
        12: '0.12',
        85: '0.85',
        95: '0.95'
      },
      zIndex: {
        nav: '40',
        overlay: '60',
        sheet: '70',
        palette: '80',
        toast: '90'
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' }
        }
      },
      animation: {
        shimmer: 'shimmer 1.8s linear infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite'
      }
    }
  },
  plugins: []
};
