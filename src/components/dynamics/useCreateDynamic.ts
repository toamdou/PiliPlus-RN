import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { dynamicsApi } from '@/api/dynamics';
import { searchApi } from '@/api/search';
import { apiClient, post } from '@/api/client';
import { Api } from '@/api/endpoints';
import { getCSRF } from '@/utils/cookie';
import { showToast } from '@/utils/toast';
import { feedBackSuccess } from '@/utils/feedback';
import { useAuthStore } from '@/stores/auth';
import type { MentionUser } from '@/components/dynamics/MentionPicker';
import type { TopicItem } from '@/components/dynamics/TopicPicker';
import { MIN_VOTE_OPTIONS, MAX_VOTE_OPTIONS, type VoteDraft } from '@/components/dynamics/VoteEditor';
import { defaultReserveTs, type ReserveDraft } from '@/components/dynamics/ReserveEditor';
import { MAX_IMAGES, buildContents, type DynReq } from '@/components/dynamics/create-dynamic';
import { generateUploadIdAsync } from 'pili-native-core';
import {
  createNativeRequestCancelToken,
  type NativeRequestCancelToken,
} from '@/utils/request-cancel';

export interface UseCreateDynamicReturn {
  isEditing: boolean;
  text: string;
  images: string[];
  publishing: boolean;
  topic: TopicItem | null;
  topicPanelOpen: boolean;
  topics: TopicItem[];
  topicLoading: boolean;
  topicKeyword: string;
  mentionKeyword: string | null;
  mentionUsers: MentionUser[];
  voteOpen: boolean;
  voteDraft: VoteDraft | null;
  reserveOpen: boolean;
  reserveDraft: ReserveDraft | null;
  multiChoice: boolean;
  onTextChange: (t: string) => void;
  pickImages: () => Promise<void>;
  removeImage: (idx: number) => void;
  onTopicKeywordChange: (kw: string) => void;
  toggleTopicPanel: () => void;
  selectTopic: (t: TopicItem) => void;
  removeTopic: () => void;
  insertMention: (user: MentionUser) => void;
  insertAt: () => void;
  toggleVoteEditor: () => void;
  updateVoteTitle: (v: string) => void;
  updateVoteOption: (i: number, v: string) => void;
  addVoteOption: () => void;
  removeVoteOption: (i: number) => void;
  setVoteChoice: (multi: boolean) => void;
  setVoteDays: (days: number) => void;
  clearVote: () => void;
  toggleReserveEditor: () => void;
  updateReserveTitle: (v: string) => void;
  setReserveDay: (offset: number) => void;
  setReserveClock: (hour: number, minute: number) => void;
  clearReserve: () => void;
  handlePublish: () => Promise<void>;
}

