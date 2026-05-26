import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db, notificationsDb } from '../firebase';
import { InAppNotification } from '../types';

const NOTIFICATION_COLLECTION = 'notifications';

/**
 * Creates a system/user notification in the isolated notifications database.
 * If the isolated notifications database fails (e.g., instance not configured),
 * it falls back to the main database gracefully.
 */
export async function sendInAppNotification(data: {
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  userId?: string;
}) {
  const payload = {
    title: data.title,
    message: data.message,
    type: data.type || 'info',
    userId: data.userId || null,
    read: false,
    createdAt: new Date().toISOString()
  };

  try {
    // Try writing to separate notification database
    await addDoc(collection(notificationsDb, NOTIFICATION_COLLECTION), payload);
  } catch (err: any) {
    console.warn("[Notifications Service] Flipped to fallback database for notify write:", err.message);
    try {
      // Fallback to standard DB
      await addDoc(collection(db, NOTIFICATION_COLLECTION), payload);
    } catch (fallbackErr: any) {
      console.error("[Notifications Service] Critical fail writing notification:", fallbackErr.message);
    }
  }
}

/**
 * Subscribes to notifications in real-time.
 * Auto-detects and falls back to standard db if notificationsDb triggers a failure listener.
 */
export function subscribeToNotifications(
  onUpdate: (notifications: InAppNotification[]) => void,
  userId?: string
) {
  let isUsingFallback = false;

  const handleSnapshot = (snapshot: any) => {
    const list: InAppNotification[] = [];
    snapshot.forEach((doc: any) => {
      const data = doc.data();
      // Optional client-side fallback query filter if needed
      if (!userId || !data.userId || data.userId === userId) {
        list.push({
          id: doc.id,
          title: data.title || '',
          message: data.message || '',
          type: data.type || 'info',
          userId: data.userId || undefined,
          read: !!data.read,
          createdAt: data.createdAt || new Date().toISOString()
        });
      }
    });
    onUpdate(list);
  };

  const getActiveQuery = (database: any) => {
    return query(
      collection(database, NOTIFICATION_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
  };

  try {
    // Attempt subscribing to the primary/isolated notifications database
    const q = getActiveQuery(notificationsDb);
    const unsub = onSnapshot(q, handleSnapshot, (err) => {
      console.warn("[Notifications Service] Primary subscription issue. Trying main db fallback.", err.message);
      if (!isUsingFallback) {
        isUsingFallback = true;
        unsub(); // unsubscribe primary
        
        // Start subscription to the fallback/main database
        const qFallback = getActiveQuery(db);
        onSnapshot(qFallback, handleSnapshot, (fallbackErr) => {
          console.error("[Notifications Service] Fallback subscription failed.", fallbackErr.message);
        });
      }
    });

    return () => {
      unsub();
    };
  } catch (err: any) {
    console.warn("[Notifications Service] Initial subscribe fail on primary db, turning to fallback:", err.message);
    const qFallback = getActiveQuery(db);
    return onSnapshot(qFallback, handleSnapshot, (fallbackErr) => {
      console.error("[Notifications Service] Fallback subscription failed.", fallbackErr.message);
    });
  }
}

/**
 * Marks a notification as read.
 */
export async function markNotificationAsRead(id: string) {
  try {
    const docRef = doc(notificationsDb, NOTIFICATION_COLLECTION, id);
    await updateDoc(docRef, { read: true });
  } catch (err) {
    try {
      const docRefFallback = doc(db, NOTIFICATION_COLLECTION, id);
      await updateDoc(docRefFallback, { read: true });
    } catch (fallbackErr) {
      console.error("[Notifications Service] Error marking notification read:", fallbackErr);
    }
  }
}

/**
 * Marks all notifications as read.
 */
export async function markAllNotificationsAsRead(notifications: InAppNotification[]) {
  const unread = notifications.filter(n => !n.read);
  for (const n of unread) {
    await markNotificationAsRead(n.id);
  }
}

/**
 * Clears/Deletes a notification.
 */
export async function deleteNotification(id: string) {
  try {
    const docRef = doc(notificationsDb, NOTIFICATION_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (err) {
    try {
      const docRefFallback = doc(db, NOTIFICATION_COLLECTION, id);
      await deleteDoc(docRefFallback);
    } catch (fallbackErr) {
      console.error("[Notifications Service] Error deleting notification:", fallbackErr);
    }
  }
}
