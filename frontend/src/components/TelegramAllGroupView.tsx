import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  FileSpreadsheet,
  Send,
  Paperclip,
  Copy,
  Check,
  RefreshCw,
  Search,
  ExternalLink,
  Sparkles,
  Plus,
  Edit3,
  Trash2,
  ArrowLeft
} from 'lucide-react';
import { api } from '../api';

interface TelegramGroupInfo {
  id: string;
  name: string;
  group_jid: string;
  invite_link?: string;
  total_members: number;
  local_saved_members?: number;
  created_at: string;
}

interface MemberRecord {
  id: string;
  member_identifier: string;
  contact_name?: string;
  status: 'ADDED' | 'INVITED' | 'FAILED';
  error_detail?: string;
  added_at: string;
}

interface ActiveJob {
  id: string;
  group_id: string;
  total: number;
  processed: number;
  added: number;
  invited: number;
  failed: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
  progressPct: number;
  current_batch: number;
  total_batches: number;
  last_error?: string;
}

interface TelegramAllGroupViewProps {
  onNavigateSettings?: () => void;
  onBack?: () => void;
}

export const TelegramAllGroupView: React.FC<TelegramAllGroupViewProps> = ({ onNavigateSettings, onBack }) => {
  const [groups, setGroups] = useState<TelegramGroupInfo[]>([]);
  const [activeGroup, setActiveGroup] = useState<TelegramGroupInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'excel' | 'paste' | 'messages' | 'members'>('excel');

  // Modals & States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');

  // Inputs
  const [rawNumbers, setRawNumbers] = useState('');
  const [pastedCount, setPastedCount] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [broadcastText, setBroadcastText] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);

  // Status & Progress
  const [loading, setLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Active Background Job for 25,000 Numbers
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);

  // Members ledger
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [membersFilter, setMembersFilter] = useState('ALL');
  const [membersSearch, setMembersSearch] = useState('');
  const [membersPage, setMembersPage] = useState(1);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Telegram status
  const [tgConnected, setTgConnected] = useState(false);
  const [tgName, setTgName] = useState('');
  const [tgUsername, setTgUsername] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const checkTelegramStatus = async () => {
    try {
      const res = await api.getTelegramStatus();
      setTgConnected(res.connected === true);
      if (res.verifiedName) setTgName(res.verifiedName);
      if (res.username) setTgUsername(res.username);
    } catch {
      setTgConnected(false);
    }
  };

  const loadGroups = async (preferredId?: string) => {
    try {
      setLoading(true);
      const res = await api.getTelegramGroups();
      if (res.success) {
        const list: TelegramGroupInfo[] = res.groups || [];
        setGroups(list);

        if (list.length === 0) {
          setActiveGroup(null);
        } else if (preferredId) {
          const match = list.find((g) => g.id === preferredId);
          setActiveGroup(match || list[0]);
        } else if (activeGroup) {
          const current = list.find((g) => g.id === activeGroup.id);
          setActiveGroup(current || list[0]);
        } else {
          setActiveGroup(list[0]);
        }
      }
    } catch (err: any) {
      console.error('Failed to load telegram groups:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveJob = async (groupId: string) => {
    try {
      const res = await api.getActiveTelegramGroupJob(groupId);
      if (res.success && res.job) {
        setActiveJob(res.job);
      } else {
        setActiveJob(null);
      }
    } catch {}
  };

  const loadMembers = async (groupId: string) => {
    try {
      setLoadingMembers(true);
      const res = await api.getTelegramGroupMembers(groupId, membersFilter, membersSearch, membersPage);
      if (res.success) {
        setMembers(res.members || []);
        setMembersTotal(res.total || 0);
      }
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    loadGroups();
    checkTelegramStatus();
  }, []);

  // Update pasted count
  useEffect(() => {
    if (!rawNumbers.trim()) {
      setPastedCount(0);
      return;
    }
    const matches = rawNumbers.match(/(\+?\d{10,13}|@[a-zA-Z0-9_]{3,})/g);
    setPastedCount(matches ? matches.length : 0);
  }, [rawNumbers]);

  // Load members and background jobs on group change
  useEffect(() => {
    if (activeGroup) {
      setRenameText(activeGroup.name);
      setIsRenaming(false);
      loadMembers(activeGroup.id);
      loadActiveJob(activeGroup.id);
    } else {
      setMembers([]);
      setMembersTotal(0);
      setActiveJob(null);
    }
  }, [activeGroup?.id, membersFilter, membersPage]);

  // Poll for active background job (especially for 25,000 numbers additions)
  useEffect(() => {
    if (!activeGroup) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.getActiveTelegramGroupJob(activeGroup.id);
        if (res.success && res.job) {
          setActiveJob(res.job);
          if (res.job.status === 'COMPLETED') {
            loadGroups(activeGroup.id);
            loadMembers(activeGroup.id);
          }
        }
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
  }, [activeGroup?.id]);

  // Create New Group
  const handleCreateNewGroup = async () => {
    if (!newGroupName.trim()) {
      alert('कृपया टेलीग्राम ग्रुप का नाम लिखें (Please enter group name).');
      return;
    }
    try {
      setLoading(true);
      setActionStatus(null);
      setProgressMsg(`Creating Telegram group "${newGroupName.trim()}"...`);

      const res = await api.createTelegramGroup({ name: newGroupName.trim() });
      if (res.success && res.group) {
        setActionStatus(`✅ नया टेलीग्राम ग्रुप "${res.group.name}" सफलतापूर्वक बन गया है! अब आप इसमें 25,000 नंबर या एक्सेल जोड़ सकते हैं।`);
        setShowCreateModal(false);
        setNewGroupName('');
        await loadGroups(res.group.id);
      }
    } catch (err: any) {
      alert(`ग्रुप बनाने में समस्या: ${err.message || 'Error creating group'}`);
    } finally {
      setLoading(false);
      setProgressMsg(null);
    }
  };

  // Rename Group
  const handleSaveRename = async () => {
    if (!activeGroup || !renameText.trim()) return;
    try {
      setLoading(true);
      await api.renameTelegramGroup(activeGroup.id, renameText.trim());
      setActionStatus(`✅ टेलीग्राम ग्रुप का नाम बदलकर "${renameText.trim()}" कर दिया गया है।`);
      setIsRenaming(false);
      await loadGroups(activeGroup.id);
    } catch (err: any) {
      alert(`नाम बदलने में समस्या: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Cancel running job
  const handleCancelJob = async () => {
    if (!activeGroup) return;
    if (!window.confirm('क्या आप चल रही इंपोर्ट प्रक्रिया को रोकना चाहते हैं?')) return;
    try {
      await api.cancelTelegramGroupJob(activeGroup.id);
      setActionStatus('🛑 इंपोर्ट प्रक्रिया रोक दी गई है (Job stopped).');
      await loadActiveJob(activeGroup.id);
    } catch (err: any) {
      alert(`Error stopping job: ${err.message}`);
    }
  };

  // Clear completed/cancelled job
  const handleClearJob = async () => {
    if (!activeGroup) return;
    try {
      await api.clearTelegramGroupJob(activeGroup.id);
      setActiveJob(null);
    } catch {}
  };

  // Delete Group
  const handleDeleteGroup = async (group: TelegramGroupInfo) => {
    const confirmDelete = window.confirm(
      `क्या आप टेलीग्राम ग्रुप "${group.name}" को हटाना चाहते हैं?\n(Are you sure you want to delete this group from the app?)`
    );
    if (!confirmDelete) return;

    try {
      setLoading(true);
      await api.deleteTelegramGroup(group.id);
      setActionStatus(`🗑️ टेलीग्राम ग्रुप "${group.name}" हटा दिया गया है।`);
      await loadGroups();
    } catch (err: any) {
      alert(`ग्रुप हटाने में समस्या: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Upload Excel (handles 20,000 - 25,000 numbers in background batches)
  const handleAddFromExcel = async () => {
    if (!activeGroup || !selectedFile) return;
    try {
      setLoading(true);
      setActionStatus(null);
      setProgressMsg(`Reading ${selectedFile.name} & launching background addition into "${activeGroup.name}"...`);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await api.uploadTelegramGroupExcel(activeGroup.id, formData);
      setActionStatus(
        `🚀 ${selectedFile.name} successfully analyzed! Detected: ${res.totalDetected} contacts. Background addition is running live now. You can watch the real-time progress bar above!`
      );
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      await loadActiveJob(activeGroup.id);
    } catch (err: any) {
      setActionStatus(`❌ Error: ${err.message || 'Failed to process Excel file'}`);
    } finally {
      setLoading(false);
      setProgressMsg(null);
    }
  };

  // Add members from Paste
  const handleAddFromPaste = async () => {
    if (!activeGroup || !rawNumbers.trim()) return;
    try {
      setLoading(true);
      setActionStatus(null);
      setProgressMsg(`Adding ${pastedCount} contacts into "${activeGroup.name}"...`);

      const res = await api.addTelegramGroupMembers(activeGroup.id, { rawNumbers });
      setActionStatus(
        `✅ Processed! Total detected: ${res.total}. (Added: ${res.added}, Failed: ${res.failed}) into "${activeGroup.name}".`
      );
      setRawNumbers('');
      await loadGroups(activeGroup.id);
      await loadMembers(activeGroup.id);
      await loadActiveJob(activeGroup.id);
    } catch (err: any) {
      setActionStatus(`❌ Error: ${err.message || 'Failed to add contacts'}`);
    } finally {
      setLoading(false);
      setProgressMsg(null);
    }
  };

  // Broadcast Message to Telegram Group
  const handleSendBroadcast = async () => {
    if (!activeGroup || !broadcastText.trim()) return;
    try {
      setLoading(true);
      setActionStatus(null);
      setProgressMsg(`Broadcasting message to Telegram group "${activeGroup.name}"...`);

      await api.broadcastTelegramGroup(activeGroup.id, {
        messageText: broadcastText.trim(),
        media: selectedMedia || undefined
      });

      setActionStatus(`✅ Announcement sent to "${activeGroup.name}"! All members in the group received it.`);
      setBroadcastText('');
      setSelectedMedia(null);
    } catch (err: any) {
      setActionStatus(`❌ Failed to send group message: ${err.message}`);
    } finally {
      setLoading(false);
      setProgressMsg(null);
    }
  };

  const copyInviteLink = () => {
    if (activeGroup?.invite_link) {
      navigator.clipboard.writeText(activeGroup.invite_link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC', overflow: 'hidden', position: 'relative' }}>
      <div className="main-watermark-bg" aria-hidden="true" />
      {/* Top Header */}
      <header
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #E2E8F0',
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          zIndex: 10,
          position: 'relative'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onBack && (
            <button
              className="mobile-back-btn"
              onClick={onBack}
              title="पीछे जाएं (Back)"
              style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                fontWeight: 600,
                color: '#1e293b'
              }}
            >
              <ArrowLeft size={18} />
              <span>Back</span>
            </button>
          )}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #0088cc 0%, #006699 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0, 136, 204, 0.25)'
            }}
          >
            <Users size={24} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 19, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Telegram All Groups (टेलीग्राम ऑल ग्रुप)
              </h1>
              <span
                onClick={!tgConnected ? onNavigateSettings : undefined}
                style={{
                  background: tgConnected ? '#E0F2FE' : '#FEE2E2',
                  color: tgConnected ? '#0369A1' : '#B91C1C',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: !tgConnected ? 'pointer' : 'default'
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: tgConnected ? '#0088cc' : '#DC2626'
                  }}
                />
                {tgConnected ? `LIVE TELEGRAM (${tgUsername || tgName || 'Connected'})` : 'TELEGRAM OFFLINE (SCAN QR)'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#64748B', margin: '3px 0 0' }}>
              Create high-capacity Telegram groups (up to 200,000 members), add thousands of numbers from Excel, and broadcast announcements.
            </p>
          </div>
        </div>

        {/* Action Buttons: New Group & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => {
              setNewGroupName(`DLB Telegram Group ${groups.length + 1}`);
              setShowCreateModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 16px',
              borderRadius: 9,
              background: '#0088cc',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 136, 204, 0.3)'
            }}
          >
            <Plus size={17} />
            <span>+ नया टेलीग्राम ग्रुप (New Group)</span>
          </button>

          {activeGroup?.invite_link && (
            <button
              onClick={copyInviteLink}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 14px',
                borderRadius: 9,
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                color: '#1E293B',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Copy Telegram Group Invite Link"
            >
              {copiedLink ? <Check size={16} color="#16A34A" /> : <Copy size={16} />}
              {copiedLink ? 'Link Copied!' : 'Copy Group Link'}
            </button>
          )}

          <button
            onClick={() => loadGroups(activeGroup?.id)}
            style={{
              padding: 9,
              borderRadius: 9,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Refresh"
          >
            <RefreshCw size={16} color="#64748B" />
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {/* Create Group Modal */}
        {showCreateModal && (
          <div
            style={{
              background: '#ffffff',
              border: '2px solid #0088cc',
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
              boxShadow: '0 8px 24px rgba(0, 136, 204, 0.15)'
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
              नया टेलीग्राम ग्रुप तैयार करें (Create New Telegram Group)
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748B' }}>
              यह टेलीग्राम पर एक सुपरग्रुप (Megagroup) बनाएगा जो 200,000 सदस्यों तक को संभाल सकता है।
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <input
                type="text"
                placeholder="उदा. DLB VIP Customer Group"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                maxLength={40}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  fontSize: 14,
                  fontWeight: 600
                }}
              />
              <button
                disabled={!newGroupName.trim() || loading}
                onClick={handleCreateNewGroup}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  background: !newGroupName.trim() || loading ? '#94A3B8' : '#0088cc',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  cursor: !newGroupName.trim() || loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                <span>ग्रुप तैयार करें</span>
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  padding: '12px 18px',
                  borderRadius: 8,
                  background: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                रद्द करें
              </button>
            </div>
          </div>
        )}

        {/* Group Selector Bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📁 आपके टेलीग्राम ग्रुप्स (Select Telegram Group):
            </span>
            <span style={{ fontSize: 12, color: '#64748B' }}>
              कुल ग्रुप: <strong>{groups.length}</strong>
            </span>
          </div>

          {groups.length === 0 ? (
            <div
              style={{
                background: '#ffffff',
                borderRadius: 12,
                padding: '24px 20px',
                textAlign: 'center',
                border: '1px dashed #CBD5E1'
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                अभी कोई टेलीग्राम ग्रुप नहीं है (No Telegram groups yet)
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16 }}>
                25,000 सदस्यों का ग्रुप बनाने के लिए नीचे दिए गए बटन पर क्लिक करें।
              </div>
              <button
                onClick={() => {
                  setNewGroupName('DLB AUTO - All Members (Telegram)');
                  setShowCreateModal(true);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  background: '#0088cc',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                + नया टेलीग्राम ग्रुप बनाएं
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {groups.map((g) => {
                const isSelected = activeGroup?.id === g.id;
                return (
                  <div
                    key={g.id}
                    onClick={() => setActiveGroup(g)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 10,
                      background: isSelected ? '#0088cc' : '#ffffff',
                      color: isSelected ? '#ffffff' : '#1E293B',
                      border: isSelected ? '1.5px solid #0088cc' : '1px solid #E2E8F0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      boxShadow: isSelected ? '0 4px 12px rgba(0, 136, 204, 0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Users size={16} color={isSelected ? '#ffffff' : '#0088cc'} />
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{g.name}</span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: isSelected ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                        color: isSelected ? '#ffffff' : '#64748B',
                        fontWeight: 700
                      }}
                    >
                      {g.total_members || g.local_saved_members || 0} members
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Group Details & Action Banner */}
        {activeGroup && (
          <div
            style={{
              background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)',
              border: '1px solid #BAE6FD',
              borderRadius: 12,
              padding: '16px 20px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: '#0088cc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Sparkles size={20} color="#ffffff" />
              </div>
              <div style={{ flex: 1 }}>
                {isRenaming ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text"
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      maxLength={40}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #0088cc',
                        fontSize: 14,
                        fontWeight: 700,
                        width: 260
                      }}
                    />
                    <button
                      onClick={handleSaveRename}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        background: '#16A34A',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setIsRenaming(false)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        background: '#E2E8F0',
                        color: '#334155',
                        border: 'none',
                        fontSize: 12,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                      {activeGroup.name}
                    </h2>
                    <button
                      onClick={() => setIsRenaming(true)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#0088cc',
                        cursor: 'pointer',
                        padding: 2
                      }}
                      title="Rename group"
                    >
                      <Edit3 size={15} />
                    </button>
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>
                  Total Capacity: <strong>200,000 members</strong> • Current: <strong>{activeGroup.total_members || activeGroup.local_saved_members || 1} members</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {activeGroup.invite_link && (
                <a
                  href={activeGroup.invite_link}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: '#0088cc',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 700,
                    textDecoration: 'none'
                  }}
                >
                  <span>Telegram में खोलें</span>
                  <ExternalLink size={14} />
                </a>
              )}

              <button
                onClick={() => handleDeleteGroup(activeGroup)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: '#FEE2E2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                title="Delete this group from app"
              >
                <Trash2 size={14} />
                <span>हटाएं (Delete)</span>
              </button>
            </div>
          </div>
        )}

        {/* Real-time Progress Card for 25,000 Numbers Background Additions */}
        {activeJob && (
          <div
            style={{
              background: '#ffffff',
              border: '1.5px solid #0088cc',
              borderRadius: 12,
              padding: 20,
              marginBottom: 24,
              boxShadow: '0 4px 16px rgba(0, 136, 204, 0.12)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: activeJob.status === 'RUNNING' ? '#0088cc' : '#16A34A',
                    animation: activeJob.status === 'RUNNING' ? 'pulse 1.5s infinite' : 'none'
                  }}
                />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                  {activeJob.status === 'RUNNING'
                    ? `25,000 Numbers Telegram Import in Progress (Batch ${activeJob.current_batch}/${activeJob.total_batches})`
                    : 'Telegram Members Import Complete!'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#0088cc' }}>
                  {activeJob.progressPct}% Processed
                </span>
                {activeJob.status === 'RUNNING' ? (
                  <button
                    onClick={handleCancelJob}
                    style={{
                      background: '#FEE2E2',
                      border: '1px solid #FCA5A5',
                      color: '#991B1B',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                    title="चल रही इंपोर्ट प्रक्रिया को रोकें"
                  >
                    <span>🛑 रोकें (Stop)</span>
                  </button>
                ) : (
                  <button
                    onClick={handleClearJob}
                    style={{
                      background: '#F1F5F9',
                      border: '1px solid #CBD5E1',
                      color: '#475569',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title="यह कार्ड हटाएं"
                  >
                    <span>✕ हटाएं (Clear)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Dynamic Progress Bar */}
            <div style={{ height: 8, width: '100%', background: '#E2E8F0', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
              <div
                style={{
                  height: '100%',
                  width: `${activeJob.progressPct}%`,
                  background: 'linear-gradient(90deg, #0088cc 0%, #38bdf8 100%)',
                  transition: 'width 0.4s ease'
                }}
              />
            </div>

            {/* Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <div style={{ padding: 12, borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>TOTAL DETECTED</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{activeJob.total.toLocaleString()}</div>
              </div>

              <div style={{ padding: 12, borderRadius: 8, background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>SUCCESSFULLY ADDED</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#065F46', marginTop: 4 }}>{activeJob.added.toLocaleString()}</div>
              </div>

              <div style={{ padding: 12, borderRadius: 8, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase' }}>INVITED (LINK SENT)</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>{activeJob.invited.toLocaleString()}</div>
              </div>

              <div style={{ padding: 12, borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase' }}>FAILED / NOT ON TG</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#991B1B', marginTop: 4 }}>{activeJob.failed.toLocaleString()}</div>
              </div>
            </div>
          </div>
        )}

        {/* Action Status Notification */}
        {actionStatus && (
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 8,
              background: actionStatus.startsWith('✅') || actionStatus.startsWith('🚀') ? '#ECFDF5' : '#FEE2E2',
              border: `1px solid ${actionStatus.startsWith('✅') || actionStatus.startsWith('🚀') ? '#86EFAC' : '#FCA5A5'}`,
              color: actionStatus.startsWith('✅') || actionStatus.startsWith('🚀') ? '#065F46' : '#7F1D1D',
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 20
            }}
          >
            {actionStatus}
          </div>
        )}

        {/* Progress Spinner */}
        {progressMsg && (
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 8,
              background: '#EFF6FF',
              border: '1px solid #93C5FD',
              color: '#1E40AF',
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}
          >
            <RefreshCw size={16} className="animate-spin" />
            <span>{progressMsg}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '2px solid #E2E8F0', marginBottom: 24, gap: 8 }}>
          <button
            onClick={() => setActiveTab('excel')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'excel' ? '3px solid #0088cc' : '3px solid transparent',
              color: activeTab === 'excel' ? '#0088cc' : '#64748B',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <FileSpreadsheet size={18} />
            एक्सेल फाइल से 25,000 नंबर जोड़ें (Excel Upload)
          </button>

          <button
            onClick={() => setActiveTab('paste')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'paste' ? '3px solid #0088cc' : '3px solid transparent',
              color: activeTab === 'paste' ? '#0088cc' : '#64748B',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Edit3 size={18} />
            सीधे नंबर पेस्ट करके जोड़ें (Paste Numbers)
          </button>

          <button
            onClick={() => setActiveTab('messages')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'messages' ? '3px solid #0088cc' : '3px solid transparent',
              color: activeTab === 'messages' ? '#0088cc' : '#64748B',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Send size={18} />
            टेलीग्राम ग्रुप में मैसेज भेजें (Broadcast)
          </button>

          <button
            onClick={() => setActiveTab('members')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'members' ? '3px solid #0088cc' : '3px solid transparent',
              color: activeTab === 'members' ? '#0088cc' : '#64748B',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Users size={18} />
            ग्रुप सदस्य सूची (Members List • {membersTotal})
          </button>
        </div>

        {/* TAB 1: EXCEL UPLOAD */}
        {activeTab === 'excel' && (
          <div style={{ background: '#ffffff', borderRadius: 12, padding: 24, border: '1px solid #E2E8F0' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
              एक्सेल फाइल से 25,000 नंबर ग्रुप में जोड़ें
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748B' }}>
              अपनी एक्सेल (.xlsx, .xls) या .csv फाइल अपलोड करें। सिस्टम अपने आप मोबाइल नंबरों को पहचान कर बैकग्राउंड में सुरक्षित गति से ग्रुप में जोड़ता रहेगा।
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #CBD5E1',
                borderRadius: 12,
                padding: '36px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: selectedFile ? '#F0F9FF' : '#F8FAFC',
                marginBottom: 20
              }}
            >
              <FileSpreadsheet size={40} color={selectedFile ? '#0088cc' : '#94A3B8'} style={{ margin: '0 auto 12px' }} />
              {selectedFile ? (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0369A1' }}>{selectedFile.name}</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                    {(selectedFile.size / 1024).toFixed(1)} KB • तैयार है, नीचे दिए बटन पर क्लिक करें
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>
                    यहाँ क्लिक करके एक्सेल फाइल चुनें (Click to choose Excel file)
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                    Supports .xlsx, .xls, .csv with up to 25,000+ phone numbers
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />
            </div>

            <button
              disabled={!selectedFile || !activeGroup || loading}
              onClick={handleAddFromExcel}
              style={{
                padding: '12px 24px',
                borderRadius: 8,
                background: !selectedFile || !activeGroup || loading ? '#94A3B8' : '#0088cc',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 700,
                border: 'none',
                cursor: !selectedFile || !activeGroup || loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
              <span>ग्रुप में 25,000 नंबर जोड़ना शुरू करें</span>
            </button>
          </div>
        )}

        {/* TAB 2: PASTE NUMBERS */}
        {activeTab === 'paste' && (
          <div style={{ background: '#ffffff', borderRadius: 12, padding: 24, border: '1px solid #E2E8F0' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
              सीधे नंबर या @यूजरनेम पेस्ट करें
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748B' }}>
              प्रत्येक पंक्ति (line) में एक मोबाइल नंबर (+91...) या टेलीग्राम @username लिखें या पेस्ट करें।
            </p>

            <textarea
              rows={8}
              placeholder={`+919876543210\n9876543211\n@john_automotive\n+919811122233`}
              value={rawNumbers}
              onChange={(e) => setRawNumbers(e.target.value)}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: 13,
                fontFamily: 'monospace',
                marginBottom: 16
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                पहचाने गए संपर्क: <strong>{pastedCount}</strong>
              </span>

              <button
                disabled={pastedCount === 0 || !activeGroup || loading}
                onClick={handleAddFromPaste}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  background: pastedCount === 0 || !activeGroup || loading ? '#94A3B8' : '#0088cc',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  cursor: pastedCount === 0 || !activeGroup || loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
                <span>{pastedCount} नंबर ग्रुप में जोड़ें</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: BROADCAST MESSAGE */}
        {activeTab === 'messages' && (
          <div style={{ background: '#ffffff', borderRadius: 12, padding: 24, border: '1px solid #E2E8F0' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
              टेलीग्राम ग्रुप में घोषणा या ऑफर भेजें
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748B' }}>
              ग्रुप के सभी सदस्यों को एक साथ संदेश और फोटो भेजें।
            </p>

            <textarea
              rows={5}
              placeholder="यहाँ टेलीग्राम ग्रुप के लिए संदेश लिखें..."
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: 14,
                marginBottom: 16
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <button
                onClick={() => mediaInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  color: '#334155',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Paperclip size={16} />
                <span>{selectedMedia ? selectedMedia.name : 'Photo / File जोड़ें'}</span>
              </button>
              {selectedMedia && (
                <button
                  onClick={() => setSelectedMedia(null)}
                  style={{ border: 'none', background: 'none', color: '#991B1B', cursor: 'pointer', fontSize: 12 }}
                >
                  हटाएं (Remove)
                </button>
              )}
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setSelectedMedia(e.target.files[0]);
                  }
                }}
              />
            </div>

            <button
              disabled={!broadcastText.trim() || !activeGroup || loading}
              onClick={handleSendBroadcast}
              style={{
                padding: '12px 24px',
                borderRadius: 8,
                background: !broadcastText.trim() || !activeGroup || loading ? '#94A3B8' : '#0088cc',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 700,
                border: 'none',
                cursor: !broadcastText.trim() || !activeGroup || loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
              <span>ग्रुप में मैसेज प्रसारित करें (Send Broadcast)</span>
            </button>
          </div>
        )}

        {/* TAB 4: MEMBERS LIST */}
        {activeTab === 'members' && (
          <div style={{ background: '#ffffff', borderRadius: 12, padding: 24, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {['ALL', 'ADDED', 'INVITED', 'FAILED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setMembersFilter(st);
                      setMembersPage(1);
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      background: membersFilter === st ? '#0088cc' : '#F1F5F9',
                      color: membersFilter === st ? '#ffffff' : '#475569',
                      fontSize: 12,
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Search size={16} color="#94A3B8" />
                <input
                  type="text"
                  placeholder="सर्च करें (Search member)..."
                  value={membersSearch}
                  onChange={(e) => setMembersSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && activeGroup) loadMembers(activeGroup.id);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    fontSize: 13
                  }}
                />
              </div>
            </div>

            {loadingMembers ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <span>सदस्य लोड हो रहे हैं...</span>
              </div>
            ) : members.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontSize: 13 }}>
                इस ग्रुप में अभी कोई सदस्य रिकॉर्ड नहीं है। आप एक्सेल अपलोड करके 25,000 नंबर जोड़ सकते हैं।
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>संपर्क / फोन</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>नाम</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>स्थिति (Status)</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>विवरण (Details)</th>
                      <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>तारीख</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>
                          {m.member_identifier}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#475569' }}>
                          {m.contact_name || 'Customer'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 700,
                              background: m.status === 'ADDED' ? '#ECFDF5' : m.status === 'INVITED' ? '#EFF6FF' : '#FEF2F2',
                              color: m.status === 'ADDED' ? '#047857' : m.status === 'INVITED' ? '#1D4ED8' : '#B91C1C'
                            }}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#64748B', fontSize: 12 }}>
                          {m.error_detail || 'Successfully in group'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#94A3B8', fontSize: 12 }}>
                          {new Date(m.added_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
