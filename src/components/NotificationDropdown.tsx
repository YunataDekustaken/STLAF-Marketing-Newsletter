import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Check, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Clock, 
  X,
  BellRing
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  subscribeToNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  deleteNotification 
} from '../services/notificationService';
import { InAppNotification } from '../types';

export const NotificationDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  
  useEffect(() => {
    const unsubscribe = subscribeToNotifications((list) => {
      setNotifications(list);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await markNotificationAsRead(id);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNotification(id);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead(notifications);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="relative">
      {/* Target Trigger Button */}
      <button
        id="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl transition-all duration-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200/50 dark:hover:border-slate-700/50 cursor-pointer group"
        title="In-App Notifications"
      >
        <Bell className={`w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-amber-500 group-hover:scale-105 transition-all duration-300 ${unreadCount > 0 ? 'animate-wiggle' : ''}`} />
        
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-[9px] font-black text-white items-center justify-center shadow-sm">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {/* Transparent Click Outside Layer */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 cursor-default" 
          onClick={() => setIsOpen(false)} 
        />
      )}

      {/* Popover Card */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Notifications</span>
                {unreadCount > 0 && (
                  <span className="bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200/40">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-bold tracking-tight inline-flex items-center gap-1 cursor-pointer transition-colors"
                  title="Mark all as read"
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
              {notifications.length === 0 ? (
                <div className="px-6 py-10 text-center flex flex-col items-center justify-center">
                  <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-2xl mb-3 text-slate-400 dark:text-slate-600">
                    <BellRing className="w-6 h-6 stroke-1" />
                  </div>
                  <h5 className="text-xs font-black text-slate-700 dark:text-slate-350 uppercase tracking-wider mb-1">No Notifications yet</h5>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-[200px]">
                    Alerts from campaigns, subscriptions, or team updates will show up here.
                  </p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div 
                    key={notification.id}
                    className={`p-4 flex gap-3 transition-all duration-200 group relative ${
                      notification.read 
                        ? 'bg-transparent text-slate-600 dark:text-slate-400' 
                        : 'bg-slate-50/50 dark:bg-slate-950/30 text-slate-800 dark:text-slate-250 font-medium'
                    }`}
                  >
                    {/* Status Circle Dot */}
                    {!notification.read && (
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-500" />
                    )}

                    {/* Icon Column */}
                    <div className="mt-0.5 shrink-0">
                      <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-750 shadow-sm">
                        {getNotificationIcon(notification.type)}
                      </div>
                    </div>

                    {/* Text Column */}
                    <div className="flex-1 min-w-0 pr-6">
                      <h4 className={`text-[12px] leading-tight mb-0.5 font-bold ${notification.read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                        {notification.title}
                      </h4>
                      <p className="text-[11px] leading-relaxed text-slate-550 dark:text-slate-400 break-words mb-1">
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-1.5 text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                        <Clock className="w-3 h-3 text-slate-350" />
                        <span>{formatTime(notification.createdAt)}</span>
                      </div>
                    </div>

                    {/* Actions Overlay Row */}
                    <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/90 dark:bg-slate-900/95 p-1 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800">
                      {!notification.read && (
                        <button
                          onClick={(e) => handleMarkAsRead(notification.id, e)}
                          className="p-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-500 transition-colors cursor-pointer"
                          title="Mark read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      
                      <button
                        onClick={(e) => handleDelete(notification.id, e)}
                        className="p-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                        title="Delete notification"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* View/Clear All footer if notifications exist */}
            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-805 bg-slate-50/50 dark:bg-slate-950/10 text-center">
                <span className="text-[10px] text-slate-405 dark:text-slate-500 font-bold uppercase tracking-widest">
                  Showing latest 50 alerts
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
