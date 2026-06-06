const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const path = require('path');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  if (!config.devServer) {
    config.devServer = {};
  }

  config.output.publicPath = '/';

  config.devServer.host = '0.0.0.0';
  config.devServer.allowedHosts = 'all';
  
  if (config.devServer.client) {
    config.devServer.client.overlay = {
      errors: true,
      warnings: false,
    };
  }

  if (!config.resolve) config.resolve = {};
  if (!config.resolve.alias) config.resolve.alias = {};
  const stubIAP = path.resolve(__dirname, 'stubs/react-native-iap.js');
  const stubNitro = path.resolve(__dirname, 'stubs/react-native-nitro-modules.js');
  config.resolve.alias['react-native-iap'] = stubIAP;
  config.resolve.alias['react-native-nitro-modules'] = stubNitro;

  const webpack = require('webpack');
  config.plugins = config.plugins || [];
  config.plugins.push(
    new webpack.NormalModuleReplacementPlugin(
      /react-native-iap/,
      stubIAP
    ),
    new webpack.NormalModuleReplacementPlugin(
      /react-native-nitro-modules/,
      stubNitro
    )
  );

  return config;
};
