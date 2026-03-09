import { graphql } from 'graphql'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { rootValue, schema } from './schema.js'

type StartTestServerOptions = {
  host?: string | undefined
  port?: number | undefined
}

export async function startTestServer(options: StartTestServerOptions = {}) {
  const { host = '127.0.0.1', port = 0 } = options
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/graphql') {
      res.statusCode = 404
      res.end('not found')
      return
    }

    let body = ''
    for await (const chunk of req) body += chunk.toString()

    const payload = JSON.parse(body || '{}') as {
      operationName?: string | undefined
      query?: string | undefined
      variables?: Record<string, unknown> | undefined
    }

    const result = await graphql({
      operationName: payload.operationName,
      rootValue,
      schema,
      source: payload.query ?? '',
      variableValues: payload.variables,
    })

    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(result))
  })

  await new Promise<void>((resolve) => server.listen(port, host, resolve))
  const address = server.address() as AddressInfo

  return {
    baseUrl: `http://${host}:${address.port}/graphql`,
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
