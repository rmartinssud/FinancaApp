import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Tudo que começa com /api vai para o servidor (Express) na porta 3333.
    // Assim o cookie de login fica no mesmo endereço do site.
    proxy: {
      '/api': 'http://localhost:3333',
    },
  },
})
