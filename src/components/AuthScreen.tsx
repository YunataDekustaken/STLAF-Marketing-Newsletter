import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Mail, Lock } from 'lucide-react';
import { motion } from 'motion/react';

export default function AuthScreen() {
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    if (isLoading) return;
    setError('');
    setIsLoading(true);
    try {
      await login();
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked') {
        setError('Login popup blocked by browser. Please enable popups and try again.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Benign
      } else {
        setError(err.message || 'Google login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-dark flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Orbs for depth */}
      <div className="absolute top-0 -left-10 w-96 h-96 bg-amber-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 -right-10 w-96 h-96 bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-slate-900/60 backdrop-blur-3xl rounded-[40px] shadow-[0_32px_128px_-12px_rgba(0,0,0,0.5)] border border-white/10 p-12 relative z-10"
      >
        <div className="flex justify-center mb-10">
          <div className="relative">
            {/* Main Logo Image */}
            <div className="w-28 h-28 flex items-center justify-center">
              <img src="/img/MAIN (1).png" alt="STLAF Logo" className="w-full h-full object-contain rounded-3xl shadow-2xl" />
            </div>
            
            {/* Mail Icon Overlay */}
            <div className="absolute -right-3 -top-3 bg-amber-500 rounded-2xl p-2.5 shadow-xl shadow-amber-500/20 border border-amber-400 z-20">
              <Mail className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-black text-white text-center mb-3 tracking-tight">Marketing Portal</h1>
        <p className="text-slate-400 text-center mb-10 font-medium leading-relaxed">
          Sign in with your corporate Google account to access marketing library resources.
        </p>

        <div className="space-y-4">
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center space-x-4 bg-white text-slate-900 py-5 rounded-[24px] font-bold border border-white/10 hover:bg-slate-50 hover:shadow-2xl hover:shadow-white/5 transition-all duration-300 disabled:opacity-50 group"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
            ) : (
              <div className="p-2 bg-slate-50 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
              </div>
            )}
            <span className="text-[15px]">Continue with Google</span>
          </button>
          
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl"
            >
              <p className="text-xs text-rose-400 font-bold text-center leading-relaxed italic">{error}</p>
            </motion.div>
          )}
        </div>

        <div className="mt-12 pt-8 border-t border-white/5 flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full">
            <Lock className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-bold">
              Secure Auth Enabled
            </span>
          </div>
          <p className="text-[11px] text-center text-slate-500 font-medium px-4">
            Authorized access only. All actions are logged for security and compliance.
          </p>
          <div className="flex items-center gap-4 mt-2">
            <a 
              href="/privacy" 
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState(null, '', '/privacy');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="text-[10px] text-slate-500 hover:text-white transition-colors uppercase tracking-widest font-bold underline underline-offset-4 decoration-white/10"
            >
              Privacy Policy
            </a>
            <span className="text-slate-700 text-[10px]">•</span>
            <a 
              href="/terms" 
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState(null, '', '/terms');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="text-[10px] text-slate-500 hover:text-white transition-colors uppercase tracking-widest font-bold underline underline-offset-4 decoration-white/10"
            >
              Terms of Service
            </a>
            <span className="text-slate-700 text-[10px]">•</span>
            <a 
              href="/deletion" 
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState(null, '', '/deletion');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="text-[10px] text-slate-500 hover:text-white transition-colors uppercase tracking-widest font-bold underline underline-offset-4 decoration-white/10"
            >
              Data Deletion
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
