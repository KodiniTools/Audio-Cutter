// eslint.config.js (Flat Config)
// Hinweis: Plugin-Versionen ggf. lokal an euer Setup anpassen (siehe README/Risiken).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  { ignores: ['dist/', 'node_modules/', 'server/node_modules/'] },
  prettier,
]
