import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { loginApi } from '@/api/login';
import { formatTime } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { Press } from '@/components/motion';

interface DeviceItem {
  id: string;
  name: string;
  platform: string;
  last_time?: number;
  current?: boolean;
}

export default function LoginDevicesScreen() {
  const colors = useThemeColors();
  const T = useType();
  const { isLoggedIn } = useAuthStore();
  const [items, setItems] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    if (isRefresh) setRefreshing(true);
    try {
      const res = await loginApi.loginDevices();
      const list = res?.data?.list || res?.data?.items || [];
      setItems(list.map((i: any) => ({
        id: String(i.device_id || i.id || ''),
        name: i.device_name || i.name || '未知设备',
        platform: i.platform || i.device_platform || '',
        last_time: i.timestamp || i.last_time,
        current: !!i.is_online || !!i.current,
      })));
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    const t = setTimeout(() => { load(true); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const renderRow = useCallback(
    ({ item, index }: { item: DeviceItem; index: number }) => (
      <View>
        <Press haptic scaleTo={0.98} style={[styles.row, { backgroundColor: colors.card }]}>
          <Ionicons name="phone-portrait-outline" size={22} color={colors.textSecondary} />
          <View style={styles.info}>
            <Text style={[T.subhead, { color: colors.text }]} numberOfLines={1}>{item.name}{item.current ? '（当前）' : ''}</Text>
            {item.platform ? <Text style={[T.caption1, { color: colors.textTertiary }]}>{item.platform}</Text> : null}
            {item.last_time ? <Text style={[T.caption2, { color: colors.textTertiary }]}>最近登录 {formatTime(item.last_time)}</Text> : null}
          </View>
        </Press>
      </View>
    ),
    [colors, T],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack.Title large>登录设备</Stack.Title>
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <FlashList
        data={items}
        keyExtractor={(it) => it.id || it.name}
        contentContainerStyle={styles.listContent}
        estimatedItemSize={76}
        windowSize={9}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.textSecondary} />}
        ListEmptyComponent={loading ? null : <Text style={[T.headline, styles.empty, { color: colors.text }]}>暂无设备信息</Text>}
        renderItem={renderRow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 40, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  info: { flex: 1, gap: 3 },
  empty: { textAlign: 'center', paddingTop: 120 },
});
