import { api } from './api';

/** Ô tròn lối tắt như khách thấy ở trang chủ. */
export interface PublicShortcut { id: string; title: string; imageUrl: string; linkUrl: string | null }

export async function fetchShortcuts(signal?: AbortSignal): Promise<PublicShortcut[]> {
  return (await api<PublicShortcut[]>('/public/shortcuts', { signal })).data;
}
