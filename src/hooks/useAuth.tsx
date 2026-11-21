import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleAuthProvider, handleFirestoreError, OperationType } from '../lib/firebase.ts';

const OWNER_EMAIL = 'maiconsillva2025@gmail.com';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function syncCustomerProfile(currentUser: User): Promise<void> {
  if (!currentUser.emailVerified || !currentUser.email) return;
  const path = `users/${currentUser.uid}`;
  const userRef = doc(db, 'users', currentUser.uid);
  const displayName = (
    currentUser.displayName ||
    currentUser.email.split('@')[0] ||
    'Cliente'
  )
    .trim()
    .slice(0, 120);
  const email = currentUser.email.trim().slice(0, 160);
  const photoUrl = (currentUser.photoURL || '').trim().slice(0, 500);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: currentUser.uid,
        displayName,
        email,
        photoUrl,
        role: 'customer',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = snap.data() as {
        displayName?: string;
        email?: string;
        photoUrl?: string;
      };
      if (
        existing.displayName !== displayName ||
        existing.email !== email ||
        (existing.photoUrl || '') !== photoUrl
      ) {
        await updateDoc(userRef, {
          displayName,
          email,
          photoUrl,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch {
      // Logged via handleFirestoreError without blocking auth initialization
    }
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthError(null);
      if (!currentUser) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      void syncCustomerProfile(currentUser);

      if (currentUser.emailVerified && currentUser.email?.toLowerCase() === OWNER_EMAIL) {
        setIsAdmin(true);
        setLoading(false);
        return;
      }

      try {
        const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
        setIsAdmin(adminDoc.exists() && currentUser.emailVerified);
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Não foi possível concluir o login.';
      setAuthError(msg);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const getIdToken = async () => {
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        authError,
        signInWithGoogle,
        logout,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return ctx;
}
