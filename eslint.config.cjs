const js = require('@eslint/js');
module.exports = [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'public/**/*.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        fetch: 'readonly',
        document: 'readonly',
        FormData: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        jest: 'readonly',
      },
    },
    rules: {
      'no-prototype-builtins': 'off',
      'no-cond-assign': 'off',
    },
  },
];