export function useCreateDynamic(): UseCreateDynamicReturn {
  const router = useRouter();
  const { editId: editIdParam, text: initialText } = useLocalSearchParams<{ editId?: string; text?: string }>();
  const editId = editIdParam || undefined;
  const isEditing = Boolean(editId);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const userInfo = useAuthStore((s) => s.userInfo);

  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);

  const [topic, setTopic] = useState<TopicItem | null>(null);
  const [topicPanelOpen, setTopicPanelOpen] = useState(false);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicKeyword, setTopicKeyword] = useState('');
  const topicTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadCancelRef = useRef<NativeRequestCancelToken | null>(null);

  const [mentionKeyword, setMentionKeyword] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentions, setMentions] = useState<MentionUser[]>([]);
  const mentionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [voteOpen, setVoteOpen] = useState(false);
  const [voteDraft, setVoteDraft] = useState<VoteDraft | null>(null);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reserveDraft, setReserveDraft] = useState<ReserveDraft | null>(null);

  useEffect(() => {
    if (!editId) return;
    const t = setTimeout(async () => {
      try {
        const res = await dynamicsApi.detail({ id: editId });
        const item = res?.data?.item;
        const md = item?.modules?.module_dynamic;
        setText(md?.desc?.text || md?.major?.opus?.summary?.text || md?.major?.opus?.title || String(initialText || ''));
      } catch (e) {
        console.error('load edit dynamic error:', e);
        showToast('动态加载失败');
      }
    }, 0);
    return () => clearTimeout(t);
  }, [editId, initialText]);

  useEffect(() => () => {
    uploadCancelRef.current?.abort();
  }, []);

  const pickImages = async () => {
    if (images.length >= MAX_IMAGES) {
      showToast(`最多添加 ${MAX_IMAGES} 张图片`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.9,
    });
    if (!result.canceled && result.assets) {
      const uris = result.assets.map((a) => a.uri);
      setImages((prev) => [...prev, ...uris].slice(0, MAX_IMAGES));
    }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ===== 话题 ===== */
  const loadRcmdTopics = useCallback(async () => {
    setTopicLoading(true);
    try {
      const res = await dynamicsApi.topicRcmd({ source: 'Web', page_size: 25, web_location: 333.1365 });
      const items: TopicItem[] = res?.data?.topic_items ?? [];
      setTopics(items);
    } catch (e) {
      console.error('loadRcmdTopics error:', e);
      showToast('话题推荐加载失败');
    } finally {
      setTopicLoading(false);
    }
  }, []);

  const searchTopics = useCallback(
    async (kw: string) => {
      try {
        if (!kw) {
          await loadRcmdTopics();
          return;
        }
        const res = await searchApi.topicPubSearch({ keywords: kw });
        const items: TopicItem[] = res?.data?.topic_items ?? [];
        setTopics(items);
      } catch (e) {
        console.error('topic search error:', e);
        showToast('话题搜索失败');
      }
    },
    [loadRcmdTopics],
  );

  const onTopicKeywordChange = (kw: string) => {
    setTopicKeyword(kw);
    if (topicTimer.current) clearTimeout(topicTimer.current);
    topicTimer.current = setTimeout(() => {
      void searchTopics(kw.trim());
    }, 300);
  };

  const toggleTopicPanel = () => {
    const next = !topicPanelOpen;
    setTopicPanelOpen(next);
    if (next && topics.length === 0 && !topicLoading) void loadRcmdTopics();
  };

  const selectTopic = (t: TopicItem) => {
    setTopic(t);
    setTopicPanelOpen(false);
    setTopicKeyword('');
  };

  const removeTopic = () => setTopic(null);

  /* ===== @提及 ===== */
  const searchMention = useCallback(async (kw: string) => {
    try {
      const res = await dynamicsApi.mention({ keyword: kw });
      const users: MentionUser[] = [];
      for (const g of res?.data?.groups ?? []) {
        for (const u of g?.items ?? []) users.push(u);
      }
      setMentionUsers(users);
    } catch (e) {
      console.error('mention search error:', e);
      showToast('用户搜索失败');
    }
  }, []);

  const scheduleMentionSearch = useCallback(
    (kw: string) => {
      if (mentionTimer.current) clearTimeout(mentionTimer.current);
      mentionTimer.current = setTimeout(() => {
        void searchMention(kw);
      }, 300);
    },
    [searchMention],
  );

  const onTextChange = (t: string) => {
    setText(t);
    const atIdx = t.lastIndexOf('@');
    if (atIdx >= 0) {
      const kw = t.slice(atIdx + 1);
      if (!/\s/.test(kw)) {
        setMentionKeyword(kw);
        scheduleMentionSearch(kw);
        return;
      }
    }
    setMentionKeyword(null);
    setMentionUsers([]);
  };

  const insertMention = (user: MentionUser) => {
    if (mentionKeyword === null) return;
    const atIdx = text.lastIndexOf('@');
    if (atIdx < 0) return;
    const newText =
      text.slice(0, atIdx) + '@' + user.name + ' ' + text.slice(atIdx + 1 + mentionKeyword.length);
    setText(newText);
    setMentions((prev) => {
      const filtered = prev.filter((m) => m.uid !== user.uid);
      return [...filtered, user];
    });
    setMentionKeyword(null);
    setMentionUsers([]);
  };

  const insertAt = () => {
    if (mentionKeyword !== null) return;
    setText((prev) => prev + '@');
    setMentionKeyword('');
    void searchMention('');
  };

  /* ===== 投票 ===== */
  const toggleVoteEditor = () => {
    const next = !voteOpen;
    setVoteOpen(next);
    if (next && !voteDraft) setVoteDraft({ title: '', options: ['', ''], choiceCnt: 1, days: 7 });
  };

  const updateVoteTitle = (v: string) => setVoteDraft((d) => (d ? { ...d, title: v } : d));
  const updateVoteOption = (i: number, v: string) =>
    setVoteDraft((d) => (d ? { ...d, options: d.options.map((o, j) => (j === i ? v : o)) } : d));
  const addVoteOption = () =>
    setVoteDraft((d) =>
      d && d.options.length < MAX_VOTE_OPTIONS ? { ...d, options: [...d.options, ''] } : d,
    );
  const removeVoteOption = (i: number) =>
    setVoteDraft((d) =>
      d && d.options.length > MIN_VOTE_OPTIONS
        ? { ...d, options: d.options.filter((_, j) => j !== i) }
        : d,
    );
  const setVoteChoice = (multi: boolean) =>
    setVoteDraft((d) => (d ? { ...d, choiceCnt: multi ? 2 : 1 } : d));
  const setVoteDays = (days: number) => setVoteDraft((d) => (d ? { ...d, days } : d));
  const clearVote = () => setVoteDraft(null);

  /* ===== 预约 ===== */
  const toggleReserveEditor = () => {
    const next = !reserveOpen;
    setReserveOpen(next);
    if (next && !reserveDraft) setReserveDraft({ title: '', ts: defaultReserveTs() });
  };

  const updateReserveTitle = (v: string) =>
    setReserveDraft((d) => (d ? { ...d, title: v } : d));

  const setReserveDay = (offset: number) => {
    setReserveDraft((d) => {
      if (!d) return d;
      const prev = new Date(d.ts * 1000);
      const base = new Date();
      base.setHours(0, 0, 0, 0);
      base.setDate(base.getDate() + offset);
      base.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
      return { ...d, ts: Math.floor(base.getTime() / 1000) };
    });
  };

  const setReserveClock = (hour: number, minute: number) => {
    setReserveDraft((d) => {
      if (!d) return d;
      const dt = new Date(d.ts * 1000);
      dt.setHours(hour, minute, 0, 0);
      return { ...d, ts: Math.floor(dt.getTime() / 1000) };
    });
  };

  const clearReserve = () => setReserveDraft(null);

  /* ===== 发布 ===== */
  const handlePublish = async () => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    const content = text.trim();
    if (!content && images.length === 0 && !voteDraft && !reserveDraft) {
      showToast('请输入内容或添加图片');
      return;
    }
    if (voteDraft) {
      if (!voteDraft.title.trim()) {
        showToast('请填写投票标题');
        return;
      }
      if (voteDraft.options.some((o) => !o.trim())) {
        showToast('请填写完整的投票选项');
        return;
      }
    }
    if (reserveDraft && !reserveDraft.title.trim()) {
      showToast('请填写预约标题');
      return;
    }
    setPublishing(true);
    try {
      uploadCancelRef.current?.abort();
      const cancelToken = createNativeRequestCancelToken();
      uploadCancelRef.current = cancelToken;
      if (editId) {
        const res = await dynamicsApi.editDyn({ dyn_id: editId, content });
        if (res?.code !== 0) {
          showToast(res?.message || '保存失败');
          return;
        }
        feedBackSuccess();
        showToast('已保存');
        router.back();
        return;
      }

      const uploadedUrls: string[] = [];
      if (images.length > 0) {
        for (const uri of images) {
          const res = await dynamicsApi.uploadBfs({
            file: { uri, type: 'image/jpeg', name: 'upload.jpg' },
            category: 'daily',
          }, cancelToken);
          if (res?.data?.image_url) uploadedUrls.push(res.data.image_url);
        }
      }

      let voteId: number | undefined;
      if (voteDraft) {
        const vres = await dynamicsApi.createVote({
          vote_info: {
            title: voteDraft.title.trim(),
            desc: '',
            type: 0,
            choice_cnt: voteDraft.choiceCnt,
            duration: voteDraft.days * 86400,
            options: voteDraft.options.map((o) => ({ opt_desc: o.trim(), img_url: '' })),
            only_fans_level: 0,
            vote_publisher: userInfo?.mid ?? 0,
          },
        });
        if (vres?.code !== 0) {
          showToast(vres?.message || '投票创建失败');
          return;
        }
        voteId = vres?.data?.vote_id;
        if (!voteId) {
          showToast('投票创建失败');
          return;
        }
      }

      let sid: number | undefined;
      if (reserveDraft) {
        const rres = await dynamicsApi.createReserve({
          title: reserveDraft.title.trim(),
          live_plan_start_time: reserveDraft.ts,
        });
        if (rres?.code !== 0) {
          showToast(rres?.message || '预约创建失败');
          return;
        }
        sid = rres?.data?.sid;
        if (!sid) {
          showToast('预约创建失败');
          return;
        }
      }

      const contents = buildContents(
        text,
        mentions,
        voteDraft && voteId ? { title: voteDraft.title.trim(), voteId } : null,
      );
      const dynReq: DynReq = {
        content: { contents },
        scene: uploadedUrls.length ? 2 : 1,
        ...(uploadedUrls.length
          ? { pics: { pics: uploadedUrls.map((src) => ({ img_src: src })) } }
          : {}),
        option: {},
        ...(sid
          ? {
              attach_card: {
                common_card: { type: 14, biz_id: sid, reserve_source: 0, reserve_lottery: 0 },
              },
            }
          : {}),
        ...(topic
          ? { topic: { id: topic.id, name: topic.name, from_source: 'dyn.web.list', from_topic_id: 0 } }
          : {}),
        upload_id: await generateUploadIdAsync(String(userInfo?.mid ?? 0)),
        meta: { app_meta: { from: 'create.dynamic.web', mobi_app: 'web' } },
      };
      const res = await post(
        apiClient,
        Api.createDynamic,
        JSON.stringify({ dyn_req: dynReq }),
        {
          platform: 'web',
          csrf: getCSRF(),
          'x-bili-device-req-json': encodeURIComponent(JSON.stringify({ platform: 'web', device: 'pc' })),
          'x-bili-web-req-json': encodeURIComponent(JSON.stringify({ spm_id: '333.999' })),
        },
        { headers: { 'Content-Type': 'application/json' } },
      );
      if (res?.code !== 0) {
        showToast(res?.message || '发布失败');
        return;
      }
      feedBackSuccess();
      showToast('发布成功');
      router.back();
    } catch (e) {
      console.error('publish dynamic error:', e);
      showToast('发布失败，请重试');
    } finally {
      setPublishing(false);
    }
  };

  return {
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
    multiChoice: voteDraft?.choiceCnt === 2,
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
  };
}
