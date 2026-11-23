import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleAuthProvider, handleFirestoreError, OperationType } from '../lib/firebase.ts';

const ADMIN_EMAILS = ['maiconsillva2025@gmail.com', 'inovaprotech@gmail.com'];

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<boolean>;
  sendVerificationEmail: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  refreshAuthUser: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';

  if (code === 'auth/operation-not-allowed') {
    return 'O provedor E-mail/Senha ainda não está ativado no Firebase Console (Authentication → Sign-in method).';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'E-mail ou senha inválidos, ou usuário ainda não cadastrado no Firebase Authentication.';
  }
  if (code === 'auth/invalid-email') {
    return 'Informe um endereço de e-mail válido.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.';
  }
  return error instanceof Error ? error.message : 'Não foi possível concluir a autenticação.';
}

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

async function resolveIsAdmin(currentUser: User): Promise<boolean> {
  const email = (currentUser.email || '').toLowerCase();
  const hasPasswordProvider = currentUser.providerData.some(
    (p) => p.providerId === 'password'
  );
  if (email === 'inovaprotech@gmail.com' && hasPasswordProvider) {
    return true;
  }
  if (!currentUser.emailVerified) return false;
  if (ADMIN_EMAILS.includes(email)) return true;

  try {
    const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
    return adminDoc.exists();
  } catch {
    return false;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [, setRefreshTick] = useState(0);

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
      const adminStatus = await resolveIsAdmin(currentUser);
      setIsAdmin(adminStatus);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (error) {
      setAuthError(mapFirebaseAuthError(error));
    }
  };

  const signInWithEmailPassword = async (email: string, password: string): Promise<boolean> => {
    setAuthError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const adminStatus = await resolveIsAdmin(cred.user);
      setUser(cred.user);
      setIsAdmin(adminStatus);
      setRefreshTick((t) => t + 1);
      return true;
    } catch (error) {
      setAuthError(mapFirebaseAuthError(error));
      return false;
    }
  };

  const sendVerificationEmail = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    setAuthError(null);
    try {
      await sendEmailVerification(auth.currentUser);
      return true;
    } catch (error) {
      setAuthError(mapFirebaseAuthError(error));
      return false;
    }
  };

  const sendPasswordReset = async (email: string): Promise<boolean> => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setAuthError('Informe o e-mail administrativo para redefinir a senha.');
      return false;
    }
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      return true;
    } catch (error) {
      setAuthError(mapFirebaseAuthError(error));
      return false;
    }
  };

  const refreshAuthUser = async () => {
    if (!auth.currentUser) return;
    setAuthError(null);
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const refreshed = auth.currentUser;
      setUser(refreshed);
      const adminStatus = await resolveIsAdmin(refreshed);
      setIsAdmin(adminStatus);
      if (refreshed.emailVerified) {
        void syncCustomerProfile(refreshed);
      }
      setRefreshTick((t) => t + 1);
    } catch (error) {
      setAuthError(mapFirebaseAuthError(error));
    }
  };

  const logout = async () => {
    setAuthError(null);
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
        signInWithEmailPassword,
        sendVerificationEmail,
        sendPasswordReset,
        refreshAuthUser,
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
