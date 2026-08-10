import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Host, ProgressView } from '@expo/ui/swift-ui';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { liveApi } from '@/api/live';
import { showToast } from '@/utils/toast';
import { biliCover } from '@/utils/image-url';
import { RADII, continuous } from '@/theme/tokens';
import { NativeBottomSheet } from '@/components/NativeBottomSheet';
import type { QualityItem } from './live-protocol';

export interface RoomArea {
  areaId: number; parentId: number; areaName: string; parentName: string;
}

interface AreaItem {
  id: number; name: string; pic: string; parent_id: number; parent_name: string;
}

export function RoomMenuSheet({
  visible,
  onClose,
  roomArea,
  onDmBlock,
  qualityList,
  currentQn,
  onQualityChange,
}: {
  visible: boolean;
  onClose: () => void;
  roomArea: RoomArea | null;
  onDmBlock: () => void;
  qualityList: QualityItem[];
  currentQn: number;
  onQualityChange: (qn: number) => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [level, setLevel] = useState<'menu' | 'areas' | 'quality'>('menu');
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(false);

  useEffect(() => {
    let active = true;
    if (!visible) {
      const timer = setTimeout(() => {
        if (!active) return;
        setLevel('menu');
        setAreas([]);
      }, 0);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
    const parentId = roomArea?.parentId || 0;
    const timer = setTimeout(() => {
      if (!active) return;
      if (parentId > 0) {
        setLoadingAreas(true);
        liveApi.roomAreaList({ parent_id: parentId }).then((res: any) => {
          if (!active) return;
          if (res?.code !== 0) {
            /* 风控等业务错误以 HTTP 200 + code!=0 返回：抛错进 catch 提示，避免假"暂无分区" */
            throw new Error(res?.message || `分区加载失败（${res?.code}）`);
          }
          const list: AreaItem[] = (res?.data ?? []).map((a: any) => ({
            id: a.id ?? 0, name: a.name || '', pic: a.pic || '',
            parent_id: a.parent_id ?? parentId, parent_name: a.parent_name || roomArea?.parentName || '',
          }));
          setAreas(list);
        }).catch((e) => {
          if (!active) return;
          console.error('roomAreaList error:', e);
          showToast('分区加载失败');
        }).finally(() => {
          if (active) setLoadingAreas(false);
        });
      } else {
        setAreas([]);
      }
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [visible, roomArea]);

  const sheetContent = (
    <View style={[styles.sheetBody, { paddingBottom: insets.bottom + 12 }]}>
      {level === 'menu' ? (
        <>
          <View style={styles.sheetHeader}>
            <Text style={[T.subhead, styles.sheetTitle, { color: colors.text }]}>直播设置</Text>
            <Press haptic scaleTo={0.88} onPress={onClose} style={styles.sheetClose}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Press>
          </View>
          <Press haptic scaleTo={0.97} onPress={() => setLevel('areas')} style={styles.menuRow}>
            <View style={[styles.menuIcon, { backgroundColor: colors.fill2 }]}>
              <Ionicons name="grid-outline" size={18} color={ACCENT} />
            </View>
            <View style={styles.menuInfo}>
              <Text style={[T.subhead, { color: colors.text }]}>直播分区</Text>
              <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>
                {roomArea?.areaName ? `当前：${roomArea.areaName}` : '切换其他分区'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Press>
          <Press haptic scaleTo={0.97} onPress={() => setLevel('quality')} style={styles.menuRow}>
            <View style={[styles.menuIcon, { backgroundColor: colors.fill2 }]}>
              <Ionicons name="speedometer-outline" size={18} color={ACCENT} />
            </View>
            <View style={styles.menuInfo}>
              <Text style={[T.subhead, { color: colors.text }]}>直播画质</Text>
              <Text style={[T.caption2, { color: colors.textTertiary }]} numberOfLines={1}>
                {qualityList.find((q) => q.quality === currentQn)?.new_description || '自动'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Press>
          <Press
            haptic
            scaleTo={0.97}
            onPress={() => {
              onClose();
              router.push('/live_area' as Href);
            }}
            style={styles.menuRow}>
            <View style={[styles.menuIcon, { backgroundColor: colors.fill2 }]}>
              <Ionicons name="apps-outline" size={18} color={ACCENT} />
            </View>
            <View style={styles.menuInfo}>
              <Text style={[T.subhead, { color: colors.text }]}>全部直播分区</Text>
              <Text style={[T.caption2, { color: colors.textTertiary }]}>浏览所有分区</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Press>
          <Press haptic scaleTo={0.97} onPress={onDmBlock} style={styles.menuRow}>
            <View style={[styles.menuIcon, { backgroundColor: colors.fill2 }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={ACCENT} />
            </View>
            <View style={styles.menuInfo}>
              <Text style={[T.subhead, { color: colors.text }]}>弹幕屏蔽管理</Text>
              <Text style={[T.caption2, { color: colors.textTertiary }]}>屏蔽词 / 用户 / 全局规则</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Press>
        </>
      ) : level === 'areas' ? (
        <>
          <View style={styles.sheetHeader}>
            <Press haptic scaleTo={0.88} onPress={() => setLevel('menu')} style={styles.sheetBack}>
              <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
            </Press>
            <Text style={[T.subhead, styles.sheetTitle, { color: colors.text }]}>切换分区</Text>
            <Press haptic scaleTo={0.88} onPress={onClose} style={styles.sheetClose}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Press>
          </View>
          {loadingAreas ? (
            <View style={styles.sheetLoading}>
              <Host matchContents><ProgressView /></Host>
            </View>
          ) : (
            <FlashList
              data={areas}
              keyExtractor={(a) => String(a.id)}
              numColumns={2}
              style={styles.areaList}
              contentContainerStyle={styles.areaListContent}
              showsVerticalScrollIndicator={false}
              estimatedItemSize={38}
              windowSize={9}
              initialNumToRender={12}
              maxToRenderPerBatch={16}
              overrideProps={{ initialDrawBatchSize: 12 }}
              ListEmptyComponent={
                <Text style={[T.footnote, styles.sheetEmpty, { color: colors.textTertiary }]}>暂无分区</Text>
              }
              renderItem={({ item: a, index }) => {
                const isCurrent = a.id === roomArea?.areaId;
                return (
                  <View style={[styles.areaCell, index % 2 === 1 && styles.areaCellGap]}>
                    <Press
                      haptic
                      scaleTo={0.94}
                      onPress={() => {
                        onClose();
                        router.push({
                          pathname: '/live_area_detail/[areaId]',
                          params: {
                            areaId: String(a.id),
                            parentAreaId: String(a.parent_id),
                            parentName: a.parent_name || roomArea?.parentName || '',
                          },
                        });
                      }}
                      style={[styles.areaChip, continuous, isCurrent ? { backgroundColor: ACCENT } : { backgroundColor: colors.fill2 }]}>
                      {a.pic ? (
                        <ExpoImage source={{ uri: biliCover(a.pic, 48, 48) }} recyclingKey={a.pic} style={styles.areaChipIcon} contentFit="cover" />
                      ) : null}
                      <Text
                        style={[T.footnote, styles.areaChipText, { color: isCurrent ? '#FFFFFF' : colors.textSecondary, fontWeight: isCurrent ? '600' : '400' }]}
                        numberOfLines={1}>
                        {a.name}
                      </Text>
                    </Press>
                  </View>
                );
              }}
            />
          )}
        </>
      ) : (
        <>
          <View style={styles.sheetHeader}>
            <Press haptic scaleTo={0.88} onPress={() => setLevel('menu')} style={styles.sheetBack}>
              <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
            </Press>
            <Text style={[T.subhead, styles.sheetTitle, { color: colors.text }]}>直播画质</Text>
            <Press haptic scaleTo={0.88} onPress={onClose} style={styles.sheetClose}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Press>
          </View>
          <FlashList
            data={qualityList}
            keyExtractor={(q) => String(q.quality)}
            numColumns={2}
            style={styles.areaList}
            contentContainerStyle={styles.areaListContent}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={38}
            windowSize={9}
            initialNumToRender={12}
            maxToRenderPerBatch={16}
            overrideProps={{ initialDrawBatchSize: 12 }}
            ListEmptyComponent={
              <Text style={[T.footnote, styles.sheetEmpty, { color: colors.textTertiary }]}>暂无可选画质</Text>
            }
            renderItem={({ item: q, index }) => {
              const isCurrent = q.quality === currentQn;
              return (
                <View style={[styles.areaCell, index % 2 === 1 && styles.areaCellGap]}>
                  <Press
                    haptic
                    scaleTo={0.94}
                    onPress={() => {
                      onQualityChange(q.quality);
                      onClose();
                    }}
                    style={[styles.areaChip, continuous, isCurrent ? { backgroundColor: ACCENT } : { backgroundColor: colors.fill2 }]}>
                    <Text
                      style={[T.footnote, styles.areaChipText, { color: isCurrent ? '#FFFFFF' : colors.textSecondary, fontWeight: isCurrent ? '600' : '400' }]}
                      numberOfLines={1}>
                      {q.new_description}
                    </Text>
                  </Press>
                </View>
              );
            }}
          />
        </>
      )}
    </View>
  );

  return (
    <NativeBottomSheet visible={visible} onClose={onClose} detents={['medium']} dragIndicator="hidden" background={colors.bg}>
      {sheetContent}
    </NativeBottomSheet>
  );
}

const styles = StyleSheet.create({
  /* 设置菜单 */
  sheetBody: { paddingHorizontal: 16, gap: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  sheetTitle: { fontWeight: '600' },
  sheetClose: { position: 'absolute', right: 0, top: 6, padding: 6 },
  sheetBack: { position: 'absolute', left: 0, top: 6, padding: 6 },
  sheetLoading: { paddingVertical: 40, alignItems: 'center' },
  sheetEmpty: { textAlign: 'center', paddingVertical: 30 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  menuIcon: { width: 34, height: 34, borderRadius: RADII.sm, justifyContent: 'center', alignItems: 'center', ...continuous },
  menuInfo: { flex: 1, gap: 2 },
  areaList: { height: 220, paddingTop: 8 },
  areaListContent: { paddingBottom: 8 },
  areaCell: { flex: 1, maxWidth: '50%', paddingBottom: 10 },
  areaCellGap: { paddingLeft: 10 },
  areaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADII.sm, maxWidth: '100%' },
  areaChipIcon: { width: 20, height: 20, borderRadius: 6 },
  areaChipText: { flexShrink: 1 },
});
