export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module"
    },
    rules: {
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }]
    }
  }
]; 