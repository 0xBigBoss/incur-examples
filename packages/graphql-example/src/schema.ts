import { buildSchema, introspectionFromSchema } from 'graphql'

const sdl = /* GraphQL */ `
  enum UserStatus {
    ACTIVE
    DISABLED
  }

  type User {
    id: ID!
    email: String!
    status: UserStatus!
    manager: User
  }

  type UserConnection {
    items: [User!]!
    nextCursor: String
  }

  input UpdateUserInput {
    userId: ID!
    email: String
    status: UserStatus
  }

  type DeleteUserPayload {
    deleted: Boolean!
    userId: ID!
  }

  type Query {
    getUser(userId: ID!): User!
    listUsers(status: UserStatus, limit: Int): UserConnection!
  }

  type Mutation {
    deleteUser(userId: ID!, reason: String): DeleteUserPayload!
    updateUser(input: UpdateUserInput!): User!
  }
`

function makeUser(
  userId: string,
  status = 'ACTIVE',
  email = `${userId}@acme.dev`,
  depth = 0,
): Record<string, unknown> {
  return {
    email,
    id: userId,
    manager:
      depth >= 2
        ? null
        : makeUser(
            `${userId}-mgr-${depth + 1}`,
            status,
            `${userId}-mgr-${depth + 1}@acme.dev`,
            depth + 1,
          ),
    status,
  }
}

export const schema = buildSchema(sdl)
export const introspection = introspectionFromSchema(schema)

export const rootValue = {
  deleteUser({ userId }: { reason?: string | undefined; userId: string }) {
    if (userId === 'missing') throw new Error('user was not found')

    return {
      deleted: true,
      userId,
    }
  },
  getUser({ userId }: { userId: string }) {
    if (userId === 'missing') throw new Error('user was not found')
    return makeUser(userId)
  },
  listUsers({ limit, status }: { limit?: number | undefined; status?: string | undefined }) {
    return {
      items: ['u-1', 'u-2', 'u-3']
        .slice(0, limit ?? 2)
        .map((userId) => makeUser(userId, status ?? 'ACTIVE')),
      nextCursor: `cursor-${limit ?? 2}`,
    }
  },
  updateUser({
    input,
  }: {
    input: { email?: string | undefined; status?: string | undefined; userId: string }
  }) {
    return makeUser(
      input.userId,
      input.status ?? 'ACTIVE',
      input.email ?? `${input.userId}@acme.dev`,
    )
  },
}
