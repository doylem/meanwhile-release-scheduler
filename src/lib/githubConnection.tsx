import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { GITHUB_OWNER, GITHUB_REPO } from './clientConfig';

const SESSION_KEY = 'meanwhile-github-pat';
const LOCAL_KEY = 'meanwhile-github-pat-persistent';

export interface GithubConnection {
  token: string;
  owner: string;
  repo: string;
}

const GithubConnectionContext = createContext<{
  connection: GithubConnection | null;
  isPersistent: boolean;
  setToken: (token: string, remember: boolean) => void;
  disconnect: () => void;
}>({ connection: null, isPersistent: false, setToken: () => {}, disconnect: () => {} });

export function GithubConnectionProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [isPersistent, setIsPersistent] = useState(false);

  useEffect(() => {
    const persistent = localStorage.getItem(LOCAL_KEY);
    if (persistent) {
      setTokenState(persistent);
      setIsPersistent(true);
      return;
    }
    const session = sessionStorage.getItem(SESSION_KEY);
    if (session) setTokenState(session);
  }, []);

  function setToken(value: string, remember: boolean) {
    if (remember) {
      localStorage.setItem(LOCAL_KEY, value);
      sessionStorage.removeItem(SESSION_KEY);
      setIsPersistent(true);
    } else {
      sessionStorage.setItem(SESSION_KEY, value);
      localStorage.removeItem(LOCAL_KEY);
      setIsPersistent(false);
    }
    setTokenState(value);
  }

  function disconnect() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LOCAL_KEY);
    setTokenState(null);
    setIsPersistent(false);
  }

  const connection = token ? { token, owner: GITHUB_OWNER, repo: GITHUB_REPO } : null;

  return (
    <GithubConnectionContext.Provider value={{ connection, isPersistent, setToken, disconnect }}>
      {children}
    </GithubConnectionContext.Provider>
  );
}

export function useGithubConnection() {
  return useContext(GithubConnectionContext);
}
