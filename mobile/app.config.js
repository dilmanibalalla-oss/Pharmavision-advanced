module.exports = ({ config }) => {
  const openInExpoGo = process.env.EXPO_GO === '1' || process.argv.includes('--go');
  if (openInExpoGo) {
    config.runtimeVersion = { policy: 'sdkVersion' };
  }
  return config;
};
