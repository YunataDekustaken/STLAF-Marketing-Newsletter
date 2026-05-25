import React, { useState } from 'react';
import { 
  History, 
  Download, 
  Upload, 
  AlertCircle 
} from 'lucide-react';
import toast from 'react-hot-toast';

interface BackupRestoreProps {
  onBackup: () => Promise<void>;
  onRestore: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onReset: () => Promise<void>;
}

export const BackupRestorePanel: React.FC<BackupRestoreProps> = ({ 
  onBackup, 
  onRestore, 
  onReset 
}) => {
  const [showResetVerify, setShowResetVerify] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  return (
    <div 
      id="backup-panel-container"
      className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors duration-300"
    >
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
          <History className="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white">System Backup & Restore</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Full Backup Pane */}
        <div id="backup-export-pane" className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2 flex items-center gap-2">
            <Download className="w-4 h-4 text-purple-500" />
            Full System Backup
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed font-medium">
            Generates a complete JSON snapshot of all system-critical collections.
          </p>
          <button 
            id="export-backup-btn"
            onClick={onBackup}
            disabled={isProcessing}
            className="w-full py-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            Export Backup (JSON)
          </button>
        </div>

        {/* Restore Pane */}
        <div id="backup-restore-pane" className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2 flex items-center gap-2">
            <Upload className="w-4 h-4 text-orange-500" />
            Restore from Backup
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed font-medium">
            Upload a previously exported JSON backup to restore system state. <span className="text-orange-600 dark:text-orange-400 font-bold">Warning: Overwrites matching records.</span>
          </p>
          <button 
            id="upload-restore-btn"
            onClick={() => document.getElementById('backup-restore-file-input')?.click()}
            disabled={isProcessing}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload & Restore
          </button>
          <input 
            type="file" 
            id="backup-restore-file-input" 
            className="hidden" 
            accept=".json" 
            onChange={onRestore} 
          />
        </div>
      </div>

      {/* Legacy Reset Tool Section */}
      <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-start gap-4 p-4 bg-rose-50 dark:bg-rose-900/10 rounded-xl border border-rose-100 dark:border-rose-900/20">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h5 className="text-xs font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest mb-1">Legacy Restore Tool</h5>
            <p className="text-[11px] text-rose-600/80 dark:text-rose-400/60 leading-relaxed font-medium mb-3">
              Permanently deletes system-compiled lists to completely reset state. User accounts are preserved.
            </p>
            
            {!showResetVerify ? (
              <button 
                id="quick-reset-btn"
                onClick={() => setShowResetVerify(true)}
                disabled={isProcessing}
                className="px-4 py-2 bg-white dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/40 rounded-lg text-[10px] font-black text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-all shadow-sm uppercase tracking-widest cursor-pointer disabled:opacity-50"
              >
                Run Quick Reset
              </button>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-white dark:bg-slate-900/50 rounded-xl border border-rose-200 dark:border-rose-900/30 max-w-md">
                  <p className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-2">
                    Type <span className="text-rose-900 dark:text-rose-200 bg-rose-100 dark:bg-rose-900/40 px-1.5 py-0.5 rounded">RESET</span> to confirm destruction
                  </p>
                  <input 
                    id="reset-verify-input"
                    type="text"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    placeholder="Type here..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border-none outline-none rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 placeholder:text-rose-300 dark:placeholder:text-rose-900/40"
                    autoFocus
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    id="confirm-destructive-reset-btn"
                    onClick={async () => {
                      if (resetConfirmText === 'RESET') {
                        setIsProcessing(true);
                        try {
                          await onReset();
                        } catch (err) {
                          // error handled inside onReset
                        } finally {
                          setShowResetVerify(false);
                          setResetConfirmText('');
                          setIsProcessing(false);
                        }
                      } else {
                        toast.error("Incorrect verification text.");
                      }
                    }}
                    disabled={isProcessing || resetConfirmText !== 'RESET'}
                    className="px-5 py-2 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-sm disabled:opacity-30 disabled:grayscale cursor-pointer"
                  >
                    {isProcessing ? 'Purging...' : 'Confirm Destructive Reset'}
                  </button>
                  <button 
                    id="cancel-reset-btn"
                    onClick={() => {
                      setShowResetVerify(false);
                      setResetConfirmText('');
                    }}
                    disabled={isProcessing}
                    className="px-5 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-300 dark:hover:bg-slate-600 transition-all cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
