import mongoose from 'mongoose';
import {
  clientRequestIdSchema,
  avatarWriteInput,
  avatarWriteCommandInput,
} from '@travel-budget/contracts';
import { dbConnect } from '@/lib/mongodb';
import {
  AvatarWriteError,
  readAvatar,
  beginAvatarWrite,
  avatarWriteStatus,
  commandAvatarWrite,
} from '@/lib/avatarWrite';
import { requireMobileUser } from './session';
import { ApiError, readBody } from './http';
export async function avatarOperation(
  request: Request,
  operation: 'read' | 'begin' | 'status' | 'command',
  uuid?: string
) {
  const actor = await requireMobileUser(request);
  if (uuid && !clientRequestIdSchema.safeParse(uuid).success)
    throw new ApiError(400, 'VALIDATION_ERROR');
  await dbConnect();
  const db = mongoose.connection.db!;
  try {
    if (operation === 'read') return await readAvatar(db, actor.id);
    if (operation === 'begin')
      return await beginAvatarWrite(db, actor.id, await readBody(request, avatarWriteInput));
    if (operation === 'status') return await avatarWriteStatus(db, actor.id, uuid!);
    return await commandAvatarWrite(
      db,
      actor.id,
      uuid!,
      (await readBody(request, avatarWriteCommandInput)).action
    );
  } catch (error) {
    if (error instanceof AvatarWriteError)
      throw new ApiError(
        ['NOT_FOUND', 'REQUEST_NOT_FOUND'].includes(error.code)
          ? 404
          : error.code === 'VALIDATION_ERROR'
            ? 400
            : 409,
        error.code
      );
    throw error;
  }
}
