/** @type {import('lint-staged').Configuration} */
export default {
  '*.{js,cjs,mjs,ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{json,jsonc,md,yaml,yml}': ['prettier --write'],
};
