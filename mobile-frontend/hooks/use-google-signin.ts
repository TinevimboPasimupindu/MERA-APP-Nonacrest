import { useEffect, useRef, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

import { apiCall, ENDPOINTS, saveToken } from '../services/api';
import { routeAfterAuth } from '../utils/route-after-auth';

// Required once per app so the in-app browser used for the Google consent
// screen actually closes and hands control back to this app when done —
// without this, promptAsync()'s returned promise never resolves.
WebBrowser.maybeCompleteAuthSession();

type ConsentFlags = { popi_consent?: boolean; terms_consent?: boolean };

// Shared by login.tsx and register.tsx — both need the same request setup,
// token exchange, and backend round trip; only the consent flags they send
// differ (register.tsx has a real checkbox to source them from, login.tsx
// doesn't collect consent at all — see accounts/views.py::GoogleSignInView
// for why that's fine: a brand-new email hitting this from login.tsx comes
// back with needs_registration instead of silently creating an account
// with no consent, surfaced here as a plain error message).
export function useGoogleSignIn(consent: ConsentFlags = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Re-read on every call without needing signIn() itself to change
  // identity each time the caller's consent value changes (e.g.
  // register.tsx's checkbox toggling) — signIn is only ever called from a
  // button's onPress, never depended on by an effect.
  const consentRef = useRef(consent);
  consentRef.current = consent;

  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  // Google Sign-In is currently paused (see PROJECT_CONTEXT.md — blocked
  // on an Expo dev-build migration), and these env vars can legitimately
  // be absent in any given environment (e.g. mobile-frontend/.env doesn't
  // exist at all right now). That must never crash the screens this hook
  // is used from: expo-auth-session's useIdTokenAuthRequest calls
  // invariantClientId() internally, which throws a real synchronous Error
  // — not a rejected promise — the moment it sees a literally `undefined`
  // client id, during the *first render*, with no way to catch it from
  // outside. Confirmed by reading the installed library's source
  // (node_modules/expo-auth-session/build/providers/ProviderUtils.js):
  // `if (typeof value === 'undefined') throw new Error(...)`.
  //
  // The fix has two parts:
  //  1. Never pass `undefined` — fall back to '' below. invariantClientId
  //     only checks for `undefined` specifically, so an empty string
  //     satisfies it without throwing (the resulting request is simply
  //     never usable, which is fine — signIn() refuses to run it either).
  //  2. Expose `isConfigured` so callers (login.tsx/register.tsx) can
  //     hide or disable the "Continue with Google" button entirely
  //     instead of rendering a button that would fail if pressed.
  const isConfigured = Boolean(iosClientId && webClientId);

  // Google Cloud Console's Web client needs this exact value listed under
  // "Authorized redirect URIs" before sign-in will work at all, and it
  // isn't something that can be predicted ahead of time — it depends on
  // the exact runtime (Expo Go's own dev-server address vs. a real
  // standalone build). Logged on every mount so it's visible in the Metro
  // console on first run; __DEV__-only since it's meaningless in a
  // production build (redirectUriOptions aren't overridden here, so this
  // is computed the same way useIdTokenAuthRequest computes its own below —
  // see the reasoning note in PROJECT_CONTEXT.md). Only logged once
  // actually configured — nothing to set up in Google Cloud Console for a
  // build that isn't attempting Google Sign-In at all.
  const redirectUri = AuthSession.makeRedirectUri();
  useEffect(() => {
    if (__DEV__ && isConfigured) {
      console.log(
        '[Google Sign-In] Redirect URI — add this exact value to the Web ' +
        'client\'s "Authorized redirect URIs" in Google Cloud Console:',
        redirectUri
      );
    }
  }, [redirectUri, isConfigured]);

  // Always called, unconditionally, on every render — hooks can't be
  // conditional — but with '' fallbacks so it never throws. See the
  // isConfigured comment above for why this is safe.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: iosClientId || '',
    webClientId: webClientId || '',
  });

  // useIdTokenAuthRequest resolves an id_token two different ways
  // depending on platform (confirmed by reading its installed source, not
  // assumed): on web it comes back directly in the first successful
  // response; on iOS it goes through a code+auto-exchange round trip, so
  // the first "success" response doesn't have params.id_token yet — only
  // a later re-render of `response`, once the exchange finishes, does.
  // Watching `response` in an effect (rather than only the promptAsync()
  // return value) handles both cases the same way without branching on
  // platform here.
  useEffect(() => {
    if (!isConfigured) return;

    const idToken = response?.type === 'success' ? response.params?.id_token : undefined;

    if (idToken) {
      (async () => {
        try {
          const data = await apiCall(ENDPOINTS.googleSignIn, 'POST', {
            id_token: idToken,
            ...consentRef.current,
          });
          await saveToken(data.access, data.refresh);
          await routeAfterAuth(data.user.role);
        } catch (err: any) {
          setError(
            err.needs_registration
              ? 'No account found for this Google email. Please register first.'
              : err.detail || 'Google sign-in failed. Please try again.'
          );
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    if (response?.type === 'error') {
      setError('Google sign-in failed. Please try again.');
      setLoading(false);
    } else if (response?.type === 'dismiss' || response?.type === 'cancel') {
      // User backed out of the Google account picker — not an error.
      setLoading(false);
    }
  }, [response, isConfigured]);

  const signIn = async () => {
    // Defense-in-depth: canSignIn (below) already tells callers to hide
    // or disable the button when unconfigured, but guard the action
    // itself too in case something ever calls signIn() directly.
    if (!isConfigured) return;

    setError('');
    setLoading(true);
    const result = await promptAsync();
    // A success result here is only the first (pre-exchange, on iOS) leg —
    // loading stays true until the effect above actually resolves an
    // id_token and completes the backend round trip. Anything else
    // (cancelled, dismissed, errored) has nothing further to wait for.
    if (result?.type !== 'success') {
      setLoading(false);
    }
  };

  return { signIn, loading, error, canSignIn: isConfigured && !!request, isConfigured, redirectUri };
}
