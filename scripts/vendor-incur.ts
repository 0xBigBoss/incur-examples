#!/usr/bin/env bun

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

type PackageJson = {
  dependencies?: Record<string, string> | undefined
  name: string
  version: string
}

const execFileAsync = promisify(execFile)

async function main() {
  const root = resolve(import.meta.dir, '..')
  const source = resolve(process.argv[2] ?? join(root, '..', 'incur'))
  const vendorDir = join(root, 'vendor')
  const tmpDir = await mkdtemp(join(tmpdir(), 'incur-pack-'))

  try {
    const packageJson = JSON.parse(
      await readFile(join(source, 'package.json'), 'utf8'),
    ) as PackageJson
    const commit = (await execFileAsync('git', ['-C', source, 'rev-parse', 'HEAD'])).stdout.trim()
    const shortCommit = commit.slice(0, 7)
    const targetName = `${packageJson.name}-${packageJson.version}-${shortCommit}.tgz`

    await execFileAsync('pnpm', ['pack', '--pack-destination', tmpDir], {
      cwd: source,
    })

    const archive = join(tmpDir, `${packageJson.name}-${packageJson.version}.tgz`)
    const target = join(vendorDir, targetName)
    for (const entry of await readdir(vendorDir))
      if (entry.startsWith(`${packageJson.name}-`) && entry.endsWith('.tgz'))
        await rm(join(vendorDir, entry), { force: true })

    await rename(archive, target)

    const appPackagePath = join(root, 'apps', 'acme-cli', 'package.json')
    const appPackageJson = JSON.parse(await readFile(appPackagePath, 'utf8')) as PackageJson

    await writeFile(
      appPackagePath,
      JSON.stringify(
        {
          ...appPackageJson,
          dependencies: {
            ...appPackageJson.dependencies,
            incur: `file:../../vendor/${targetName}`,
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )

    await writeFile(
      join(vendorDir, 'incur.json'),
      JSON.stringify(
        {
          commit,
          name: packageJson.name,
          packagedAt: new Date().toISOString(),
          source,
          tarball: `vendor/${targetName}`,
          version: packageJson.version,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )

    process.stdout.write(`${target}\n`)
  } finally {
    await rm(tmpDir, { force: true, recursive: true })
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
