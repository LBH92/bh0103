import React, { useState } from 'react';
import { X, Lock, Mail, User, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider } from '../../services/firebase';
import { firebaseRepository } from '../../services/firebaseRepository';
import { useApp } from '../../context/AppContext';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, setIsAuthModalOpen, showToast } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<{ code: string; message: string; tip?: string } | null>(null);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);

    try {
      if (mode === 'login') {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const fbUser = cred.user;
        console.log('[Firebase Auth] Login successful. UID:', fbUser.uid, 'Email:', fbUser.email);
        await firebaseRepository.syncUserProfile(fbUser.uid, fbUser.email || email, fbUser.displayName || undefined);
        showToast('성공적으로 로그인되었습니다.', 'success');
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const fbUser = cred.user;
        console.log('[Firebase Auth] User created. UID:', fbUser.uid, 'Email:', fbUser.email);
        if (name) {
          await updateProfile(fbUser, { displayName: name });
        }
        await firebaseRepository.syncUserProfile(fbUser.uid, fbUser.email || email, name || undefined);
        showToast('회원가입이 완료되었습니다!', 'success');
      }
      setIsAuthModalOpen(false);
    } catch (err: any) {
      console.error('[Firebase Auth Error]', err.code, err.message);
      let tip = '';
      if (err.code === 'auth/operation-not-allowed') {
        tip = 'Firebase 콘솔의 Authentication > Sign-in method에서 [이메일/비밀번호] 제공업체가 활성화되어 있지 않습니다. 아래의 Google 계정 로그인을 이용하시거나 Firebase 콘솔에서 공급자를 활성화해주세요.';
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        tip = '이메일 또는 비밀번호가 올바르지 않습니다. 다시 확인해주세요.';
      } else if (err.code === 'auth/email-already-in-use') {
        tip = '이미 가입된 이메일 주소입니다. 로그인 탭에서 로그인해주세요.';
      } else if (err.code === 'auth/weak-password') {
        tip = '비밀번호는 최소 6자 이상이어야 합니다.';
      } else if (err.code === 'auth/configuration-not-found') {
        tip = 'Firebase 프로젝트에 Authentication이 구성되지 않았습니다.';
      } else if (err.code === 'auth/network-request-failed') {
        tip = '네트워크 연결 상태를 확인해주세요.';
      }

      setAuthError({
        code: err.code || 'auth/unknown-error',
        message: err.message || '인증 처리 중 오류가 발생했습니다.',
        tip,
      });
      showToast(`인증 실패: ${err.code || '오류'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setAuthError(null);

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const fbUser = cred.user;
      console.log('[Firebase Google Auth] Success. UID:', fbUser.uid, 'Email:', fbUser.email);
      await firebaseRepository.syncUserProfile(
        fbUser.uid,
        fbUser.email || 'user@google.com',
        fbUser.displayName || undefined,
        fbUser.photoURL || undefined
      );
      showToast('Google 계정으로 로그인되었습니다.', 'success');
      setIsAuthModalOpen(false);
    } catch (err: any) {
      console.error('[Firebase Google Auth Error]', err.code, err.message);
      let tip = '';
      if (err.code === 'auth/popup-blocked') {
        tip = '브라우저 팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.';
      } else if (err.code === 'auth/popup-closed-by-user') {
        tip = '로그인 창이 닫혔습니다.';
      } else if (err.code === 'auth/operation-not-allowed') {
        tip = 'Firebase 콘솔에서 Google 로그인 공급자가 활성화되어 있는지 확인해주세요.';
      }

      setAuthError({
        code: err.code || 'auth/google-sign-in-failed',
        message: err.message || 'Google 로그인에 실패했습니다.',
        tip,
      });
      showToast(`Google 로그인 실패: ${err.code || '오류'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-md bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center font-black">
              BD
            </div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">
              {mode === 'login' ? '로그인' : '회원가입'}
            </h3>
          </div>
          <button
            onClick={() => setIsAuthModalOpen(false)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Tabs */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl mb-6">
            <button
              onClick={() => {
                setMode('login');
                setAuthError(null);
              }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-white dark:bg-[#1a1f2e] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              로그인
            </button>
            <button
              onClick={() => {
                setMode('register');
                setAuthError(null);
              }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-white dark:bg-[#1a1f2e] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              회원가입
            </button>
          </div>

          {/* Real Firebase Auth Error Alert */}
          {authError && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-left space-y-1.5 animate-in fade-in duration-100">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400">
                  {authError.code}
                </span>
              </div>
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                {authError.message}
              </p>
              {authError.tip && (
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg border border-rose-200 dark:border-rose-900/40">
                  💡 {authError.tip}
                </p>
              )}
            </div>
          )}

          {/* Social Login Button (Firebase Auth Google Provider) */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors mb-4 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Google 계정으로 계속하기
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
            <span className="text-xs text-slate-400">또는 이메일로</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  닉네임
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="여의도스윙러"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                이메일
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="investor@example.com"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                비밀번호
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-sm transition-colors mt-2 shadow-lg shadow-rose-600/25 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>처리 중...</span>
                </>
              ) : (
                <span>{mode === 'login' ? '로그인' : '회원가입 완료'}</span>
              )}
            </button>
          </form>

          <div className="mt-4 p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Firebase Authentication 및 Cloud Firestore와 안전하게 연결되었습니다.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
