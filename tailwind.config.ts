import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/components/**/*.{js,vue,ts}',
    './app/layouts/**/*.vue',
    './app/pages/**/*.vue',
    './app/app.vue',
    './app/plugins/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Nunito', 'system-ui', 'sans-serif'],
        sans: ['Nunito', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: '#0a0a0a',
          elevated: '#141414',
          muted: '#1c1c1c',
        },
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s ease-out both',
        'fade-up-delay': 'fade-up 0.45s ease-out 0.12s both',
        'fade-up-delay-2': 'fade-up 0.45s ease-out 0.24s both',
        pulseSoft: 'pulseSoft 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
