import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Served at seanfontaine.dev/stethoscribe and scribecentral.io/stethoscribe.
  // Built files stay in dist/assets; vercel.json maps the /stethoscribe prefix onto them.
  base: "/stethoscribe/",
  plugins: [react()],
  build: {
    sourcemap: true
  }
})