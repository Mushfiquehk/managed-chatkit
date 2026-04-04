import { useState } from "react";

interface BasicAuthPanelProps {
  onAuthenticate: () => void;
}

export function BasicAuthPanel({ onAuthenticate }: BasicAuthPanelProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        // Password verified, store session and authenticate
        sessionStorage.setItem("basicAuthVerified", "true");
        onAuthenticate();
      } else {
        const data = await response.json();
        setError(data.error || "Invalid password");
        setPassword("");
      }
    } catch (err) {
      setError("Authentication failed. Please try again.");
      console.error("[BasicAuth] Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
      <div className="rounded-2xl bg-white p-8 shadow-sm dark:bg-slate-900 w-full max-w-md">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Access Required
        </h1>
        <p className="mb-6 text-slate-600 dark:text-slate-400">
          Enter the password to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={isLoading}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 dark:focus:ring-blue-900 disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900 dark:text-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password.trim()}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Verifying..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
