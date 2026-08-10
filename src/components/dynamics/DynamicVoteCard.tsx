import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { Press, Reveal } from '@/components/motion';
import { useType } from '@/components/type-scale';
import { formatCount, formatDate } from '@/utils/format';
import { RADII, continuous, shadow } from '@/theme/tokens';
import type { VoteInfoData, ReserveCard } from './dynamic-types';

export function DynamicVoteCard({
  voteInfo,
  voted,
  voteEnded,
  showVotePct,
  totalCnt,
  maxChoice,
  selections,
  voting,
  onToggleOption,
  onSubmit,
}: {
  voteInfo: VoteInfoData | null;
  voted: boolean;
  voteEnded: boolean;
  showVotePct: boolean;
  totalCnt: number;
  maxChoice: number;
  selections: number[];
  voting: boolean;
  onToggleOption: (optIdx: number) => void;
  onSubmit: () => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  if (!voteInfo) return null;

  return (
    <Reveal delay={110}>
      <View style={[styles.card, { backgroundColor: colors.card, ...shadow('md', colors.isDark) }]}>
        <View style={styles.voteHead}>
          <Ionicons name="bar-chart" size={16} color={ACCENT} />
          <Text style={[T.subhead, styles.voteHeadText, { color: ACCENT }]}>投票</Text>
          <Text style={[T.caption2, { color: colors.textTertiary }]}>
            {voted ? '已完成' : voteEnded ? '已结束' : `已选 ${selections.length} / ${maxChoice}`}
          </Text>
        </View>
        {voteInfo.title ? (
          <Text style={[T.headline, styles.voteTitle, { color: colors.text }]}>{voteInfo.title}</Text>
        ) : null}
        {voteInfo.desc ? (
          <Text style={[T.footnote, styles.voteDesc, { color: colors.textSecondary }]}>{voteInfo.desc}</Text>
        ) : null}
        <Text style={[T.caption1, styles.voteMeta, { color: colors.textSecondary }]}>
          {voteInfo.end_time ? `至 ${formatDate(voteInfo.end_time)}` : ''}
          {voteInfo.join_num != null ? ` · ${formatCount(voteInfo.join_num)}人参与` : ''}
        </Text>
        <View style={styles.voteOptions}>
          {(voteInfo.options ?? []).map((opt, i) => {
            const optIdx = opt.opt_idx ?? i;
            const selected = selections.includes(optIdx);
            const pct = totalCnt > 0 ? (opt.cnt ?? 0) / totalCnt : 0;
            return (
              <Press
                key={optIdx}
                haptic
                onPress={voted || voteEnded ? undefined : () => onToggleOption(optIdx)}
                style={[
                  styles.voteOption,
                  { backgroundColor: colors.fill3 },
                  selected && styles.voteOptionSelected,
                ]}>
                {showVotePct ? (
                  <View
                    style={[
                      styles.voteFill,
                      { width: `${Math.round(pct * 100)}%` },
                      selected && styles.voteFillSelected,
                    ]}
                  />
                ) : null}
                <Text style={[T.footnote, styles.voteOptionText, { color: colors.text }]} numberOfLines={2}>
                  {opt.opt_desc}
                </Text>
                {selected ? <Ionicons name="checkmark-circle" size={16} color={ACCENT} /> : null}
                {showVotePct ? (
                  <Text style={[T.caption1, { color: colors.textSecondary }]}>{Math.round(pct * 100)}%</Text>
                ) : null}
              </Press>
            );
          })}
        </View>
        {!voted && !voteEnded ? (
          <Press
            haptic
            scaleTo={0.96}
            onPress={selections.length > 0 ? onSubmit : undefined}
            style={[styles.voteSubmit, { opacity: selections.length > 0 ? 1 : 0.4 }]}>
            <Text style={styles.voteSubmitText}>{voting ? '投票中...' : '投票'}</Text>
          </Press>
        ) : null}
      </View>
    </Reveal>
  );
}

export function DynamicReserveCard({
  reserve,
  reserveBtnText,
  reserveBtnDisabled,
  onReserve,
}: {
  reserve: ReserveCard | null;
  reserveBtnText: string;
  reserveBtnDisabled: boolean;
  onReserve: () => void;
}) {
  const colors = useThemeColors();
  const T = useType();
  if (!reserve) return null;
  const reserveBtn = reserve.button;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, ...shadow('md', colors.isDark) }]}>
      <View style={styles.voteHead}>
        <Ionicons name="calendar" size={15} color={ACCENT} />
        <Text style={[T.subhead, styles.voteHeadText, { color: ACCENT }]}>直播预约</Text>
      </View>
      {reserve.title ? (
        <Text style={[T.headline, styles.voteTitle, { color: colors.text }]}>{reserve.title}</Text>
      ) : null}
      {reserve.desc1?.text ? (
        <Text style={[T.footnote, styles.voteDesc, { color: colors.textSecondary }]}>{reserve.desc1.text}</Text>
      ) : null}
      {reserve.desc2?.text ? (
        <Text style={[T.caption1, styles.voteMeta, { color: colors.textTertiary }]}>{reserve.desc2.text}</Text>
      ) : null}
      {reserve.desc3?.text ? (
        <View style={styles.reserveGift}>
          <Ionicons name="gift-outline" size={14} color={ACCENT} />
          <Text style={[T.footnote, { color: ACCENT }]}>{reserve.desc3.text}</Text>
        </View>
      ) : null}
      {reserveBtn ? (
        <Press
          haptic
          scaleTo={0.96}
          onPress={reserveBtnDisabled ? undefined : onReserve}
          style={[styles.reserveBtn, { opacity: reserveBtnDisabled ? 0.5 : 1 }]}>
          <Text style={styles.reserveBtnText}>{reserveBtnText}</Text>
        </Press>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADII.lg, padding: 16, ...continuous },
  /* 投票 / 预约 */
  voteHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voteHeadText: { fontWeight: '600' },
  voteTitle: { fontWeight: '600', marginTop: 10 },
  voteDesc: { marginTop: 4 },
  voteMeta: { marginTop: 6 },
  voteOptions: { gap: 8, marginTop: 12 },
  voteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: RADII.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
    ...continuous,
  },
  voteOptionSelected: { borderColor: ACCENT, borderWidth: 1 },
  voteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: 'rgba(120,120,128,0.25)',
  },
  voteFillSelected: { backgroundColor: 'rgba(251,114,153,0.18)' },
  voteOptionText: { flex: 1 },
  voteSubmit: {
    backgroundColor: ACCENT,
    borderRadius: RADII.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 14,
    ...continuous,
  },
  voteSubmitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  reserveGift: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  reserveBtn: {
    backgroundColor: ACCENT,
    borderRadius: RADII.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 14,
    ...continuous,
  },
  reserveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
