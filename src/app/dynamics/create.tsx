import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, ACCENT } from '@/components/SwiftUIHost';
import { useType } from '@/components/type-scale';
import { Press } from '@/components/motion';
import EmotePicker from '@/components/emote/EmotePicker';
import { MentionPicker } from '@/components/dynamics/MentionPicker';
import { TopicPicker } from '@/components/dynamics/TopicPicker';
import { VoteEditor } from '@/components/dynamics/VoteEditor';
import { ReserveEditor } from '@/components/dynamics/ReserveEditor';
import { ImagePickerRow } from '@/components/dynamics/ImagePickerRow';
import { CreateDynToolbar } from '@/components/dynamics/CreateDynToolbar';
import { useCreateDynamic } from '@/components/dynamics/useCreateDynamic';
import { MAX_TEXT, MAX_IMAGES } from '@/components/dynamics/create-dynamic';
import { RADII, continuous } from '@/theme/tokens';

export default function CreateDynamicScreen() {
  const colors = useThemeColors();
  const T = useType();
  const insets = useSafeAreaInsets();
  // 表情面板开关（emote 体系接入：发布动态输入框支持 [xxx] 表情）
  const [showEmote, setShowEmote] = useState(false);
  const {
    isEditing,
    text,
    images,
    publishing,
    topic,
    topicPanelOpen,
    topics,
    topicLoading,
    topicKeyword,
    mentionKeyword,
    mentionUsers,
    voteOpen,
    voteDraft,
    reserveOpen,
    reserveDraft,
    multiChoice,
    onTextChange,
    pickImages,
    removeImage,
    onTopicKeywordChange,
    toggleTopicPanel,
    selectTopic,
    removeTopic,
    insertMention,
    insertAt,
    toggleVoteEditor,
    updateVoteTitle,
    updateVoteOption,
    addVoteOption,
    removeVoteOption,
    setVoteChoice,
    setVoteDays,
    clearVote,
    toggleReserveEditor,
    updateReserveTitle,
    setReserveDay,
    setReserveClock,
    clearReserve,
    handlePublish,
  } = useCreateDynamic();

  return (
    <>
      <Stack.Screen options={{ title: isEditing ? '编辑动态' : '发布动态', headerBackButtonDisplayMode: 'minimal' }} />
      <Stack.Header blurEffect="systemMaterial" style={{ shadowColor: 'transparent' }} />
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled">
          <TextInput
            style={[styles.textInput, T.body, { color: colors.text }]}
            placeholder="分享你的想法..."
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={MAX_TEXT}
            value={text}
            onChangeText={onTextChange}
            autoFocus
          />
          <Text style={[T.caption2, { color: colors.textTertiary, textAlign: 'right', marginTop: 4 }]}>
            {text.length}/{MAX_TEXT}
          </Text>

          <MentionPicker keyword={mentionKeyword} users={mentionUsers} onSelect={insertMention} />

          <TopicPicker
            topic={topic}
            open={topicPanelOpen}
            keyword={topicKeyword}
            loading={topicLoading}
            topics={topics}
            onKeywordChange={onTopicKeywordChange}
            onSelect={selectTopic}
            onRemove={removeTopic}
          />

          {!isEditing ? (
            <>
              <VoteEditor
                draft={voteDraft}
                open={voteOpen}
                multiChoice={multiChoice}
                onToggle={toggleVoteEditor}
                onTitleChange={updateVoteTitle}
                onOptionChange={updateVoteOption}
                onAddOption={addVoteOption}
                onRemoveOption={removeVoteOption}
                onChoiceChange={setVoteChoice}
                onDaysChange={setVoteDays}
                onRemove={clearVote}
              />

              <ReserveEditor
                draft={reserveDraft}
                open={reserveOpen}
                onToggle={toggleReserveEditor}
                onTitleChange={updateReserveTitle}
                onDayChange={setReserveDay}
                onClockChange={setReserveClock}
                onRemove={clearReserve}
              />

              <ImagePickerRow images={images} max={MAX_IMAGES} onAdd={pickImages} onRemove={removeImage} />

              <View style={styles.toolbarRow}>
                <CreateDynToolbar
                  topicActive={Boolean(topic) || topicPanelOpen}
                  mentionActive={mentionKeyword !== null}
                  voteActive={Boolean(voteDraft) || voteOpen}
                  reserveActive={Boolean(reserveDraft) || reserveOpen}
                  onPickImages={pickImages}
                  onToggleTopic={toggleTopicPanel}
                  onInsertAt={insertAt}
                  onToggleVote={toggleVoteEditor}
                  onToggleReserve={toggleReserveEditor}
                />
                {/* 表情按钮（EmotePicker 表情面板切换） */}
                <Press haptic scaleTo={0.94} onPress={() => setShowEmote((v) => !v)} style={styles.emoteBtn}>
                  <Ionicons name="happy-outline" size={22} color={showEmote ? ACCENT : colors.textSecondary} />
                </Press>
              </View>
            </>
          ) : null}
        </ScrollView>

        {/* 表情面板：onSelect 把 [xxx] 文本码拼进动态文本 */}
        <EmotePicker
          visible={showEmote}
          onSelect={(code) => onTextChange(text + code)}
          onClose={() => setShowEmote(false)}
        />

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Press
            haptic
            scaleTo={0.95}
            onPress={handlePublish}
            style={[styles.publishBtn, { opacity: publishing ? 0.6 : 1 }]}>
            <Text style={styles.publishText}>{publishing ? '保存中...' : isEditing ? '保存' : '发布'}</Text>
          </Press>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  textInput: { minHeight: 160, textAlignVertical: 'top' },
  footer: { paddingHorizontal: 16 },
  publishBtn: {
    backgroundColor: ACCENT,
    borderRadius: RADII.md,
    paddingVertical: 12,
    alignItems: 'center',
    ...continuous,
  },
  publishText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  /* 工具栏行：表情按钮与既有 CreateDynToolbar 同排 */
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  emoteBtn: { padding: 8 },
});
