/**
 * EmotePicker —— 全站表情面板（评论/动态/私信输入框共用）。
 *
 * 契约（其他代理依赖此 API，勿变更签名）：
 *   EmotePicker({
 *     visible: boolean,               // 是否展示面板
 *     onSelect: (code: string) => void,  // 点击表情回调 `[xxx]` 文本码，调用方拼进输入框
 *     onClose: () => void,            // 请求关闭面板
 *   })
 *
 * 同时提供「默认导出」与「具名导出」两种形式：
 *  - 任务契约要求默认导出；
 *  - whisper 页已有并行代理按具名导入接线（`import { EmotePicker } from ...`）。
 * 两者指向同一组件，均可正常工作。
 *
 * 实现：输入栏上方的内联面板（对齐 LiveChatInput 弹幕表情面板，高度 220），
 * 顶部表情包 tab + FlashList 网格。数据来自 `getEmotePackages()`
 * （`/x/emote/user/panel/web`，失败回退内置兜底表情包），模块级缓存共享。
 * 文字表情包（type=4）单元格直接渲染文字，点击同样回传 `[关键字]`。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';
import { feedBackSelection } from '@/utils/feedback';
import { getEmotePackages, type EmoteItem, type EmotePackage } from '@/api/emote';

const PANEL_HEIGHT = 220;

function EmotePicker({
  visible,
  onSelect,
  onClose,
}: {
  visible: boolean;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  const { width: windowWidth } = useWindowDimensions();

  const [packages, setPackages] = useState<EmotePackage[] | null>(null);
  const [pkgIdx, setPkgIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    getEmotePackages().then((pkgs) => {
      if (!alive) return;
      setPackages(pkgs);
      setPkgIdx((prev) => (prev >= pkgs.length ? 0 : prev));
    });
    return () => {
      alive = false;
    };
  }, []);

  // 列数按屏宽计算（对齐 LiveChatInput：每列 ~48pt）
  const cols = useMemo(() => Math.max(4, Math.floor((windowWidth - 24) / 48)), [windowWidth]);

  const handlePick = useCallback(
    (emote: EmoteItem) => {
      const code = emote.text || '';
      if (!code) return;
      feedBackSelection();
      onSelect(code);
    },
    [onSelect],
  );

  if (!visible) return null;

  const activePkg: EmotePackage | undefined = packages?.[pkgIdx];

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderTopColor: colors.separator }]}>
      {/* 表情包 tab 栏 + 收起 */}
      <View style={styles.tabRow}>
        {packages == null ? (
          <View style={styles.tabLoading}>
            <ActivityIndicator size="small" color={colors.textTertiary} />
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabContent}>
              {packages.map((pkg, i) => {
                const active = i === pkgIdx;
                const isTextPkg = pkg.type === 4;
                return (
                  <Press
                    key={String(pkg.package_id ?? i)}
                    haptic
                    scaleTo={0.94}
                    onPress={() => setPkgIdx(i)}
                    style={[
                      styles.tabChip,
                      continuous,
                      active ? { backgroundColor: ACCENT } : { backgroundColor: colors.fill2 },
                    ]}>
                    {pkg.url && !isTextPkg ? (
                      <ExpoImage
                        source={{ uri: biliCover(pkg.url, 48, 48) }}
                        recyclingKey={pkg.url}
                        style={styles.tabIcon}
                        contentFit="contain"
                      />
                    ) : (
                      <Text
                        style={[
                          T.caption2,
                          { color: active ? '#FFFFFF' : colors.textSecondary, fontWeight: active ? '600' : '400' },
                        ]}
                        numberOfLines={1}>
                        {pkg.name || `表情包 ${i + 1}`}
                      </Text>
                    )}
                  </Press>
                );
              })}
            </ScrollView>
            <Press haptic scaleTo={0.9} onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
            </Press>
          </>
        )}
      </View>

      {/* 表情网格 */}
      {packages != null && activePkg != null ? (
        <FlashList
          data={activePkg.emotes}
          numColumns={cols}
          keyExtractor={(em, i) => `${em.text}-${i}`}
          style={styles.grid}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          estimatedItemSize={40}
          windowSize={9}
          initialNumToRender={24}
          maxToRenderPerBatch={24}
          renderItem={({ item }) => (
            <Press
              haptic
              scaleTo={0.9}
              onPress={() => handlePick(item)}
              style={[styles.cell, continuous]}>
              {item.url ? (
                <ExpoImage
                  source={{ uri: biliCover(item.url, 96, 96) }}
                  recyclingKey={item.url}
                  style={styles.cellImage}
                  contentFit="contain"
                />
              ) : (
                <Text style={[T.caption1, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.text.replace(/[\[\]]/g, '')}
                </Text>
              )}
            </Press>
          )}
        />
      ) : null}
    </View>
  );
}

export default EmotePicker;
export { EmotePicker };

const styles = StyleSheet.create({
  panel: {
    height: PANEL_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  tabRow: { flexDirection: 'row', alignItems: 'center' },
  tabLoading: { paddingHorizontal: 14, paddingVertical: 6 },
  tabContent: { paddingHorizontal: 12, gap: 8, paddingBottom: 8, alignItems: 'center' },
  tabChip: {
    height: 30,
    minWidth: 40,
    paddingHorizontal: 10,
    borderRadius: RADII.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: { width: 22, height: 22 },
  closeBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  grid: { flex: 1 },
  gridContent: { paddingHorizontal: 12, paddingBottom: 10 },
  cell: {
    flex: 1,
    height: 40,
    margin: 2,
    borderRadius: RADII.thumb,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cellImage: { width: 34, height: 34 },
});
