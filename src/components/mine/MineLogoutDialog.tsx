import { ConfirmationDialog, Button as SUIButton, Text as SUIText } from '@expo/ui/swift-ui';
import { Host } from '@/components/SwiftUIHost';
import { hidden } from '@expo/ui/swift-ui/modifiers';

export function MineLogoutDialog({
  visible,
  onChange,
  onLogout,
}: {
  visible: boolean;
  onChange: (visible: boolean) => void;
  onLogout: () => void;
}) {
  return (
    <Host matchContents>
      <ConfirmationDialog
        title="退出登录"
        isPresented={visible}
        onIsPresentedChange={onChange}
        titleVisibility="visible">
        <ConfirmationDialog.Trigger>
          <SUIButton label=" " onPress={() => onChange(true)} modifiers={[hidden(true)]} />
        </ConfirmationDialog.Trigger>
        <ConfirmationDialog.Actions>
          <SUIButton label="退出" role="destructive" onPress={onLogout} />
          <SUIButton label="取消" role="cancel" />
        </ConfirmationDialog.Actions>
        <ConfirmationDialog.Message>
          <SUIText>确定要退出当前账号吗？</SUIText>
        </ConfirmationDialog.Message>
      </ConfirmationDialog>
    </Host>
  );
}
