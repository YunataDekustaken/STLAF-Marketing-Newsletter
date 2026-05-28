import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Save, 
  Eye, 
  EyeOff,
  Code, 
  Users, 
  Calendar, 
  Mail, 
  Info, 
  Check, 
  Sparkles, 
  X, 
  FileText,
  Paperclip,
  Trash2,
  Image,
  Undo,
  Redo,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Quote,
  Link,
  Table,
  Smartphone,
  Monitor,
  Maximize2,
  Minimize2,
  ChevronDown,
  FileCode,
  Globe,
  Scissors,
  HelpCircle,
  ArrowLeft
} from 'lucide-react';
import { collection, getDocs, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { EmailCampaign, Subscriber, EmailTemplate } from '../types';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { sendInAppNotification } from '../services/notificationService';

interface ComposeCampaignViewProps {
  onNavigate: (view: any) => void;
  initialCampaign?: EmailCampaign | null;
}

function parseTags(tagsVal: any): string[] {
  if (Array.isArray(tagsVal)) {
    return tagsVal;
  }
  if (typeof tagsVal === 'string') {
    if (!tagsVal.trim()) return [];
    try {
      const parsed = JSON.parse(tagsVal);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
      return [String(parsed)];
    } catch {
      return tagsVal.split(',').map((t: string) => t.trim()).filter(Boolean);
    }
  }
  return [];
}

function formatTagDisplay(tag: string): string {
  if (!tag) return "";
  const trimmed = tag.trim();
  return trimmed.split(/\s+/)
    .map(word => {
      if (word.toLowerCase() === "it") return "IT";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export const ComposeCampaignView: React.FC<ComposeCampaignViewProps> = ({ onNavigate, initialCampaign }) => {
  const [title, setTitle] = useState(initialCampaign?.title || '');
  const [subject, setSubject] = useState(initialCampaign?.subject || '');
  const [type, setType] = useState<EmailCampaign['type']>(initialCampaign?.type || 'Newsletter');
  const [body, setBody] = useState(initialCampaign?.body || '');
  const [importedPostId, setImportedPostId] = useState<string>((initialCampaign as any)?.importedPostId || '');
  const [recipientTags, setRecipientTags] = useState<string[]>(Array.isArray(initialCampaign?.recipientTags) ? initialCampaign.recipientTags : []);
  const [sendType, setSendType] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; type: string; size: number; content: string }[]>(() => {
    if (initialCampaign?.attachmentsJson) {
      try {
        return JSON.parse(initialCampaign.attachmentsJson);
      } catch (e) {
        console.error("Error parsing campaign attachments:", e);
      }
    }
    return [];
  });
  
  // Available subscriber tags
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  // Loaded templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  // Visual Editor and formatting states
  const [editorMode, setEditorMode] = useState<'visual' | 'code'>('visual');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [activeDropdown, setActiveDropdown] = useState<'edit' | 'view' | 'insert' | 'format' | 'table' | null>(null);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showAids, setShowAids] = useState(true);
  const [loading, setLoading] = useState(false);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [showRecipientsList, setShowRecipientsList] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // Fullscreen and Resizing states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editorHeight, setEditorHeight] = useState<number>(450);
  const dragYRef = useRef<number | null>(null);
  const dragHeightRef = useRef<number>(450);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragYRef.current = e.clientY;
    dragHeightRef.current = editorHeight;
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent) => {
    if (dragYRef.current !== null) {
      const deltaY = e.clientY - dragYRef.current;
      const newHeight = Math.max(250, Math.min(1200, dragHeightRef.current + deltaY));
      setEditorHeight(newHeight);
    }
  };

  const handleDragEnd = () => {
    dragYRef.current = null;
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
  };

  // Clean up drag events on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (activeDropdown && !(e.target as HTMLElement).closest('.toolbar-dropdown-container')) {
        setActiveDropdown(null);
        setShowTablePicker(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [activeDropdown]);

  // Synchronize internal body state to contentEditable DOM only on external updates or mode changes
  useEffect(() => {
    if (editorMode === 'visual' && editorRef.current) {
      if (editorRef.current.innerHTML !== body) {
        editorRef.current.innerHTML = body || '<p><br></p>';
      }
    }
  }, [body, editorMode]);

  const executeCommand = (command: string, value: string = '') => {
    try {
      document.execCommand(command, false, value);
    } catch (e) {
      console.error("Failed to execute format command", e);
    }
    // Pull the content immediately to sync React state
    if (editorRef.current) {
      setBody(editorRef.current.innerHTML);
    }
  };

  const handleVisualInput = () => {
    if (editorRef.current) {
      setBody(editorRef.current.innerHTML);
    }
  };

  const insertTable = (rows: number, cols: number) => {
    let tableHtml = `<table style="width:100%; border-collapse:collapse; margin:16px 0; border:1px solid #cbd5e1;">` +
      `<thead><tr style="background-color:#f8fafc;">`;
    for (let c = 0; c < cols; c++) {
      tableHtml += `<th style="border:1px solid #cbd5e1; padding:8px; text-align:left; font-weight:bold; font-size:13px; color:#334155;">Header ${c+1}</th>`;
    }
    tableHtml += `</tr></thead><tbody>`;
    for (let r = 0; r < rows; r++) {
      tableHtml += `<tr>`;
      for (let c = 0; c < cols; c++) {
        tableHtml += `<td style="border:1px solid #cbd5e1; padding:8px; text-align:left; font-size:13px; color:#475569;">Cell</td>`;
      }
      tableHtml += `</tr>`;
    }
    tableHtml += `</tbody></table><p><br></p>`;
    executeCommand('insertHTML', tableHtml);
    setShowTablePicker(false);
    setActiveDropdown(null);
  };

  const insertTag = (tag: string) => {
    executeCommand('insertText', tag);
    setActiveDropdown(null);
  };

  const handleInsertLinkPrompt = () => {
    const url = window.prompt("Enter link URL:", "https://");
    if (url) {
      executeCommand('createLink', url);
    }
    setActiveDropdown(null);
  };

  const handleFormatBlock = (tag: string) => {
    executeCommand('formatBlock', tag);
    setActiveDropdown(null);
  };

  useEffect(() => {
    // Fetch subscribers to get all tags and determine recipient counts
    const fetchSubscribersAndTemplates = async () => {
      try {
        const subSnapshot = await getDocs(collection(db, 'subscribers'));
        const subList: Subscriber[] = [];
        const tagsSet = new Set<string>();
        subSnapshot.forEach(doc => {
          const s = doc.data() as Subscriber;
          const parsedTags = parseTags(s.tags);
          subList.push({ ...s, tags: parsedTags, id: doc.id });
          
          // Only pull targeting tags from currently active subscribers
          if (s.status === 'active') {
            parsedTags.forEach(t => {
              if (t && t.trim()) {
                tagsSet.add(formatTagDisplay(t));
              }
            });
          }
        });

        // De-duplicate availableTags case-insensitively
        const uniqueTags: string[] = [];
        tagsSet.forEach(tag => {
          if (!uniqueTags.some(t => t.toLowerCase() === tag.toLowerCase())) {
            uniqueTags.push(tag);
          }
        });

        setSubscribers(subList);
        setAvailableTags(uniqueTags);

        const tempSnapshot = await getDocs(collection(db, 'emailTemplates'));
        const tempList: EmailTemplate[] = [];
        tempSnapshot.forEach(doc => {
          tempList.push({ ...(doc.data() as EmailTemplate), id: doc.id });
        });
        setTemplates(tempList);
      } catch (e) {
        console.error("Error loaded composition references", e);
      }
    };
    fetchSubscribersAndTemplates();
  }, []);

  const handleApplyTemplate = (temp: EmailTemplate) => {
    setSubject(temp.subject);
    setBody(temp.body);
    toast.success(`Applied template: ${temp.name}`);
  };

  const handleTagToggle = (tag: string) => {
    if (recipientTags.some(rt => rt.toLowerCase() === tag.toLowerCase())) {
      setRecipientTags(recipientTags.filter(t => t.toLowerCase() !== tag.toLowerCase()));
    } else {
      setRecipientTags([...recipientTags, tag]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files) as File[];
    
    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`File "${file.name}" is too large (max 5MB)`);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments(prev => [
          ...prev,
          {
            name: file.name,
            type: file.type,
            size: file.size,
            content: reader.result as string
          }
        ]);
        toast.success(`Attached "${file.name}"`);
      };
      reader.readAsDataURL(file);
    });
    
    // Clear input
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
    toast.success("Attachment removed");
  };

  const handleEmbedImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const loadingId = toast.loading("Uploading image...");
      
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const fileData = reader.result as string;
          const response = await fetch("/api/upload", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              fileData,
              fileName: file.name,
              fileType: file.type
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || "Server failed to process upload");
          }

          const data = await response.json();
          const downloadUrl = data.downloadUrl;

          const imgTag = `<img src="${downloadUrl}" alt="${file.name}" style="max-width: 100%; height: auto; border-radius: 12px; margin: 16px auto; display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />`;
          
          if (editorMode === 'visual') {
            executeCommand('insertHTML', imgTag);
          } else {
            setBody(prev => prev ? prev + '\n' + imgTag : imgTag);
          }
          toast.success("Image embedded successfully!", { id: loadingId });
        } catch (error: any) {
          console.error("Error uploading image:", error);
          toast.error(`Failed to upload: ${error.message || "Please check server config"}`, { id: loadingId });
        }
      };
      reader.onerror = () => {
        toast.error("Failed to read image file.", { id: loadingId });
      };
      reader.readAsDataURL(file);
    };
    input.click();
    setActiveDropdown(null);
  };

  const activeFilteredSubscribers = subscribers.filter(s => {
    if (s.status !== 'active') return false;
    if (recipientTags.length === 0) return true; // All Active Subscribers
    return s.tags?.some(t => recipientTags.some(rt => rt.toLowerCase() === t.toLowerCase()));
  });

  const handleCancelGateway = async () => {
    if (importedPostId) {
      setLoading(true);
      try {
        const postRef = doc(db, 'posts', importedPostId);
        await updateDoc(postRef, {
          mailStatus: 'cancelled'
        });
        toast.success("Campaign hand-off cancelled.");
      } catch (err) {
        console.error("Error setting request to cancelled:", err);
      } finally {
        setLoading(false);
      }
    }
    onNavigate('dashboard');
  };

  const handleCreateCampaign = async (isSend: boolean) => {
    if (!title || !subject || !body) {
      toast.error("Please fill in Campaign Title, Subject, and HTML Content.");
      return;
    }

    if (isSend && activeFilteredSubscribers.length === 0) {
      toast.error("There are no active subscribers in the selected filter.");
      return;
    }

    setLoading(true);
    try {
      // 1. Save campaign doc to Firestore
      const newCampaign: Omit<EmailCampaign, 'id'> = {
        title,
        subject,
        body,
        status: isSend ? (sendType === 'schedule' ? 'scheduled' : 'sending') : 'draft',
        type,
        recipientTags,
        scheduledAt: sendType === 'schedule' ? scheduledAt : '',
        sentCount: 0,
        failedCount: 0,
        createdBy: auth.currentUser?.email || 'System',
        createdAt: new Date().toISOString(),
        attachmentsJson: JSON.stringify(attachments)
      };

      const docRef = await addDoc(collection(db, 'emailCampaigns'), newCampaign);
      
      if (isSend) {
        if (sendType === 'schedule') {
          if (importedPostId) {
            try {
              const postRef = doc(db, 'posts', importedPostId);
              await updateDoc(postRef, {
                mailStatus: 'scheduled',
                mailSentTime: serverTimestamp(),
                mailScheduledTime: scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString()
              });
            } catch (err) {
              console.error("Error updating handoff post:", err);
            }
          }
          await sendInAppNotification({
            title: "Campaign Scheduled 📅",
            message: `The campaign "${title}" has been scheduled.`,
            type: "info"
          });
          toast.success("Campaign scheduled successfully!");
          onNavigate('campaigns');
        } else {
          // Bulk send directly in background
          if (importedPostId) {
            try {
              const postRef = doc(db, 'posts', importedPostId);
              await updateDoc(postRef, {
                mailStatus: 'authorized',
                mailSentTime: serverTimestamp()
              });
            } catch (err) {
              console.error("Error updating handoff post:", err);
            }
          }
          await sendInAppNotification({
            title: "Campaign Dispatched 🚀",
            message: `The campaign "${title}" was successfully launched.`,
            type: "success"
          });
          toast.success("Launching bulk campaign send!");
          onNavigate('campaigns');
          // Call client API async
          axios.post('/api/gmail/send-bulk', {
            campaignId: docRef.id,
            recipients: activeFilteredSubscribers.map(s => ({ email: s.email, name: s.name }))
          }).catch(err => {
            console.error("Direct send request failed", err);
          });
        }
      } else {
        await sendInAppNotification({
          title: "New Campaign Draft 📝",
          message: `Campaign draft "${title}" was successfully saved.`,
          type: "info"
        });
        toast.success("Campaign draft saved!");
        onNavigate('campaigns');
      }
    } catch (e: any) {
      console.error("Error creating campaign", e);
      toast.error(`Failed to compose campaign: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {importedPostId && (
        <div className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl gap-4">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl mt-0.5 shrink-0 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-amber-400">
                Loaded from Content Calendar Asset (ID: <span className="font-mono text-xs font-black select-all bg-amber-500/10 text-amber-600 dark:text-amber-300 px-1 py-0.5 rounded">{importedPostId}</span>)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                You can edit the subject, message body content, or attached assets freely before sending. Changes are instantly editable.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('dashboard')}
              className="px-4 py-2 border-0 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm"
            >
              Back to Planner
            </button>
            <button
              onClick={handleCancelGateway}
              className="px-4 py-2 border border-rose-200 dark:border-rose-900/30 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-450 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm"
            >
              Cancel Gateway
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end pb-2">
        <button
          type="button"
          onClick={() => onNavigate('campaigns')}
          className="flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Campaigns
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Composer Form Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            
            {/* Title & Type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Campaign Title (Internal)</label>
                <input
                  type="text"
                  placeholder="e.g. May 2026 Monthly Promotion"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="Newsletter">Newsletter</option>
                  <option value="Promotion">Promotion</option>
                  <option value="Update">Update</option>
                  <option value="Announcement">Announcement</option>
                  <option value="Follow-up">Follow-up</option>
                </select>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Subject Line</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Special Offer inside, {{name}}! 🎁"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Pro-tip: You can use <code className="font-mono bg-slate-50 dark:bg-slate-800 px-1 py-0.5 rounded text-amber-500">{"{{name}}"}</code> and <code className="font-mono bg-slate-50 dark:bg-slate-800 px-1 py-0.5 rounded text-amber-500">{"{{email}}"}</code> to insert personalized values!
              </p>
            </div>

            {/* Templates shortcut */}
            {templates.length > 0 && (
              <div className="p-3 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-800/10 rounded-lg">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Quick Template Apply
                </p>
                <div className="flex flex-wrap gap-2">
                  {templates.map(temp => (
                    <button
                      key={temp.id}
                      onClick={() => handleApplyTemplate(temp)}
                      className="text-[11px] bg-white border border-slate-200 px-2 py-1 rounded text-slate-700 hover:border-amber-500 hover:text-amber-600 transition-all font-medium"
                    >
                      {temp.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Campaign Body Editor with Visual WYSIWYG/HTML Dual-Mode Panel */}
            <div className={`${isFullscreen ? 'fixed inset-0 z-[100] bg-white dark:bg-slate-950 p-4 md:p-8 flex flex-col h-screen w-screen overflow-hidden' : 'space-y-3'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-150 dark:border-slate-800 pb-2 shrink-0">
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">HTML Content / Message Body</h3>
                  <p className="text-[10px] text-slate-400">Design your email using the friendly visual interface or edit raw code blocks directly.</p>
                </div>
                
                {/* Visual vs Code Mode Toggles */}
                <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditorMode('visual')}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      editorMode === 'visual'
                        ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" /> Visual Live Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('code')}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      editorMode === 'code'
                        ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" /> HTML Code Editor
                  </button>
                </div>
              </div>

              {/* RICH TEXT EDIT TOOLBAR (Shown in Visual mode) */}
              {editorMode === 'visual' && (
                <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-t-xl shadow-sm overflow-visible shrink-0">
                  {/* Row 1: Dropdown Menus */}
                  <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-350 select-none">
                    
                    {/* EDIT MENU */}
                    <div className="relative toolbar-dropdown-container">
                      <button
                        type="button"
                        onClick={() => setActiveDropdown(activeDropdown === 'edit' ? null : 'edit')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 font-medium transition-colors"
                      >
                        Edit <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>
                      {activeDropdown === 'edit' && (
                        <div className="absolute left-0 mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1.5 z-50">
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { executeCommand('undo'); setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs text-slate-700 dark:text-slate-200"
                          >
                            <span>Undo</span>
                            <span className="text-[9px] font-mono opacity-50 bg-slate-100 dark:bg-slate-950 px-1 py-0.5 rounded">Ctrl+Z</span>
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { executeCommand('redo'); setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs text-slate-700 dark:text-slate-200"
                          >
                            <span>Redo</span>
                            <span className="text-[9px] font-mono opacity-50 bg-slate-100 dark:bg-slate-950 px-1 py-0.5 rounded">Ctrl+Y</span>
                          </button>
                          <hr className="my-1 border-slate-100 dark:border-slate-800" />
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { executeCommand('selectAll'); setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs text-slate-700 dark:text-slate-200"
                          >
                            <span>Select All</span>
                            <span className="text-[9px] font-mono opacity-50 bg-slate-100 dark:bg-slate-950 px-1 py-0.5 rounded">Ctrl+A</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => { if(confirm("Clear document content?")) { setBody('<p><br></p>'); if(editorRef.current) editorRef.current.innerHTML = '<p><br></p>'; } setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 text-xs text-rose-500"
                          >
                            Clear Canvas
                          </button>
                        </div>
                      )}
                    </div>

                    {/* VIEW MENU */}
                    <div className="relative toolbar-dropdown-container">
                      <button
                        type="button"
                        onClick={() => setActiveDropdown(activeDropdown === 'view' ? null : 'view')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 font-medium transition-colors"
                      >
                        View <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>
                      {activeDropdown === 'view' && (
                        <div className="absolute left-0 mt-1 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1.5 z-50">
                          <button
                            type="button"
                            onClick={() => { setPreviewDevice('desktop'); setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs text-slate-700 dark:text-slate-200"
                          >
                            <span className="flex items-center gap-2"><Monitor className="w-3.5 h-3.5" /> Desktop Width</span>
                            {previewDevice === 'desktop' && <Check className="w-3.5 h-3.5 text-amber-500" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setPreviewDevice('mobile'); setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs text-slate-700 dark:text-slate-200"
                          >
                            <span className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5" /> Mobile Width</span>
                            {previewDevice === 'mobile' && <Check className="w-3.5 h-3.5 text-amber-500" />}
                          </button>
                          <hr className="my-1 border-slate-100 dark:border-slate-800" />
                          <button
                            type="button"
                            onClick={() => { setShowAids(!showAids); setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs text-slate-700 dark:text-slate-200"
                          >
                            <span className="flex items-center gap-1.5">Toggle Table Gridlines</span>
                            {showAids && <Check className="w-3.5 h-3.5 text-amber-500" />}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* INSERT MENU */}
                    <div className="relative toolbar-dropdown-container">
                      <button
                        type="button"
                        onClick={() => setActiveDropdown(activeDropdown === 'insert' ? null : 'insert')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 font-medium transition-colors"
                      >
                        Insert <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>
                      {activeDropdown === 'insert' && (
                        <div className="absolute left-0 mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1.5 z-50">
                          <button
                            type="button"
                            onClick={handleEmbedImage}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"
                          >
                            <Image className="w-3.5 h-3.5 text-slate-450" /> Embed Inline Image
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleInsertLinkPrompt}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"
                          >
                            <Link className="w-3.5 h-3.5 text-slate-450" /> Hyperlink...
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { executeCommand('insertHorizontalRule'); setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"
                          >
                            <span className="font-bold text-[10px]">---</span> Horizontal Line
                          </button>
                          <hr className="my-1 border-slate-100 dark:border-slate-800" />
                          <div className="px-4 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Merge Tags</div>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => insertTag('{{name}}')}
                            className="w-full text-left px-6 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-mono font-semibold"
                          >
                            {"{{name}}"} <span className="text-[10px] text-slate-400 font-normal ml-auto">(First Name)</span>
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => insertTag('{{email}}')}
                            className="w-full text-left px-6 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-mono font-semibold"
                          >
                            {"{{email}}"} <span className="text-[10px] text-slate-400 font-normal ml-auto">(Email Address)</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* FORMAT MENU */}
                    <div className="relative toolbar-dropdown-container">
                      <button
                        type="button"
                        onClick={() => setActiveDropdown(activeDropdown === 'format' ? null : 'format')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 font-medium transition-colors"
                      >
                        Format <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>
                      {activeDropdown === 'format' && (
                        <div className="absolute left-0 mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1.5 z-50">
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { executeCommand('bold'); setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100"
                          >
                            <Bold className="w-3.5 h-3.5" /> Bold
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { executeCommand('italic'); setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-xs italic text-slate-700 dark:text-slate-200"
                          >
                            <Italic className="w-3.5 h-3.5" /> Italic
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { executeCommand('underline'); setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-xs underline text-slate-700 dark:text-slate-200"
                          >
                            <Underline className="w-3.5 h-3.5" /> Underline
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { executeCommand('strikeThrough'); setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-xs line-through text-slate-700 dark:text-slate-200"
                          >
                            <Strikethrough className="w-3.5 h-3.5" /> Strikethrough
                          </button>
                          <hr className="my-1 border-slate-100 dark:border-slate-800" />
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleFormatBlock('p')}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-200"
                          >
                            Regular Paragraph
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleFormatBlock('h1')}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-black text-slate-900 dark:text-white"
                          >
                            Heading 1
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleFormatBlock('h2')}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-extrabold text-slate-800 dark:text-slate-100"
                          >
                            Heading 2
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleFormatBlock('blockquote')}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs italic pl-6 text-slate-600 dark:text-slate-400"
                          >
                            Quote Block
                          </button>
                          <hr className="my-1 border-slate-100 dark:border-slate-800" />
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { executeCommand('removeFormat'); setActiveDropdown(null); }}
                            className="w-full text-left px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs text-rose-500 font-medium"
                          >
                            Clear Formatting
                          </button>
                        </div>
                      )}
                    </div>

                    {/* TABLE MENU */}
                    <div className="relative toolbar-dropdown-container">
                      <button
                        type="button"
                        onClick={() => setActiveDropdown(activeDropdown === 'table' ? null : 'table')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 font-medium transition-colors"
                      >
                        Table <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>
                      {activeDropdown === 'table' && (
                        <div className="absolute left-0 mt-1 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-2 z-50 px-2 space-y-1.5">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Grid Select</p>
                          <div className="grid grid-cols-3 gap-1 px-2">
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => insertTable(2, 2)}
                              className="text-[10px] font-bold bg-slate-100 hover:bg-amber-100 h-8 rounded border border-slate-200 flex items-center justify-center text-slate-700 hover:text-amber-700 hover:border-amber-300"
                            >
                              2x2 Layout
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => insertTable(3, 3)}
                              className="text-[10px] font-bold bg-slate-100 hover:bg-amber-100 h-8 rounded border border-slate-200 flex items-center justify-center text-slate-700 hover:text-amber-700 hover:border-amber-300"
                            >
                              3x3 Layout
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => insertTable(4, 2)}
                              className="text-[10px] font-bold bg-slate-100 hover:bg-amber-100 h-8 rounded border border-slate-200 flex items-center justify-center text-slate-700 hover:text-amber-700 hover:border-amber-300"
                            >
                              4x2 Layout
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Standard Format Buttons Layout (Identical to layout in request image) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-100/70 dark:bg-slate-900/40 select-none">
                    <div className="flex flex-wrap items-center gap-1">
                      {/* Undo & Redo */}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeCommand('undo')}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-colors"
                        title="Undo (Ctrl+Z)"
                      >
                        <Undo className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeCommand('redo')}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-colors"
                        title="Redo (Ctrl+Y)"
                      >
                        <Redo className="w-3.5 h-3.5" />
                      </button>

                      <span className="w-px h-4 bg-slate-250 dark:bg-slate-800 mx-1 block" />

                      {/* Bold & Italic */}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeCommand('bold')}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-extrabold transition-colors"
                        title="Bold (Ctrl+B)"
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeCommand('italic')}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 italic transition-colors"
                        title="Italic (Ctrl+I)"
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeCommand('underline')}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 underline transition-colors"
                        title="Underline (Ctrl+U)"
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>

                      <span className="w-px h-4 bg-slate-250 dark:bg-slate-800 mx-1 block" />

                      {/* Heading Format Quick-switch */}
                      <select
                        onChange={(e) => {
                          handleFormatBlock(e.target.value);
                          e.target.value = ''; // Reset select state
                        }}
                        defaultValue=""
                        className="px-1.5 py-1 text-xs font-semibold rounded border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-250 focus:outline-none cursor-pointer"
                      >
                        <option value="" disabled>Format Block...</option>
                        <option value="p">Paragraph (Normal)</option>
                        <option value="h1">Heading 1 (Large)</option>
                        <option value="h2">Heading 2 (Medium)</option>
                        <option value="h3">Heading 3 (Small)</option>
                        <option value="blockquote">Blockquote Block</option>
                      </select>

                      <span className="w-px h-4 bg-slate-250 dark:bg-slate-800 mx-1 block" />

                      {/* Alignments */}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeCommand('justifyLeft')}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-colors"
                        title="Align Left"
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeCommand('justifyCenter')}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-colors"
                        title="Align Center"
                      >
                        <AlignCenter className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeCommand('justifyRight')}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-colors"
                        title="Align Right"
                      >
                        <AlignRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeCommand('justifyFull')}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-colors"
                        title="Justify"
                      >
                        <AlignJustify className="w-3.5 h-3.5" />
                      </button>

                      <span className="w-px h-4 bg-slate-250 dark:bg-slate-800 mx-1 block" />

                      {/* Bullet & Numbered List */}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeCommand('insertUnorderedList')}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-colors"
                        title="Bullet List"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeCommand('insertOrderedList')}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-colors"
                        title="Numbered List"
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => executeCommand('formatBlock', 'blockquote')}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-colors"
                        title="Blockquote"
                      >
                        <Quote className="w-3.5 h-3.5" />
                      </button>

                      <span className="w-px h-4 bg-slate-250 dark:bg-slate-800 mx-1 block" />

                      {/* Insert Quick Link & Image */}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleInsertLinkPrompt}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-colors font-bold text-amber-600 dark:text-amber-400"
                        title="Insert hyperlink"
                      >
                        <Link className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleEmbedImage}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-colors"
                        title="Embed Inline Image"
                      >
                        <Image className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertTable(2, 2)}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 transition-colors"
                        title="Insert 2x2 Table"
                      >
                        <Table className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Desktop/Mobile Layout switchers and Fullscreen Toggle */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex bg-slate-200/60 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-250 dark:border-slate-700 gap-0.5">
                        <button
                          type="button"
                          onClick={() => setPreviewDevice('desktop')}
                          className={`p-1 rounded transition-all ${
                            previewDevice === 'desktop'
                              ? 'bg-white dark:bg-slate-900 text-amber-500 shadow-sm'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                          }`}
                          title="Simulate desktop mail client width"
                        >
                          <Monitor className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewDevice('mobile')}
                          className={`p-1 rounded transition-all ${
                            previewDevice === 'mobile'
                              ? 'bg-white dark:bg-slate-900 text-amber-500 shadow-sm'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                          }`}
                          title="Simulate mobile phone viewport"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          isFullscreen 
                            ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900 dark:hover:bg-slate-850 dark:border-slate-800 dark:text-slate-250 shadow-xs'
                        }`}
                        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Focus Mode"}
                      >
                        {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* EDITOR WORKSPACE DISPLAY */}
              {editorMode === 'visual' ? (
                /* LIVE HTML CONTENT VISUAL CANVASES WRAPPER */
                <div 
                  className={`flex flex-col bg-slate-100 dark:bg-slate-950 border border-t-0 border-slate-200 dark:border-slate-800 shadow-inner transition-all ${
                    isFullscreen ? 'flex-1 rounded-none border-0 overflow-hidden p-2 md:p-4' : 'rounded-b-xl min-h-[400px] overflow-auto p-4 md:p-8'
                  }`}
                  style={isFullscreen ? {} : { maxHeight: `${editorHeight + 200}px` }}
                >
                  <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-2 flex items-center justify-between shrink-0">
                    <span>Simulated Client Browser ({previewDevice === 'desktop' ? 'Desktop 650px width' : 'Mobile 375px width'})</span>
                    <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-amber-500" /> Interactive live WYSIWYG</span>
                  </div>

                  <div 
                    className={`w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 shadow-xl rounded-xl transition-all duration-300 mx-auto overflow-hidden flex flex-col ${
                      isFullscreen ? 'max-w-none flex-1' : (previewDevice === 'desktop' ? 'max-w-[650px]' : 'max-w-[375px]')
                    }`}
                  >
                    {/* Simulated Mail Header */}
                    <div className="border-b border-indigo-50/50 bg-slate-50/50 dark:bg-slate-900/50 dark:border-slate-800/50 py-3.5 px-6 space-y-1.5 select-none shrink-0 text-left">
                      <div className="flex items-center text-[11px] gap-2">
                        <span className="font-bold text-slate-400 dark:text-slate-500 w-11 shrink-0">From:</span>
                        <span className="font-semibold text-slate-600 dark:text-slate-350 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">Your System &lt;gmail@api.handoff&gt;</span>
                      </div>
                      <div className="flex items-center text-[11px] gap-2">
                        <span className="font-bold text-slate-400 dark:text-slate-500 w-11 shrink-0">Subject:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{subject || '(No Subject Line Written Yet)'}</span>
                      </div>
                    </div>

                    {/* REAL-TIME CONTENT-EDITABLE TEXT AREA CANVASES */}
                    <div 
                      id="visual-editor-container"
                      className={`p-6 md:p-8 text-left overflow-y-auto ${isFullscreen ? 'flex-1' : ''}`}
                      style={isFullscreen ? {} : { height: `${editorHeight}px` }}
                    >
                      <div
                        ref={editorRef}
                        contentEditable
                        onInput={handleVisualInput}
                        className={`outline-none min-h-[300px] text-slate-800 dark:text-slate-150 text-sm leading-relaxed prose dark:prose-invert max-w-none focus:ring-0 ${
                          showAids ? '[&_table]:border-dashed [&_table_td]:border-dashed [&_table]:border-amber-400/50 [&_table_td]:border-amber-400/50 [&_blockquote]:border-l-4 [&_blockquote]:border-amber-500 [&_blockquote]:pl-4 [&_blockquote]:italic' : ''
                        }`}
                        placeholder="Click here and start visual composing your stunning newsletter..."
                        style={{ minHeight: '100%' }}
                      />

                      {/* Integrated Email Footer Preview - Built-in & classic */}
                      {!/{{unsubscribe}}/i.test(body) && (
                        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 pointer-events-none select-none text-center">
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
                            You are receiving this email because you subscribed to our list.<br />
                            If you no longer wish to receive these emails, you can{" "}
                            <span className="text-[#c9a84c] underline font-semibold">
                              unsubscribe instantly here
                            </span>.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Resizable Handle at the bottom of the visual live editor component card */}
                    {!isFullscreen && (
                      <div 
                        onMouseDown={handleDragStart}
                        className="h-2.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 active:bg-slate-300 dark:active:bg-slate-750 cursor-ns-resize flex items-center justify-center transition-all group shrink-0"
                        title="Drag to resize editor height"
                      >
                        <div className="w-12 h-1 bg-slate-300 dark:bg-slate-700 rounded transition-all group-hover:bg-slate-400 dark:group-hover:bg-slate-500" />
                      </div>
                    )}
                  </div>
                  
                  <p className="text-[10px] text-slate-400 mt-3 text-center shrink-0">
                    Changes made physically inside this client mockup update the campaign body code directly.
                  </p>
                </div>
              ) : (
                /* RAW HTML SOURCING EDITOR (Monospaced style with full raw edit capability) */
                <div className="space-y-2">
                  <textarea
                    rows={16}
                    placeholder="e.g. <h1>Hi {{name}},</h1><p>Check out our news!</p>"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-emerald-400 focus:outline-none focus:ring-1 focus:ring-amber-500 min-h-[350px] leading-relaxed select-all"
                  />
                  <div className="flex items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs text-slate-500 border border-slate-200 dark:border-slate-800">
                    <Info className="w-3.5 h-3.5 text-amber-500" />
                    <span>You can write standard responsive CSS inline styles or HTML layout tags here. Switching to Visual tab renders it instantly!</span>
                  </div>
                </div>
              )}
            </div>

            {/* Campaign-level File Attachments widget */}
            <div className="border-t border-slate-100 dark:border-slate-800/60 pt-5 mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email File Attachments</h4>
                  <p className="text-[10px] text-slate-400">Attach PDFs, images, or files to send alongside your campaign. Max 5MB per file.</p>
                </div>
                <label className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-all font-semibold text-slate-700 dark:text-slate-200">
                  <Paperclip className="w-3.5 h-3.5" /> Attach File(s)
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {attachments.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                      <div className="flex items-center gap-2 overflow-hidden mr-2">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="overflow-hidden">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{att.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{(att.size / 1024).toFixed(1)} KB • {att.type.split('/')[1] || 'Unknown'}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="text-slate-400 hover:text-rose-500 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shrink-0"
                        title="Remove Attachment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-lg py-6 text-center text-xs text-slate-400 bg-slate-50/30 dark:bg-slate-950/10">
                  No files attached to this campaign. Use the button above to add documents or marketing flyers.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recipients Sidebar Filter & Publish options */}
        <div className="space-y-4">
          {/* Target List Card */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-950 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-500" /> Filter Target Recipients
            </h3>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-2">Select subscriber tags to target. Deselect all to send to <strong>All Active Subscribers</strong>.</p>
                {availableTags.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No subscriber tags defined yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {availableTags.map(tag => {
                      const selected = recipientTags.some(rt => rt.toLowerCase() === tag.toLowerCase());
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleTagToggle(tag)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-all font-medium ${
                            selected 
                              ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-800'
                              : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-600 hover:border-slate-350 dark:text-slate-300'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-lg flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-slate-500">Active Target Group</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{activeFilteredSubscribers.length} Contacts</p>
                </div>
                {activeFilteredSubscribers.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowRecipientsList(!showRecipientsList)}
                    className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-950/30 dark:hover:bg-amber-950/60 px-2.5 py-1.5 rounded-lg border border-amber-200/50 dark:border-amber-900/30 transition-all cursor-pointer shadow-sm select-none"
                  >
                    {showRecipientsList ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hide Recipients</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Recipients</span>
                      </>
                    )}
                  </button>
                ) : (
                  <Info className="w-4 h-4 text-slate-400 animate-pulse" />
                )}
              </div>

              {showRecipientsList && activeFilteredSubscribers.length > 0 ? (
                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/50">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-505 uppercase tracking-wider">
                    {recipientTags.length > 0 ? "Targeted Recipient Names:" : "All Active Recipients:"}
                  </p>
                  <div className="max-h-36 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin">
                    {activeFilteredSubscribers.map(sub => (
                      <div key={sub.id} className="flex flex-col text-[11px] px-2.5 py-1.5 bg-slate-50/50 dark:bg-slate-950/30 rounded-lg border border-slate-100 dark:border-slate-800/30 hover:border-amber-200 dark:hover:border-amber-900/30 transition-colors">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={sub.name}>
                          {sub.name}
                        </span>
                        <span className="text-[9px] text-slate-400 dark:text-slate-505 font-mono truncate" title={sub.email}>
                          {sub.email}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeFilteredSubscribers.length === 0 ? (
                <div className="text-center py-4 bg-slate-50/30 dark:bg-slate-950/10 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-400 italic">No active contacts match selection.</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Delivery Options Card */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-950 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500" /> Scheduling Options
            </h3>

            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="radio"
                    name="sendType"
                    checked={sendType === 'now'}
                    onChange={() => setSendType('now')}
                    className="accent-amber-500"
                  />
                  Send Now
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="radio"
                    name="sendType"
                    checked={sendType === 'schedule'}
                    onChange={() => setSendType('schedule')}
                    className="accent-amber-500"
                  />
                  Schedule Later
                </label>
              </div>

              {sendType === 'schedule' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Target Date & Time</label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Action Row */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onNavigate('campaigns')}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => handleCreateCampaign(false)}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1"
            >
              <Save className="w-4 h-4" /> Save Draft
            </button>
            <button
              onClick={() => handleCreateCampaign(true)}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-lg text-sm font-semibold shadow transition-all flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> {sendType === 'schedule' ? 'Schedule' : 'Send Campaign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
