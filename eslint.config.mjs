import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest,
                ...globals.browser,
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-wrapper-object-types': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off',

            'no-console': 'off',
            'no-debugger': 'warn',
            'no-unused-vars': 'off',
            'no-undef': 'off',
            'no-empty': 'off',
            'no-constant-condition': 'off',
            'prefer-const': 'off',
            'object-shorthand': 'off',
            'prefer-template': 'off',
            'no-useless-escape': 'off',
            'no-control-regex': 'off',
            'no-empty-character-class': 'off',
            'no-regex-spaces': 'off',
            'no-extra-semi': 'off',
            'no-mixed-spaces-and-tabs': 'off',
            'no-case-declarations': 'off',
            'no-async-promise-executor': 'off',
            'no-prototype-builtins': 'off',
        },
    },
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/coverage/**',
            '**/*.d.ts',
            '**/*.tsbuildinfo',
            '.eslintrc.js.bak',
        ],
    }
);
