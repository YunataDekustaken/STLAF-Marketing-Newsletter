import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  CheckCircle, 
  AlertCircle, 
  Send, 
  Sparkles, 
  Loader2, 
  Fingerprint, 
  Check, 
  ChevronRight,
  ShieldCheck,
  User,
  Tags
} from 'lucide-react';
import axios from 'axios';

interface PublicPortalProps {
  mode: 'subscribe' | 'unsubscribe';
}

export const PublicPortal: React.FC<PublicPortalProps> = ({ mode }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  
  // Tag choices representing subscription preferences
  const [selectedTags, setSelectedTags] = useState<string[]>(['Newsletter']);
  const availableTags = ['Newsletter', 'Product Updates', 'Exclusive Offers', 'Tech Tips', 'Events'];

  // Unsubscribe reasons
  const [reason, setReason] = useState('');
  const [otherReasonText, setOtherReasonText] = useState('');
  const reasons = [
    "Emails are too frequent",
    "Content is no longer relevant to me",
    "I received this email by mistake",
    "The content quality is not what I expected",
    "Other (please specify)"
  ];

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [devVerificationUrl, setDevVerificationUrl] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'none' | 'success' | 'expired' | 'invalid'>('none');

  // Auto-detect email and verification params from query string
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
    
    const verifiedParam = params.get('verified');
    if (verifiedParam) {
      if (verifiedParam === 'success') {
        setVerificationStatus('success');
      } else if (verifiedParam === 'expired') {
        setVerificationStatus('expired');
      } else if (verifiedParam === 'invalid') {
        setVerificationStatus('invalid');
      }
    }
  }, [mode]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) {
      setErrorMessage("Please fill in your name and email address.");
      return;
    }

    setLoading(true);
    setErrorMessage('');
    
    try {
      const resp = await axios.post('/api/public/subscribe', {
        name,
        email,
        tags: selectedTags
      });

      if (resp.data.success) {
        setEmailSent(!!resp.data.emailSent);
        setDevVerificationUrl(resp.data.devVerificationUrl || null);
        setSuccess(true);
      } else {
        setErrorMessage(resp.data.error || "Failed to subscribe. Please try again.");
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "An unexpected error occurred.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMessage("Please enter your email address to unsubscribe.");
      return;
    }

    setLoading(true);
    setErrorMessage('');

    const finalReason = reason === "Other (please specify)" ? `Other: ${otherReasonText}` : reason;

    try {
      const resp = await axios.post('/api/public/unsubscribe', {
        email,
        reason: finalReason
      });

      if (resp.data.success) {
        setSuccess(true);
      } else {
        setErrorMessage(resp.data.error || "Failed to unsubscribe. Please try again.");
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "An unexpected error occurred.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResubscribe = () => {
    // Reset state and switch mode if they want to re-subscribe
    setSuccess(false);
    setErrorMessage('');
    // Go to subscribe path
    window.history.pushState({}, '', '/subscribe');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-350">
      
      {/* Visual Header Branding */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 bg-[#1b2a4a] text-white rounded-2xl flex items-center justify-center p-2.5 shadow-xl ring-4 ring-white dark:ring-slate-900 transition-transform hover:scale-105">
          <img src="/img/MAIN (1).png" alt="Portal Logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white tracking-tight font-sans">
          STLAF Marketing Portal
        </h1>
        <p className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-1 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-full border border-slate-205 dark:border-slate-805">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-500" /> Secure Subscription Registry
        </p>
      </div>

      {/* Main Action Window Card */}
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6">
        
        {verificationStatus !== 'none' ? (
          /* VERIFICATION RESULT PANEL */
          <div className="space-y-6 text-center animate-fade-in py-4">
            {verificationStatus === 'success' && (
              <>
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/30 border border-emerald-300">
                  <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    Subscription Verified!
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
                    Your email address <strong>{email || 'registered address'}</strong> has been verified successfully. Your subscription is now fully active!
                  </p>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setVerificationStatus('none');
                      setSuccess(false);
                      window.history.pushState({}, '', '/subscribe');
                      window.location.reload();
                    }}
                    className="w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-xl text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-500 transition-all font-sans cursor-pointer"
                  >
                    Return to subscriber portal
                  </button>
                </div>
              </>
            )}

            {verificationStatus === 'expired' && (
              <>
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-950/30 border border-amber-300">
                  <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    Verification Expired
                  </h2>
                  <p className="text-slate-500 dark:text-slate-450 text-sm max-w-sm mx-auto leading-relaxed">
                    This verification link has expired. To maintain clean subscriber lists, unverified registrations are automatically deleted after 24 hours. Please re-subscribe to trigger a new link.
                  </p>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setVerificationStatus('none');
                      setSuccess(false);
                      window.history.pushState({}, '', '/subscribe');
                      window.location.reload();
                    }}
                    className="w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-xl text-sm font-semibold text-slate-900 bg-amber-450 hover:bg-amber-500 transition-all font-sans cursor-pointer"
                  >
                    Subscribe Again
                  </button>
                </div>
              </>
            )}

            {verificationStatus === 'invalid' && (
              <>
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-rose-100 dark:bg-rose-950/30 border border-rose-300">
                  <AlertCircle className="h-8 w-8 text-rose-600 dark:text-rose-450" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    Invalid Verification URL
                  </h2>
                  <p className="text-slate-500 dark:text-slate-450 text-sm max-w-sm mx-auto leading-relaxed">
                    We couldn't verify this email subscription. The token is invalid, corrupted, or have already been fully activated. Please check the email details and try again.
                  </p>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setVerificationStatus('none');
                      setSuccess(false);
                      window.history.pushState({}, '', '/subscribe');
                      window.location.reload();
                    }}
                    className="w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-rose-505 hover:bg-rose-600 transition-all font-sans cursor-pointer"
                  >
                    Retry Subscription Setup
                  </button>
                </div>
              </>
            )}
          </div>
        ) : success ? (
          /* SUCCESS STATE PANEL */
          <div className="space-y-6 text-center animate-fade-in py-4">
            {mode === 'subscribe' ? (
              <>
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-950/30 border border-amber-300 animate-pulse">
                  <Mail className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                    Verification Needed!
                  </h2>
                  <p className="text-slate-500 dark:text-slate-450 text-sm max-w-sm mx-auto leading-relaxed">
                    We've sent a verification link to <strong>{email}</strong>. Please check your inbox and click this link within 24 hours to confirm your subscription.
                  </p>
                </div>

                {devVerificationUrl && (
                  <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 text-left space-y-2">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
                      <Fingerprint className="w-3 h-3" /> Developer Sandbox
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal">
                      {!emailSent 
                        ? "Admin Note: Gmail is not yet configured or authorised. Use the sandbox shortcut below to manually complete the double opt-in verification cycle without wait:" 
                        : "For convenience in development, you can also use this link to complete the verification simulation:"
                      }
                    </p>
                    <a
                      href={devVerificationUrl}
                      className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-bold underline hover:text-amber-700 break-all"
                    >
                      Verify Subscription Manually &rarr;
                    </a>
                  </div>
                )}

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-slate-400">Unverified subscriptions automatically expire and are cleared from the queue after 24 hours.</p>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/30 border border-emerald-300">
                  <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                    Successfully Opted-Out
                  </h2>
                  <p className="text-slate-500 dark:text-slate-450 text-sm max-w-sm mx-auto leading-relaxed">
                    <strong>{email}</strong> has been removed from all marketing campaigns. We are sorry to see you go.
                  </p>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3">
                  <button
                    onClick={handleResubscribe}
                    className="w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 focus:outline-none transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <Sparkles className="w-4 h-4" /> Changed your mind? Re-subscribe
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* ACTIVE FORM STAGE */
          <div className="space-y-6 animate-fade-in">
            <div className="space-y-1.5 text-center border-b border-slate-100 dark:border-slate-800/80 pb-4">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {mode === 'subscribe' ? 'Subscribe to Newsletter' : 'Unsubscribe Center'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {mode === 'subscribe' 
                  ? 'Join our circle to receive custom recommendations, tech news, and system updates.'
                  : 'Manage your campaign preferences or unsubscribe from our distribution list.'
                }
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-300 rounded-xl flex items-start gap-2 text-xs text-red-600 dark:text-red-400 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-tight">{errorMessage}</p>
              </div>
            )}

            {mode === 'subscribe' ? (
              /* SUBSCRIBE HTML VIEW */
              <form onSubmit={handleSubscribe} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-amber-500" /> Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="E.g., John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-sans text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-amber-500" /> Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="john@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-sans text-sm"
                  />
                </div>

                {/* Subscriptions Preferences Tags */}
                <div className="space-y-3 pt-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Tags className="w-3.5 h-3.5 text-amber-500" /> Topic Preferences
                  </label>
                  <p className="text-xs text-slate-450 dark:text-slate-500 -mt-2 leading-relaxed">
                    Select categories you're interested in:
                  </p>
                  
                  <div className="flex flex-wrap gap-2 pt-1">
                    {availableTags.map(tag => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          type="button"
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                            isSelected 
                              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900' 
                              : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800 hover:bg-slate-100'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-6 py-3 px-4 rounded-xl font-bold text-slate-950 bg-[#dcae44] hover:bg-amber-500 disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> Processing...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Subscribe to Updates
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* UNSUBSCRIBE HTML VIEW */
              <form onSubmit={handleUnsubscribe} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-amber-500" /> Your Registered Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="john@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-sans text-sm"
                  />
                </div>

                {/* Optional Feedback Block */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    Feedback Reason (Optional)
                  </label>
                  <p className="text-xs text-slate-450 dark:text-slate-500 -mt-1">
                    Help us improve! Why are you opting-out?
                  </p>
                  
                  <div className="space-y-2 mt-2">
                    {reasons.map((r) => (
                      <label key={r} className="flex items-center gap-2.5 text-xs text-slate-650 dark:text-slate-350 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                        <input
                          type="radio"
                          name="unsubscribe_reason"
                          checked={reason === r}
                          onChange={() => setReason(r)}
                          className="text-amber-500 focus:ring-amber-500 border-slate-300 dark:border-slate-800"
                        />
                        <span>{r}</span>
                      </label>
                    ))}
                    
                    {reason === "Other (please specify)" && (
                      <input
                        type="text"
                        required
                        placeholder="Please tell us more..."
                        value={otherReasonText}
                        onChange={(e) => setOtherReasonText(e.target.value)}
                        className="w-full px-3 py-2 mt-1.5 rounded-lg border border-slate-205 dark:border-slate-805 bg-white dark:bg-slate-950 text-slate-950 dark:text-white focus:outline-none text-xs"
                      />
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-6 py-3 px-4 rounded-xl font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" /> Processing...
                    </>
                  ) : (
                    <>
                      Confirm Unsubscribe
                    </>
                  )}
                </button>
              </form>
            )}
            
          </div>
        )}
        
      </div>

      {/* Security notice and compliance banner */}
      <p className="mt-8 text-center text-xs text-slate-400 tracking-normal font-sans max-w-sm">
        🔒 This database compliance form respects GDPR rules-of-consent and CAN-SPAM Act requirements.
      </p>
    </div>
  );
};
