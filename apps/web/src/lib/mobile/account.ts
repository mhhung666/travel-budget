import {
  registerInput,
  passwordResetRequestInput,
  passwordResetInput,
} from '@travel-budget/contracts';
import {
  AccountEntryError,
  registerAccount,
  requestAccountReset,
  confirmAccountReset,
} from '../accountEntry';
import { accountEnvironment, deliverAccountReset } from '../accountAdapter';
import { apiResponse, ApiError, readBody } from './http';

export function accountRequest(request: Request, mode: 'register' | 'request' | 'confirm') {
  return apiResponse(async () => {
    try {
      // Public, anonymous and cookie-independent. No credential/session is created here.
      if (mode === 'register') {
        const body = await readBody(request, registerInput);
        const { db, context } = await accountEnvironment(request.headers);
        return await registerAccount(db, body, context);
      }
      if (mode === 'request') {
        const body = await readBody(request, passwordResetRequestInput);
        const { db, context } = await accountEnvironment(request.headers);
        return await requestAccountReset(db, body, context, deliverAccountReset);
      }
      const body = await readBody(request, passwordResetInput);
      const { db, context } = await accountEnvironment(request.headers);
      return await confirmAccountReset(db, body, context);
    } catch (error) {
      if (error instanceof AccountEntryError)
        throw new ApiError(
          error.code === 'RATE_LIMITED' ? 429 : error.code === 'ACCOUNT_CONFLICT' ? 409 : 400,
          error.code,
          error.retryAfter
        );
      throw error;
    }
  });
}
