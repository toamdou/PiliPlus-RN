export function formatCount(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toString();
}

export function parseChineseNumber(str: string | undefined | null): number {
  if (!str || str === '-') return 0;
  const match = str.match(/([\d.]+)\s*([千万亿])?/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return 0;
  const unit = match[2];
  if (unit === '千') return Math.floor(num * 1000);
  if (unit === '万') return Math.floor(num * 10000);
  if (unit === '亿') return Math.floor(num * 100000000);
  return Math.floor(num);
}

export function normalizeHttpUrl(url: string): string {
  const u = (url || '').trim();
  if (!u) return u;
  if (u.startsWith('//')) return `https:${u}`;
  if (/^http:\/\//i.test(u)) return u.replace(/^http:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(u)) return `https://${u}`;
  return u;
}

export function stripHtml(text: string): string {
  return (text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function formatDuration(s: number): string {
  let value = typeof s === 'number' && Number.isFinite(s) ? s : 0;
  if (value < 0) value = 0;
  const total = Math.floor(value);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function formatTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
  if (diff < 2592000) return Math.floor(diff / 86400) + '天前';
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

export function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}
