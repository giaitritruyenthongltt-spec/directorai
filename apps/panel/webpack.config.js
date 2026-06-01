const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// P4.11 — only require @sentry/webpack-plugin when SENTRY_AUTH_TOKEN is
// present so dev builds and CI without the secret don't fail.
function maybeSentryPlugin() {
  if (!process.env.SENTRY_AUTH_TOKEN || !process.env.SENTRY_ORG || !process.env.SENTRY_PROJECT) {
    return null;
  }
  try {
    const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');
    return sentryWebpackPlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.SENTRY_RELEASE || undefined },
      sourcemaps: {
        assets: path.resolve(__dirname, 'dist'),
      },
    });
  } catch (err) {
    console.warn('[panel] Sentry plugin disabled:', err.message);
    return null;
  }
}

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
    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'icons', to: 'icons', noErrorOnMissing: true },
      ],
    }),
    ...(argv.mode === 'production' ? [maybeSentryPlugin()].filter(Boolean) : []),
  ],
  externals: {
    // UXP runtime injects these via require() — do NOT bundle.
    // externalsType must be 'commonjs2' so webpack emits a real runtime
    // require('premierepro') call instead of a global-var lookup (which is
    // the default for target:'web' and silently returns undefined in UXP).
    premierepro: 'commonjs2 premierepro',
    uxp: 'commonjs2 uxp',
  },
  // P4.11 — production builds emit a sibling .map file Sentry can pick up.
  // Dev mode keeps inline source maps for fast UXP DevTool inspection.
  devtool: argv.mode === 'development' ? 'inline-source-map' : 'hidden-source-map',
  target: ['web', 'es2020'],
  optimization: {
    minimize: false, // UXP doesn't always handle minified code well
  },
});
