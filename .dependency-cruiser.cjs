module.exports = {
  forbidden: [
    {
      name: 'no-legacy-ee-imports',
      severity: 'error',
      comment: 'Imports from removed ee/ directories are not allowed.',
      from: { pathNot: '^node_modules' },
      to: {
        path: '(^|/)ee(/|$)',
        pathNot: '^node_modules|packages/ee/embed-sdk',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: 'node_modules|dist' },
    tsPreCompilationDeps: true,
  },
}
