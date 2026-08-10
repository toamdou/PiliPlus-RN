/**
 * Expo config plugin: 启用 react-native-screens 的 gamma 特性（ScrollViewMarker）。
 *
 * ScrollViewMarker 是 iOS 26+ 下 NativeTabs minimizeBehavior（滚动自动收缩为 pill）
 * 和 scrollEdgeEffects 的必要组件——它通过 UIViewController.setContentScrollView:forEdge:
 * 将内容 ScrollView 注册给 UITabBarController，使系统能追踪滚动事件。
 *
 * 该 plugin 在 Podfile 顶部注入 ENV['RNS_GAMMA_ENABLED'] = '1'，
 * 使 react-native-screens podspec 编译时定义 RNS_GAMMA_ENABLED 宏。
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ENV_LINE = "ENV['RNS_GAMMA_ENABLED'] = '1'";

function withRNSGamma(config) {
  return withDangerousMod(config, [
    'ios',
    (mod) => {
      const podfilePath = path.join(mod.modRequest.platformProjectRoot, 'Podfile');
      let content = fs.readFileSync(podfilePath, 'utf8');

      if (content.includes('RNS_GAMMA_ENABLED')) {
        return mod; // 已注入，跳过
      }

      // 在 Podfile 最顶部（require 之前）注入环境变量
      content = ENV_LINE + '\n' + content;
      fs.writeFileSync(podfilePath, content, 'utf8');

      return mod;
    },
  ]);
}

module.exports = withRNSGamma;
