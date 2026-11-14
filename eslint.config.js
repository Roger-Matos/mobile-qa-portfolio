import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    { ignores: ['.cache/**', 'artifacts/**', 'allure-results/**', 'allure-report/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    { languageOptions: { globals: globals.node } },
)
