import { describe, expect, test } from 'bun:test'
import { startTestServer as startConnectRpcTestServer } from '@incur-examples/connectrpc-example'
import { startTestServer as startGraphqlTestServer } from '@incur-examples/graphql-example'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

type RunCliResult = {
  exitCode: number
  stderr: string
  stdout: string
}

const root = resolve(import.meta.dir, '..', '..', '..')
const cliEntry = join(root, 'apps', 'acme-cli', 'src', 'index.ts')
const opsFile = join(root, 'apps', 'acme-cli', 'ops.graphql')

function json(text: string): unknown {
  return JSON.parse(text)
}

async function runCli(args: string[], env: Record<string, string>): Promise<RunCliResult> {
  const proc = Bun.spawn([process.execPath, cliEntry, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    stderr: 'pipe',
    stdout: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  return { exitCode, stderr, stdout }
}

describe('acme CLI smoke', () => {
  test('connectrpc plugin supports get-user, list-users json, jsonl streams, llms, and schema', async () => {
    const connectServer = await startConnectRpcTestServer('connect')
    const graphqlServer = await startGraphqlTestServer()
    const env = {
      ACME_CONNECTRPC_URL: connectServer.baseUrl,
      ACME_GRAPHQL_URL: graphqlServer.baseUrl,
    }

    try {
      const getUser = await runCli(['users', 'get-user', 'u-1', '--format', 'json'], env)
      expect(getUser.exitCode).toBe(0)
      expect(json(getUser.stdout)).toMatchObject({
        email: 'u-1@acme.dev',
        userId: 'u-1',
      })

      const listUsers = await runCli(
        [
          'users',
          'list-users',
          '--json',
          '{"status":"disabled","page":{"pageSize":2,"cursor":"cursor-1"}}',
          '--format',
          'json',
        ],
        env,
      )
      expect(listUsers.exitCode).toBe(0)
      expect(json(listUsers.stdout)).toMatchObject({
        nextCursor: 'cursor-1-next',
        users: [{ status: 'disabled' }, { status: 'disabled' }],
      })

      const watchUsers = await runCli(['users', 'watch-users', '--format', 'jsonl'], env)
      expect(watchUsers.exitCode).toBe(0)
      expect(
        watchUsers.stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line)),
      ).toMatchObject([
        { type: 'chunk', data: { eventType: 'updated' } },
        { type: 'chunk', data: { eventType: 'deleted' } },
        { type: 'done', ok: true },
      ])

      const llms = await runCli(['users', '--llms', '--format', 'json'], env)
      expect(llms.exitCode).toBe(0)
      expect(
        (json(llms.stdout) as { commands: Array<{ name: string }> }).commands.map(
          (command) => command.name,
        ),
      ).toEqual(['users delete-user', 'users get-user', 'users list-users', 'users watch-users'])

      const schema = await runCli(['schema', 'users', 'list-users', '--format', 'json'], env)
      expect(schema.exitCode).toBe(0)
      expect(json(schema.stdout)).toMatchObject({
        name: 'users list-users',
        schema: {
          input: {
            properties: {
              page: { type: 'object' },
              status: { enum: ['active', 'disabled'] },
            },
          },
        },
      })
    } finally {
      await connectServer.close()
      await graphqlServer.close()
    }
  })

  test('connectrpc plugin surfaces stable structured errors', async () => {
    const connectServer = await startConnectRpcTestServer('connect')
    const graphqlServer = await startGraphqlTestServer()
    const env = {
      ACME_CONNECTRPC_URL: connectServer.baseUrl,
      ACME_GRAPHQL_URL: graphqlServer.baseUrl,
    }

    try {
      const result = await runCli(['users', 'get-user', 'bad', '--format', 'json'], env)
      expect(result.exitCode).toBe(1)
      expect(json(result.stdout)).toMatchObject({
        code: 'RPC_INVALID_ARGUMENT',
        message: 'user id is invalid',
        retryable: false,
      })
    } finally {
      await connectServer.close()
      await graphqlServer.close()
    }
  })

  test('graphql plugin supports generated commands, raw documents, llms, and schema', async () => {
    const connectServer = await startConnectRpcTestServer('connect')
    const graphqlServer = await startGraphqlTestServer()
    const env = {
      ACME_CONNECTRPC_URL: connectServer.baseUrl,
      ACME_GRAPHQL_URL: graphqlServer.baseUrl,
    }

    try {
      const getUser = await runCli(
        ['graphql', 'get-user', '--userId', 'u-1', '--format', 'json'],
        env,
      )
      expect(getUser.exitCode).toBe(0)
      expect(json(getUser.stdout)).toMatchObject({
        email: 'u-1@acme.dev',
        id: 'u-1',
        status: 'ACTIVE',
      })

      const updateUser = await runCli(
        [
          'graphql',
          'update-user',
          '--json',
          '{"input":{"userId":"u-1","email":"u-1+updated@acme.dev"}}',
          '--format',
          'json',
        ],
        env,
      )
      expect(updateUser.exitCode).toBe(0)
      expect(json(updateUser.stdout)).toMatchObject({
        email: 'u-1+updated@acme.dev',
        id: 'u-1',
      })

      const raw = await runCli(
        [
          'graphql',
          'raw',
          '--file',
          opsFile,
          '--operation-name',
          'ListUsers',
          '--variables',
          '{"limit":1}',
          '--format',
          'json',
        ],
        env,
      )
      expect(raw.exitCode).toBe(0)
      expect(json(raw.stdout)).toEqual({
        listUsers: {
          nextCursor: 'cursor-1',
        },
      })

      const llms = await runCli(['graphql', '--llms', '--format', 'json'], env)
      expect(llms.exitCode).toBe(0)
      expect(
        (json(llms.stdout) as { commands: Array<{ name: string }> }).commands.map(
          (command) => command.name,
        ),
      ).toEqual([
        'graphql delete-user',
        'graphql get-user',
        'graphql list-users',
        'graphql raw',
        'graphql update-user',
      ])

      const schema = await runCli(['schema', 'graphql', 'get-user', '--format', 'json'], env)
      expect(schema.exitCode).toBe(0)
      expect(json(schema.stdout)).toMatchObject({
        name: 'graphql get-user',
        schema: {
          input: {
            properties: {
              userId: { type: 'string' },
            },
            required: ['userId'],
          },
        },
      })
    } finally {
      await connectServer.close()
      await graphqlServer.close()
    }
  })

  test('graphql plugin surfaces stable structured errors', async () => {
    const connectServer = await startConnectRpcTestServer('connect')
    const graphqlServer = await startGraphqlTestServer()
    const env = {
      ACME_CONNECTRPC_URL: connectServer.baseUrl,
      ACME_GRAPHQL_URL: graphqlServer.baseUrl,
    }

    try {
      const result = await runCli(
        [
          'graphql',
          'raw',
          '--query',
          'query GetUser($userId: ID!) { getUser(userId: $userId) { id } }',
          '--operation-name',
          'GetUser',
          '--variables',
          '{"userId":"missing"}',
          '--format',
          'json',
        ],
        env,
      )
      expect(result.exitCode).toBe(1)
      expect(json(result.stdout)).toMatchObject({
        code: 'GRAPHQL_OPERATION_FAILED',
        message: 'user was not found',
      })
    } finally {
      await connectServer.close()
      await graphqlServer.close()
    }
  })

  test('graphql raw supports file-backed documents outside the repo tree', async () => {
    const connectServer = await startConnectRpcTestServer('connect')
    const graphqlServer = await startGraphqlTestServer()
    const env = {
      ACME_CONNECTRPC_URL: connectServer.baseUrl,
      ACME_GRAPHQL_URL: graphqlServer.baseUrl,
    }
    const dir = await mkdtemp(join(tmpdir(), 'incur-examples-graphql-'))
    const file = join(dir, 'ops.graphql')

    try {
      await writeFile(file, await readFile(opsFile, 'utf8'), 'utf8')

      const result = await runCli(
        [
          'graphql',
          'raw',
          '--file',
          file,
          '--operation-name',
          'GetUser',
          '--variables',
          '{"userId":"u-1"}',
          '--format',
          'json',
        ],
        env,
      )

      expect(result.exitCode).toBe(0)
      expect(json(result.stdout)).toEqual({
        getUser: {
          email: 'u-1@acme.dev',
          id: 'u-1',
          status: 'ACTIVE',
        },
      })
    } finally {
      await rm(dir, { force: true, recursive: true })
      await connectServer.close()
      await graphqlServer.close()
    }
  })
})
