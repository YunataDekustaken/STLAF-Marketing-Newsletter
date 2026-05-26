/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ViewMode = 'dashboard' | 'compose' | 'campaigns' | 'subscribers' | 'templates' | 'sent-history' | 'settings' | 'profile' | 'help';

export type UserRole = 'marketing_supervisor' | 'marketing_member' | 'department';

export type Department = 'Marketing' | 'HR' | 'Litigation' | 'Corpo' | 'Accounting' | 'IT' | 'Operations';

export type UserStatus = 'active' | 'pending' | 'blocked';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  department: Department;
  photoURL?: string;
  status: UserStatus;
  columnPreferences?: any[];
}

export interface EmailCampaign {
  id: string;
  title: string;
  subject: string;
  body: string; // HTML
  status: 'draft' | 'scheduled' | 'sent' | 'sending';
  type: 'Promotion' | 'Update' | 'Newsletter' | 'Announcement' | 'Follow-up';
  recipientTags: string[]; // empty indicates All Subscribers
  scheduledAt?: string; // ISO date-time
  sentAt?: string; // ISO date-time
  sentCount: number;
  failedCount: number;
  createdBy: string;
  createdAt: string;
  attachmentsJson?: string;
}

export interface Subscriber {
  id: string;
  email: string;
  name: string;
  tags: string[];
  status: 'active' | 'pending' | 'unsubscribed' | 'bounced';
  addedAt: string;
  addedBy: string;
  unsubscribeReason?: string;
  unsubscribedAt?: string;
  verifiedAt?: string;
  verificationToken?: string;
  verificationExpiresAt?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string; // HTML
  category: string;
  createdBy: string;
  createdAt: string;
}

export interface EmailLog {
  id: string;
  campaignId: string;
  recipientEmail: string;
  status: 'sent' | 'failed';
  errorMessage?: string;
  sentAt: string;
  gmailMessageId?: string;
}

export interface GmailConfig {
  connected: boolean;
  authorizedEmail?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
}

export interface InAppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  userId?: string; // Optional: specify user targeted notification
  read: boolean;
  createdAt: string;
}


