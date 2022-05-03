module.exports = {
  presets: ['@babel/preset-typescript', '@babel/preset-react'],

  overrides: [
    {
      include: ['./packages/evmcrispr', './packages/evmcrispr-terminal'],
      presets: [['@babel/preset-env', { targets: 'defaults, not ie 11' }]],
    },
  ],
};
