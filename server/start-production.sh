#!/bin/sh
set -eu

# Fail closed: never accept traffic before the schema and initial settings exist.
# Both commands are idempotent and preserve existing business data.
npm run db:migrate
npm run db:seed
exec node server/src/index.js
