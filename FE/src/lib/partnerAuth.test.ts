import { describe, expect, it } from 'vitest';
import { passwordIssues } from './partnerAuth';
import { shareUrl } from './partner';

describe('passwordIssues', () => {
  it('hợp lệ', () => expect(passwordIssues('matkhau123')).toEqual([]));
  it('quá ngắn', () => expect(passwordIssues('abc1')).toHaveLength(1));
  it('thiếu chữ số', () => expect(passwordIssues('chuchuchu')[0]).toMatch(/chữ số/));
  it('thiếu chữ cái', () => expect(passwordIssues('12345678')[0]).toMatch(/chữ cái/));
  it('đếm ký tự Unicode đủ, không đếm byte', () => expect(passwordIssues('đđđđđđđ1')).toEqual([]));
});

describe('shareUrl', () => {
  it('ghép tên miền với đường dẫn', () => expect(shareUrl('https://a.vn/', '/r/linh01?c=zalo')).toBe('https://a.vn/r/linh01?c=zalo'));
});
