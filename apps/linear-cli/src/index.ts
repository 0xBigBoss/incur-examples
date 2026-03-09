import { createCli } from './cli.js'

const apiKey = process.env.LINEAR_API_KEY
if (!apiKey) {
  process.stderr.write('LINEAR_API_KEY is required\n')
  process.exit(1)
}

createCli(apiKey).serve()
