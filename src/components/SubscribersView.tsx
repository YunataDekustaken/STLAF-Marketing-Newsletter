import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Download, 
  Upload, 
  Search, 
  Filter, 
  Trash2, 
  Edit2, 
  UserCheck, 
  UserMinus, 
  X, 
  FileText, 
  Tag, 
  RefreshCw,
  BarChart3,
  PieChart as PieChartIcon,
  MessageSquare,
  Calendar,
  AlertTriangle,
  CheckSquare,
  ClipboardList
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Subscriber } from '../types';
import { toast } from 'react-hot-toast';
import Papa from 'papaparse';
import { sendInAppNotification } from '../services/notificationService';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart as RechartsPieChart,
  Pie,
  Legend
} from 'recharts';

function parseTags(tagsVal: any): string[] {
  let tags: string[] = [];
  if (Array.isArray(tagsVal)) {
    tags = tagsVal.map(String);
  } else if (typeof tagsVal === 'string') {
    if (!tagsVal.trim()) return [];
    try {
      const parsed = JSON.parse(tagsVal);
      if (Array.isArray(parsed)) {
        tags = parsed.map(String);
      } else {
        tags = [String(parsed)];
      }
    } catch {
      tags = tagsVal.split(',').map((t: string) => t.trim()).filter(Boolean);
    }
  }
  return Array.from(new Set(tags.map(t => t.trim().toLowerCase()).filter(Boolean)));
}

