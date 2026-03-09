/**
 * Fetches the Linear GraphQL introspection schema and writes it to
 * apps/linear-cli/src/introspection.json.
 *
 * Requires LINEAR_API_KEY in the environment.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

// Standard GraphQL introspection query — inlined to avoid depending on `graphql` at root.
const introspectionQuery = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        ...FullType
      }
      directives {
        name
        description
        locations
        args { ...InputValue }
      }
    }
  }
  fragment FullType on __Type {
    kind name description
    fields(includeDeprecated: true) {
      name description
      args { ...InputValue }
      type { ...TypeRef }
      isDeprecated deprecationReason
    }
    inputFields { ...InputValue }
    interfaces { ...TypeRef }
    enumValues(includeDeprecated: true) {
      name description isDeprecated deprecationReason
    }
    possibleTypes { ...TypeRef }
  }
  fragment InputValue on __InputValue {
    name description
    type { ...TypeRef }
    defaultValue
  }
  fragment TypeRef on __Type {
    kind name
    ofType {
      kind name
      ofType {
        kind name
        ofType {
          kind name
          ofType {
            kind name
            ofType {
              kind name
              ofType {
                kind name
              }
            }
          }
        }
      }
    }
  }
`

const apiKey = process.env.LINEAR_API_KEY
if (!apiKey) {
  throw new Error('LINEAR_API_KEY is required — set it in the environment')
}

const outPath = resolve(import.meta.dir, '..', 'apps', 'linear-cli', 'src', 'introspection.json')

const response = await fetch('https://api.linear.app/graphql', {
  body: JSON.stringify({ query: introspectionQuery }),
  headers: {
    Authorization: apiKey,
    'Content-Type': 'application/json',
  },
  method: 'POST',
})

if (!response.ok) {
  throw new Error(`Linear API returned ${response.status}: ${await response.text()}`)
}

const result = (await response.json()) as { data?: unknown; errors?: Array<{ message: string }> }

if (result.errors?.length) {
  throw new Error(`Linear introspection errors: ${result.errors.map((e) => e.message).join(', ')}`)
}

if (!result.data) {
  throw new Error('Linear introspection returned no data')
}

await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, JSON.stringify(result.data, null, 2), 'utf8')

process.stdout.write(`${outPath}\n`)
