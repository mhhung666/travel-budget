import { Checklist } from '@/models';
import { toChecklistDto, type ChecklistDtoInput } from '@/lib/dto';
/** Internal service: all callers must authorize the trip before reading its child collections. */
export async function readChecklists(tripId: string) {
  const lists = await Checklist.find({ trip: tripId })
    .sort({ createdAt: 1 })
    .populate({ path: 'items.assignee', select: 'username displayName' })
    .lean<ChecklistDtoInput[]>();
  return lists.map(toChecklistDto);
}
