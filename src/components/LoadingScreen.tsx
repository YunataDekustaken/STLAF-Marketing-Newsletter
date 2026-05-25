import React from 'react';
import { motion } from 'motion/react';
import { Mail } from 'lucide-react';

interface LoadingScreenProps {
  progress?: number;       // Value between 0 and 100
  loadingMessage?: string; // e.g., "Initializing Workspace"
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  progress = 0,
  loadingMessage = 'Initializing Workspace'
}) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden transition-colors duration-300">
      {/* Decorative Background Glow Elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 dark:bg-amber-500/10 blur-[120px] rounded-full" />
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-500/5 dark:bg-indigo-500/10 blur-[80px] rounded-full" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center"
      >
        {/* App Logo Area with Gold Mail Badge */}
        <motion.div 
          initial={{ scale: 0.8, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ 
            type: "spring", 
            stiffness: 180, 
            damping: 15,
            delay: 0.1 
          }}
          className="w-28 h-28 mb-8 relative"
        >
          {/* 1. OVERLAPPING AMBER MAIL BADGE */}
          {/* - Matches the gold squircle layout of the screenshot */}
          <div className="absolute -right-2.5 -top-2.5 w-11 h-11 bg-[#d5a848] rounded-[18px] flex items-center justify-center shadow-lg border border-[#e5ba5a] z-10">
            <Mail className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          
          {/* 2. MAIN LOGO WRAPPER */}
          <img 
            src="/img/MAIN (1).png" 
            alt="STLAF Logo" 
            className="w-full h-full object-contain rounded-[28px] shadow-2xl bg-white p-5 border border-slate-100" 
          />
        </motion.div>
        
        {/* Application Logo Text & Title */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-3">
            Newsletter <span className="text-amber-500">Portal</span>
          </h1>
          
          <div className="flex flex-col items-center gap-4">
            {/* Status Label + Ambient Sound wave / Dot pulses */}
            <div className="flex items-center justify-center gap-3 text-slate-505 dark:text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em]">
              <div className="flex gap-1">
                <motion.div 
                  animate={{ scaleY: [1, 1.5, 1] }} 
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                  className="w-0.5 h-3 bg-amber-500/60 rounded-full" 
                />
                <motion.div 
                  animate={{ scaleY: [1, 1.5, 1] }} 
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                  className="w-0.5 h-3 bg-amber-500/60 rounded-full" 
                />
                <motion.div 
                  animate={{ scaleY: [1, 1.5, 1] }} 
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                  className="w-0.5 h-3 bg-amber-500/60 rounded-full" 
                />
              </div>
              {loadingMessage}
            </div>

            {/* Micro Progress Bar */}
            <div className="w-48 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden relative">
              <motion.div 
                className="absolute inset-y-0 left-0 bg-amber-500 animate-pulse"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 50, damping: 20 }}
              />
            </div>

            {/* Diagnostic Progress Percentage */}
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 font-mono tabular-nums">
              {Math.round(progress)}%
            </span>
          </div>
        </motion.div>
      </motion.div>
      
      {/* Absolute Bottom Footer Badge */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="absolute bottom-12 text-slate-400 dark:text-slate-600 text-[10px] font-bold uppercase tracking-widest"
      >
        Powered by Gemini AI
      </motion.div>
    </div>
  );
};
