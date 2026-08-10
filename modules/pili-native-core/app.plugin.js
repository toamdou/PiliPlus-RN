const { withInfoPlist } = require('expo/config-plugins');

const BACKGROUND_TASK_IDENTIFIER = 'com.piliplus.dynamic-check';

module.exports = function withPiliNativeCore(config) {
  return withInfoPlist(config, (config) => {
    const plist = config.modResults;
    plist.UIBackgroundModes = Array.from(
      new Set([...(plist.UIBackgroundModes ?? []), 'fetch'])
    );
    plist.BGTaskSchedulerPermittedIdentifiers = Array.from(
      new Set([
        ...(plist.BGTaskSchedulerPermittedIdentifiers ?? []),
        BACKGROUND_TASK_IDENTIFIER,
      ])
    );
    return config;
  });
};
