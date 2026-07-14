import { describe, expect, it } from 'vitest';
import {
  markdownLineToPlain,
  summarizeNote,
  shouldCollapseNote,
  toggleNoteTask,
} from '@/lib/noteMarkdown';

describe('markdownLineToPlain', () => {
  it('strips heading / list / blockquote prefixes', () => {
    expect(markdownLineToPlain('# 東京美食清單')).toBe('東京美食清單');
    expect(markdownLineToPlain('## 標題二')).toBe('標題二');
    expect(markdownLineToPlain('- 一蘭拉麵')).toBe('一蘭拉麵');
    expect(markdownLineToPlain('3. 淺草寺')).toBe('淺草寺');
    expect(markdownLineToPlain('> 引用一句話')).toBe('引用一句話');
    expect(markdownLineToPlain('- [ ] 買 SIM 卡')).toBe('買 SIM 卡');
    expect(markdownLineToPlain('- [x] 訂機票')).toBe('訂機票');
  });

  it('strips inline emphasis, code, links and images', () => {
    expect(markdownLineToPlain('**必吃**的`拉麵`店')).toBe('必吃的拉麵店');
    expect(markdownLineToPlain('[官網](https://example.com) 預約')).toBe('官網 預約');
    expect(markdownLineToPlain('![菜單照片](https://example.com/a.jpg)')).toBe('菜單照片');
    expect(markdownLineToPlain('~~取消~~ 改天')).toBe('取消 改天');
  });

  it('keeps plain text untouched', () => {
    expect(markdownLineToPlain('想去藍瓶咖啡')).toBe('想去藍瓶咖啡');
  });
});

describe('summarizeNote', () => {
  it('uses the first non-empty line as title and joins the rest as excerpt', () => {
    const { title, excerpt } = summarizeNote('# 美食清單\n\n- 一蘭\n- 鰻魚飯');
    expect(title).toBe('美食清單');
    expect(excerpt).toBe('一蘭 鰻魚飯');
  });

  it('skips horizontal rules and keeps fenced code content as plain text', () => {
    const { title, excerpt } = summarizeNote('標題\n---\n```\n- [ ] not a task\n```\n結尾');
    expect(title).toBe('標題');
    expect(excerpt).toBe('- [ ] not a task 結尾');
  });

  it('returns empty strings for whitespace-only text', () => {
    expect(summarizeNote('  \n \n')).toEqual({ title: '', excerpt: '' });
  });
});

describe('shouldCollapseNote', () => {
  it('keeps short memos expanded', () => {
    expect(shouldCollapseNote('想去藍瓶咖啡')).toBe(false);
    expect(shouldCollapseNote('第一行\n第二行\n第三行')).toBe(false);
  });

  it('collapses notes with many lines or long text', () => {
    expect(shouldCollapseNote('1\n2\n3\n4\n5')).toBe(true);
    expect(shouldCollapseNote('あ'.repeat(161))).toBe(true);
  });
});

describe('toggleNoteTask', () => {
  const text = '# 行前準備\n- [ ] 買 SIM 卡\n- [x] 訂機票\n- 一般清單項目\n- [ ] 換日幣';

  it('checks an unchecked task by render-order index', () => {
    expect(toggleNoteTask(text, 0)).toContain('- [x] 買 SIM 卡');
  });

  it('unchecks a checked task', () => {
    expect(toggleNoteTask(text, 1)).toContain('- [ ] 訂機票');
  });

  it('skips non-task list items when counting', () => {
    expect(toggleNoteTask(text, 2)).toContain('- [x] 換日幣');
  });

  it('returns null when the index is out of range or negative', () => {
    expect(toggleNoteTask(text, 3)).toBeNull();
    expect(toggleNoteTask(text, -1)).toBeNull();
  });

  it('ignores task-like lines inside fenced code blocks', () => {
    const withFence = '```\n- [ ] code 裡的\n```\n- [ ] 真的任務';
    expect(toggleNoteTask(withFence, 0)).toBe('```\n- [ ] code 裡的\n```\n- [x] 真的任務');
  });

  it('handles indented and blockquoted tasks', () => {
    expect(toggleNoteTask('- 外層\n  - [ ] 巢狀任務', 0)).toContain('  - [x] 巢狀任務');
    expect(toggleNoteTask('> - [ ] 引用內任務', 0)).toContain('> - [x] 引用內任務');
  });

  it('does not treat "[x]abc" without trailing whitespace as a task', () => {
    expect(toggleNoteTask('- [ ]沒有空白', 0)).toBeNull();
  });
});
