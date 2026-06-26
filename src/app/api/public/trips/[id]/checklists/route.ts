import { NextResponse } from 'next/server';
import { Checklist } from '@/models';
import { withPublicTrip } from '@/lib/withPublicTrip';
import { toChecklistDto, type ChecklistDtoInput } from '@/lib/dto';

/**
 * Public API to get checklists for a trip.
 * Anyone with the share link can view (read-only; no auth required).
 */
export const GET = withPublicTrip(
  async ({ tripId }) => {
    const lists = await Checklist.find({ trip: tripId })
      .sort({ createdAt: 1 })
      .populate({ path: 'items.assignee', select: 'username displayName' })
      .lean<ChecklistDtoInput[]>();

    return NextResponse.json({ checklists: lists.map(toChecklistDto) });
  },
  { logLabel: 'Get public checklists error' }
);
