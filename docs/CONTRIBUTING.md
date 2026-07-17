# Contributing

1. Use Node 22+ and the npm workspaces monorepo.
2. Prefer shared types/constants from `@nexusdesk/types` and `@nexusdesk/shared`.
3. Keep API layers separated: routes → services → repositories → Prisma.
4. Do not commit secrets; update `.env.example` when adding configuration.
5. Add Vitest coverage for auth, permissions, and critical utilities.
6. Run `npm run format` / lint / typecheck before opening a PR.
7. CI (`.github/workflows/ci.yml`) must pass.
