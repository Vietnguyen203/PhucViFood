import { describe, expect, it } from 'vitest';
import { bannerState, fromLocalInput, toLocalInput } from './banner';

const NOW = new Date('2026-11-27T10:00:00Z');
const hour = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();

describe('trạng thái banner', () => {
  it('đã tắt thắng mọi lịch', () => {
    expect(bannerState({ isActive: false, startsAt: null, endsAt: null }, NOW)).toBe('OFF');
    expect(bannerState({ isActive: false, startsAt: hour(-5), endsAt: hour(5) }, NOW)).toBe('OFF');
  });
  it('không lịch hoặc trong lịch: đang hiện', () => {
    expect(bannerState({ isActive: true, startsAt: null, endsAt: null }, NOW)).toBe('LIVE');
    expect(bannerState({ isActive: true, startsAt: hour(-1), endsAt: hour(1) }, NOW)).toBe('LIVE');
    expect(bannerState({ isActive: true, startsAt: hour(0), endsAt: null }, NOW)).toBe('LIVE'); // đúng giờ bắt đầu thì đã hiện
  });
  it('chưa tới lịch và hết hạn (đúng giờ kết thúc là đã hết)', () => {
    expect(bannerState({ isActive: true, startsAt: hour(1), endsAt: null }, NOW)).toBe('UPCOMING');
    expect(bannerState({ isActive: true, startsAt: null, endsAt: hour(0) }, NOW)).toBe('EXPIRED');
    expect(bannerState({ isActive: true, startsAt: null, endsAt: hour(-1) }, NOW)).toBe('EXPIRED');
  });
});

describe('ô ngày giờ', () => {
  it('qua lại giữa ISO và datetime-local giữ nguyên thời điểm (đến phút)', () => {
    const iso = '2026-12-01T03:30:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });
  it('rỗng hoặc sai thì rỗng/null', () => {
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput('khong-phai-ngay')).toBe('');
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('hom-qua')).toBeNull();
  });
});
