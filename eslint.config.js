// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions and *.test.ts files are Deno code, checked by `npm test`.
    ignores: ['dist/*', 'supabase/functions/*', '**/*.test.ts'],
  },
]);
