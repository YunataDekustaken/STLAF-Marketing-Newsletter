import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Send, 
  Trash2, 
  Edit2, 
  Plus, 
  Search, 
  Eye, 
  Copy, 
  Calendar, 
  MoreVertical, 
  AlertCircle,
  FileCode,
  CheckCircle,
  HelpCircle,
  Clock,
  X,
  Play
} from 'lucide-react';
import { collection, onSnapshot, deleteDoc, doc, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { EmailCampaign } from '../types';
import { toast } from 'react-hot-toast';
import axios from 'axios';

interface CampaignsListViewProps {
  onNavigate: (view: any, data?: any) => void;
  userRole: string;
}

export const CampaignsListView: React.FC<CampaignsListViewProps> = ({ onNavigate, userRole }) => {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<EmailCampaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'emailCampaigns'), (snapshot) => {
      const list: EmailCampaign[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...(doc.data() as EmailCampaign), id: doc.id });
      });
      // Sort by createdAt desc
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCampaigns(list);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching campaigns:", err);
    });

    return () => unsub();
  }, []);

  const handleDelete = async (campaignId: string) => {
    if (!window.confirm("Are you sure you want to delete this campaign permanently?")) return;
    try {
      await deleteDoc(doc(db, 'emailCampaigns', campaignId));
      toast.success("Campaign deleted");
    } catch (e: any) {
      toast.error(`Error deleting: ${e.message}`);
    }
  };

  const handleDuplicate = async (campaign: EmailCampaign) => {
    try {
      const duplicated: Omit<EmailCampaign, 'id'> = {
        title: `${campaign.title} (Copy)`,
        subject: campaign.subject,
        body: campaign.body,
        status: 'draft',
        type: campaign.type,
        recipientTags: Array.isArray(campaign.recipientTags) ? campaign.recipientTags : [],
        sentCount: 0,
        failedCount: 0,
        createdBy: auth.currentUser?.email || 'System',
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'emailCampaigns'), duplicated);
      toast.success("Campaign duplicated into draft!");
    } catch (e: any) {
      toast.error("Duplicate failed");
    }
  };

  const filteredCampaigns = campaigns.filter(c => 
    c.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.type?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => onNavigate('compose')}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm shadow transition-all"
        >
          <Plus className="w-4 h-4" /> Create Campaign
        </button>
      </div>

      {/* Filter Row */}
      <div className="flex bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search campaigns by title, subject, or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        </div>
      </div>

      {/* Desktop campaigns Table / List cards */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4">Title</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Filters</th>
                <th className="px-6 py-4 text-center">Outcome</th>
                <th className="px-6 py-4">Created Date</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">Loading campaign list...</td>
                </tr>
              ) : filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">No campaigns found matching search criteria.</td>
                </tr>
              ) : (
                filteredCampaigns.map((campaign) => (
                  <tr 
                    key={campaign.id} 
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 cursor-pointer transition-colors"
                    onClick={() => {
                      if (campaign.status === 'draft') {
                        onNavigate('compose', campaign);
                      } else {
                        setSelectedCampaign(campaign);
                      }
                    }}
                  >
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                      <div className="flex flex-col">
                        <span>{campaign.title}</span>
                        <span className="text-xs text-slate-400 font-normal max-w-sm truncate">{campaign.subject}</span>
                        {campaign.status === 'scheduled' && campaign.scheduledAt && (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1">
                            ⏱️ Scheduled for {new Date(campaign.scheduledAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        campaign.type === 'Newsletter' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20' :
                        campaign.type === 'Promotion' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20' :
                        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {campaign.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        campaign.status === 'sent' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30' :
                        campaign.status === 'sending' ? 'bg-blue-100 text-blue-800 animate-pulse' :
                        campaign.status === 'scheduled' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {campaign.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate">
                      {Array.isArray(campaign.recipientTags) && campaign.recipientTags.length > 0 ? (
                        <div className="flex gap-1 overflow-hidden">
                          {campaign.recipientTags.map(tag => (
                            <span key={tag} className="bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-300 text-[10px] px-1.5 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">All active contacts</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="text-xs">
                        <span className="font-semibold text-emerald-600">{campaign.sentCount || 0} sent</span>
                        {campaign.failedCount > 0 && (
                          <span className="text-red-500 font-medium ml-2">{campaign.failedCount} failed</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(campaign.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCampaign(campaign);
                          }}
                          className="p-1 px-2.5 rounded text-slate-500 bg-slate-50 hover:bg-slate-150 text-xs font-bold transition-all flex items-center gap-1"
                          title="View layout"
                        >
                          <Eye className="w-3.5 h-3.5" /> View HTML
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(campaign);
                          }}
                          className="p-1 text-indigo-500 hover:bg-indigo-50 rounded"
                          title="Duplicate draft"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        {campaign.status === 'draft' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate('compose', campaign);
                            }}
                            className="p-1 text-amber-500 hover:bg-amber-50 rounded"
                            title="Edit campaign"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(campaign.id);
                          }}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                          title="Delete Campaign"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* HTML Content Viewer Drawer/Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">{selectedCampaign.title}</h3>
                <p className="text-xs text-slate-500 mt-1">Subject: <strong>{selectedCampaign.subject}</strong></p>
              </div>
              <button
                onClick={() => setSelectedCampaign(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-950 prose dark:prose-invert max-w-none">
              <div dangerouslySetInnerHTML={{ __html: selectedCampaign.body }} />
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 text-xs">
              <span className="text-slate-400 mr-auto flex items-center gap-1">
                <FileCode className="w-4 h-4" /> HTML Rendering
              </span>
              <button
                onClick={() => setSelectedCampaign(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-semibold transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
