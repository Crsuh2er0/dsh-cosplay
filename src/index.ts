/**
 * dsh-cosplay — package entry point (round 1 placeholder).
 *
 * No plugin behavior is implemented yet. The final package will export one or
 * more Cordis plugin entry points (host half: settings service, tools;
 * client half: settings UI), wired into the running Harness through the
 * `cordis.patch.yml` bundle layer instead of direct imports.
 *
 * Build/typecheck require dependencies first (`pnpm install` then
 * `pnpm build` / `pnpm typecheck`), which needs network access.
 */

export const name = 'dsh-cosplay'

export const version = '0.1.0'
