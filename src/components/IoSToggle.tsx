/**
 * IoSToggle —— iOS 化开关控件（#37，来源 05-B17/C2）。
 *
 * 统一替换 6 处 RN 裸 Switch（bar_set / color_select / whisper_link_setting /
 * whisper_settings / live_dm_block / PlayerSettingsSheet×3）。
 *
 * 实现选择：采用「tint 化 RN Switch」而非 SwiftUI Toggle，理由：
 * 1. RN 的 Switch 在 iOS 上本就渲染为原生 UISwitch，问题只在默认「绿开关」与
 *    全站主题色冲突——用 trackColor/thumbColor 染色即可修正，视觉即 iOS 原生；
 * 2. 8 处调用点全部嵌在 RN flex 行 / FlashList 行 / NativeBottomSheet 内，
 *    SwiftUI Toggle 需要额外的 Host 包裹且内嵌尺寸行为不透明，容易引起行高与
 *    对齐回归；tint 化 Switch 可零改动保持既有布局与开关绑定语义；
 * 3. props 与 RN Switch 完全兼容（value / onValueChange / disabled），替换零风险。
 *
 * 主题色响应：内部通过 useAccent() 订阅 useSettingsStore，开启色跟随当前主题色，
 * 在设置页换色后即时生效（与 #38 useAccent 重构联动）。
 */
import { Switch, type SwitchProps } from 'react-native';
import { useAccent } from '@/components/SwiftUIHost';

export type IoSToggleProps = SwitchProps;

export function IoSToggle(props: IoSToggleProps) {
  const accent = useAccent();
  const { trackColor, thumbColor = '#FFFFFF', ios_backgroundColor, ...rest } = props;
  return (
    <Switch
      {...rest}
      // 开启色固定走动态主题色，保证与全站 accent 一致；
      // 外部传入的 trackColor 只允许补充关闭态等细节，true 态始终被 accent 覆盖。
      trackColor={{ ...trackColor, true: accent }}
      thumbColor={thumbColor}
      ios_backgroundColor={ios_backgroundColor}
    />
  );
}
