import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Mail, 
  Lock, 
  Unlock, 
  RefreshCw, 
  Bell, 
  Shield, 
  Check, 
  Info,
  ExternalLink,
  Copy,
  Globe
} from 'lucide-react';
import { RoleManager } from './RoleManager';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { db, auth } from '../firebase';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { BackupRestorePanel } from './BackupRestorePanel';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface SettingsViewProps {
  userRole: string;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ userRole }) => {
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; authorizedEmail: string | null }>({
    connected: false,
    authorizedEmail: null
  });
  const [loading, setLoading] = useState(true);
  
  // Notification Toggles State
  const [notifyBounces, setNotifyBounces] = useState(true);
  const [notifyWeeklyStats, setNotifyWeeklyStats] = useState(false);
  const [notifyCampaignFinished, setNotifyCampaignFinished] = useState(true);

  // Clipboard copy status
  const [copiedSub, setCopiedSub] = useState(false);
  const [copiedUnsub, setCopiedUnsub] = useState(false);

  // System Backup (JSON Export)
  const handleBackupData = async () => {
    const toastId = toast.loading('Querying database collections...');
    try {
      const backupData: Record<string, any[]> = {};
      const collections = [
        'subscribers',
        'emailCampaigns',
        'emailTemplates',
        'emailLogs',
        'concerns',
        'roleAssignments',
        'users',
        'posts',
        'notifications',
        'settings',
        'comments'
      ];
      
      for (const colName of collections) {
        try {
          const snapshot = await getDocs(collection(db, colName));
          backupData[colName] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
        } catch (e) {
          console.warn(`Collection failed to fetch during backup: ${colName}`, e);
          if (e && typeof e === 'object' && 'code' in e && e.code === 'permission-denied') {
            handleFirestoreError(e, OperationType.GET, colName);
          }
        }
      }

      const dataStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const exportFileName = `full_system_backup_${new Date().toISOString().slice(0, 10)}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('id', 'temp-download-link');
      linkElement.setAttribute('href', url);
      linkElement.setAttribute('download', exportFileName);
      linkElement.click();
      
      URL.revokeObjectURL(url);
      toast.success('Backup snapshot downloaded!', { id: toastId });
    } catch (error) {
      console.error('Backup failed:', error);
      toast.error('Failed to compile backup', { id: toastId });
    }
  };

  // Restore from Backup
  const handleRestoreData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const userConfirmed = window.confirm(
      'Restoring data will overwrite existing records with matching IDs. Continue?'
    );
    if (!userConfirmed) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const toastId = toast.loading('Initializing database write...');
      try {
        const backupData = JSON.parse(event.target?.result as string);
        let restoreCount = 0;

        for (const [colName, docs] of Object.entries(backupData)) {
          if (!Array.isArray(docs)) continue;
          
          toast.loading(`Restoring ${colName}...`, { id: toastId });
          
          for (const docData of docs) {
            const { id, ...data } = docData;
            if (!id) continue;
            
            try {
              await setDoc(doc(db, colName, id), data);
              restoreCount++;
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `${colName}/${id}`);
            }
          }
        }

        toast.success(`Successfully uploaded and restored ${restoreCount} documents!`, { id: toastId });
      } catch (error) {
        console.error('Restoration failed:', error);
        toast.error('Invalid backup document format.', { id: toastId });
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Destructive Collection Purge
  const handleLegacyReset = async () => {
    const collectionsToClear = [
      'emailCampaigns', 
      'emailLogs', 
      'concerns', 
      'posts', 
      'notifications', 
      'comments'
    ];
    
    const toastId = toast.loading('Purging lists...');
    try {
      let totalDeleted = 0;
      for (const colName of collectionsToClear) {
        try {
          const snapshot = await getDocs(collection(db, colName));
          if (snapshot.empty) continue;
          
          const batch = writeBatch(db);
          snapshot.forEach((doc) => {
            batch.delete(doc.ref);
            totalDeleted++;
          });
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, colName);
        }
      }
      
      toast.success(`Database lists purged correctly. Deleted ${totalDeleted} documents.`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Purge transaction failed.', { id: toastId });
    }
  };

  const fetchGmailStatus = async () => {
    try {
      const resp = await axios.get('/api/gmail/status');
      setGmailStatus(resp.data);
    } catch (err) {
      console.error("Failed to load Gmail integration status", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGmailStatus();
  }, []);

  const handleConnectGmail = async () => {
    try {
      // Get auth redirect url from server
      const resp = await axios.post('/api/gmail/auth-url', { origin: window.location.origin });
      if (resp.data.url) {
        // Since we are strictly inside an iframe, let's open Gmail authentication popup or normal tab
        // Let's use window.open as standard or redirect current tab. Opening in a new tab is much cleaner!
        window.open(resp.data.url, '_blank', 'width=600,height=600');
        toast.success("Opening secure Google Authorization window...");
        
        // Start polling for connection success every 3 seconds
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          const check = await axios.get('/api/gmail/status');
          if (check.data.connected) {
            setGmailStatus(check.data);
            toast.success(`Successfully connected ${check.data.authorizedEmail}!`);
            clearInterval(interval);
          }
          if (attempts > 40) clearInterval(interval); // Stop after 2 mins
        }, 3000);
      }
    } catch (e: any) {
      toast.error(`Gmail config endpoint error: ${e.response?.data?.error || e.message}`);
    }
  };

  const handleDisconnectGmail = async () => {
    if (!window.confirm("Are you sure you want to revoke authorization and disconnect Gmail?")) return;
    try {
      await axios.delete('/api/gmail/disconnect');
      setGmailStatus({ connected: false, authorizedEmail: null });
      toast.success("Gmail integration disconnected.");
    } catch (e: any) {
      toast.error("Failed to revoke token");
    }
  };

  const mockToastNotifications = (msg: string, title?: string, type?: string) => {
    if (type === 'success') {
      toast.success(`${title || 'Success'}: ${msg}`);
    } else {
      toast(msg);
    }
  };

  if (userRole !== 'marketing_supervisor') {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg mx-auto space-y-3">
        <Shield className="w-12 h-12 text-slate-300 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Supervisor Access Only</h2>
        <p className="text-sm text-slate-500">Only authorized marketing supervisors can access settings, integrations, and manage system roles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Gmail Integration + Toggles */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Gmail API configuration block */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-sm text-slate-950 dark:text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-500" /> Gmail API Channel
            </h2>

            <p className="text-xs text-slate-500">
              Deliver unlimited campaign emails using your secure Gmail / Google Workspace account directly. Uses standard Oauth2.
            </p>

            {loading ? (
              <p className="text-xs text-slate-400">Inspecting Google credentials...</p>
            ) : gmailStatus.connected ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-100 flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-400">Bearer Token Live</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-500 font-mono">{gmailStatus.authorizedEmail}</p>
                  </div>
                </div>

                <button
                  onClick={handleDisconnectGmail}
                  className="w-full text-center px-4 py-2 bg-red-50 hover:bg-red-100 text-red-650 rounded-lg text-xs font-semibold transition-all"
                >
                  Disconnect Account
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleConnectGmail}
                  className="w-full text-center px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm shadow flex items-center justify-center gap-2"
                >
                  Connect Google Account <ExternalLink className="w-4 h-4" />
                </button>
                <p className="text-[10px] text-slate-400 italic text-center">Scopes: gmail.send and gmail.readonly</p>
              </div>
            )}
          </div>

          {/* Subscriber Portal Links */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 animate-fade-in">
            <h2 className="font-bold text-sm text-slate-950 dark:text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-500" /> Public Portal Links
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Copy and share these addresses to let external clients or returning users register with your system, customize preferences, or safely opt-out first-hand.
            </p>

            <div className="space-y-4 pt-1">
              {/* Subscribe Link block */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  New / Returning Subscriber Registration
                </span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/subscribe`}
                    className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 font-mono focus:outline-none"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(`${window.location.origin}/subscribe`);
                        setCopiedSub(true);
                        setTimeout(() => setCopiedSub(false), 2000);
                        toast.success("Subscription link copied!");
                      } catch {
                        toast.error("Could not copy link");
                      }
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-850 transition-all shrink-0 cursor-pointer"
                    title="Copy link"
                  >
                    {copiedSub ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={`${window.location.origin}/subscribe`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-850 transition-all shrink-0"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Unsubscribe Link block */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  General Unsubscribe Center
                </span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/unsubscribe`}
                    className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 font-mono focus:outline-none"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(`${window.location.origin}/unsubscribe`);
                        setCopiedUnsub(true);
                        setTimeout(() => setCopiedUnsub(false), 2000);
                        toast.success("Unsubscribe link copied!");
                      } catch {
                        toast.error("Could not copy link");
                      }
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-850 transition-all shrink-0 cursor-pointer"
                    title="Copy link"
                  >
                    {copiedUnsub ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={`${window.location.origin}/unsubscribe`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-850 transition-all shrink-0"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Toggle preferences */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-sm text-slate-950 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" /> Notify Toggles
            </h2>

            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Alert on Bounce Failures</span>
                <input
                  type="checkbox"
                  checked={notifyBounces}
                  onChange={(e) => {
                    setNotifyBounces(e.target.checked);
                    toast.success("Updated bounces notification rule");
                  }}
                  className="accent-amber-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Digest Report (Weekly)</span>
                <input
                  type="checkbox"
                  checked={notifyWeeklyStats}
                  onChange={(e) => {
                    setNotifyWeeklyStats(e.target.checked);
                    toast.success("Updated weekly performance summaries");
                  }}
                  className="accent-amber-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Success alerts on Send</span>
                <input
                  type="checkbox"
                  checked={notifyCampaignFinished}
                  onChange={(e) => {
                    setNotifyCampaignFinished(e.target.checked);
                    toast.success("Updated campaign alert rules");
                  }}
                  className="accent-amber-500 w-4 h-4"
                />
              </label>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl flex gap-2">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Google Workspace OAuth credentials (GMAIL_CLIENT_ID & GMAIL_CLIENT_SECRET) are held encrypted and mapped natively inside the Express server. At no point are access keys emitted client side.
            </p>
          </div>

        </div>

        {/* Right Column: Portal User Role audit Manager */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h2 className="font-extrabold text-sm text-slate-950 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <Shield className="w-4.5 h-4.5 text-amber-500" /> Portal Permissions Auditor
            </h2>
            <RoleManager addNotification={mockToastNotifications} />
          </div>
        </div>

      </div>

      {/* System Backup & Restore Panel Section */}
      <div className="mt-8">
        <BackupRestorePanel 
          onBackup={handleBackupData} 
          onRestore={handleRestoreData} 
          onReset={handleLegacyReset} 
        />
      </div>
    </div>
  );
};
