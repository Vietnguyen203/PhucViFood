import { api } from './api';

export type CreatorKind = 'KOL' | 'KOC';

/** KOL/KOC như khách thấy ở trang chủ. */
export interface PublicCreator { id: string; name: string; kind: CreatorKind; headline: string | null; imageUrl: string; linkUrl: string | null }

export async function fetchCreators(signal?: AbortSignal): Promise<PublicCreator[]> {
  return (await api<PublicCreator[]>('/public/creators', { signal })).data;
}

export const CREATOR_KIND_LABEL: Record<CreatorKind, string> = { KOL: 'KOL', KOC: 'KOC' };
export const CREATOR_KIND_HINT: Record<CreatorKind, string> = { KOL: 'Người có tầm ảnh hưởng', KOC: 'Khách hàng thật chia sẻ' };
