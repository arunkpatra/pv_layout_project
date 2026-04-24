// Repo-root ESLint flat config.
//
// One config covers every workspace. Each workspace's `lint` script runs
// `eslint .` and discovers this file via flat-config lookup.
//
// Conventions match CLAUDE.md §11 (no semicolons, double quotes; Tailwind
// v4 has no first-party ESLint plugin so class-ordering isn't enforced).
//
// React rules apply to .tsx files only. TypeScript-eslint runs on every
// TS file. The Tauri Rust shell isn't linted here — `cargo clippy` runs
// in the desktop workspace's own gates.

import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import globals from "globals"

export default tseslint.config(
  // Ignore generated / vendored / build artifacts.
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/src-tauri/target/**",
      "**/src-tauri/gen/**",
      "**/python/**",
      "docs/design/rendered/**",
    ],
  },

  // Base JS recommended.
  js.configs.recommended,

  // TypeScript recommended (no type-checked rules — keeps lint fast).
  ...tseslint.configs.recommended,

  // Project-wide TS settings.
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Allow leading underscore for intentionally-unused params.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Permit explicit `any` at boundaries (sidecar JSON, third-party
      // gunge); we have typecheck for the rest.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // React-specific rules apply to .tsx only.
  {
    files: ["**/*.tsx"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // Keep the classic, battle-tested hook rules.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Disable the new (eslint-plugin-react-hooks v7) rules that flag
      // patterns valid in our codebase. These are valuable in greenfield
      // code but generate false positives against the existing setState-
      // in-effect / ref-init patterns we already audited and accepted.
      // Revisit individually if a future spike hits a real bug they catch.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/component-hook-factories": "off",
      "react-hooks/refs": "off",

      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // Build/script files run in Node, not the browser.
  {
    files: ["**/scripts/**/*.{js,mjs,cjs,ts}", "**/*.config.{js,mjs,cjs,ts}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Test files: relax a few rules that are noisy in tests.
  {
    files: ["**/*.{test,spec}.{ts,tsx}", "**/test-utils/**", "**/test-setup.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-refresh/only-export-components": "off",
    },
  },

  // Index / barrel files re-export components by design — Fast Refresh
  // tolerates this just fine, the plugin's "only export components" check
  // is a false positive here.
  {
    files: ["**/index.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  }
)
