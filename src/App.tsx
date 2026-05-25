import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Send, 
  Mail, 
  Users, 
  FileCode, 
  History, 
  Settings, 
  User as UserIcon, 
  HelpCircle, 
  Sun, 
  Moon, 
  Loader2, 
  LogOut, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Sparkles, 
  Lock,
  Compass,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  PanelLeft,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'react-hot-toast';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

import { ViewMode } from './types';
import { auth, db } from './firebase';
import { AuthProvider, useAuth } from './hooks/useAuth';

// Modular Views
import { DashboardView } from './components/DashboardView';
import { ComposeCampaignView } from './components/ComposeCampaignView';
import { CampaignsListView } from './components/CampaignsListView';
import { SubscribersView } from './components/SubscribersView';
import { TemplatesView } from './components/TemplatesView';
import { SentHistoryView } from './components/SentHistoryView';
import { SettingsView } from './components/SettingsView';
import { ProfileView } from './components/ProfileView';
import { HelpView } from './components/HelpView';
import AuthScreen from './components/AuthScreen';
import { PublicPortal } from './components/PublicPortal';
import { LoadingScreen } from './components/LoadingScreen';

function AppContent() {
  const isPublicUnsubscribe = window.location.pathname === '/unsubscribe' || window.location.search.includes('unsubscribe=');
  const isPublicSubscribe = window.location.pathname === '/subscribe' || window.location.search.includes('subscribe=');

  if (isPublicUnsubscribe || isPublicSubscribe) {
    return <PublicPortal mode={isPublicUnsubscribe ? 'unsubscribe' : 'subscribe'} />;
  }

  const { user, profile, loading: authLoading, login, logout, updateProfile } = useAuth();
  
  // Custom initialization loading stats
  const [initProgress, setInitProgress] = useState(0);
  const [showLoading, setShowLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing Workspace');

  useEffect(() => {
    const messages = [
      'Initializing Workspace',
      'Connecting to Database',
      'Loading Content Assets',
      'Synchronizing Planner',
      'Finalizing Setup'
    ];
    
    let timer: any;
    let currentStep = 0;

    const interval = setInterval(() => {
      setInitProgress(prev => {
        let nextVal = prev;
        if (authLoading) {
          // Slowly increment to 88% while authenticating
          if (prev < 88) {
            nextVal = prev + Math.floor(Math.random() * 5) + 3;
          }
        } else {
          // Jump to 100% when complete
          if (prev < 100) {
            nextVal = prev + Math.floor(Math.random() * 12) + 12;
          } else {
            clearInterval(interval);
            timer = setTimeout(() => {
              setShowLoading(false);
            }, 350); // Fluid exit animation wait
            return 100;
          }
        }
        
        const finalVal = nextVal >= 100 ? 100 : nextVal;
        const step = Math.floor(finalVal / 20);
        if (step > currentStep && step < messages.length) {
          currentStep = step;
          setLoadingMessage(messages[step]);
        }
        return finalVal;
      });
    }, 120);

    return () => {
      clearInterval(interval);
      if (timer) clearTimeout(timer);
    };
  }, [authLoading]);

  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');

  const getViewTitle = (mode: ViewMode) => {
    switch (mode) {
      case 'dashboard': return 'Email Mailer Dashboard';
      case 'compose': return 'Compose Campaign';
      case 'campaigns': return 'Campaigns';
      case 'subscribers': return 'Subscribers';
      case 'templates': return 'Templates';
      case 'sent-history': return 'Sent History';
      case 'settings': return 'Settings';
      case 'profile': return 'My Profile';
      case 'help': return 'Help & Support';
      default: return 'Email Mailer';
    }
  };
  
  // 3-State Sidebar Mode
  const [sidebarMode, setSidebarMode] = useState<'full' | 'mini-hover' | 'mini-fixed'>('full');
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [quickLinksOpen, setQuickLinksOpen] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Derived Sizing
  const isSidebarExpanded = sidebarMode === 'full' || (sidebarMode === 'mini-hover' && isSidebarHovered);
  const isSidebarMini = !isSidebarExpanded;

  const handleManualRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      toast.success("Marketing operations synchronized successfully!");
    }, 1050);
  };
  
  // Custom navigation state passed to compose window for draft editing / templates prefill
  const [navigationData, setNavigationData] = useState<any>(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const handleNavigate = (view: ViewMode, data: any = null) => {
    setNavigationData(data);
    setViewMode(view);
  };

  // Action to clear postId URL query param
  const clearPostIdQueryParam = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('postId');
    window.history.replaceState({}, '', url.pathname + url.search);
  };

  useEffect(() => {
    if (!showLoading && user && profile && profile.status === 'active') {
      const urlParams = new URLSearchParams(window.location.search);
      const postId = urlParams.get('postId');
      if (postId) {
        // Fetch post from Firestore
        const fetchPost = async () => {
          try {
            const postRef = doc(db, 'posts', postId);
            const postSnap = await getDoc(postRef);
            if (postSnap.exists()) {
              const postData = postSnap.data();
              const contentTitle = postData.contentTitle || postData.title || 'Untitled Campaign';
              const caption = postData.caption || postData.body || '';
              const creatives = postData.creatives || [];

              // Convert any graphics from the creatives list into accessible attachments and inline images
              const attachmentsList: any[] = [];
              let firstImgUrl = '';
              if (Array.isArray(creatives)) {
                creatives.forEach((creative, index) => {
                  const url = typeof creative === 'string' ? creative : (creative?.url || '');
                  if (url) {
                    if (index === 0) {
                      firstImgUrl = url;
                    }
                    attachmentsList.push({
                      name: creative?.name || `asset_${index + 1}.png`,
                      type: creative?.type || 'image/png',
                      size: creative?.size || 102400,
                      content: url
                    });
                  }
                });
              }

              // Set the extracted "Caption" message as the draft HTML Body with editing enabled
              let emailBody = `${caption.replace(/\n/g, '<br/>')}`;
              if (firstImgUrl) {
                // Include first image as an elegant inline media module block
                emailBody += `\n\n<div style="margin: 24px 0; text-align: center;">\n  <img src="${firstImgUrl}" alt="${contentTitle}" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />\n</div>`;
              }

              const mappedCampaign = {
                title: contentTitle,
                subject: contentTitle, // Set extracted Content Title as Email Subject
                body: emailBody,
                status: 'draft',
                type: 'Newsletter',
                recipientTags: [],
                importedPostId: postId, // Carry postId for two-way tracking
                attachmentsJson: JSON.stringify(attachmentsList)
              };

              // Bypass default dashboard and load Compose Campaign directly at startup
              handleNavigate('compose', mappedCampaign);
              toast.success("Loaded campaign draft from Content Calendar!");
            } else {
              toast.error(`Campaign post document ID "${postId}" not found.`);
            }
          } catch (err) {
            console.error("Error reading post from shared database:", err);
            toast.error("Failed to load campaign data. You may not have access permission.");
          } finally {
            clearPostIdQueryParam();
          }
        };

        fetchPost();
      }
    }
  }, [showLoading, user, profile]);

  const getRoleLabel = (role?: string) => {
    if (!role) return 'Operations';
    return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (showLoading) {
    return <LoadingScreen progress={initProgress} loadingMessage={loadingMessage} />;
  }

  // Auth Guard
  if (!user || !profile) {
    return <AuthScreen />;
  }

  // Account Status blocker
  if (profile.status === 'blocked') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/30 rounded-full flex items-center justify-center mb-6 border border-rose-300">
          <Lock className="w-8 h-8 text-rose-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Revoked</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md text-sm">Your account profile has been suspended or blocked. If you believe this is an error, please reach out directly to your portal administrator.</p>
        <button onClick={logout} className="mt-8 text-xs font-bold text-amber-600 hover:text-amber-700 uppercase tracking-widest font-mono">Sign Out</button>
      </div>
    );
  }

  // Account Pending validation blocker
  if (profile.status === 'pending') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
        <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/30 rounded-full flex items-center justify-center mb-6 border border-amber-300">
          <Mail className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Registration Pending Approval</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md text-sm">Welcome, <strong className="text-slate-900 dark:text-white">{profile.displayName}</strong>! Your account requires verification from a marketing supervisor before you can access the newsletter sender.</p>
        <button onClick={logout} className="mt-8 text-xs font-bold text-amber-605 uppercase tracking-widest font-mono">Sign Out</button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Toaster position="top-right" reverseOrder={false} />

      {/* Sidebar Navigation */}
      <aside 
        onMouseEnter={() => sidebarMode === 'mini-hover' && setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        className={`${isSidebarMini ? 'w-20' : 'w-64'} bg-primary-dark text-slate-300 flex flex-col shrink-0 transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] relative z-40 border-r border-[#15223c] shadow-2xl`}
      >
        {/* Brand header */}
        <div 
          onClick={() => handleNavigate('dashboard')}
          className={`pt-[30px] pb-[24px] pl-[24px] pr-5 flex items-center cursor-pointer hover:bg-white/5 transition-colors group ${isSidebarMini ? 'justify-center' : 'gap-3'} border-b border-[#121c32]`}
        >
          <div className="relative shrink-0 group-hover:scale-105 transition-transform duration-300">
            {/* 1. MAIN LOGO WRAPPER */}
            {/* - "w-12 h-12" renders it at exactly 48px by 48px */}
            <div className="w-12 h-12 flex items-center justify-center">
              <img 
                src="/img/MAIN (1).png" 
                alt="Logo" 
                className="w-full h-full object-contain rounded-xl shadow-lg border border-white/10" 
                /* "rounded-xl" specifies a border-radius of 12px (0.75rem) */
              />
            </div>

            {/* 2. OVERLAPPING AMBER MAIL BADGE */}
            {/* - "absolute -right-1.5 -top-1.5" positions the badge overlap */}
            {/* - "rounded-lg" specifies a border-radius of 8px (0.5rem) */}
            <div className="absolute -right-1.5 -top-1.5 bg-amber-500 rounded-lg p-1 shadow-sm border border-amber-400 z-10">
              <Mail className="w-3 h-3 text-white" />
            </div>
          </div>
          {isSidebarExpanded && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="overflow-hidden whitespace-nowrap ml-1"
            >
              {/* 3. MARKETING PORTAL HEADER LABEL */}
              <h2 className="text-sm font-bold text-white leading-tight group-hover:text-amber-500 transition-colors pl-0">
                Marketing Portal
              </h2>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold font-sans">
                Newsletter
              </p>
            </motion.div>
          )}
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          <button 
            onClick={() => handleNavigate('dashboard')}
            className={`w-full flex items-center ${isSidebarMini ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-semibold text-xs transition-all duration-300 ease-in-out ${
              viewMode === 'dashboard' 
                ? 'bg-[#243555] text-[#dcae44] border-l-4 border-amber-500 font-bold' 
                : 'hover:bg-white/5 hover:text-white text-slate-400'
            }`}
            title={isSidebarMini ? "Dashboard" : ""}
          >
            <LayoutDashboard className={`w-5 h-5 shrink-0 ${viewMode === 'dashboard' ? 'text-[#dcae44]' : 'text-slate-400'}`} />
            {isSidebarExpanded && <span className="whitespace-nowrap">Dashboard</span>}
          </button>

          <button 
            onClick={() => handleNavigate('compose')}
            className={`w-full flex items-center ${isSidebarMini ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-semibold text-xs transition-all duration-300 ease-in-out ${
              viewMode === 'compose' 
                ? 'bg-[#243555] text-[#dcae44] border-l-4 border-amber-500 font-bold' 
                : 'hover:bg-white/5 hover:text-white text-slate-400'
            }`}
            title={isSidebarMini ? "Compose Campaign" : ""}
          >
            <Send className={`w-5 h-5 shrink-0 ${viewMode === 'compose' ? 'text-[#dcae44]' : 'text-slate-400'}`} />
            {isSidebarExpanded && <span className="whitespace-nowrap">Compose Campaign</span>}
          </button>

          <button 
            onClick={() => handleNavigate('campaigns')}
            className={`w-full flex items-center ${isSidebarMini ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-semibold text-xs transition-all duration-300 ease-in-out ${
              viewMode === 'campaigns' 
                ? 'bg-[#243555] text-[#dcae44] border-l-4 border-amber-500 font-bold' 
                : 'hover:bg-white/5 hover:text-white text-slate-400'
            }`}
            title={isSidebarMini ? "Campaigns" : ""}
          >
            <Mail className={`w-5 h-5 shrink-0 ${viewMode === 'campaigns' ? 'text-[#dcae44]' : 'text-slate-400'}`} />
            {isSidebarExpanded && <span className="whitespace-nowrap">Campaigns</span>}
          </button>

          <button 
            onClick={() => handleNavigate('subscribers')}
            className={`w-full flex items-center ${isSidebarMini ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-semibold text-xs transition-all duration-300 ease-in-out ${
              viewMode === 'subscribers' 
                ? 'bg-[#243555] text-[#dcae44] border-l-4 border-amber-500 font-bold' 
                : 'hover:bg-white/5 hover:text-white text-slate-400'
            }`}
            title={isSidebarMini ? "Subscribers" : ""}
          >
            <Users className={`w-5 h-5 shrink-0 ${viewMode === 'subscribers' ? 'text-[#dcae44]' : 'text-slate-400'}`} />
            {isSidebarExpanded && <span className="whitespace-nowrap">Subscribers</span>}
          </button>

          <button 
            onClick={() => handleNavigate('templates')}
            className={`w-full flex items-center ${isSidebarMini ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-semibold text-xs transition-all duration-300 ease-in-out ${
              viewMode === 'templates' 
                ? 'bg-[#243555] text-[#dcae44] border-l-4 border-amber-500 font-bold' 
                : 'hover:bg-white/5 hover:text-white text-slate-400'
            }`}
            title={isSidebarMini ? "Templates" : ""}
          >
            <FileCode className={`w-5 h-5 shrink-0 ${viewMode === 'templates' ? 'text-[#dcae44]' : 'text-slate-400'}`} />
            {isSidebarExpanded && <span className="whitespace-nowrap">Templates</span>}
          </button>

          <button 
            onClick={() => handleNavigate('sent-history')}
            className={`w-full flex items-center ${isSidebarMini ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-semibold text-xs transition-all duration-300 ease-in-out ${
              viewMode === 'sent-history' 
                ? 'bg-[#243555] text-[#dcae44] border-l-4 border-amber-500 font-bold' 
                : 'hover:bg-white/5 hover:text-white text-slate-400'
            }`}
            title={isSidebarMini ? "Sent History" : ""}
          >
            <History className={`w-5 h-5 shrink-0 ${viewMode === 'sent-history' ? 'text-[#dcae44]' : 'text-slate-400'}`} />
            {isSidebarExpanded && <span className="whitespace-nowrap">Sent History</span>}
          </button>

          {/* Spacer / Divider */}
          <div className="pt-2 border-t border-[#121c32] my-1" />

          {profile.role === 'marketing_supervisor' && (
            <button 
              onClick={() => handleNavigate('settings')}
              className={`w-full flex items-center ${isSidebarMini ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-semibold text-xs transition-all duration-300 ease-in-out ${
                viewMode === 'settings' 
                  ? 'bg-[#243555] text-[#dcae44] border-l-4 border-amber-500 font-bold' 
                  : 'hover:bg-white/5 hover:text-white text-slate-400'
              }`}
              title={isSidebarMini ? "Settings" : ""}
            >
              <Settings className={`w-5 h-5 shrink-0 ${viewMode === 'settings' ? 'text-[#dcae44]' : 'text-slate-400'}`} />
              {isSidebarExpanded && <span className="whitespace-nowrap">Settings</span>}
            </button>
          )}

          <button 
            onClick={() => handleNavigate('profile')}
            className={`w-full flex items-center ${isSidebarMini ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-semibold text-xs transition-all duration-300 ease-in-out ${
              viewMode === 'profile' 
                ? 'bg-[#243555] text-[#dcae44] border-l-4 border-amber-500 font-bold' 
                : 'hover:bg-white/5 hover:text-white text-slate-400'
            }`}
            title={isSidebarMini ? "My Profile" : ""}
          >
            <UserIcon className={`w-5 h-5 shrink-0 ${viewMode === 'profile' ? 'text-[#dcae44]' : 'text-slate-400'}`} />
            {isSidebarExpanded && <span className="whitespace-nowrap">My Profile</span>}
          </button>

          <button 
            onClick={() => handleNavigate('help')}
            className={`w-full flex items-center ${isSidebarMini ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-semibold text-xs transition-all duration-300 ease-in-out ${
              viewMode === 'help' 
                ? 'bg-[#243555] text-[#dcae44] border-l-4 border-amber-500 font-bold' 
                : 'hover:bg-white/5 hover:text-white text-slate-400'
            }`}
            title={isSidebarMini ? "Help & Support" : ""}
          >
            <HelpCircle className={`w-5 h-5 shrink-0 ${viewMode === 'help' ? 'text-[#dcae44]' : 'text-slate-400'}`} />
            {isSidebarExpanded && <span className="whitespace-nowrap">Help & Support</span>}
          </button>

          {/* Quick Links Section */}
          {isSidebarExpanded && (
            <div className="pt-4 border-t border-[#121c32] mt-3">
              <button 
                type="button"
                onClick={() => setQuickLinksOpen(!quickLinksOpen)}
                className="w-full flex items-center justify-between text-[#8a99ad] uppercase tracking-wider text-[11px] font-bold px-4 mb-2 hover:text-white transition-all bg-transparent border-0 outline-none"
              >
                <span>Quick Links</span>
                {quickLinksOpen ? <ChevronUp className="w-3.5 h-3.5 text-[#8a99ad]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#8a99ad]" />}
              </button>
              
              <AnimatePresence>
                {quickLinksOpen && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-1.5 px-1 overflow-hidden"
                  >
                    <a 
                      href="https://workspace.google.com" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex items-center gap-3 px-4 py-2 text-xs font-semibold text-[#8a99ad] hover:text-white hover:bg-white/5 rounded-xl transition-all"
                    >
                      <ExternalLink className="w-4 h-4 text-[#8a99ad]" />
                      <span>Marketing Assets</span>
                    </a>
                    <a 
                      href="https://notion.so" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex items-center gap-3 px-4 py-2 text-xs font-semibold text-[#8a99ad] hover:text-white hover:bg-white/5 rounded-xl transition-all"
                    >
                      <ExternalLink className="w-4 h-4 text-[#8a99ad]" />
                      <span>Notion</span>
                    </a>
                    <a 
                      href="https://google.com" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex items-center gap-3 px-4 py-2 text-xs font-semibold text-[#8a99ad] hover:text-white hover:bg-white/5 rounded-xl transition-all"
                    >
                      <ExternalLink className="w-4 h-4 text-[#8a99ad]" />
                      <span>Topic Bank</span>
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </nav>

        {/* BOTTOM USER PROFILE BANNER */}
        {(() => {
          const userPhoto = profile?.photoURL || user?.photoURL;
          const userDisplayName = profile?.displayName || user?.displayName || "Raphael Mendoza";
          return (
            <div className="mt-auto p-4 pt-2 border-t border-slate-700/50 flex flex-col gap-3 bg-[#1b2a4a]">
              {/* Profile & Default Theme Toggle Row */}
              <div className="flex items-center justify-between">
                <div className={`flex items-center ${isSidebarMini ? 'justify-center w-full' : 'gap-3'}`}>
                  {userPhoto ? (
                    <button 
                      onClick={() => handleNavigate('profile')}
                      className="hover:scale-105 transition-transform shrink-0"
                    >
                      <img 
                        src={userPhoto} 
                        className="w-10 h-10 rounded-full border border-slate-600 shrink-0 object-cover" 
                        alt="Profile" 
                        referrerPolicy="no-referrer" 
                      />
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleNavigate('profile')}
                      className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-slate-600 hover:scale-105 transition-transform"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" />
                    </button>
                  )}
                  
                  {isSidebarExpanded && (
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-sm font-bold text-white truncate leading-tight">
                        {userDisplayName}
                      </p>
                      <button 
                        onClick={logout}
                        className="text-[11px] text-[#8a99ad] hover:text-slate-300 transition-colors block mt-0.5 font-medium"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>

                {/* Theme Toggle Button (Hidden when Mini/Collapsed) */}
                {!isSidebarMini && (
                  <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all duration-300"
                    title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                  >
                    {isDarkMode ? (
                      <Sun className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Moon className="w-4 h-4 text-slate-200" />
                    )}
                  </button>
                )}
              </div>

              {/* Theme Toggle Icon for Mini Mode (Centered Below Photo) */}
              {isSidebarMini && (
                <button 
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className="flex items-center justify-center p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all duration-300"
                  title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                  {isDarkMode ? (
                    <Sun className="w-5 h-5 text-amber-500" />
                  ) : (
                    <Moon className="w-5 h-5" />
                  )}
                </button>
              )}
              
              {/* Brand Sub-Credit */}
              {!isSidebarMini && (
                <div className="flex items-center justify-center gap-1.5 opacity-20 mt-1">
                  <Sparkles className="w-2 h-2 text-amber-500" />
                  {isSidebarExpanded && (
                    <span className="text-[9px] font-bold text-white uppercase tracking-tighter">
                      Powered by Gemini AI
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        
        {/* Top Header Panel */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 sm:px-8 flex items-center justify-between sticky top-0 z-35 transition-colors duration-300">
          <div className="flex items-center gap-3">
            
            {/* 3-STATE SIDEBAR CONTROL BUTTON */}
            <button 
              onClick={() => {
                if (sidebarMode === 'full') setSidebarMode('mini-hover');
                else if (sidebarMode === 'mini-hover') setSidebarMode('mini-fixed');
                else setSidebarMode('full');
              }}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all duration-300 group flex items-center justify-center"
              title={
                sidebarMode === 'full' ? "Switch to Auto-expand Mini" : 
                sidebarMode === 'mini-hover' ? "Switch to Full Mini View" : 
                "Switch to Layout View"
              }
            >
              {sidebarMode === 'full' ? (
                <PanelLeftClose className="w-5 h-5 group-hover:scale-110 transition-transform" />
              ) : sidebarMode === 'mini-hover' ? (
                <div className="relative">
                  <PanelLeftOpen className="w-5 h-5 group-hover:scale-110 transition-transform text-amber-500" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full border border-white dark:border-slate-900 animate-pulse" />
                </div>
              ) : (
                <PanelLeft className="w-5 h-5 group-hover:scale-110 transition-transform" />
              )}
            </button>

            {/* REFRESH / DATA SYNC BUTTON */}
            <button 
              onClick={handleManualRefresh}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-amber-500 transition-all duration-300 group flex items-center"
              title="Refresh Portal Data"
            >
              <RefreshCw className={`w-5 h-5 transition-transform duration-500 ${refreshing ? 'animate-spin-once' : 'group-hover:rotate-180'}`} />
              <div className="w-0 overflow-hidden group-hover:w-auto transition-all duration-300">
                <span className="text-[10px] font-black uppercase tracking-widest hidden lg:inline opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap ml-2">Sync Data</span>
              </div>
            </button>

            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

            <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight ml-1.5">
              {getViewTitle(viewMode)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-slate-100 dark:bg-slate-850 px-2.5 py-1 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest rounded-lg border border-slate-200/50">
              UTC Connection Safe
            </span>
          </div>
        </header>

        {/* Dynamic App Content Views */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto animate-fade-in">
            {viewMode === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
            {viewMode === 'compose' && <ComposeCampaignView onNavigate={handleNavigate} initialCampaign={navigationData} />}
            {viewMode === 'campaigns' && <CampaignsListView onNavigate={handleNavigate} userRole={profile.role} />}
            {viewMode === 'subscribers' && <SubscribersView />}
            {viewMode === 'templates' && <TemplatesView onNavigate={handleNavigate} />}
            {viewMode === 'sent-history' && <SentHistoryView />}
            {viewMode === 'settings' && <SettingsView userRole={profile.role} />}
            {viewMode === 'profile' && <ProfileView profile={profile} onLogout={logout} onUpdateProfile={updateProfile} />}
            {viewMode === 'help' && (
              <HelpView 
                userEmail={user.email || ''} 
                displayName={profile.displayName} 
                userId={user.uid} 
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
