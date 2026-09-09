import { describe, expect, it } from 'vitest';
import { dayActivitiesToDrafts, draftsToPayload, makeEmptyActivity } from '@/lib/activityDraft';
import type { Activity } from '@/types';

describe('activity draft identity', () => {
  it('keeps stored identity through editing even if the render key changes', () => {
    const activity: Activity = {
      revision: 0,
      id: '507f1f77bcf86cd799439015',
      title: 'Original',
      type: 'other',
      time: null,
      end_time: null,
      location: null,
      location_name: '',
      note: '',
      confirmation_code: '',
      attachments: [],
    };
    const [draft] = dayActivitiesToDrafts([activity]);
    draft.key = 'different-render-key';
    draft.title = 'Edited';
    expect(draftsToPayload([draft])[0]).toMatchObject({ id: activity.id, title: 'Edited' });
  });

  it('marks new activities explicitly without sending their temporary render keys', () => {
    const draft = makeEmptyActivity();
    draft.title = 'New';
    const [payload] = draftsToPayload([draft]);
    expect(draft.key).toBeTruthy();
    expect(payload.id).toBeNull();
    expect(payload).not.toHaveProperty('key');
  });
});
