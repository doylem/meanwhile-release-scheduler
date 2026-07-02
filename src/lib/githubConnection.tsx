import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { GITHUB_OWNER, GITHUB_REPO } from './clientConfig';

const TOKEN_KEY = 'meanwhile-github-pat';

export interface GithubConnection {
  token: string;
  owner: string;
  repo: string;
}

const GithubConnectionContext = createContext<{
  connection: GithubConnection | null;
  setToken: (token: string) => void;
  disconnect: () => void;
}>({ connection: null, setToken: () => {}, disconnect: () => {} });

export function GithubConnectionProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) setTokenState(stored);
  }, []);

  function setToken(value: string) {
    sessionStorage.setItem(TOKEN_KEY, value);
    setTokenState(value);
  }

  function disconnect() {
    sessionStorage.removeItem(TOKEN_KEY);
    setTokenState(null);
  }

  const connection = token ? { token, owner: GITHUB_OWNER, repo: GITHUB_REPO } : null;

  return (
    <GithubConnectionContext.Provider value={{ connection, setToken, disconnect }}>
      {children}
    </GithubConnectionContext.Provider>
  );
}

export function useGithubConnection() {
  return useContext(GithubConnectionContext);
}
