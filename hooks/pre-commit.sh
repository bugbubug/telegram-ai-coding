#!/bin/bash
set -e

echo "🔍 Running pre-commit checks..."

# Type check
pnpm typecheck || { echo "❌ Type check failed"; exit 1; }

# Lint
pnpm lint || { echo "❌ Lint failed"; exit 1; }

# Test suite
pnpm test || { echo "❌ Tests failed"; exit 1; }

# Check for console.log
if grep -rn "console\.log" src/ --include="*.ts" | grep -v "// allow-console"; then
  echo "❌ Found console.log in src/. Use pino logger instead."
  exit 1
fi

echo "✅ All checks passed"
