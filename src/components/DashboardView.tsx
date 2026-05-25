import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Send, 
  Inbox, 
  Users, 
  TrendingUp, 
  Mail, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Activity, 
  Check, 
  X,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { EmailCampaign, Subscriber } from '../types';
import axios from 'axios';

interface DashboardViewProps {
  onNavigate: (view: any) => void;
  userRole: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, userRole }) => {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [sentThisMonth, setSentThisMonth] = useState(0);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; authorizedEmail: string | null }>({
    connected: false,
    authorizedEmail: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Gmail connection status
    axios.get('/api/gmail/status')
      .then(res => {
        setGmailStatus(res.data);
      })
      .catch(err => console.error("Could not fetch Gmail status", err));

    // Listen to campaigns
    const qCampaigns = query(collection(db, 'emailCampaigns'), orderBy('createdAt', 'desc'));
    const unsubscribeCampaigns = onSnapshot(qCampaigns, (snapshot) => {
      const list: EmailCampaign[] = [];
      let monthSentCount = 0;
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      snapshot.forEach((doc) => {
        const data = doc.data() as EmailCampaign;
        list.push({ ...data, id: doc.id });

        if (data.status === 'sent' && data.sentAt) {
          try {
            const sentDate = new Date(data.sentAt);
            if (sentDate.getMonth() === currentMonth && sentDate.getFullYear() === currentYear) {
              monthSentCount += (data.sentCount || 0);
            }
          } catch (e) {
            // Ignore
          }
        }
      });
      setCampaigns(list);
      setSentThisMonth(monthSentCount);
      setLoading(false);
    });

    // Listen to subscribers
    const unsubscribeSubscribers = onSnapshot(collection(db, 'subscribers'), (snapshot) => {
      const list: Subscriber[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...(doc.data() as Subscriber), id: doc.id });
      });
      setSubscribers(list);
    });

    return () => {
      unsubscribeCampaigns();
      unsubscribeSubscribers();
    };
  }, []);

  const totalSubscribers = subscribers.length;
  const activeSubscribers = subscribers.filter(s => s.status === 'active').length;
  const unsubscribedSubscribers = subscribers.filter(s => s.status === 'unsubscribed').length;

  const totalCampaigns = campaigns.length;
  const sentCampaigns = campaigns.filter(c => c.status === 'sent' || c.status === 'sending').length;

  const stats = [
    {
      label: 'Total Campaigns',
      value: totalCampaigns,
      subText: `${sentCampaigns} sent / sending`,
      icon: Mail,
      color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/20',
    },
    {
      label: 'Total Subscribers',
      value: totalSubscribers,
      subText: `${activeSubscribers} active verified`,
      icon: Users,
      color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/20',
    },
    {
      label: 'Sent This Month',
      value: sentThisMonth,
      subText: 'Delivered via Gmail API',
      icon: Send,
      color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome & Action Header */}
      <div className="flex justify-end">
        <button
          onClick={() => onNavigate('compose')}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-medium rounded-lg text-sm shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {/* Gmail Connection Status Block */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className={`p-2 rounded-lg ${gmailStatus.connected ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20' : 'bg-red-50 text-red-600 dark:bg-red-950/20'}`}>
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Gmail API Authorized Channel</h3>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                gmailStatus.connected 
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400' 
                  : 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400'
              }`}>
                {gmailStatus.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {gmailStatus.connected 
                ? `Authorized sender account: ${gmailStatus.authorizedEmail}` 
                : 'Click Settings in the left sidebar to connect your Google / Gmail account via secure OAuth'}
            </p>
          </div>
        </div>
        
        {!gmailStatus.connected && (
          <button 
            onClick={() => onNavigate('settings')}
            className="flex items-center gap-1 text-xs font-semibold text-amber-500 hover:text-amber-600 hover:underline"
          >
            Connect Gmail Now <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Stats Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, idx) => {
          const IconComponent = stat.icon;
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all flex items-center justify-between"
            >
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{stat.label}</p>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{stat.value}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{stat.subText}</p>
              </div>
              <div className={`p-3 rounded-xl ${stat.color}`}>
                <IconComponent className="w-6 h-6" />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Main Split details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Campaigns list */}
        <div className="lg:col-span-2 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-950 dark:text-white tracking-tight">Recent Email Campaigns</h2>
            <button 
              onClick={() => onNavigate('campaigns')}
              className="text-xs text-amber-500 font-semibold hover:underline"
            >
              All campaigns
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <div className="py-8 text-center text-slate-400">Loading your campaigns...</div>
            ) : campaigns.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <p className="text-sm">No campaigns composed yet.</p>
                <button
                  onClick={() => onNavigate('compose')}
                  className="text-xs bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400 px-3 py-1.5 rounded-md font-semibold hover:bg-amber-100 transition-all"
                >
                  Create your first email
                </button>
              </div>
            ) : (
              campaigns.slice(0, 5).map((campaign) => (
                <div key={campaign.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{campaign.title}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{campaign.subject}</p>
                    {campaign.status === 'scheduled' && campaign.scheduledAt && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">
                        ⏱️ Scheduled: {new Date(campaign.scheduledAt).toLocaleString()}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        campaign.type === 'Newsletter' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20' :
                        campaign.type === 'Promotion' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20' :
                        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {campaign.type}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString() : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div className="text-xs space-y-0.5">
                      <p className="font-semibold text-slate-800 dark:text-white">{campaign.sentCount || 0} Sent</p>
                      {campaign.failedCount > 0 && <p className="text-red-500 font-medium">{campaign.failedCount} Failed</p>}
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      campaign.status === 'sent' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30' :
                      campaign.status === 'sending' ? 'bg-blue-100 text-blue-800 animate-pulse' :
                      campaign.status === 'scheduled' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/30' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-800'
                    }`}>
                      {campaign.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Breakdown Panel */}
        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6">
          <h2 className="font-bold text-slate-950 dark:text-white tracking-tight">Recipients Status</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Active Contacts</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">{activeSubscribers}</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
              <div 
                className="bg-emerald-500 h-1.5 rounded-full" 
                style={{ width: `${totalSubscribers > 0 ? (activeSubscribers / totalSubscribers) * 100 : 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-slate-600 dark:text-slate-400">Unsubscribed Contacts</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">{unsubscribedSubscribers}</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
              <div 
                className="bg-amber-500 h-1.5 rounded-full" 
                style={{ width: `${totalSubscribers > 0 ? (unsubscribedSubscribers / totalSubscribers) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <button
              onClick={() => onNavigate('subscribers')}
              className="text-xs text-amber-500 font-bold hover:underline"
            >
              Manage Email Subscribers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
