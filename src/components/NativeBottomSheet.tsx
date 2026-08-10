import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Host, BottomSheet, Group, RNHostView } from '@expo/ui/swift-ui';
import { presentationDetents, presentationDragIndicator } from '@expo/ui/swift-ui/modifiers';

/**
 * NativeBottomSheet —— @expo/ui SwiftUI BottomSheet 宿主样板收敛。
 * 统一 Host / BottomSheet / Group / RNHostView / sheetFill，外部只关心内容。
 */
export function NativeBottomSheet({
  visible,
  onClose,
  detents = ['medium'],
  dragIndicator = 'visible',
  background,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  detents?: string[];
  dragIndicator?: 'visible' | 'hidden';
  background?: string;
  children: ReactNode;
}) {
  return (
    <Host>
      <BottomSheet isPresented={visible} onIsPresentedChange={(v) => { if (!v) onClose(); }}>
        <Group modifiers={[
          presentationDetents(detents as any),
          presentationDragIndicator(dragIndicator),
        ]}>
          <RNHostView>
            <View style={[styles.sheetFill, background ? { backgroundColor: background } : null]}>
              {children}
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({
  sheetFill: { flexGrow: 1, height: 0 },
});
