import { ConnectError, type ConnectRouter } from '@connectrpc/connect'
import { Code } from '@connectrpc/connect'
import { connectNodeAdapter } from '@connectrpc/connect-node'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttp2Server } from 'node:http2'
import type { AddressInfo } from 'node:net'

import { EventType, UserService, UserStatus, type GetUserResponse } from './user_pb.js'

type StartTestServerOptions = {
  host?: string | undefined
  port?: number | undefined
}

function user(userId: string, status: UserStatus = UserStatus.USER_STATUS_ACTIVE): GetUserResponse {
  return {
    $typeName: 'acme.user.v1.GetUserResponse',
    email: `${userId}@acme.dev`,
    status,
    tags: ['alpha', 'beta'],
    userId,
  }
}

function routes(router: ConnectRouter) {
  router.service(UserService, {
    deleteUser(request) {
      if (request.userId === 'missing') throw new ConnectError('user was not found', Code.NotFound)

      return {
        deleted: true,
        userId: request.userId,
      }
    },
    getUser(request) {
      if (request.userId === 'missing') throw new ConnectError('user was not found', Code.NotFound)
      if (request.userId === 'bad')
        throw new ConnectError('user id is invalid', Code.InvalidArgument)
      if (request.userId === 'flaky')
        throw new ConnectError('backend unavailable', Code.Unavailable)

      return user(request.userId)
    },
    listUsers(request) {
      const status = request.status || UserStatus.USER_STATUS_ACTIVE
      return {
        nextCursor: request.page?.cursor ? `${request.page.cursor}-next` : 'cursor-2',
        users: [user('u-1', status), user('u-2', status)],
      }
    },
    async *watchUsers(request) {
      const status = request.status || UserStatus.USER_STATUS_ACTIVE

      yield {
        eventType:
          request.status === UserStatus.USER_STATUS_DISABLED
            ? EventType.EVENT_TYPE_DELETED
            : EventType.EVENT_TYPE_UPDATED,
        user: user('u-1', status),
      }

      yield {
        eventType: EventType.EVENT_TYPE_DELETED,
        user: user('u-2', status),
      }
    },
  })
}

export async function startTestServer(
  protocol: 'connect' | 'grpc',
  options: StartTestServerOptions = {},
) {
  const { host = '127.0.0.1', port = 0 } = options
  const handler = connectNodeAdapter({ routes })
  const server =
    protocol === 'grpc' ? createHttp2Server(handler as never) : createHttpServer(handler as never)

  await new Promise<void>((resolve) => server.listen(port, host, resolve))
  const address = server.address() as AddressInfo

  return {
    baseUrl: `http://${host}:${address.port}`,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        }),
      )
    },
  }
}
