import React, { useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider 
} from 'firebase/auth';
import { setDoc, doc, getDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { LiquidGlassCard } from './LiquidGlassCard';
import { Mail, Lock, User, Film, Eye } from 'lucide-react';

interface AuthProps {
  onAuthSuccess: (uid: string) => void;
  onDemoLogin: (guestName: string) => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess, onDemoLogin }) => {
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const generateFriendCode = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (isRegistering && !name)) {
      setError('Please fill in all fields');
      return;
    }
    
    setError('');
    setLoading(true);

    try {
      if (isRegistering) {
        // Register user with email and password
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const friendCode = generateFriendCode();
        
        const profileData = {
          uid: user.uid,
          name: name,
          email: email,
          profilePic: '🐧', // Cute default penguin emoji!
          themeColor: 'sky', // Default liquid-sky accent
          friendCode: friendCode,
          friends: []
        };

        const path = `users/${user.uid}`;
        try {
          await setDoc(doc(db, 'users', user.uid), profileData);
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.CREATE, path);
        }
        
        sessionStorage.setItem('just_logged_in', 'true');
        onAuthSuccess(user.uid);
      } else {
        // Sign in user
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        sessionStorage.setItem('just_logged_in', 'true');
        onAuthSuccess(userCredential.user.uid);
      }
    } catch (err: any) {
      console.error("Auth Error Object:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered! Please click "Sign In" below or reset password.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password. Please double check your password.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found for this email. Click "Create Account" below to register first!');
      } else if (err.code === 'auth/invalid-credential') {
        setError('Invalid credentials or account does not exist yet. If you haven\'t created an account, click "Create Account" below!');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Domain not authorized in Firebase! Please add "penguin-view.netlify.app" to Firebase Console > Authentication > Settings > Authorized domains.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('auth/operation-not-allowed');
      } else {
        setError(err.message || 'An error occurred during authentication.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // Check if user profile already exists
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        const friendCode = generateFriendCode();
        const profileData = {
          uid: user.uid,
          name: user.displayName || 'Penguin Watcher',
          email: user.email || '',
          profilePic: '🐧',
          themeColor: 'sky',
          friendCode: friendCode,
          friends: []
        };
        const path = `users/${user.uid}`;
        try {
          await setDoc(userDocRef, profileData);
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.CREATE, path);
        }
      }

      sessionStorage.setItem('just_logged_in', 'true');
      onAuthSuccess(user.uid);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] p-4 font-sans relative">
      {/* Dynamic Background Gradients */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Floating Logo App Title */}
      <div className="flex flex-col items-center mb-8 z-10 text-center animate-fade-in">
        <div className="w-20 h-20 rounded-[28%] bg-gradient-to-tr from-sky-400 via-indigo-500 to-purple-600 p-[2px] shadow-2xl mb-4 hover:scale-105 transition-transform duration-300">
          <div className="w-full h-full rounded-[26%] bg-[#0e1424]/90 flex items-center justify-center backdrop-blur-md">
            <span className="text-4xl animate-bounce">🐧</span>
          </div>
        </div>
        <h1 className="text-4xl font-extrabold font-display tracking-tight bg-gradient-to-r from-sky-300 via-indigo-200 to-purple-300 bg-clip-text text-transparent">
          Penguin View
        </h1>
        <p className="text-slate-400 text-sm mt-2 max-w-sm font-light">
          Real-Time Video Syncing across the globe with gorgeous liquid glass aesthetics.
        </p>
      </div>

      <LiquidGlassCard id="auth-card" className="w-full max-w-md" intensity="glass">
        <h2 className="text-2xl font-semibold text-white mb-6 font-display flex items-center gap-2">
          <Film className="w-5 h-5 text-sky-400" />
          {isRegistering ? 'Create Account' : 'Welcome Back'}
        </h2>

        {error && (error.includes('operation-not-allowed') || error.includes('auth/operation-not-allowed')) ? (
          <div className="p-3.5 mb-5 text-sm bg-indigo-950/60 border border-indigo-500/40 rounded-xl text-indigo-200 animate-fade-in">
            <p className="font-semibold mb-1 flex items-center gap-1.5 text-indigo-300">
              <Film className="w-4 h-4 text-sky-400" />
              Firebase Auth provider is disabled
            </p>
            <p className="text-[11px] text-indigo-300/80 mb-3 leading-relaxed">
              This is because <strong>Email/Password</strong> sign-in isn't turned on in your Firebase settings yet. Don't worry! You can bypass this instantly and test-drive the complete sync engine right now:
            </p>
            <button
              type="button"
              onClick={() => onDemoLogin(name || 'Penguin Watcher')}
              className="w-full py-2 bg-gradient-to-r from-sky-400 to-indigo-500 hover:from-sky-500 hover:to-indigo-600 text-white font-semibold rounded-lg text-xs shadow-md active:scale-[0.98] transition-all cursor-pointer"
            >
              Instant Demo / Guest Access &rarr;
            </button>
          </div>
        ) : error && (
          <div className="p-3 mb-5 text-sm text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isRegistering && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 ml-1">Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Your Name"
                  className="w-full pl-10 pr-4 py-3 text-slate-100 liquid-glass-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 text-slate-100 liquid-glass-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 text-slate-100 liquid-glass-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-4 text-white font-medium shadow-lg hover:shadow-sky-500/10 active:scale-[0.98] transition-all duration-200 cursor-pointer text-center flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.3) 0%, rgba(99, 102, 241, 0.3) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: '14px',
              backdropFilter: 'blur(10px)'
            }}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
            ) : isRegistering ? (
              'Join the Penguin Family'
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#0e1424] px-2 text-slate-400 font-mono text-[10px]">Or continue with</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-2.5 px-4 bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl text-xs font-semibold text-white transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.1 9 5 12 5z" />
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z" />
            <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z" />
            <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.1-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z" />
          </svg>
          Sign in with Google
        </button>

        <p className="mt-6 text-center text-xs text-slate-400">
          {isRegistering ? 'Already have an account?' : "Don't have an account yet?"}{' '}
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-sky-300 font-medium hover:underline transition-all cursor-pointer"
          >
            {isRegistering ? 'Sign In' : 'Create Account'}
          </button>
        </p>
      </LiquidGlassCard>

      <div className="mt-8 text-center text-[10px] text-slate-500 font-mono flex items-center gap-1.5 opacity-60">
        <Film className="w-3 h-3 text-sky-400" />
        SECURE CLOUD ENGINE COUPLING ACTIVE
      </div>
    </div>
  );
};
