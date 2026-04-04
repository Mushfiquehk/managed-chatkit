import { type ReactNode, useEffect, useState } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest, useMsalAuth } from "../lib/msalConfig";
import { BasicAuthPanel } from "./BasicAuthPanel";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  if (!useMsalAuth) {
    return <BasicModeAuthGuard>{children}</BasicModeAuthGuard>;
  }

  return <MsalModeAuthGuard>{children}</MsalModeAuthGuard>;
}

function BasicModeAuthGuard({ children }: AuthGuardProps) {
  const [basicAuthVerified, setBasicAuthVerified] = useState(false);

  useEffect(() => {
    const verified = sessionStorage.getItem("basicAuthVerified");
    setBasicAuthVerified(verified === "true");
  }, []);

  if (basicAuthVerified) {
    return <>{children}</>;
  }

  return <BasicAuthPanel onAuthenticate={() => setBasicAuthVerified(true)} />;
}

function MsalModeAuthGuard({ children }: AuthGuardProps) {
  const { instance, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    instance
      .handleRedirectPromise()
      .then((response) => {
        if (response?.account) {
          instance.setActiveAccount(response.account);
        } else {
          const accounts = instance.getAllAccounts();
          if (accounts.length > 0) {
            instance.setActiveAccount(accounts[0]);
          }
        }
        setIsInitializing(false);
      })
      .catch((error) => {
        console.error("[MSAL] Redirect error:", error);
        setIsInitializing(false);
      });
  }, [instance]);

  const handleLogin = () => {
    instance.loginRedirect(loginRequest);
  };

  // MSAL auth mode
  if (isInitializing || inProgress !== InteractionStatus.None) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center">
          <div className="text-lg text-slate-600 dark:text-slate-400">
            Authenticating...
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="rounded-2xl bg-white p-8 shadow-sm dark:bg-slate-900 text-center max-w-md">
          <h1 className="mb-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Sign in to continue
          </h1>
          <p className="mb-6 text-slate-600 dark:text-slate-400">
            Pioni is ready to assist you!
          </p>
          <button
            onClick={handleLogin}
            className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Sign in with Microsoft
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
