import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// export default defineConfig({
//   plugins: [react(), tailwindcss()],
//   server: {
//     proxy: {
//       '/api': { target: 'http://localhost:3000', changeOrigin: true }
//     }
//   }
// })

// export default defineConfig({
//   // ...
//   server: {
//     proxy: {
//       '/api': {
//         target: 'http://127.0.0.1:3000', // було localhost → стане 127.0.0.1
//         changeOrigin: true
//       }
//     }
//   }
// })

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'shared/engine'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      }
    }
  }
})

