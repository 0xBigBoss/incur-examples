# incur-examples

Example CLIs built with [incur](https://github.com/0xbigboss/incur), demonstrating the GraphQL and ConnectRPC plugins.

The repo vendors `incur` as a checked-in tarball under `vendor/` so the examples install without a sibling checkout, npm publish, or Git submodule.

## Layout

- `apps/acme-cli` — combined CLI mounting ConnectRPC and GraphQL plugins against local test servers
- `apps/linear-cli` — real-world CLI for the [Linear](https://linear.app) GraphQL API
- `packages/connectrpc-example` — local Connect-compatible server plus generated protobuf descriptor
- `packages/graphql-example` — local GraphQL server plus introspection artifact
- `vendor/incur-*.tgz` — vendored tarball of the incur fork

## Prerequisites

- [Bun](https://bun.sh) v1.3+
- (Optional) [Nix](https://nixos.org) for a reproducible dev shell

## Install

```sh
bun install
```

Or with Nix:

```sh
nix develop -c bun install
```

## Acme CLI (local examples)

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

## Linear CLI

Requires a [Linear API key](https://linear.app/settings/api).

```sh
LINEAR_API_KEY=lin_api_... bun run linear -- linear viewer --format json
```

To refresh the trimmed introspection schema from Linear's API:

```sh
LINEAR_API_KEY=lin_api_... bun run linear:schema
```

## Tests

```sh
bun run smoke        # smoke tests
bun run check        # typecheck + lint + format
```

## Build standalone binaries

```sh
bun run build
```

Produces `apps/acme-cli/acme` and `apps/linear-cli/linear`.

## Refresh the vendored tarball

Packs a sibling `../incur` checkout (or a custom path), writes a commit-stamped tarball under `vendor/`, and updates dependency references.

```sh
bun run vendor:incur            # default: ../incur
bun run vendor:incur /path/to   # custom source
```

## License

MIT
