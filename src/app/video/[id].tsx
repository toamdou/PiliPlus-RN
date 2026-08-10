import { useNativeVideoController } from '@/hooks/use-video-controller';
import { VideoScreenView } from '@/components/video/VideoScreenView';

export default function VideoScreen() {
  const controller = useNativeVideoController();
  return <VideoScreenView controller={controller} />;
}
