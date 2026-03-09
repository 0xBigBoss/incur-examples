import { Cli, Plugins } from 'incur'

import introspection from './introspection.json'

export function createCli(apiKey: string) {
  return Cli.create('linear', {
    description: 'Linear CLI powered by incur',
    version: '0.0.0',
  }).plugin(
    'linear',
    Plugins.graphql({
      include: [
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
      ],
      schema: introspection as never,
      selection: { depth: 2 },
      transport: {
        headers: () => ({ Authorization: apiKey }),
        url: 'https://api.linear.app/graphql',
      },
    }),
  )
}
