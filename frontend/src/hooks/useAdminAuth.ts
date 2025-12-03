import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';

import { auth } from '../lib/firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  error?: string;
  supported: boolean;
}

export function useAdminAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: Boolean(auth),
    supported: Boolean(auth),
  });

  useEffect(() => {
    if (!auth) {
      setState((prev) => ({ ...prev, loading: false, supported: false }));
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setState({ user, loading: false, supported: true });
    });
    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!auth) return;
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: (error as Error).message,
        loading: false,
      }));
    }
  };

  const signOutUser = async () => {
    if (!auth) return;
    await signOut(auth);
  };

  return {
    ...state,
    signIn,
    signOut: signOutUser,
  };
}

