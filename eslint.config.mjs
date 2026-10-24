import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React Compiler readiness rules. The compiler is not enabled (next.config.ts), so these flag
    // runtime-correct patterns: syncing local state from props or the pathname in an effect, polling
    // loaders started from an effect, and Date.now() in server components (rendered per request).
    // Kept visible as warnings; the other compiler rules (static components, refs) stay errors.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  globalIgnores(['.next/**', '.next-*/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**', 'storage/**', '.local-test/**']),
])
