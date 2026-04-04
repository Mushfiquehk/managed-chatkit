import { msalInstance, loginRequest, useMsalAuth } from "./msalConfig";
import type { SilentRequest } from "@azure/msal-browser";

/**
 * Acquire an ID token silently for the active account.
 * Falls back to redirect-based login if silent acquisition fails.
 */
export async function acquireIdToken(): Promise<string> {
  if (!useMsalAuth) {
    return "";
  }

  if (!msalInstance) {
    throw new Error("MSAL is enabled but not initialized");
  }

  const account = msalInstance.getActiveAccount();
  if (!account) {
    await msalInstance.loginRedirect(loginRequest);
    throw new Error("Redirecting to login...");
  }

  const silentRequest: SilentRequest = {
    ...loginRequest,
    account,
  };

  try {
    const response = await msalInstance.acquireTokenSilent(silentRequest);
    return response.idToken;
  } catch {
    await msalInstance.acquireTokenRedirect(loginRequest);
    throw new Error("Redirecting to acquire token...");
  }
}
