// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/main.css'],
  tailwindcss: {
    cssPath: '~/assets/css/main.css',
    configPath: 'tailwind.config.ts',
    viewer: false,
  },
  postcss: {
    plugins: {
      'tailwindcss/nesting': false,
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  nitro: {
    preset: 'vercel',
  },
  // Bo'sh default — Vercel/local env `NUXT_*` orqali runtime'da to'ldiriladi
  runtimeConfig: {
    sessionSecret: '',
    public: {
      firebaseApiKey: '',
      firebaseAuthDomain: '',
      firebaseProjectId: '',
      firebaseStorageBucket: '',
      firebaseMessagingSenderId: '',
      firebaseAppId: '',
      firebaseMeasurementId: '',
      firebaseDatabaseURL: '',
    },
  },
  vite: {
    optimizeDeps: {
      include: ['firebase/app', 'firebase/auth', 'firebase/database', 'jose'],
    },
  },
  routeRules: {
    '/app': { ssr: false, headers: { 'Cache-Control': 'no-store' } },
    '/api/**': { headers: { 'Cache-Control': 'no-store' } },
  },
  app: {
    head: {
      title: 'LiveChat',
      meta: [
        { name: 'description', content: "O'zbekiston bo'ylab odamlar bilan bir lahzada bog'laning" },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1' },
        { name: 'theme-color', content: '#000000' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap',
        },
      ],
    },
  },
})
