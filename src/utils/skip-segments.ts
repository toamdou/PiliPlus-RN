import type { SBSegment } from '@/api/sponsor-block';

export function sortSkipSegments(segments: SBSegment[]): SBSegment[] {
  return [...segments].sort(
    (a, b) => a.segment[0] - b.segment[0] || a.segment[1] - b.segment[1],
  );
}
