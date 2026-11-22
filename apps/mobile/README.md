# apps/mobile

Tourneasy mobile app (React Native + Expo, SDK 58, Expo Router). Phase 0 setup only: the app shows a placeholder home screen. Scope and phases are in [SCOPE.md](./SCOPE.md); API and staff notes are in [REFERENCE.md](./REFERENCE.md) and [STAFF_ACCOUNTS.md](./STAFF_ACCOUNTS.md).

## Commands

Run from the repository root:

```bash
pnpm --filter @tourneasy/mobile start     # Expo dev server
pnpm --filter @tourneasy/mobile lint
pnpm --filter @tourneasy/mobile typecheck
pnpm --filter @tourneasy/mobile test
```

`pnpm lint`, `pnpm typecheck` and `pnpm test` at the root include this package through Turbo.

## Layout

- `src/app/`: Expo Router screens (every file is a route).
- `src/lib/`: non-route code (crash reporting, API client later).
- `src/__tests__/`: Jest tests.
- `assets/`: icons and splash images.

## Configuration

- `app.json`: bundle identifier `com.tourneasy.app`, iOS deployment target 16.4 (the minimum for SDK 58), Sentry plugin.
- Crash reporting is off unless `EXPO_PUBLIC_SENTRY_DSN` is set. Use the EU-region Sentry project DSN.
- Native folders (`ios/`, `android/`) are generated and not committed. Configure native behaviour in `app.json`.
- Install packages with `npx expo install <package>` from this folder, so versions match the SDK.

See [AGENTS.md](./AGENTS.md) for the Expo conventions this project follows.
