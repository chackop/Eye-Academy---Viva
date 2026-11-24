import { defineConfig, loadEnv } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  // expose .env (incl. ANTHROPIC_API_KEY) to server functions via process.env
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
  server: { port: 3000 },
  plugins: [tsconfigPaths(), tanstackStart(), viteReact()],
}
})
