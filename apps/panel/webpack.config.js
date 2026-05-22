const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => ({
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    },
    fallback: {},
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: {
          loader: 'ts-loader',
          options: {
            // Allow workspace monorepo packages (pnpm symlinks)
            allowTsInNodeModules: true,
          },
        },
        // Don't exclude @directorai/* packages — they're TypeScript sources
        exclude: /node_modules\/(?!@directorai)/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html',
    }),
  ],
  externals: {
    // UXP runtime injects these — do NOT bundle
    premierepro: 'premierepro',
    uxp: 'uxp',
  },
  devtool: argv.mode === 'development' ? 'inline-source-map' : false,
  target: ['web', 'es2020'],
  optimization: {
    minimize: false, // UXP doesn't always handle minified code well
  },
});
