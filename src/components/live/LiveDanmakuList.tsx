import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useScrollToTop } from 'expo-router';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { RADII, continuous } from '@/theme/tokens';

export interface DmMsg {
  id: number;
  uname: string;
  msg: string;
}

export interface LiveDanmakuListHandle {
  push: (uname: string, msg: string) => void;
  pushBatch: (items: { uname: string; msg: string }[]) => void;
  seed: (items: DmMsg[]) => void;
}

const MAX_ITEMS = 50;

const DmRow = memo(function DmRow({ item, colors, T }: {
  item: DmMsg;
  colors: ReturnType<typeof useThemeColors>;
  T: ReturnType<typeof useType>;
}) {
  return (
    <View style={styles.dmRow}>
      <Text style={[T.footnote, styles.dmName, { color: ACCENT }]}>{`${item.uname}: `}</Text>
      <Text style={[T.footnote, styles.dmMsg, { color: colors.text }]}>{item.msg}</Text>
    </View>
  );
});

export const LiveDanmakuList = memo(
  forwardRef<LiveDanmakuListHandle, { data?: DmMsg[] }>(function LiveDanmakuList(
    { data: initialData },
    ref,
  ) {
    const colors = useThemeColors();
    const T = useType();
    const listRef = useRef<FlashListRef<DmMsg>>(null);
    useScrollToTop(listRef);
    const [data, setData] = useState<DmMsg[]>(initialData ?? []);
    const idRef = useRef(0);
    const seededRef = useRef(false);

    useImperativeHandle(ref, () => ({
      push: (uname, msg) => {
        const item = { id: idRef.current++, uname, msg };
        setData((prev) => [...prev, item].slice(-MAX_ITEMS));
      },
      pushBatch: (items) => {
        if (items.length === 0) return;
        const mapped = items.map(({ uname, msg }) => ({
          id: idRef.current++,
          uname,
          msg,
        }));
        setData((prev) => [...prev, ...mapped].slice(-MAX_ITEMS));
      },
      seed: (items) => {
        if (seededRef.current) return;
        seededRef.current = true;
        const mapped = items.map((it) => ({
          id: it.id || idRef.current++,
          uname: it.uname || '',
          msg: it.msg || '',
        }));
        setData((prev) => [...mapped, ...prev].slice(-MAX_ITEMS));
      },
    }), []);

    const renderDm = useCallback(
      ({ item }: { item: DmMsg }) => (
        <DmRow item={item} colors={colors} T={T} />
      ),
      [colors, T],
    );

    return (
      <View style={[styles.dmCard, { backgroundColor: colors.card }]}>
        <Text style={[T.subhead, styles.dmHeader, { color: colors.text }]}>弹幕</Text>
        <FlashList
          ref={listRef}
          data={data}
          keyExtractor={(it) => String(it.id)}
          showsVerticalScrollIndicator={false}
          maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 40 }}
          estimatedItemSize={160}
          windowSize={9}
          initialNumToRender={10}
          maxToRenderPerBatch={12}
          overrideProps={{ initialDrawBatchSize: 10 }}
          ListEmptyComponent={
            <Text style={[T.footnote, styles.dmEmpty, { color: colors.textTertiary }]}>暂无弹幕，来发第一条吧</Text>
          }
          renderItem={renderDm}
        />
      </View>
    );
  }),
);

const styles = StyleSheet.create({
  dmCard: {
    flex: 1,
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 8,
    padding: 14,
    borderRadius: RADII.lg,
    ...continuous,
  },
  dmHeader: { fontWeight: '700', marginBottom: 8 },
  dmRow: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 3 },
  dmName: { fontWeight: '600' },
  dmMsg: { flexShrink: 1 },
  dmEmpty: { textAlign: 'center', marginTop: 20 },
});
