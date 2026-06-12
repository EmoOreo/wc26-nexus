import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/wc26-nexus/',
  plugins: [react()],
})
