module.exports = {
  files: [
    {
      path: 'core/evmcrispr/dist/*.js',
      path: 'modules/**/dist/*.js',
    },
    {
      path: 'core/evmcrispr/dist/*.mjs',
      path: 'modules/**/dist/*.mjs',
    },
  ],
  ci: {
    trackBranches: ['next', 'master'],
  },
};
