module.exports = {
    extends: ['plugin:@typescript-eslint/recommended'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    rules: {
        'import/extensions': 'off',
        'no-use-before-define': 'off',
        '@typescript-eslint/no-use-before-define': ['error', { ignoreTypeReferences: true }],
        'import/prefer-default-export': 'off',
        quotes: ['error', 'single', { allowTemplateLiterals: true }],
    },
    settings: {
        'import/resolver': {
            node: {
                extensions: ['.js', '.ts'],
                moduleDirectory: ['node_modules', './src', './base', './test'],
            },
        },
    },
    parserOptions: {
        project: './tsconfig.json',
    },
};
