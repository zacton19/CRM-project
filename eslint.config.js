// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions are Deno code (npm: imports), checked by `npm run test:functions`.
    ignores: ['dist/*', 'supabase/functions/*'],
  },
]);
