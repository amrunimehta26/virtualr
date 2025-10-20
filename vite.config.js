import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  build: {
    outDir: 'dist',          // build output folder
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html')
    }
  },

  ssr: {
    noExternal: ['react', 'react-dom']  // bundle react for SSR
  }
})
