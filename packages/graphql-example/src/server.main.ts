import { startTestServer } from './server.js'

const port = Number.parseInt(process.env.PORT ?? '4001', 10)
const host = process.env.HOST ?? '127.0.0.1'

const server = await startTestServer({ host, port })
process.stdout.write(`${server.baseUrl}\n`)

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void server.close().finally(() => process.exit(0))
  })
