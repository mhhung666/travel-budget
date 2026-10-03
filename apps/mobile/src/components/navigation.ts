import { router, type Href } from 'expo-router';

/** Go back in the stack; a screen opened by a deep link has no history, so use its parent route. */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
