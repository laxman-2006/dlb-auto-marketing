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

  // Webhook Simulator
  simulateWebhook: (payload: any) =>
    fetchJson<any>(`/webhook/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
};
