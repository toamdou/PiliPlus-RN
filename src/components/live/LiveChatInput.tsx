import { View, Text, TextInput, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { feedBack } from '@/utils/feedback';
import { RADII, continuous } from '@/theme/tokens';
import { biliCover } from '@/utils/image-url';

export function LiveChatInput({
  input,
  onInputChange,
  onSend,
  onEmojiPick,
  emoticons,
  emojiPackageIdx,
  onEmojiPackageChange,
  showEmojiPanel,
  onToggleEmojiPanel,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onEmojiPick: (name: string) => void;
  emoticons: any[];
  emojiPackageIdx: number;
  onEmojiPackageChange: (index: number) => void;
  showEmojiPanel: boolean;
  onToggleEmojiPanel: () => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const emojiCols = Math.max(4, Math.floor((windowWidth - 24) / 48));
  const emojis = (emoticons[emojiPackageIdx]?.emoticons || []) as any[];

  return (
    <>
      {/* 弹幕输入栏（实心抬升表面）*/}
      {showEmojiPanel && emoticons.length > 0 && (
        <View style={[styles.emojiPanel, { backgroundColor: colors.card, borderTopColor: colors.separator }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.emojiPkgContent}>
            {emoticons.map((pkg: any, i: number) => (
              <Press
                key={pkg?.package_id || i}
                haptic
                scaleTo={0.94}
                onPress={() => onEmojiPackageChange(i)}
                style={[styles.emojiPkgChip, continuous, i === emojiPackageIdx ? { backgroundColor: ACCENT } : { backgroundColor: colors.fill2 }]}>
                <Text style={[T.caption2, { color: i === emojiPackageIdx ? '#FFFFFF' : colors.textSecondary, fontWeight: i === emojiPackageIdx ? '600' : '400' }]} numberOfLines={1}>
                  {pkg?.package_name || `表情包 ${i + 1}`}
                </Text>
              </Press>
            ))}
          </ScrollView>
          <FlashList
            data={emojis}
            numColumns={emojiCols}
            keyExtractor={(em: any, i: number) => String(em?.id ?? em?.name ?? i)}
            style={styles.emojiGrid}
            contentContainerStyle={styles.emojiGridContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            estimatedItemSize={40}
            windowSize={9}
            initialNumToRender={24}
            maxToRenderPerBatch={24}
            renderItem={({ item: em, index }: { item: any; index: number }) => (
              <Press
                key={String(em?.id ?? em?.name ?? index)}
                haptic
                scaleTo={0.9}
                onPress={() => {
                  const text = em?.emoticon_unique || em?.emoji || em?.text || em?.name || '';
                  if (text) onEmojiPick(text);
                }}
                style={styles.emojiCell}>
                {em?.url ? (
                  <ExpoImage source={{ uri: biliCover(em.url, 96, 96) }} recyclingKey={em.url} style={styles.emojiImage} contentFit="contain" />
                ) : (
                  <Text style={[T.caption1, { color: colors.textSecondary }]}>{em?.name || ''}</Text>
                )}
              </Press>
            )}
          />
        </View>
      )}
      <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.separator, paddingBottom: insets.bottom + 8 }]}>
        {emoticons.length > 0 && (
          <Press
            haptic
            scaleTo={0.88}
            onPress={() => {
              feedBack();
              onToggleEmojiPanel();
            }}
            style={[styles.emojiToggle, { backgroundColor: showEmojiPanel ? 'rgba(251,114,153,0.12)' : 'transparent' }]}>
            <Ionicons name="happy-outline" size={20} color={showEmojiPanel ? ACCENT : colors.textSecondary} />
          </Press>
        )}
        <View style={[styles.inputField, { backgroundColor: colors.fill2 }]}>
          <TextInput
            value={input}
            onChangeText={onInputChange}
            placeholder="发个弹幕…"
            placeholderTextColor={colors.textTertiary}
            style={[styles.textInput, { color: colors.text }]}
            maxLength={40}
          />
        </View>
        <Press
          haptic
          scaleTo={0.9}
          disabled={!input.trim()}
          onPress={onSend}
          style={[styles.sendBtn, { backgroundColor: input.trim() ? ACCENT : colors.fill2 }]}>
          <Ionicons name="send" size={16} color={input.trim() ? '#FFFFFF' : colors.textTertiary} />
        </Press>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  /* 表情面板 */
  emojiPanel: {
    height: 220,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  emojiPkgContent: { paddingHorizontal: 12, gap: 8, paddingBottom: 8 },
  emojiPkgChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADII.sm, ...continuous },
  emojiGrid: {
    flex: 1,
  },
  emojiGridContent: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  emojiCell: {
    width: 40,
    height: 40,
    borderRadius: RADII.thumb,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emojiImage: { width: 34, height: 34 },
  emojiToggle: { width: 36, height: 36, borderRadius: RADII.circle, justifyContent: 'center', alignItems: 'center' },
  /* 输入栏 */
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  inputField: { flex: 1, borderRadius: RADII.lg, paddingHorizontal: 14, paddingVertical: 8, ...continuous },
  textInput: { fontSize: 14.5 },
  sendBtn: { width: 36, height: 36, borderRadius: RADII.circle, justifyContent: 'center', alignItems: 'center' },
});
