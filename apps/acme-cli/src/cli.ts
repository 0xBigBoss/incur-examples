import { UserService } from '@incur-examples/connectrpc-example/user_pb'
import { introspection } from '@incur-examples/graphql-example'
import { Cli, Plugins } from 'incur'

export type CreateCliOptions = {
  connectRpcBaseUrl: string
  graphqlUrl: string
}

export function createCli(options: CreateCliOptions) {
  const { connectRpcBaseUrl, graphqlUrl } = options

  return Cli.create('acme', {
    description: 'Local QA CLI for the vendored incur fork',
    version: '0.0.0',
  })
    .plugin(
      'users',
      Plugins.connectRpc({
        service: UserService,
        transport: {
          baseUrl: connectRpcBaseUrl,
          protocol: 'connect',
        },
        positionals: {
          deleteUser: ['userId'],
          getUser: ['userId'],
        },
        mutations: {
          deleteUser: {
            destructive: true,
            mutates: true,
          },
        },
      }),
    )
    .plugin(
      'graphql',
      Plugins.graphql({
        schema: introspection,
        transport: {
          url: graphqlUrl,
        },
      }),
    )
}
