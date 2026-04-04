import { PublicClientApplication, LogLevel } from "@azure/msal-browser";

const readEnvString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const clientId = readEnvString(import.meta.env.MSAL_CLIENT_ID);
const tenantId = readEnvString(import.meta.env.MSAL_TENANT_ID);
const redirectUri =
  readEnvString(import.meta.env.MSAL_REDIRECT_URI) ??
  window.location.origin + "/";

// Determine auth mode: MSAL if both clientId and tenantId are set, otherwise basic auth
export const useMsalAuth = !!(clientId && tenantId);

if (!useMsalAuth) {
  console.info(
    "[Auth] MSAL_CLIENT_ID or MSAL_TENANT_ID not set. Using basic password authentication."
  );
}

const authority = useMsalAuth
  ? `https://login.microsoftonline.com/${tenantId}`
  : "";

export const msalConfig = useMsalAuth
  ? {
      auth: {
        clientId: clientId!,
        authority,
        redirectUri,
        postLogoutRedirectUri: redirectUri,
        navigateToLoginRequestUrl: true,
      },
      cache: {
        cacheLocation: "sessionStorage" as const,
        storeAuthStateInCookie: false,
      },
      system: {
        loggerOptions: {
          logLevel: LogLevel.Warning,
          loggerCallback: (level: LogLevel, message: string) => {
            if (level === LogLevel.Error) console.error("[MSAL]", message);
          },
        },
      },
    }
  : null;

export const loginRequest = {
  scopes: ["openid", "profile", "email"],
};

export const msalInstance = useMsalAuth
  ? new PublicClientApplication(msalConfig!)
  : null;

if (useMsalAuth && msalInstance) {
  await msalInstance.initialize();
}
