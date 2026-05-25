import React, { useState, useEffect } from 'react';
import { 
  HelpCircle, 
  MessageSquare, 
  BookOpen, 
  Send, 
  Calendar, 
  Sparkles, 
  ShieldCheck, 
  Facebook,
  CheckCircle2,
  ChevronRight,
  AlertCircle,
  History,
  Clock,
  User,
  Shield,
  Trash2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { addDoc, collection, serverTimestamp, query, where, orderBy, onSnapshot, doc, updateDoc, arrayUnion, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';

const captionImg = '/img/CAPTION.png';
const editPoImg = '/img/EditPo.png';

interface HelpViewProps {
  userEmail: string | null;
  displayName: string | null;
  userId: string | null;
}

export const HelpView: React.FC<HelpViewProps> = ({ userEmail, displayName, userId }) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'contact' | 'history'>('guide');
  const [subject, setSubject] = useState('');
  const [concern, setConcern] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [myConcerns, setMyConcerns] = useState<any[]>([]);
  const [userReplyText, setUserReplyText] = useState<{ [key: string]: string }>({});
  const [isReplying, setIsReplying] = useState<{ [key: string]: boolean }>({});
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'concerns'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a: any, b: any) => {
        const timeA = a.timestamp?.toMillis?.() || 0;
        const timeB = b.timestamp?.toMillis?.() || 0;
        return timeB - timeA;
      });
      setMyConcerns(entries);
    });

    return () => unsubscribe();
  }, [userId]);

  const handleSubmitConcern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concern.trim()) return;

    setIsSubmitting(true);
    try {
      const initialMessage = {
        text: concern,
        senderId: userId,
        senderName: displayName || userEmail,
        role: 'user',
        timestamp: new Date().toISOString()
      };

      await addDoc(collection(db, 'concerns'), {
        userId: userId,
        userEmail: userEmail,
        userName: displayName || userEmail,
        subject: subject.trim() || 'No Subject',
        messages: [initialMessage],
        status: 'pending',
        timestamp: serverTimestamp(),
      });
      toast.success("Concern submitted. A supervisor will review it shortly.");
      setConcern('');
      setSubject('');
      setActiveTab('history');
    } catch (error) {
      console.error("Error submitting concern:", error);
      toast.error("Failed to submit concern. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUserReply = async (concernId: string) => {
    const text = userReplyText[concernId];
    if (!text?.trim()) return;

    setIsReplying(prev => ({ ...prev, [concernId]: true }));
    try {
      const newMessage = {
        text: text.trim(),
        senderId: userId,
        senderName: displayName || userEmail,
        role: 'user',
        timestamp: new Date().toISOString()
      };

      await updateDoc(doc(db, 'concerns', concernId), {
        messages: arrayUnion(newMessage),
        status: 'pending' // Reset to pending when user replies
      });
      
      setUserReplyText(prev => ({ ...prev, [concernId]: '' }));
      toast.success("Reply sent.");
    } catch (error) {
      console.error("Error sending reply:", error);
      toast.error("Failed to send reply.");
    } finally {
      setIsReplying(prev => ({ ...prev, [concernId]: false }));
    }
  };

  const guideSections = [
    {
      title: "Getting Started",
      icon: <CheckCircle2 className="w-5 h-5 text-sky-500" />,
      content: "Learn the foundational steps to navigate the platform, from your first login to configuring your workspace for success.",
      longContent: "Welcome to the Marketing Operations Portal. To get started, ensure you are logged in using your authorized organizational email. The navigation sidebar allows you to jump between the Content Planner (main hub), the Social Hub (history & metrics), and your Personal Profile. For administrators, the Admin Tab is the central place to configure API integrations and manage team roles.",
      topics: [
        {
          title: "Initial Login",
          content: "1. Access the portal via the provided URL.\n2. Log in using your registered Firebase Authentication credentials.\n3. Upon entry, you'll be directed to the 'Month' view of the Planner by default, showing the current month's campaign activities."
        },
        {
          title: "Navigation 101",
          content: "• Sidebar: Toggle between planning views and administrative tools.\n• Search Bar: Locate specific content titles or topics across the entire database.\n• Role Dashboard: In the top right, you can see your current role and sign out.\n• Theme Toggle: Switch between Light and Dark mode based on your preference."
        },
        {
          title: "Profile Setup",
          content: "Visit your User Settings to set your display name and check your permissions. If you are a supervisor, ensure you have configured the 'Governance' settings in the Admin tab to enable or disable deletion approvals."
        }
      ],
      color: "bg-sky-50 dark:bg-sky-900/20"
    },
    {
      title: "Content Planning",
      icon: <Calendar className="w-5 h-5 text-indigo-500" />,
      content: "Organize your social media strategy using multiple view modes. Track content from ideation to final publication.",
      longContent: "The Content Planner is where most of your work happens. It allows for high-level visualization and granular control over every piece of digital content being produced.",
      topics: [
        {
          title: "Switching View Modes",
          content: "Use the view switcher at the top of the Planner to alternate between:\n\n• Table View: Best for batch editing and viewing dense data (captions, links, notes).\n• Kanban Board: Visualizes the pipeline. Drag cards between 'Not Started', 'In Progress', 'For Review', 'Approved', 'Scheduled', and 'Published'.\n• Month View: A traditional calendar grid for checking campaign spacing and deadlines."
        },
        {
          title: "Creating a Post",
          content: "1. Click the 'Create New' button or click on a specific date in the Calendar/Table.\n2. Fill in the 'Content Title' (this is the internal identifier).\n3. Set the 'Topic/Theme' and choose from predefined 'Content Types' (e.g., Reel, Carousel, Photo).\n4. Assign a 'Format' and 'Objective' (Awareness, Conversion, etc.) to help with sorting and reporting."
        },
        {
          title: "Collaboration & Attachments",
          content: "Inside each post editor, you can upload 'Deliverables'. These are the actual media files (images/videos) that will be posted. Creative team members can upload files, and Supervisors can review them directly from the panel. You can also add 'Internal Notes' for team-only communication that won't be published."
        }
      ],
      color: "bg-indigo-50 dark:bg-indigo-900/20"
    },
    {
      title: "AI Generation",
      icon: <Sparkles className="w-5 h-5 text-amber-500" />,
      content: "When editing a post, use the 'AI Magic' sidebar to generate catchy captions. You can provide a topic and select the desired tone to get AI-powered results.",
      longContent: "Powered by Gemini, the AI Magic engine understands your campaign's context to generate multiple variations of social media captions based on your topic and chosen tone.",
      topics: [
        {
          title: "Overview",
          content: "The AI Magic engine, powered by Gemini, helps you brainstorm and generate high-quality captions tailored to your audience. It takes the heavy lifting out of copywriting by offering variations based on your chosen tone and topic."
        },
        {
          title: "How to use it?",
          content: "There are two ways to access the AI Magic tool from the Planner:\n\n1. From the Captions Column: Hover over the caption cell of any post and click the 'Sparkles' (✨) icon to instantly open the AI Generation sidebar.\n2. From the Actions Column: Click the 'Edit' (pencil) icon to open the post editor, then locate the 'AI Magic' section in the right sidebar.\n\nOnce open:\n3. Type your main topic or idea into the 'Topic' text field.\n4. Select a preferred 'Tone' (e.g., Professional, Playful, FOMO, Educational) to set the mood.\n5. Click the 'Click to generate' button.\n6. The AI will provide several caption options. You can easily click on one to insert it into your post's caption field.",
          images: [
            { url: captionImg, alt: "Accessing from the Captions Column", caption: "Accessing from the Captions Column" },
            { url: editPoImg, alt: "Accessing from the Actions Column", caption: "Accessing from the Actions Column" }
          ]
        },
        {
          title: "Usage Limits",
          content: "To ensure fair usage and maintain system performance, there is a global limit of 20 AI generations per day across the entire application. This limit automatically resets at midnight every day. If the application reaches this limit, you will need to wait until the next day to generate more captions."
        }
      ],
      color: "bg-amber-50 dark:bg-amber-900/20"
    },
    {
      title: "Facebook Integration",
      icon: <Facebook className="w-5 h-5 text-blue-500" />,
      content: "Connect your Facebook Page and Instagram Business account through the Meta Settings in the Dashboard. Once connected, you can publish or schedule posts directly to your social pages from the Planner.",
      longContent: `Direct Meta API integration allows you to sync your marketing efforts across Facebook and Instagram seamlessly.`,
      topics: [
        {
          title: "Overview",
          content: "Direct Meta API integration allows you to sync your marketing efforts across Facebook and Instagram seamlessly. When a post is marked as 'Published' or 'Scheduled', the system communicates with Meta's Graph API to post to the appropriate channels. The portal also tracks 'Linked Content', helping you maintain a consistent brand voice across all platforms."
        },
        {
          title: "How does it work?",
          content: "The system connects directly to Meta's Graph API using a Long-Lived Page Access Token. When you trigger an action in the application, such as publishing or scheduling a post, the app translates those actions into API calls.\n\nFor Facebook: Posts and attachments are formatted and sent to the Facebook Page's feed endpoints.\nFor Instagram: Posts are assembled first into \"Media Containers\" which Meta validates, then these containers are \"published\" to the connected Instagram Business account.\n\nAuthentication happens server-side, meaning once set up, no ongoing user authentication prompts are required to post."
        },
        {
          title: "How to use it?",
          content: "1. Create a Post in the Planner\n2. Add your captions and media (note: Instagram requires at least one image or video).\n3. Click 'Publish Now' or 'Schedule' in the post details panel.\n4. Select 'Facebook Page', 'Instagram Business', or both to publish the content.\n5. Wait for the success response. The Social Hub will also track its history."
        },
        {
          title: "Setup Guide",
          content: `Here is a step-by-step guide to connect this web app to your Facebook Page and Instagram Business Account:

1. Create a Meta Developer App
   - Go to developers.facebook.com and log in with your Facebook account.
   - Click "My Apps" -> "Create App".
   - Select "Other" -> "Business" (or whatever corresponds to API access) as the app type.
   - Enter your App Name and contact email, and click "Create App".

2. Set Up Permissions & Graph API
   - In your app dashboard, add the "Facebook Login for Business" product if prompted, or directly use the Graph API Explorer (Tools -> Graph API Explorer).
   - Select your Facebook App. Under "Permissions", add the following:
     • pages_show_list
     • pages_read_engagement
     • pages_manage_posts
     • instagram_basic
     • instagram_content_publish
   - Click "Generate Access Token" and log in to authorize your account. Ensure you select the specific Page(s) and Instagram account(s) you want to manage.

3. Obtain a Long-Lived Page Access Token
   - Click the "i" (info) icon next to your access token in the Graph API Explorer and click "Open in Access Token Tool" -> "Extend Access Token" to get a 60-day token.
   - Go back to the Graph API Explorer, paste the 60-day token, and run the query: \`me/accounts\`
   - Find your target page in the response. Copy its \`access_token\` (this is a never-expiring Page Access Token) and its \`id\` (your Page ID).

4. Configure the Web App Environment Variables
   - Go to your hosting environment settings (AI Studio or Vercel, etc).
   - Add the following environment variables:
     • FACEBOOK_PAGE_ACCESS_TOKEN = Your_Never_Expiring_Page_Token
     • FACEBOOK_PAGE_ID = Your_Page_ID
   - Restart the server if necessary.

5. Linking Instagram Business
   - To post to Instagram, you MUST have an Instagram account converted to a professional Business Account, AND it must be linked to your Facebook Page.
   - Go to your Facebook Page Settings -> Linked Accounts, and connect your Instagram account.
   - No separate Instagram token or ID is needed! The app will automatically discover the connected Instagram Business account via the Page Access Token.

After completing these steps, go back to the "Admin" tab in this application and click the refresh button in the Meta Integration section to verify your connection. You should now be able to schedule and publish correctly.`
        }
      ],
      color: "bg-blue-50 dark:bg-blue-900/20"
    },
    {
      title: "Governance & Approvals",
      icon: <ShieldCheck className="w-5 h-5 text-emerald-500" />,
      content: "Depending on your role, you may need supervisor approval to delete content or finalize schedules. If governance toggles are active, system restrictions keep the workflow safe and professional.",
      longContent: "The platform implements a multi-tier authorization system. Regular Marketing users can create and edit drafts, but critical actions like 'Deleting a Published Post' or 'Bypassing Schedule Limits' may require a Marketing Supervisor's approval. Deletion requests appear in the Social Hub for supervisors to review. Status progression is also protected: once a post is 'Scheduled' for Facebook, its core content is locked to prevent accidental changes before deployment.",
      color: "bg-emerald-50 dark:bg-emerald-900/20"
    },
    {
      title: "Social Media Hub",
      icon: <History className="w-5 h-5 text-violet-500" />,
      content: "Track the performance and lifecycle of your published content. View historical data and real-time engagement metrics.",
      longContent: "The Social Hub acts as your command center for everything that has left the Planner and gone live on social media. It provides transparency into post status and historical records.",
      topics: [
        {
          title: "Monitoring Live Posts",
          content: "The Hub displays a stream of 'Linked Content'. Each card shows:\n\n• Live Status: Indicates if the post is still live or has been deleted from Meta.\n• Performance Insights: (If supported) Real-time counts for Reactions, Comments, and Shares.\n• External Links: Quick links to view the post directly on Facebook or Instagram."
        },
        {
          title: "Post History",
          content: "Use the 'History' tab within the Social Hub to see a timeline of all completed publishing actions. You can search this history to see who published what, and on which date. This is crucial for verifying campaign consistency."
        },
        {
          title: "Deletion Requests",
          content: "If governance is enabled, deleting a published post requires a request. These requests appear in the Social Hub. Supervisors can either approve the deletion (removing it from both Meta and the Portal) or reject it, keeping the content live."
        }
      ],
      color: "bg-violet-50 dark:bg-violet-900/20"
    },
    {
      title: "System Infrastructure",
      icon: <Shield className="w-5 h-5 text-purple-500" />,
      content: "The app utilizes two projects: the 'Active Database' (marketing-43c62) for high-speed data and auth, and the 'Provisioned Runtime' for the AI Studio hosting environment and GenAI engine.",
      longContent: "This application's architecture is split for maximum reliability. The 'Active Database' (marketing-43c62) manages our real-time Firestore database and Firebase Authentication, ensuring your workspace is always synced and secure. The 'Provisioned Runtime' (gen-lang-client...) is our hosting environment within Google Cloud/AI Studio, handling the secure processing of LLM requests and the overall system runtime.",
      color: "bg-purple-50 dark:bg-purple-900/20"
    }
  ];

  const [selectedGuide, setSelectedGuide] = useState<typeof guideSections[0] | null>(null);
  const [selectedTopicIndex, setSelectedTopicIndex] = useState(0);

  return (
    <div className="max-w-5xl mx-auto py-8 px-6">
      <AnimatePresence mode="wait">
        {selectedGuide ? (
          <motion.div 
            key="article-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            {/* Navigation Header */}
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setSelectedGuide(null)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs transition-all group"
              >
                <ChevronRight className="w-4 h-4 rotate-180 transition-transform group-hover:-translate-x-1" />
                Back to Support Center
              </button>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Article</span>
                <div className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{selectedGuide.title}</span>
              </div>
            </div>

            {/* Article Content */}
            <div className={`p-12 rounded-[40px] ${selectedGuide.color} border border-white dark:border-slate-800 shadow-sm relative overflow-hidden`}>
              <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 blur-[100px] rounded-full -mr-32 -mt-32" />
              <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start">
                <div className="w-24 h-24 bg-white dark:bg-slate-900 rounded-[32px] flex items-center justify-center shadow-xl shrink-0">
                  {React.cloneElement(selectedGuide.icon as React.ReactElement, { className: "w-10 h-10" })}
                </div>
                <div>
                  <h3 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tighter mb-3 leading-tight">
                    {selectedGuide.title}
                  </h3>
                  <p className="text-base text-slate-600 dark:text-slate-300 font-medium max-w-3xl leading-relaxed">
                    {selectedGuide.content}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-100 dark:border-slate-800 shadow-sm">
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-3">
                    <div className="w-6 h-1 rounded-full bg-indigo-500" />
                    In-depth Guide
                  </h4>
                  
                  {/* @ts-ignore */}
                  {selectedGuide.topics && selectedGuide.topics.length > 0 ? (
                    <div className="flex flex-col gap-6">
                      <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                        {/* @ts-ignore */}
                        {selectedGuide.topics.map((topic, idx) => (
                           <button
                             key={idx}
                             onClick={() => setSelectedTopicIndex(idx)}
                             className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                               selectedTopicIndex === idx 
                               ? 'bg-indigo-600 text-white shadow-md' 
                               : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                             }`}
                           >
                             {topic.title}
                           </button>
                        ))}
                      </div>
                      <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-normal whitespace-pre-wrap">
                          {/* @ts-ignore */}
                          {selectedGuide.topics[selectedTopicIndex].content}
                        </p>
                        {/* @ts-ignore */}
                        {selectedGuide.topics[selectedTopicIndex].imageUrl && (
                          <div className="mt-6 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                            <img 
                              /* @ts-ignore */
                              src={selectedGuide.topics[selectedTopicIndex].imageUrl} 
                              /* @ts-ignore */
                              alt={selectedGuide.topics[selectedTopicIndex].title}
                              className="w-full object-cover" 
                            />
                          </div>
                        )}
                        {/* @ts-ignore */}
                        {selectedGuide.topics[selectedTopicIndex].images && (
                          <div className="mt-6 flex flex-col gap-6">
                            {/* @ts-ignore */}
                            {selectedGuide.topics[selectedTopicIndex].images.map((img, i) => (
                              <div key={i} className="flex flex-col gap-2">
                                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                                  <img 
                                    src={img.url} 
                                    alt={img.alt}
                                    className="w-full object-cover" 
                                  />
                                </div>
                                {img.caption && (
                                  <p className="text-xs text-center text-slate-500 font-medium">{img.caption}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-normal whitespace-pre-wrap">
                        {selectedGuide.longContent}
                      </p>
                    </div>
                  )}

                  <div className="mt-12 p-8 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800/50">
                    <h5 className="font-bold text-slate-900 dark:text-white mb-2">Need more help with this?</h5>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 font-medium">If this article didn't answer all your questions, feel free to reach out to our team.</p>
                    <button 
                      onClick={() => {
                        setSelectedGuide(null);
                        setActiveTab('contact');
                        setSubject(`Help with: ${selectedGuide.title}`);
                      }}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all"
                    >
                      Ask a Supervisor
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="p-8 bg-slate-50 dark:bg-slate-900 rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-sm">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6">Related Topics</h4>
                  <div className="space-y-4">
                    {guideSections.filter(s => s.title !== selectedGuide.title).slice(0, 3).map((item, idx) => (
                      <button 
                        key={idx}
                        onClick={() => {
                          setSelectedGuide(item);
                          setSelectedTopicIndex(0);
                        }}
                        className="w-full text-left p-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-100 dark:border-slate-700 rounded-2xl transition-all group/rel"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${item.color} group-hover/rel:scale-110 transition-transform`}>
                            {React.cloneElement(item.icon as React.ReactElement, { className: "w-4 h-4" })}
                          </div>
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="dashboard-view"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <div className="flex justify-end mb-6">
              <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl w-fit">
                <button 
                  onClick={() => setActiveTab('guide')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'guide' 
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  User Guide
                </button>
                <button 
                  onClick={() => setActiveTab('contact')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'contact' 
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  Contact Supervisor
                </button>
                <button 
                  onClick={() => setActiveTab('history')}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'history' 
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <History className="w-4 h-4" />
                  My Concerns
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'guide' ? (
                <motion.div 
                  key="guide"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-6"
                >
                  {guideSections.map((section, idx) => (
                    <div 
                      key={idx}
                      className="group p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-indigo-200 dark:hover:border-indigo-900/30 transition-all duration-300"
                    >
                      <div className={`w-12 h-12 ${section.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                        {section.icon}
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{section.title}</h3>
                      <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed font-medium">
                        {section.content}
                      </p>
                      <button 
                        onClick={() => {
                          setSelectedGuide(section);
                          setSelectedTopicIndex(0);
                        }}
                        className="mt-6 flex items-center gap-2 text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:text-indigo-700 dark:hover:text-indigo-300 transition-all group/btn"
                      >
                        Learn More 
                        <ChevronRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  ))}

                  <div className="md:col-span-2 p-8 bg-indigo-600 rounded-3xl shadow-xl shadow-indigo-200 dark:shadow-none text-white relative overflow-hidden">
                    <div className="relative z-10">
                      <h3 className="text-2xl font-black mb-4">Master Your Workflow</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {['Create', 'Generate', 'Connect'].map((step, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">
                              {i + 1}
                            </div>
                            <span className="font-bold">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <HelpCircle className="absolute -right-8 -bottom-8 w-48 h-48 text-white/10 rotate-12" />
                  </div>
                </motion.div>
              ) : activeTab === 'contact' ? (
                <motion.div 
                  key="contact"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-2xl mx-auto"
                >
                  <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-10 shadow-2xl">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 bg-rose-50 dark:bg-rose-900/20 rounded-2xl flex items-center justify-center">
                        <AlertCircle className="w-6 h-6 text-rose-500" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Direct Concern Box</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Your message will be sent directly to the Marketing Supervisors.</p>
                      </div>
                    </div>

                    <form onSubmit={handleSubmitConcern} className="space-y-6">
                      <div>
                        <label className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Topic / Subject</label>
                        <input 
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          placeholder="Brief title for your concern..."
                          className="w-full px-6 py-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500 dark:focus:border-indigo-400 text-slate-900 dark:text-white focus:outline-none transition-all font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Your Message / Concern</label>
                        <textarea 
                          value={concern}
                          onChange={(e) => setConcern(e.target.value)}
                          required
                          placeholder="Describe your concern or question here..."
                          className="w-full h-40 px-6 py-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500 dark:focus:border-indigo-400 text-slate-900 dark:text-white focus:outline-none transition-all resize-none font-medium"
                        />
                      </div>

                      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800 mb-2">
                        <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                          Messages are private. We aim to respond within 24-48 business hours. For technical errors, please include context or error messages.
                        </p>
                      </div>

                      <button 
                        type="submit"
                        disabled={isSubmitting || !concern.trim()}
                        className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center justify-center gap-3"
                      >
                        {isSubmitting ? (
                          <Sparkles className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                        Send to Supervisors
                      </button>
                    </form>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="history"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-4xl mx-auto"
                >
                  <div className="space-y-8">
                    {/* Active Concerns Section */}
                    <section>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-indigo-500" />
                        Active Support Requests
                      </h3>
                      <div className="space-y-4">
                        {myConcerns.filter(c => c.status !== 'resolved').length === 0 ? (
                          <div className="p-12 text-center bg-slate-50 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                            <p className="text-slate-400 font-bold italic">No active concerns.</p>
                          </div>
                        ) : (
                          myConcerns.filter(c => c.status !== 'resolved').map(item => (
                            <div key={item.id} className="p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                              <div className="flex items-center justify-between gap-4 mb-4">
                                <div className="flex items-center gap-3">
                                  <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${
                                    item.status === 'reviewed' 
                                      ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                                      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                                  }`}>
                                    {item.status}
                                  </span>
                                  {item.status !== 'resolved' && (
                                    <button 
                                      onClick={async () => {
                                        try {
                                          await updateDoc(doc(db, 'concerns', item.id), { status: 'resolved' });
                                          toast.success("Marked as resolved.");
                                        } catch (err) {
                                          toast.error("Failed to update status.");
                                        }
                                      }}
                                      className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      Mark as Resolved
                                    </button>
                                  )}
                                </div>
                                <span className="text-xs text-slate-400 font-bold italic">
                                  {item.timestamp?.toDate ? new Date(item.timestamp.toDate()).toLocaleString() : 'Just now'}
                                </span>
                              </div>
                              <h4 className="text-lg font-black text-slate-900 dark:text-white mb-6 border-b border-slate-50 dark:border-slate-800 pb-2">{item.subject}</h4>
                              
                              <div className="space-y-4 mb-8">
                                {!item.messages && item.message && (
                                  <div className="flex justify-end">
                                    <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                      <div className="flex items-center gap-2 mb-1">
                                        <User className="w-3 h-3 text-slate-400" />
                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">You</span>
                                      </div>
                                      <p className="text-sm font-medium leading-relaxed">{item.message}</p>
                                    </div>
                                  </div>
                                )}
                                {(item.messages || []).map((msg: any, idx: number) => (
                                  <div key={idx} className={`flex ${msg.role === 'supervisor' ? 'justify-start' : 'justify-end'}`}>
                                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                                      msg.role === 'supervisor' 
                                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-slate-900 dark:text-slate-100 border border-indigo-100 dark:border-indigo-800' 
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                    }`}>
                                      <div className="flex items-center gap-2 mb-1">
                                        {msg.role === 'supervisor' ? <Shield className="w-3 h-3 text-indigo-500" /> : <User className="w-3 h-3 text-slate-400" />}
                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                          {msg.role === 'supervisor' ? 'Supervisor' : 'You'}
                                        </span>
                                        <span className="text-[10px] opacity-40 ml-auto">
                                          {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                      </div>
                                      <p className="text-sm font-medium leading-relaxed">{msg.text}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* User Reply Input */}
                              <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                                <div className="relative group">
                                  <input 
                                    type="text"
                                    value={userReplyText[item.id] || ''}
                                    onChange={(e) => setUserReplyText(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    onKeyDown={(e) => e.key === 'Enter' && handleUserReply(item.id)}
                                    placeholder="Type your reply..."
                                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500 dark:focus:border-indigo-400 text-sm font-medium outline-none transition-all pr-16"
                                  />
                                  <button 
                                    onClick={() => handleUserReply(item.id)}
                                    disabled={isReplying[item.id] || !(userReplyText[item.id] || '').trim()}
                                    className="absolute right-2 top-2 bottom-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl transition-all flex items-center justify-center"
                                  >
                                    {isReplying[item.id] ? <Clock className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </section>

                    {/* Resolved Concerns Section */}
                    <section className="pt-8 border-t border-slate-100 dark:border-slate-800">
                      <h3 className="text-xl font-bold text-slate-400 dark:text-slate-500 mb-6 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5" />
                        Past Concerns
                      </h3>
                      <div className="space-y-4 opacity-70 hover:opacity-100 transition-opacity">
                        {myConcerns.filter(c => c.status === 'resolved').length === 0 ? (
                          <p className="text-xs text-slate-400 italic">History is clear.</p>
                        ) : (
                          myConcerns.filter(c => c.status === 'resolved').map(item => (
                            <div key={item.id} className="p-6 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 rounded-2xl grayscale hover:grayscale-0 transition-all flex items-start justify-between gap-4 group">
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-2">
                                   <h4 className="text-sm font-bold text-slate-600 dark:text-slate-300">{item.subject}</h4>
                                   <span className="text-[10px] text-slate-400 font-bold">{item.timestamp?.toDate ? new Date(item.timestamp.toDate()).toLocaleDateString() : ''}</span>
                                </div>
                                <p className="text-xs text-slate-400 line-clamp-1 italic">
                                  "{item.messages && item.messages.length > 0 ? item.messages[0].text : (item.message || 'No content')}"
                                </p>
                              </div>
                              
                              {isDeleting === item.id ? (
                                <div className="flex items-center gap-2">
                                   <button 
                                     onClick={async () => {
                                       try {
                                         await deleteDoc(doc(db, 'concerns', item.id));
                                         toast.success("Record deleted.");
                                         setIsDeleting(null);
                                       } catch (err) {
                                         toast.error("Failed to delete.");
                                       }
                                     }}
                                     className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-black"
                                   >
                                     OK
                                   </button>
                                   <button onClick={() => setIsDeleting(null)} className="text-[10px] text-slate-400">Esc</button>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => setIsDeleting(item.id)}
                                  className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-500 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-all font-bold"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legal Footer */}
      <div className="mt-16 pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-col items-center gap-4">
        <div className="flex items-center gap-6">
          <a 
            href="/privacy" 
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState(null, '', '/privacy');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
          >
            Privacy Policy
          </a>
          <a 
            href="/terms" 
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState(null, '', '/terms');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
          >
            Terms of Service
          </a>
          <a 
            href="/deletion" 
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState(null, '', '/deletion');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
          >
            Data Deletion
          </a>
        </div>
        <p className="text-[10px] text-slate-300 dark:text-slate-600 font-bold uppercase tracking-[0.2em]">
          Marketing Operations Portal © 2026
        </p>
      </div>
    </div>
  );
};
