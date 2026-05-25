import React, { useState, useEffect } from 'react';
import { 
  History, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Search, 
  AlertTriangle, 
  Mail, 
  HelpCircle,
  FileText,
  Clock 
} from 'lucide-react';
import { collection, onSnapshot, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { EmailLog, EmailCampaign } from '../types';
import { toast } from 'react-hot-toast';
import axios from 'axios';

export const SentHistoryView: React.FC = () => {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Read campaigns for dropdown filters
    const unsubCampaigns = onSnapshot(collection(db, 'emailCampaigns'), (snapshot) => {
      const list: EmailCampaign[] = [];
      snapshot.forEach(doc => {
        list.push({ ...(doc.data() as EmailCampaign), id: doc.id });
      });
      list.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCampaigns(list);
    });

    // Read general stream of logs
    const unsubLogs = onSnapshot(collection(db, 'emailLogs'), (snapshot) => {
      const list: EmailLog[] = [];
      snapshot.forEach(doc => {
        list.push({ ...(doc.data() as EmailLog), id: doc.id });
      });
      list.sort((a,b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
      setLogs(list);
      setLoading(false);
    });

    return () => {
      unsubCampaigns();
      unsubLogs();
    };
  }, []);

  const getCampaignName = (campaignId: string) => {
    const c = campaigns.find(item => item.id === campaignId);
    return c ? c.title : `Campaign #${campaignId.slice(0, 6)}`;
  };

  const handleRetryFailed = async () => {
    if (selectedCampaignId === 'all') {
      toast.error("Please filter by a specific campaign first to retry its failures.");
      return;
    }

    const campaign = campaigns.find(c => c.id === selectedCampaignId);
    if (!campaign) {
      toast.error("Campaign not found.");
      return;
    }

    // Find failed logs for this campaign
    const failedForCamp = logs.filter(l => l.campaignId === selectedCampaignId && l.status === 'failed');
    if (failedForCamp.length === 0) {
      toast("There are no failed deliverability logs for this campaign.");
      return;
    }

    if (!window.confirm(`Are you sure you want to retry sending emails to the ${failedForCamp.length} failed recipients?`)) {
      return;
    }

    toast.success("Retrying failed deliveries in background!");
    
    // Fetch from subscribers collection to get the corresponding names if possible
    try {
      const subSnapshot = await getDocs(collection(db, 'subscribers'));
      const activeSubs: Record<string, string> = {};
      subSnapshot.forEach(doc => {
        const data = doc.data();
        activeSubs[data.email] = data.name || data.email;
      });

      const retryRecipients = failedForCamp.map(log => ({
        email: log.recipientEmail,
        name: activeSubs[log.recipientEmail] || log.recipientEmail.split('@')[0]
      }));

      // Call bulk send API directly
      await axios.post('/api/gmail/send-bulk', {
        campaignId: selectedCampaignId,
        recipients: retryRecipients
      });
    } catch (err: any) {
      toast.error(`Retry scheduling failed: ${err.message}`);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesCampaign = selectedCampaignId === 'all' || log.campaignId === selectedCampaignId;
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    const matchesSearch = log.recipientEmail?.toLowerCase().includes(search.toLowerCase()) || 
                          log.errorMessage?.toLowerCase().includes(search.toLowerCase()) ||
                          getCampaignName(log.campaignId).toLowerCase().includes(search.toLowerCase());

    return matchesCampaign && matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {selectedCampaignId !== 'all' && logs.some(l => l.campaignId === selectedCampaignId && l.status === 'failed') && (
          <button
            onClick={handleRetryFailed}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-650 text-white rounded-lg text-xs font-semibold shadow transition-all"
          >
            <RefreshCw className="w-4 h-4 animate-spin-once" /> Retry Failed Sends
          </button>
        )}
      </div>

      {/* Grid Filter Box */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            placeholder="Search logs by recipient, campaign name, or errors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none min-w-[150px] max-w-sm"
          >
            <option value="all">All Campaigns</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          >
            <option value="all">All Statuses</option>
            <option value="sent">Successfully Delivered</option>
            <option value="failed">Sent Failed</option>
          </select>
        </div>
      </div>

      {/* Logs Table cards element */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4">Recipient</th>
                <th className="px-6 py-4">Campaign Name</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Delivery Time</th>
                <th className="px-6 py-4">Gmail Msg ID / Error Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">Loading delivery stream...</td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">No logs found matching selected parameters.</td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                    <td className="px-6 py-4 font-mono text-xs text-slate-900 dark:text-white">{log.recipientEmail}</td>
                    <td className="px-6 py-4 font-semibold text-xs max-w-xs truncate">{getCampaignName(log.campaignId)}</td>
                    <td className="px-6 py-4 animate-fade-in">
                      {log.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase tracking-wider">
                          <CheckCircle className="w-3 h-3" /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[10px] uppercase tracking-wider">
                          <XCircle className="w-3 h-3" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {log.sentAt ? new Date(log.sentAt).toLocaleString() : ''}
                    </td>
                    <td className="px-6 py-4 max-w-sm font-mono text-xs overflow-hidden">
                      {log.status === 'sent' ? (
                        <span className="text-slate-500 truncate block">{log.gmailMessageId || 'Confirmed send'}</span>
                      ) : (
                        <span className="text-red-500 font-medium whitespace-pre-wrap">{log.errorMessage || 'Unknown Gmail API Error'}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
