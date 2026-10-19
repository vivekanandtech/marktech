import { defineConfig, configDefaults } from 'vitest/config'

// `npm run build` compiles tests into dist/ too; never run those copies.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
})
