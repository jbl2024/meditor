import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src-tauri/**',
        'coverage/**',
        'dist/**',
        'target/**',
        '**/target/**',
        'src/main.ts',
        'src/test/**',
        'src/vite-env.d.ts',
        'src/types/**',
        'postcss.config.js',
        'vite.config.ts',
        'vitest.config.ts'
      ],
      reportsDirectory: 'coverage/front',
      reporter: ['text', 'html', 'lcov']
    }
  }
})
