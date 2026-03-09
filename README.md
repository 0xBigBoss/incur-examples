# incur-examples

Standalone Bun/TypeScript examples for the current `incur` fork.

The repo vendors `incur` as a checked-in tarball under `vendor/` so the examples install without a sibling checkout, npm publish, or Git submodule.

## Layout

- `apps/acme-cli` — combined CLI that mounts the ConnectRPC and GraphQL plugins
- `packages/connectrpc-example` — local Connect-compatible server plus generated protobuf descriptor
- `packages/graphql-example` — local GraphQL server plus introspection artifact
- `vendor/incur-*.tgz` — vendored tarball of the `incur` fork used by the CLI app

## Install

```sh
bun install
```

## Run the examples

Start the local servers in separate terminals:

```sh
bun run connectrpc:server
bun run graphql:server
```

Then point the CLI at them:

```sh
ACME_CONNECTRPC_URL=http://127.0.0.1:4000 \
ACME_GRAPHQL_URL=http://127.0.0.1:4001/graphql \
  bun run cli -- users get-user u-1 --format json
```

## QA

```sh
bun run smoke
```

## Refresh the vendored tarball

By default the refresh script packs the sibling checkout at `../incur`, writes a commit-stamped tarball under `vendor/`, updates `apps/acme-cli/package.json`, and rewrites `vendor/incur.json`.

```sh
bun run vendor:incur
```
