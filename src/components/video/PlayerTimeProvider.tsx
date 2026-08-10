import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { DanmakuOverlay } from '@/components/DanmakuOverlay';
import { SubtitleOverlay } from '@/components/SubtitleOverlay';
import { CollapsedPlayerBar } from './CollapsedPlayerBar';

export interface PlayerTimeControl {
  publish: (currentTime: number, duration?: number) => void;
}

const PlayerTimeContext = createContext({ currentTime: 0, duration: 0 });
const PlayerDurationContext = createContext(0);

export function usePlayerTime() {
  return useContext(PlayerTimeContext);
}

export function usePlayerDuration() {
  return useContext(PlayerDurationContext);
}

export function PlayerTimeProvider({
  player,
  controlRef,
  children,
}: {
  player: any;
  controlRef?: { current: PlayerTimeControl | null };
  children: ReactNode;
}) {
  const [time, setTime] = useState({ currentTime: 0, duration: 0 });

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('timeUpdate', (e: any) => {
      const duration = typeof e.duration === 'number' && e.duration > 0 ? e.duration : 0;
      setTime((prev) =>
        prev.currentTime === e.currentTime && prev.duration === duration
          ? prev
          : { currentTime: e.currentTime, duration },
      );
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      publish: (currentTime, duration) => {
        setTime((prev) => {
          const next = { currentTime, duration: duration ?? prev.duration };
          return next.currentTime === prev.currentTime && next.duration === prev.duration
            ? prev
            : next;
        });
      },
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef]);

  return (
    <PlayerTimeContext.Provider value={time}>
      <PlayerDurationContext.Provider value={time.duration}>
        {children}
      </PlayerDurationContext.Provider>
    </PlayerTimeContext.Provider>
  );
}

export function TimeAwareDanmakuOverlay(
  props: Omit<ComponentProps<typeof DanmakuOverlay>, 'currentTime' | 'duration'>,
) {
  const duration = usePlayerDuration();
  return <DanmakuOverlay duration={duration} {...props} />;
}

export function TimeAwareSubtitleOverlay(
  props: Omit<ComponentProps<typeof SubtitleOverlay>, 'currentTime'>,
) {
  return <SubtitleOverlay {...props} />;
}

export function TimeAwareCollapsedPlayerBar(
  props: Omit<ComponentProps<typeof CollapsedPlayerBar>, 'playedTime'>,
) {
  const { currentTime } = usePlayerTime();
  return <CollapsedPlayerBar playedTime={currentTime} {...props} />;
}
