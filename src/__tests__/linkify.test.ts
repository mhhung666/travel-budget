import { describe, it, expect } from 'vitest';
import { linkify } from '@/lib/linkify';

describe('linkify', () => {
  it('純文字無網址時原樣單段回傳', () => {
    expect(linkify('hello world')).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('抓出行首行尾的網址並保留前後文字', () => {
    const segs = linkify('看這個 https://example.com/page 很讚');
    expect(segs).toEqual([
      { type: 'text', value: '看這個 ' },
      { type: 'link', href: 'https://example.com/page', display: 'example.com/page' },
      { type: 'text', value: ' 很讚' },
    ]);
  });

  it('多個網址各自成段', () => {
    const segs = linkify('a http://a.com b https://b.com');
    expect(segs.filter((s) => s.type === 'link')).toHaveLength(2);
  });

  it('去掉 scheme、www 與尾斜線做顯示', () => {
    const [seg] = linkify('https://www.example.com/');
    expect(seg).toEqual({
      type: 'link',
      href: 'https://www.example.com/',
      display: 'example.com',
    });
  });

  it('過長網址截短並加省略號，但 href 保持完整', () => {
    const long = 'https://example.com/' + 'a'.repeat(60);
    const [seg] = linkify(long);
    if (seg.type !== 'link') throw new Error('expected link');
    expect(seg.href).toBe(long);
    expect(seg.display.endsWith('…')).toBe(true);
    expect(seg.display.length).toBeLessThanOrEqual(32);
  });

  it('尾隨標點不納入連結，退回文字段', () => {
    const segs = linkify('見 https://example.com。');
    expect(segs).toEqual([
      { type: 'text', value: '見 ' },
      { type: 'link', href: 'https://example.com', display: 'example.com' },
      { type: 'text', value: '。' },
    ]);
  });

  it('markdown 式括號不吃進右括號', () => {
    const segs = linkify('(https://example.com)');
    expect(segs).toEqual([
      { type: 'text', value: '(' },
      { type: 'link', href: 'https://example.com', display: 'example.com' },
      { type: 'text', value: ')' },
    ]);
  });

  it('非 http 的文字不轉連結', () => {
    expect(linkify('ftp://x.com and foo@bar.com')).toEqual([
      { type: 'text', value: 'ftp://x.com and foo@bar.com' },
    ]);
  });

  it('保留換行給 whitespace-pre-wrap', () => {
    const segs = linkify('line1\nhttps://a.com\nline2');
    expect(segs[0]).toEqual({ type: 'text', value: 'line1\n' });
    expect(segs[2]).toEqual({ type: 'text', value: '\n' + 'line2' });
  });
});
