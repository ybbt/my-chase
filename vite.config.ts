import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// export default defineConfig({
//   plugins: [react(), tailwindcss()],
//   server: {
//     proxy: {
//       '/api': { target: 'http://localhost:3000', changeOrigin: true }
//     }
//   }
// })

export default defineConfig({
  // ...
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000', // було localhost → стане 127.0.0.1
        changeOrigin: true
      }
    }
  }
})
