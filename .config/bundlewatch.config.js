module.exports = {
  files: [
    {
      path: 'packages/evmcrispr/dist/*.cjs.prod.js',
    },
    {
      path: 'packages/evmcrispr/dist/*.esm.js',
    },
  ],
  ci: {
    trackBranches: ['main'],
  },
};
