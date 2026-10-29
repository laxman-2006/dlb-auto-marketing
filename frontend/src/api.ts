const API_BASE = '/api';

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || `HTTP error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// WhatsApp Connection APIs
export const api = {
  getWhatsAppStatus: () => fetchJson<any>(`${API_BASE}/whatsapp/status`),
  verifyWhatsApp: () => fetchJson<any>(`${API_BASE}/whatsapp/verify`, { method: 'POST' }),
  connectWhatsApp: (payload: any) =>
    fetchJson<any>(`${API_BASE}/whatsapp/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  disconnectWhatsApp: () => fetchJson<any>(`${API_BASE}/whatsapp/disconnect`, { method: 'POST' }),
  sendTestMessage: (recipientPhone: string, templateName?: string) =>
    fetchJson<any>(`${API_BASE}/whatsapp/test-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientPhone, templateName })
    }),

  // Excel Import APIs
  inspectExcel: (formData: FormData) =>
    fetchJson<any>(`${API_BASE}/import/inspect`, {
      method: 'POST',
      body: formData
    }),
  executeImport: (formData: FormData) =>
    fetchJson<any>(`${API_BASE}/import/execute`, {
      method: 'POST',
      body: formData
    }),
  getImportHistory: () => fetchJson<any>(`${API_BASE}/import/history`),

  // Contacts APIs
  getContacts: (page = 1, limit = 20, segment = 'all', q = '') =>
    fetchJson<any>(`${API_BASE}/contacts?page=${page}&limit=${limit}&segment=${segment}&q=${encodeURIComponent(q)}`),
  getContactStats: () => fetchJson<any>(`${API_BASE}/contacts/stats`),
  updateConsent: (contactId: string, consentStatus: string, notes?: string) =>
    fetchJson<any>(`${API_BASE}/contacts/${contactId}/consent`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consentStatus, notes })
    }),
  deleteContact: (contactId: string) =>
    fetchJson<any>(`${API_BASE}/contacts/${contactId}`, { method: 'DELETE' }),
  pasteNumbers: (payload: { rawText: string; consentStatus?: string; defaultCountryCode?: string; commit?: boolean }) =>
    fetchJson<any>(`${API_BASE}/contacts/paste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),

  // Templates APIs
  getTemplates: () => fetchJson<any>(`${API_BASE}/templates`),
  syncTemplates: () => fetchJson<any>(`${API_BASE}/templates/sync`, { method: 'POST' }),
  createTemplate: (payload: any) =>
    fetchJson<any>(`${API_BASE}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),

  // Campaigns APIs
  getCampaigns: () => fetchJson<any>(`${API_BASE}/campaigns`),
  getCampaignsFeed: () => fetchJson<any>(`${API_BASE}/campaigns/feed`),
  getCampaignDetails: (id: string) => fetchJson<any>(`${API_BASE}/campaigns/${id}`),
  getWhoGotWhat: (id: string, status = 'ALL', q = '', page = 1) =>
    fetchJson<any>(`${API_BASE}/campaigns/${id}/who-got-what?status=${status}&q=${encodeURIComponent(q)}&page=${page}`),
  retryFailedRecipients: (id: string) =>
    fetchJson<any>(`${API_BASE}/campaigns/${id}/retry-failed`, { method: 'POST' }),
  quickSend: (payload: { messageText: string; mediaName?: string; mediaUrl?: string; recipientPhones?: string[]; templateId?: string }) =>
    fetchJson<any>(`${API_BASE}/campaigns/quick-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  uploadBroadcastWhatsApp: (formData: FormData) =>
    fetchJson<any>(`${API_BASE}/campaigns/upload-broadcast`, {
      method: 'POST',
      body: formData
    }),
  getPacingStatus: () => fetchJson<any>(`${API_BASE}/campaigns/pacing-status`),
  getGroupAdderStatus: () => fetchJson<any>(`${API_BASE}/groups/adder-status`),
  estimateCampaign: (templateId: string, contactSegment: string) =>
    fetchJson<any>(`${API_BASE}/campaigns/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId, contactSegment })
    }),
  createCampaign: (payload: any) =>
    fetchJson<any>(`${API_BASE}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  pauseCampaign: (id: string) => fetchJson<any>(`${API_BASE}/campaigns/${id}/pause`, { method: 'POST' }),
  resumeCampaign: (id: string) => fetchJson<any>(`${API_BASE}/campaigns/${id}/resume`, { method: 'POST' }),
  cancelCampaign: (id: string) => fetchJson<any>(`${API_BASE}/campaigns/${id}/cancel`, { method: 'POST' }),
  deleteCampaign: (id: string) => fetchJson<any>(`${API_BASE}/campaigns/${id}`, { method: 'DELETE' }),

  // Conversations APIs
  getConversations: () => fetchJson<any>(`${API_BASE}/conversations`),
  getConversationMessages: (id: string) => fetchJson<any>(`${API_BASE}/conversations/${id}/messages`),
  sendReply: (conversationId: string, text: string) =>
    fetchJson<any>(`${API_BASE}/conversations/${conversationId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    }),

  // Reports APIs
  getReportsOverview: () => fetchJson<any>(`${API_BASE}/reports/overview`),

  // Group Management APIs
  getGroups: () => fetchJson<any>(`${API_BASE}/groups`),
  createGroup: (payload: { name: string; initialPhones?: string[] }) =>
    fetchJson<any>(`${API_BASE}/groups/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  addGroupMembers: (groupId: string, payload: { rawNumbers?: string; numbersList?: string[] }) =>
    fetchJson<any>(`${API_BASE}/groups/${groupId}/add-members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  uploadGroupExcel: (groupId: string, formData: FormData) =>
    fetchJson<any>(`${API_BASE}/groups/${groupId}/upload`, {
      method: 'POST',
      body: formData
    }),
  sendGroupMessage: (groupId: string, payload: { messageText: string; mediaUrl?: string; mediaName?: string }) =>
    fetchJson<any>(`${API_BASE}/groups/${groupId}/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  getGroupMembers: (groupId: string, filter = 'ALL', q = '', page = 1) =>
    fetchJson<any>(`${API_BASE}/groups/${groupId}/members?status=${filter}&q=${encodeURIComponent(q)}&page=${page}`),
  getGroupMessages: (groupId: string) =>
    fetchJson<any>(`${API_BASE}/groups/${groupId}/messages`),
  renameGroup: (id: string, name: string) =>
    fetchJson<any>(`${API_BASE}/groups/${id}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    }),
  deleteGroup: (id: string) =>
    fetchJson<any>(`${API_BASE}/groups/${id}`, { method: 'DELETE' }),

  // Webhook Simulator
  simulateWebhook: (payload: any) =>
    fetchJson<any>(`/webhook/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),

  // Telegram APIs
  getTelegramStatus: () => fetchJson<any>(`${API_BASE}/telegram/status`),
  connectTelegramBot: (botToken: string) =>
    fetchJson<any>(`${API_BASE}/telegram/connect-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken })
    }),
  sendTelegramPhoneCode: (phone: string) =>
    fetchJson<any>(`${API_BASE}/telegram/send-phone-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    }),
  verifyTelegramPhoneCode: (code: string, password?: string) =>
    fetchJson<any>(`${API_BASE}/telegram/verify-phone-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, password })
    }),
  disconnectTelegram: () => fetchJson<any>(`${API_BASE}/telegram/disconnect`, { method: 'POST' }),
  getTelegramFeed: () => fetchJson<any>(`${API_BASE}/telegram/feed`),
  getTelegramDialogs: (q: string = '') => fetchJson<any>(`${API_BASE}/telegram/dialogs?q=${encodeURIComponent(q)}`),
  sendTelegramPersonal: (payload: { recipient: string; messageText: string }) =>
    fetchJson<any>(`${API_BASE}/telegram/send-personal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  sendTelegramBulk: (payload: { recipients: string[]; messageText: string }) =>
    fetchJson<any>(`${API_BASE}/telegram/send-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  quickSendTelegram: (formData: FormData) =>
    fetchJson<any>(`${API_BASE}/telegram/send-bulk`, {
      method: 'POST',
      body: formData
    }),
  uploadBroadcastTelegram: (formData: FormData) =>
    fetchJson<any>(`${API_BASE}/telegram/campaigns/upload-broadcast`, {
      method: 'POST',
      body: formData
    }),
  getTelegramGroups: () => fetchJson<any>(`${API_BASE}/telegram/groups`),
  createTelegramGroup: (payload: { name: string; initialPhones?: string[] }) =>
    fetchJson<any>(`${API_BASE}/telegram/groups/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  renameTelegramGroup: (groupId: string, name: string) =>
    fetchJson<any>(`${API_BASE}/telegram/groups/${groupId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    }),
  deleteTelegramGroup: (groupId: string) =>
    fetchJson<any>(`${API_BASE}/telegram/groups/${groupId}`, {
      method: 'DELETE'
    }),
  uploadTelegramGroupExcel: (groupId: string, formData: FormData) =>
    fetchJson<any>(`${API_BASE}/telegram/groups/${groupId}/upload`, {
      method: 'POST',
      body: formData
    }),
  addTelegramGroupMembers: (groupId: string, payload: { members?: string[]; rawNumbers?: string }) =>
    fetchJson<any>(`${API_BASE}/telegram/groups/${groupId}/add-members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  getActiveTelegramGroupJob: (groupId: string) =>
    fetchJson<any>(`${API_BASE}/telegram/groups/${groupId}/jobs/active`),
  cancelTelegramGroupJob: (groupId: string) =>
    fetchJson<any>(`${API_BASE}/telegram/groups/${groupId}/jobs/cancel`, { method: 'POST' }),
  clearTelegramGroupJob: (groupId: string) =>
    fetchJson<any>(`${API_BASE}/telegram/groups/${groupId}/jobs/clear`, { method: 'POST' }),
  getTelegramGroupMembers: (groupId: string, status: string = 'ALL', search: string = '', page: number = 1) =>
    fetchJson<any>(`${API_BASE}/telegram/groups/${groupId}/members?status=${status}&search=${encodeURIComponent(search)}&page=${page}`),
  broadcastTelegramGroup: (groupId: string, payload: { messageText: string; media?: File }) => {
    if (payload.media) {
      const fd = new FormData();
      fd.append('messageText', payload.messageText);
      fd.append('media', payload.media);
      return fetchJson<any>(`${API_BASE}/telegram/groups/${groupId}/broadcast`, {
        method: 'POST',
        body: fd
      });
    }
    return fetchJson<any>(`${API_BASE}/telegram/groups/${groupId}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageText: payload.messageText })
    });
  },
  deleteTelegramCampaign: (id: string) =>
    fetchJson<any>(`${API_BASE}/telegram/campaigns/${id}`, { method: 'DELETE' }),
  getTelegramMessages: () => fetchJson<any>(`${API_BASE}/telegram/messages`)
};

