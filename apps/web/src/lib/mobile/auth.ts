import {
  loginInput,
  refreshInput,
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
import { ApiError, readBody } from './http';
import { loginMobile, logoutMobile, refreshMobile, requireMobileUser } from './session';

export type MobileAuthOperation =
  | 'login'
  | 'refresh'
  | 'logout'
  | 'register'
  | 'passwordResetRequest'
  | 'passwordResetConfirm'
  | 'me';

/**
 * Auth/account handler behind the `/api/v2` auth routes.
 * No trip ledger is involved, and nothing here rotates tokens beyond the normal refresh.
 */
export async function mobileAuth(request: Request, operation: MobileAuthOperation) {
  switch (operation) {
    case 'login': {
      const body = await readBody(request, loginInput);
      return loginMobile(body.username, body.password);
    }
    case 'refresh':
      return refreshMobile((await readBody(request, refreshInput)).refreshToken);
    case 'logout':
      return logoutMobile((await readBody(request, refreshInput)).refreshToken);
    case 'me':
      return requireMobileUser(request);
    default:
      return accountRequest(request, operation);
  }
}

async function accountRequest(
  request: Request,
  mode: 'register' | 'passwordResetRequest' | 'passwordResetConfirm'
) {
  try {
    // Public, anonymous and cookie-independent. No credential/session is created here.
    if (mode === 'register') {
      const body = await readBody(request, registerInput);
      const { db, context } = await accountEnvironment(request.headers);
      return await registerAccount(db, body, context);
    }
    if (mode === 'passwordResetRequest') {
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
}