export const SubscribersView: React.FC = () => {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'insights'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'unsubscribed' | 'bounced'>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [uniqueTags, setUniqueTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Bulk selection states
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const [selectedSubIds, setSelectedSubIds] = useState<string[]>([]);
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [bulkTagActionType, setBulkTagActionType] = useState<'add' | 'remove'>('add');
  const [bulkTagInput, setBulkTagInput] = useState('');

  // Feedback specific states
  const [feedbackFilter, setFeedbackFilter] = useState<string>('all');
  const [feedbackSearch, setFeedbackSearch] = useState<string>('');

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscriber | null>(null);
  const [subName, setSubName] = useState('');
  const [subEmail, setSubEmail] = useState('');
  const [subStatus, setSubStatus] = useState<'active' | 'unsubscribed' | 'bounced'>('active');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchTagQuery, setSearchTagQuery] = useState('');
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);

  // Bulk Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'subscribers'), (snapshot) => {
      const list: Subscriber[] = [];
      const tagsSet = new Set<string>();
      const seenLower = new Set<string>();
      snapshot.forEach(doc => {
        const data = doc.data() as Subscriber;
        const parsedTags = parseTags(data.tags);
        list.push({ ...data, tags: parsedTags, id: doc.id });
        parsedTags.forEach(t => {
          const lower = t.toLowerCase();
          if (!seenLower.has(lower)) {
            seenLower.add(lower);
            tagsSet.add(t);
          }
        });
      });
      list.sort((a,b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
      setSubscribers(list);
      setUniqueTags(Array.from(tagsSet));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const openAddModal = () => {
    setEditingSub(null);
    setSubName('');
    setSubEmail('');
    setSubStatus('active');
    setSelectedTags([]);
    setSearchTagQuery('');
    setIsTagDropdownOpen(false);
    setShowAddModal(true);
  };

  const openEditModal = (sub: Subscriber) => {
    setEditingSub(sub);
    setSubName(sub.name);
    setSubEmail(sub.email);
    setSubStatus(sub.status);
    setSelectedTags(parseTags(sub.tags));
    setSearchTagQuery('');
    setIsTagDropdownOpen(false);
    setShowAddModal(true);
  };

  const handleSaveSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subEmail || !subName) {
      toast.error("Email and Name are required");
      return;
    }

    const finalTags = [...selectedTags];
    const queryTag = searchTagQuery.trim().toLowerCase();
    if (queryTag && !finalTags.includes(queryTag)) {
      finalTags.push(queryTag);
    }
    const tags = Array.from(new Set(finalTags.map(t => t.trim().toLowerCase()).filter(Boolean)));

    try {
      if (editingSub) {
        // Edit
        await setDoc(doc(db, 'subscribers', editingSub.id), {
          name: subName,
          email: subEmail,
          status: subStatus,
          tags,
          addedAt: editingSub.addedAt,
          addedBy: editingSub.addedBy
        }, { merge: true });
        toast.success("Subscriber updated successfully!");
      } else {
        // New
        await addDoc(collection(db, 'subscribers'), {
          name: subName,
          email: subEmail,
          status: subStatus,
          tags,
          addedAt: new Date().toISOString(),
          addedBy: auth.currentUser?.email || 'admin'
        });
        await sendInAppNotification({
          title: "New Subscriber Added 👤",
          message: `${subName || 'Anonymous'} (${subEmail}) registered successfully.`,
          type: "success"
        });
        toast.success("Subscriber added!");
      }
      setShowAddModal(false);
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    }
  };

  const toggleStatus = async (sub: Subscriber) => {
    const newStatus = sub.status === 'active' ? 'unsubscribed' : 'active';
    try {
      await setDoc(doc(db, 'subscribers', sub.id), { status: newStatus }, { merge: true });
      await sendInAppNotification({
        title: "Subscriber Status Updated 🔄",
        message: `${sub.name || 'Anonymous'} is now set to ${newStatus}.`,
        type: "info"
      });
      toast.success(`Subscriber is now ${newStatus}`);
    } catch (err: any) {
      toast.error("Toggle status failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this subscriber?")) return;
    try {
      await deleteDoc(doc(db, 'subscribers', id));
      toast.success("Deleted subscriber");
    } catch (e: any) {
      toast.error("Delete failed");
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete these ${selectedSubIds.length} custom subscribers?`)) return;
    const toastId = toast.loading(`Deleting ${selectedSubIds.length} subscribers...`);
    try {
      const batch = writeBatch(db);
      selectedSubIds.forEach(id => {
        batch.delete(doc(db, 'subscribers', id));
      });
      await batch.commit();
      setSelectedSubIds([]);
      toast.success(`Successfully deleted selected subscribers!`, { id: toastId });
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`, { id: toastId });
    }
  };

  const handleBulkUpdateStatus = async (status: 'active' | 'unsubscribed' | 'bounced') => {
    const toastId = toast.loading(`Updating status...`);
    try {
      const batch = writeBatch(db);
      selectedSubIds.forEach(id => {
        batch.set(doc(db, 'subscribers', id), { status }, { merge: true });
      });
      await batch.commit();
      setSelectedSubIds([]);
      toast.success(`Successfully updated status for selected subscribers!`, { id: toastId });
    } catch (err: any) {
      toast.error(`Failed to bulk update status: ${err.message}`, { id: toastId });
    }
  };

  const handleBulkAddTags = async (tagsToAddStr: string) => {
    const rawTags = tagsToAddStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    if (rawTags.length === 0) {
      toast.error("Please enter at least one tag.");
      return;
    }
    
    const newTagsNormalized = Array.from(new Set(rawTags));

    const toastId = toast.loading(`Adding tags to ${selectedSubIds.length} subscribers...`);
    try {
      const batch = writeBatch(db);
      selectedSubIds.forEach(id => {
        const sub = subscribers.find(s => s.id === id);
        if (sub) {
          const currentTags = sub.tags || [];
          const updatedTags = [...currentTags];
          newTagsNormalized.forEach(newT => {
            if (!updatedTags.some(existing => existing.toLowerCase() === newT.toLowerCase())) {
              updatedTags.push(newT);
            }
          });
          batch.set(doc(db, 'subscribers', id), { tags: updatedTags }, { merge: true });
        }
      });
      await batch.commit();
      setSelectedSubIds([]);
      setBulkTagInput('');
      setShowBulkTagModal(false);
      toast.success(`Broadly added tags to selected subscribers!`, { id: toastId });
    } catch (err: any) {
      toast.error(`Bulk tag add failed: ${err.message}`, { id: toastId });
    }
  };

  const handleBulkRemoveTags = async (tagsToRemoveStr: string) => {
    const tagsToRemove = tagsToRemoveStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    if (tagsToRemove.length === 0) {
      toast.error("Please enter at least one tag to remove.");
      return;
    }

    const toastId = toast.loading(`Removing tags from ${selectedSubIds.length} subscribers...`);
    try {
      const batch = writeBatch(db);
      selectedSubIds.forEach(id => {
        const sub = subscribers.find(s => s.id === id);
        if (sub) {
          const currentTags = sub.tags || [];
          const updatedTags = currentTags.filter(t => !tagsToRemove.includes(t.toLowerCase()));
          batch.set(doc(db, 'subscribers', id), { tags: updatedTags }, { merge: true });
        }
      });
      await batch.commit();
      setSelectedSubIds([]);
      setBulkTagInput('');
      setShowBulkTagModal(false);
      toast.success(`Broadly removed tags from selected subscribers!`, { id: toastId });
    } catch (err: any) {
      toast.error(`Bulk tag remove failed: ${err.message}`, { id: toastId });
    }
  };

  const handleExportCSV = () => {
    const csvContent = Papa.unparse(subscribers.map(s => ({
      Name: s.name,
      Email: s.email,
      Tags: s.tags?.join(';'),
      Status: s.status,
      AddedAt: s.addedAt
    })));

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `subscribers_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Export completed!");
  };

  const handleCsvUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      toast.error("Please pick a valid CSV file");
      return;
    }

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const batch = writeBatch(db);
        let count = 0;
        
        results.data.forEach((row: any) => {
          // Detect headers: name, email, tags, status
          const email = row.Email || row.email || row.EMAIL;
          const name = row.Name || row.name || row.NAME || email?.split('@')[0];
          const tagsStr = row.Tags || row.tags || row.TAGS || '';
          const status = (row.Status || row.status || 'active').toLowerCase() as any;

          if (email) {
            const tags = Array.from(new Set(tagsStr.split(';').map((t: string) => t.trim().toLowerCase()).filter(Boolean)));
            const newDocRef = doc(collection(db, 'subscribers'));
            batch.set(newDocRef, {
              email,
              name,
              tagsSpace: tagsStr, // preserving raw
              tags,
              status: ['active', 'unsubscribed', 'bounced'].includes(status) ? status : 'active',
              addedAt: new Date().toISOString(),
              addedBy: auth.currentUser?.email || 'bulk-uploader'
            });
            count++;
          }
        });

        if (count > 0) {
          try {
            await batch.commit();
            toast.success(`Broadly imported ${count} subscribers!`);
            setShowImportModal(false);
            setCsvFile(null);
          } catch (err: any) {
            toast.error(`Write failed: ${err.message}`);
          }
        } else {
          toast.error("No valid subscribers found in CSV.");
        }
      }
    });
  };

  const filtered = subscribers.filter(sub => {
    const matchesSearch = sub.name?.toLowerCase().includes(search.toLowerCase()) || 
                          sub.email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    const matchesTag = tagFilter === 'all' || sub.tags?.some(t => t.toLowerCase() === tagFilter.toLowerCase());

    return matchesSearch && matchesStatus && matchesTag;
  });

  const unsubscribedSubs = subscribers.filter(s => s.status === 'unsubscribed' || s.unsubscribeReason);

  const reasonLabels: Record<string, string> = {
    "Emails are too frequent": "Too Frequent Frequency",
    "Content is no longer relevant to me": "Content Irrelevant",
    "I received this email by mistake": "Incorrect Sign-up/Mistake",
    "The content quality is not what I expected": "Poor/Unexpected Quality",
    "Other (please specify)": "Other Reasons"
  };

  const reasonCounts: Record<string, number> = {
    "Too Frequent Frequency": 0,
    "Content Irrelevant": 0,
    "Incorrect Sign-up/Mistake": 0,
    "Poor/Unexpected Quality": 0,
    "Other / Specific Details": 0,
    "No Reason Specified": 0
  };

  unsubscribedSubs.forEach(s => {
    const raw = s.unsubscribeReason?.trim();
    if (!raw || raw === "No reason specified" || raw === "") {
      reasonCounts["No Reason Specified"]++;
    } else if (raw.startsWith("Other:") || raw === "Other (please specify)") {
      reasonCounts["Other / Specific Details"]++;
    } else if (reasonLabels[raw]) {
      reasonCounts[reasonLabels[raw]]++;
    } else {
      reasonCounts["Other / Specific Details"]++;
    }
  });

  const chartData = Object.keys(reasonCounts)
    .map(key => ({
      name: key,
      value: reasonCounts[key]
    }))
    .filter(item => item.value > 0);

  const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#6366f1', '#ec4899', '#64748b'];

  const filteredFeedback = unsubscribedSubs.filter(s => {
    const reason = s.unsubscribeReason || "No reason specified";
    const matchesFilter = feedbackFilter === 'all' || 
      (feedbackFilter === 'specified' && reason !== 'No reason specified') ||
      (feedbackFilter === 'too_frequent' && reason === 'Emails are too frequent') ||
      (feedbackFilter === 'irrelevant' && reason === 'Content is no longer relevant to me') ||
      (feedbackFilter === 'mistake' && reason === 'I received this email by mistake') ||
      (feedbackFilter === 'quality' && reason === 'The content quality is not what I expected') ||
      (feedbackFilter === 'other' && (reason.startsWith('Other') || (!reasonLabels[reason] && reason !== 'No reason specified')));
      
    const matchesSearch = feedbackSearch === '' || 
      s.email?.toLowerCase().includes(feedbackSearch.toLowerCase()) ||
      s.name?.toLowerCase().includes(feedbackSearch.toLowerCase()) ||
      reason.toLowerCase().includes(feedbackSearch.toLowerCase());
      
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 font-semibold text-white rounded-lg text-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Subscriber
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-250 text-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-xs font-semibold cursor-pointer"
          >
            <Upload className="w-4 h-4" /> CSV Import
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-250 text-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg text-xs font-semibold cursor-pointer"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Visual Navigation Tabs */}
      <div className="flex border-b border-slate-205 dark:border-slate-805">
        <button
          onClick={() => setActiveTab('list')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'list'
              ? 'border-amber-500 text-amber-500'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <Users className="w-4 h-4" /> Subscriber Directory ({filtered.length})
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'insights'
              ? 'border-amber-500 text-amber-500'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Opt-Out Feedback Insights ({unsubscribedSubs.length})
        </button>
      </div>

      {activeTab === 'insights' ? (
        <div className="space-y-6 animate-fade-in">
          {/* Key Metric cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center gap-4">
              <div className="p-3 bg-red-100 dark:bg-red-950/30 rounded-lg text-red-650 dark:text-red-400">
                <UserMinus className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-505 uppercase tracking-widest block">Total Opt-Outs</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white leading-none block mt-0.5">{unsubscribedSubs.length}</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center gap-4">
              <div className="p-3 bg-amber-100 dark:bg-amber-950/30 rounded-lg text-amber-600 dark:text-amber-400 font-bold">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-505 uppercase tracking-widest block">Feedback Provided</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white leading-none block mt-0.5">
                  {unsubscribedSubs.filter(s => s.unsubscribeReason && s.unsubscribeReason !== 'No reason specified').length}
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-950/30 rounded-lg text-emerald-650 dark:text-emerald-400">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-widest block">Feedback Rate</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white leading-none block mt-0.5">
                  {(unsubscribedSubs.length > 0 
                    ? (unsubscribedSubs.filter(s => s.unsubscribeReason && s.unsubscribeReason !== 'No reason specified').length / unsubscribedSubs.length) * 100 
                    : 0
                  ).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Visualization Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-805 p-5 rounded-xl shadow-sm space-y-4">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-950 dark:text-white flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <BarChart3 className="w-4 h-4 text-amber-500" /> distribution of opt-out reasons
              </h3>
              
              {chartData.length === 0 ? (
                <div className="h-[250px] flex flex-col items-center justify-center text-slate-400 text-xs">
                  <AlertTriangle className="w-8 h-8 text-slate-350 mb-2" />
                  No specific opt-out reason reasons have been submitted yet.
                </div>
              ) : (
                <div className="h-[250px] w-full text-xs font-semibold pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: '9px' }} />
                      <YAxis tick={{ fill: '#94a3b8' }} allowDecimals={false} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#0f172a', 
                          border: 'none', 
                          borderRadius: '8px', 
                          color: '#fff',
                          fontSize: '11px'
                        }} 
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-805 p-5 rounded-xl shadow-sm space-y-4">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-950 dark:text-white flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <PieChartIcon className="w-4 h-4 text-amber-500" /> Share proportion ratio
              </h3>
              
              {chartData.length === 0 ? (
                <div className="h-[250px] flex flex-col items-center justify-center text-slate-400 text-xs">
                  <AlertTriangle className="w-8 h-8 text-slate-350 mb-2" />
                  No feedback proportion ratios available.
                </div>
              ) : (
                <div className="h-[250px] w-full text-xs font-semibold relative flex items-center pr-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: '#0f172a', 
                          border: 'none', 
                          borderRadius: '8px', 
                          color: '#fff',
                          fontSize: '11px'
                        }} 
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  {/* Custom visual legend */}
                  <div className="absolute right-2 top-4 bottom-4 flex flex-col justify-center gap-2 w-[150px] overflow-y-auto pr-1">
                    {chartData.map((item, idx) => (
                      <div key={item.name} className="flex items-center gap-1.5 text-[10px]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                        <span className="text-slate-650 dark:text-slate-400 font-semibold truncate" title={item.name}>
                          {item.name}: <strong className="text-slate-900 dark:text-white">{item.value}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Log / Feedback listing and filters table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-205 dark:border-slate-805 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/20">
              <h3 className="font-bold text-sm text-slate-950 dark:text-white flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-amber-500" /> Detailed Customer Opt-Out Logs
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search comments..."
                    value={feedbackSearch}
                    onChange={(e) => setFeedbackSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                </div>
                
                <select
                  value={feedbackFilter}
                  onChange={(e) => setFeedbackFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="all">All Feedback Comments</option>
                  <option value="specified">Only Specified Reasons</option>
                  <option value="too_frequent">Emails are too frequent</option>
                  <option value="irrelevant">Content is no longer relevant</option>
                  <option value="mistake">Received by mistake</option>
                  <option value="quality">Quality not expected</option>
                  <option value="other">Other specifiable reasons</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Client Name</th>
                    <th className="px-6 py-4">Target Email</th>
                    <th className="px-6 py-4">Opt-Out Date</th>
                    <th className="px-6 py-4">Option Chosen / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredFeedback.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-xs">
                        No customer opt-out logs match your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredFeedback.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                        <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                          {sub.name}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">{sub.email}</td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-400">
                          {sub.unsubscribedAt 
                            ? new Date(sub.unsubscribedAt).toLocaleString() 
                            : sub.addedAt 
                            ? new Date(sub.addedAt).toLocaleDateString()
                            : "N/A"
                          }
                        </td>
                        <td className="px-6 py-4 max-w-sm whitespace-normal truncate">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-block ${
                            !sub.unsubscribeReason || sub.unsubscribeReason === 'No reason specified'
                              ? 'bg-slate-100 text-slate-500 dark:bg-slate-950'
                              : sub.unsubscribeReason.startsWith('Other:')
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-400'
                          }`}>
                            {sub.unsubscribeReason || "No reason specified"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Audiences Filters Box */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <input
                type="text"
                placeholder="Search by name or email address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending Verification</option>
                <option value="unsubscribed">Unsubscribed</option>
                <option value="bounced">Bounced</option>
              </select>

              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none min-w-[120px]"
              >
                <option value="all">All Tags</option>
                {uniqueTags.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bulk Action Panel */}
          {selectedSubIds.length > 0 && (
            <div id="bulk-action-bar" className="bg-amber-50 dark:bg-amber-955 border border-amber-200 dark:border-amber-900 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between animate-fade-in mb-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-505 animate-pulse" />
                <p className="text-xs font-bold text-amber-805 dark:text-amber-300">
                  Selected <strong className="text-amber-900 dark:text-white text-sm">{selectedSubIds.length}</strong> {selectedSubIds.length === 1 ? 'subscriber' : 'subscribers'} for bulk actions
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                {/* Status Actions */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-amber-705/80 uppercase tracking-wider">Status:</span>
                  <button
                    onClick={() => handleBulkUpdateStatus('active')}
                    className="px-2 py-1 text-[10px] font-bold bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 cursor-pointer shadow-xs"
                  >
                    Set Active
                  </button>
                  <button
                    onClick={() => handleBulkUpdateStatus('unsubscribed')}
                    className="px-2 py-1 text-[10px] font-bold bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 cursor-pointer shadow-xs"
                  >
                    Set Unsubscribed
                  </button>
                  <button
                    onClick={() => handleBulkUpdateStatus('bounced')}
                    className="px-2 py-1 text-[10px] font-bold bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 cursor-pointer shadow-xs"
                  >
                    Set Bounced
                  </button>
                </div>

                <div className="h-5 w-px bg-amber-200 dark:bg-amber-900 mx-1 hidden sm:block" />

                {/* Tags Actions */}
                <button
                  type="button"
                  onClick={() => {
                    setBulkTagActionType('add');
                    setBulkTagInput('');
                    setShowBulkTagModal(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-250 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 cursor-pointer shadow-xs"
                >
                  <Tag className="w-3 h-3 text-amber-500" /> + Add Tags
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkTagActionType('remove');
                    setBulkTagInput('');
                    setShowBulkTagModal(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-250 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 cursor-pointer shadow-xs"
                >
                  <Tag className="w-3 h-3 text-amber-500" /> - Remove Tags
                </button>

                <div className="h-5 w-px bg-amber-200 dark:bg-amber-900 mx-1 hidden sm:block" />

                {/* Delete selected */}
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-red-600 hover:bg-red-705 text-white rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>

                {/* Clear selection */}
                <button
                  onClick={() => setSelectedSubIds([])}
                  className="px-2 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                >
                  Clear ({selectedSubIds.length})
                </button>
              </div>
            </div>
          )}

          {/* Subscribers Table card design */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            {/* Table Header Controls */}
            <div className="px-5 py-3 border-b border-slate-150 dark:border-slate-805 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Subscribers List</span>
              <button
                type="button"
                id="toggle-multi-select-mode-btn"
                title={bulkSelectionMode ? "Exit Selection Mode" : "Enable Bulk Selection"}
                onClick={() => {
                  setBulkSelectionMode(!bulkSelectionMode);
                  if (bulkSelectionMode) {
                    setSelectedSubIds([]); // Clear selection when turning off Selection Mode
                  }
                }}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  bulkSelectionMode 
                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:border-slate-800 dark:text-slate-250 shadow-xs'
                }`}
              >
                <CheckSquare className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    {bulkSelectionMode && (
                      <th className="px-4 py-4 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={filtered.length > 0 && filtered.every(sub => selectedSubIds.includes(sub.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const allFilteredIds = filtered.map(sub => sub.id);
                              setSelectedSubIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
                            } else {
                              const filteredSet = new Set(filtered.map(sub => sub.id));
                              setSelectedSubIds(prev => prev.filter(id => !filteredSet.has(id)));
                            }
                          }}
                          className="rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-550 cursor-pointer h-4 w-4 bg-transparent"
                        />
                      </th>
                    )}
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Tags</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Created Date</th>
                    <th className="px-6 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {loading ? (
                    <tr>
                      <td colSpan={bulkSelectionMode ? 7 : 6} className="px-6 py-12 text-center text-slate-400">Loading audience lists...</td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={bulkSelectionMode ? 7 : 6} className="px-6 py-12 text-center text-slate-400">No subscribers match search filters.</td>
                    </tr>
                  ) : (
                    filtered.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                        {bulkSelectionMode && (
                          <td className="px-4 py-4 text-center w-10">
                            <input
                              type="checkbox"
                              checked={selectedSubIds.includes(sub.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSubIds(prev => [...prev, sub.id]);
                                } else {
                                  setSelectedSubIds(prev => prev.filter(id => id !== sub.id));
                                }
                              }}
                              className="rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-550 cursor-pointer h-4 w-4 bg-transparent"
                            />
                          </td>
                        )}
                        <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{sub.name}</td>
                        <td className="px-6 py-4 font-mono text-xs">{sub.email}</td>
                        <td className="px-6 py-4 max-w-xs truncate">
                          <div className="flex flex-wrap gap-1">
                            {sub.tags && sub.tags.map(t => (
                              <span key={t} className="bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 text-[10px] px-2 py-0.5 rounded-full font-semibold border border-amber-200/45">
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            sub.status === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30' :
                            sub.status === 'pending' ? 'bg-cyan-105 text-cyan-800 dark:bg-cyan-950/30' :
                            sub.status === 'unsubscribed' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/30' :
                            'bg-red-100 text-red-800 dark:bg-red-950/30'
                          }`}>
                            {sub.status === 'pending' ? 'Pending' : sub.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400">
                          {sub.addedAt ? new Date(sub.addedAt).toLocaleDateString() : ''}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => toggleStatus(sub)}
                              className={`p-1 rounded text-xs px-2 font-bold transition-all ${
                                sub.status === 'active' 
                                  ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' 
                                  : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                              }`}
                            >
                              {sub.status === 'active' ? 'Unsubscribe' : 'Activate'}
                            </button>
                            <button
                              onClick={() => openEditModal(sub)}
                              className="p-1 text-slate-500 hover:text-slate-800"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(sub.id)}
                              className="p-1 text-red-500 hover:text-red-700"
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
        </>
      )}

      {/* Add / Edit Subscriber Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveSubscriber} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {editingSub ? "Edit Subscriber Profile" : "Register New Subscriber"}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="Juan Dela Cruz"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="juandelacruz@example.com"
                  value={subEmail}
                  onChange={(e) => setSubEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-950 dark:text-white"
                />
              </div>

              <div className="relative">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Tags</label>
                
                {/* Selected Tag Badges Container */}
                <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent min-h-[42px] items-center focus-within:ring-1 focus-within:ring-amber-500 transition-all">
                  {selectedTags.map(tag => (
                    <span 
                      key={tag} 
                      className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/45 text-amber-800 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full border border-amber-100 dark:border-amber-900/50 font-medium"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
                        className="p-0.5 hover:text-red-500 text-amber-500/70 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  
                  <input
                    type="text"
                    value={searchTagQuery}
                    placeholder={selectedTags.length === 0 ? "Search or type new tag..." : "Add tag..."}
                    onChange={(e) => {
                      setSearchTagQuery(e.target.value.toLowerCase());
                      setIsTagDropdownOpen(true);
                    }}
                    onFocus={() => setIsTagDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        const val = searchTagQuery.trim().toLowerCase();
                        if (val) {
                          if (!selectedTags.includes(val)) {
                            setSelectedTags(prev => [...prev, val]);
                          }
                          setSearchTagQuery('');
                        }
                      } else if (e.key === 'Backspace' && !searchTagQuery && selectedTags.length > 0) {
                        setSelectedTags(prev => prev.slice(0, -1));
                      }
                    }}
                    className="flex-1 min-w-[120px] bg-transparent border-0 p-0 text-sm focus:outline-none focus:ring-0 text-slate-950 dark:text-white"
                  />
                </div>

                {/* Suggestions Dropdown */}
                {isTagDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsTagDropdownOpen(false)} 
                    />
                    
                    <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg py-1">
                      {(() => {
                        const filteredSuggestions = uniqueTags.filter(tag => 
                          tag.toLowerCase().includes(searchTagQuery) && 
                          !selectedTags.includes(tag.toLowerCase())
                        );

                        const exactMatchExists = uniqueTags.some(tag => tag.toLowerCase() === searchTagQuery.trim());

                        return (
                          <>
                            {filteredSuggestions.length > 0 ? (
                              filteredSuggestions.map(tag => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => {
                                    setSelectedTags(prev => [...prev, tag.toLowerCase()]);
                                    setSearchTagQuery('');
                                    setIsTagDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 flex items-center gap-1.5 font-medium border-b border-slate-50 last:border-0 dark:border-slate-850"
                                >
                                  <Tag className="w-3.5 h-3.5 text-amber-500/60" />
                                  <span>{tag}</span>
                                </button>
                              ))
                            ) : searchTagQuery.trim() === '' ? (
                              <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 italic">
                                Start typing to search existing tags...
                              </div>
                            ) : null}

                            {searchTagQuery.trim() !== '' && !exactMatchExists && !selectedTags.includes(searchTagQuery.trim()) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newTag = searchTagQuery.trim().toLowerCase();
                                  setSelectedTags(prev => [...prev, newTag]);
                                  setSearchTagQuery('');
                                  setIsTagDropdownOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 dark:hover:bg-amber-955 text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5 text-amber-500" />
                                <span>Create new tag: "{searchTagQuery.trim()}"</span>
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}


                <p className="text-[10px] text-slate-400 mt-1">Press Enter or type a comma to add custom tags.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Status</label>
                <select
                  value={subStatus}
                  onChange={(e) => setSubStatus(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="active">Active</option>
                  <option value="unsubscribed">Unsubscribed</option>
                  <option value="bounced">Bounced</option>
                </select>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-semibold"
              >
                Save Profile
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCsvUpload} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <FileText className="w-5 h-5 text-amber-500" /> Bulk subscribers CSV Import
              </h3>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Your CSV should include columns like <strong>Email</strong>, <strong>Name</strong>, and optionally <strong>Tags</strong> (use semicolon separator if multiple) and <strong>Status</strong>.
              </p>

              <div className="border-2 border-dashed border-slate-250 dark:border-slate-800 rounded-xl p-8 text-center bg-slate-50 dark:bg-slate-950">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files ? e.target.files[0] : null)}
                  className="hidden"
                  id="csv-file-selector"
                />
                <label htmlFor="csv-file-selector" className="cursor-pointer space-y-2 block">
                  <Upload className="w-8 h-8 mx-auto text-slate-400" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {csvFile ? csvFile.name : "Select subscription list CSV"}
                  </p>
                  <p className="text-xs text-slate-400">Click to browse or drop file here</p>
                </label>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-semibold"
              >
                Parse & Upload
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Tag Management Modal */}
      {showBulkTagModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (bulkTagActionType === 'add') {
                handleBulkAddTags(bulkTagInput);
              } else {
                handleBulkRemoveTags(bulkTagInput);
              }
            }} 
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col animate-fade-in"
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Tag className="w-5 h-5 text-amber-500" />
                {bulkTagActionType === 'add' ? 'Bulk Add Tags' : 'Bulk Remove Tags'}
              </h3>
              <button
                type="button"
                onClick={() => setShowBulkTagModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-left">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                This will {bulkTagActionType === 'add' ? 'add' : 'remove'} the following tag(s) from/to the <strong>{selectedSubIds.length}</strong> selected subscribers.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Tags (Comma Separated)</label>
                <input
                  type="text"
                  required
                  placeholder="VIP, Alumni, June2026"
                  value={bulkTagInput}
                  onChange={(e) => setBulkTagInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-950 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  autoFocus
                />
              </div>

              {uniqueTags.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Click existing tag to select/deselect:</p>
                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-950/40 rounded-lg border border-slate-150 dark:border-slate-800">
                    {uniqueTags.map(tag => {
                      const currentTags = bulkTagInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                      const isSelected = currentTags.includes(tag.toLowerCase());

                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            const list = bulkTagInput.split(',').map(t => t.trim()).filter(Boolean);
                            const lowerList = list.map(t => t.toLowerCase());
                            const idx = lowerList.indexOf(tag.toLowerCase());
                            if (idx >= 0) {
                              list.splice(idx, 1);
                            } else {
                              list.push(tag);
                            }
                            setBulkTagInput(list.join(', '));
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-amber-500 text-white border-amber-600'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-350 border-slate-250 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkTagModal(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-semibold"
              >
                Apply to {selectedSubIds.length} Subscribers
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
