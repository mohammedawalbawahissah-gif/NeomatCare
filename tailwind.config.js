/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#f0f9f4',
          100: '#dcf1e6',
          200: '#bbe3ce',
          300: '#8acead',
          400: '#54b285',
          500: '#2f9466',
          600: '#207652',
          700: '#1a5e42',
          800: '#174b36',
          900: '#143e2d',
          950: '#0a2319',
        },
        danger: {
          50:  '#fff4f2',
          100: '#ffe8e4',
          200: '#ffd0c8',
          300: '#ffad9d',
          400: '#ff7d66',
          500: '#f75336',
          600: '#e43418',
          700: '#c02812',
          800: '#9e2414',
          900: '#832317',
        },
        slate: {
          925: '#0d1520',
        }
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 8px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.10)',
        'glow-green': '0 0 24px rgba(47,148,102,0.25)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } },
      },
    },
  },
  plugins: [],
}
