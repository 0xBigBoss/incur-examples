import { createCli } from './cli.js'

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

createCli({
  connectRpcBaseUrl: env('ACME_CONNECTRPC_URL'),
  graphqlUrl: env('ACME_GRAPHQL_URL'),
}).serve()
