# Release source-map upload (P4.11)

The panel webpack config emits `hidden-source-map`s in production builds.
On a release run we want Sentry to ingest those so stack traces in
production are symbolicated.

We deliberately do NOT list `@sentry/webpack-plugin` in
`apps/panel/devDependencies` — it pulls `@sentry/cli`, which has a
postinstall script that downloads a native binary. Local dev installs
shouldn't need that.

## CI release job

```yaml
- name: Install Sentry plugin
  run: pnpm add -D --filter @directorai/panel @sentry/webpack-plugin

- name: Build panel
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: directorai
    SENTRY_PROJECT: panel
    SENTRY_RELEASE: ${{ github.ref_name }}
  run: pnpm --filter @directorai/panel build
```

When all three env vars are present, the webpack config's
`maybeSentryPlugin()` requires `@sentry/webpack-plugin` and adds it to
the plugin list. Missing any one → the plugin is silently skipped and
maps stay local.

## Verifying

After the release build runs, you should see in the Sentry dashboard
under **Releases → <version> → Artifacts**:

- `bundle.js`
- `bundle.js.map`

Then any error captured with that release tag will have a symbolicated
stack trace.

## Why hidden-source-map

`hidden-source-map` emits the `.map` file but does NOT append the
`//# sourceMappingURL=…` reference to `bundle.js`. UXP loads the
runtime bundle without ever resolving the map (it's only used
server-side by Sentry's symbolication), so users don't get a leaked
source-of-truth view but our debugging stays sharp.
