/**
 * Trims the Linear introspection schema to only types reachable from a curated
 * set of query/mutation fields, and breaks recursive type cycles by removing
 * back-reference fields that cause infinite recursion in JSON schema generation.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type TypeRef = {
  kind: string
  name?: string | null
  ofType?: TypeRef | null
}

type FieldDef = {
  args?: Array<{ name: string; type: TypeRef; defaultValue?: string | null; description?: string }>
  deprecationReason?: string | null
  description?: string
  isDeprecated?: boolean
  name: string
  type: TypeRef
}

type IntrospectionType = {
  description?: string
  enumValues?: Array<{
    name: string
    description?: string
    isDeprecated?: boolean
    deprecationReason?: string | null
  }>
  fields?: FieldDef[]
  inputFields?: Array<{
    name: string
    type: TypeRef
    defaultValue?: string | null
    description?: string
  }>
  interfaces?: TypeRef[]
  kind: string
  name: string
  possibleTypes?: TypeRef[]
}

type Schema = {
  __schema: {
    directives: unknown[]
    mutationType: { name: string }
    queryType: { name: string }
    subscriptionType: { name: string } | null
    types: IntrospectionType[]
  }
}

const INCLUDE_FIELDS = [
  'viewer',
  'issue',
  'issues',
  'issueSearch',
  'issuePriorityValues',
  'project',
  'projects',
  'team',
  'teams',
  'user',
  'users',
  'workflowStates',
  'issueCreate',
  'issueUpdate',
  'issueArchive',
  'issueDelete',
  'commentCreate',
]

// Fields present in introspection but rejected by the API at query time.
const RESTRICTED_FIELDS: Record<string, Set<string>> = {
  User: new Set(['featureFlags']),
}

function extractTypeName(ref: TypeRef): string | null {
  if (ref.name) return ref.name
  if (ref.ofType) return extractTypeName(ref.ofType)
  return null
}

function isConnectionType(name: string): boolean {
  return name.endsWith('Connection')
}

function isPayloadType(name: string): boolean {
  return name.endsWith('Payload')
}

/**
 * Break recursive type cycles by stripping all non-leaf fields from entity types.
 * Only scalar, enum, and list-of-scalar/enum fields survive. Users can always
 * use `raw` for deeper nested queries.
 */
function breakCycles(types: IntrospectionType[], rootTypeNames: Set<string>): void {
  const typeMap = new Map(types.map((t) => [t.name, t]))

  function isLeafType(ref: TypeRef): boolean {
    const name = extractTypeName(ref)
    if (!name) return false
    const type = typeMap.get(name)
    if (!type) return true
    return type.kind === 'SCALAR' || type.kind === 'ENUM'
  }

  // Break cycles in INPUT_OBJECT types (Linear's filter types are mutually recursive).
  // Keep only leaf (scalar/enum) input fields.
  for (const type of types) {
    if (type.kind !== 'INPUT_OBJECT' || !type.inputFields) continue
    type.inputFields = type.inputFields.filter((field) => isLeafType(field.type))
  }

  for (const type of types) {
    // Skip non-object types, root types, introspection types, and payload types
    if (type.kind !== 'OBJECT') continue
    if (rootTypeNames.has(type.name)) continue
    if (type.name.startsWith('__')) continue
    if (isPayloadType(type.name)) continue
    if (!type.fields) continue

    // Connection types: only keep nodes, edges, pageInfo
    if (isConnectionType(type.name)) {
      type.fields = type.fields.filter((f) => ['nodes', 'edges', 'pageInfo'].includes(f.name))
      continue
    }

    // Entity types: only keep scalar and enum fields
    type.fields = type.fields.filter((field) => isLeafType(field.type))
  }
}

// --- Main ---

const inPath = resolve(import.meta.dir, '..', 'apps', 'linear-cli', 'src', 'introspection.json')
const outPath = inPath

const full: Schema = JSON.parse(await readFile(inPath, 'utf8'))
const typeMap = new Map(full.__schema.types.map((t) => [t.name, t]))

const queryType = typeMap.get(full.__schema.queryType.name)!
const mutationType = typeMap.get(full.__schema.mutationType.name)!

const includedFields = new Set(INCLUDE_FIELDS)
const rootReturnTypes = new Set<string>()

// Collect the direct return types of included fields
for (const type of [queryType, mutationType]) {
  if (!type.fields) continue
  for (const field of type.fields) {
    if (!includedFields.has(field.name)) continue
    const returnType = extractTypeName(field.type)
    if (returnType) rootReturnTypes.add(returnType)
  }
}

// Trim root type fields to only included fields
function trimRootFields(type: IntrospectionType) {
  if (type.fields) {
    type.fields = type.fields.filter((f) => includedFields.has(f.name))
  }
}

trimRootFields(queryType)
trimRootFields(mutationType)

// Strip fields that are in introspection but rejected by the API at query time
for (const type of full.__schema.types) {
  const restricted = RESTRICTED_FIELDS[type.name]
  if (restricted && type.fields) {
    type.fields = type.fields.filter((f) => !restricted.has(f.name))
  }
}

// Break cycles in the schema before collecting reachable types
const rootNames = new Set([full.__schema.queryType.name, full.__schema.mutationType.name])
breakCycles(full.__schema.types, rootNames)

// Now collect reachable types from trimmed+de-cycled schema
function collectReachable(rootNames: string[]): Set<string> {
  const visited = new Set<string>()

  function walk(name: string) {
    if (visited.has(name)) return
    visited.add(name)

    const type = typeMap.get(name)
    if (!type) return

    const refs: TypeRef[] = []

    if (type.fields) {
      for (const field of type.fields) {
        refs.push(field.type)
        if (field.args) {
          for (const arg of field.args) refs.push(arg.type)
        }
      }
    }
    if (type.inputFields) {
      for (const field of type.inputFields) refs.push(field.type)
    }
    if (type.interfaces) refs.push(...type.interfaces)
    if (type.possibleTypes) refs.push(...type.possibleTypes)

    for (const ref of refs) {
      const refName = extractTypeName(ref)
      if (refName) walk(refName)
    }
  }

  for (const name of rootNames) walk(name)
  return visited
}

// Start from root type fields' return types and argument types
const seedTypes: string[] = []
for (const type of [queryType, mutationType]) {
  if (!type.fields) continue
  for (const field of type.fields) {
    const returnType = extractTypeName(field.type)
    if (returnType) seedTypes.push(returnType)
    if (field.args) {
      for (const arg of field.args) {
        const argType = extractTypeName(arg.type)
        if (argType) seedTypes.push(argType)
      }
    }
  }
}

const reachable = collectReachable(seedTypes)

// Always keep built-in and root types
for (const type of full.__schema.types) {
  if (type.name.startsWith('__') || type.kind === 'SCALAR') {
    reachable.add(type.name)
  }
}
reachable.add(full.__schema.queryType.name)
reachable.add(full.__schema.mutationType.name)

// Build trimmed schema
const trimmed: Schema = {
  __schema: {
    ...full.__schema,
    types: full.__schema.types.filter((t) => reachable.has(t.name)),
  },
}

await writeFile(outPath, JSON.stringify(trimmed, null, 2), 'utf8')

const originalCount = full.__schema.types.length
const trimmedCount = trimmed.__schema.types.length
process.stdout.write(
  `Trimmed ${originalCount} → ${trimmedCount} types (${originalCount - trimmedCount} removed)\n`,
)
process.stdout.write(`${outPath}\n`)
