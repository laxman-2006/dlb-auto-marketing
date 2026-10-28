import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  UserPlus,
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
  X
} from 'lucide-react';
import { api } from '../api';

interface GroupInfo {
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
  phone_number: string;
  contact_name?: string;
  status: 'ADDED' | 'INVITED' | 'ALREADY_MEMBER' | 'FAILED';
  error_detail?: string;
  added_at: string;
}

interface GroupMessage {
  id: string;
  message_text: string;
  media_name?: string;
  media_url?: string;
  status: string;
  sent_at: string;
}

interface AllMemberGroupViewProps {
  onNavigateSettings?: () => void;
}

export const AllMemberGroupView: React.FC<AllMemberGroupViewProps> = () => {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'excel' | 'paste' | 'messages' | 'members'>('excel');

  // Create new group modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Rename group state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');

  // Input states
  const [rawNumbers, setRawNumbers] = useState('');
  const [pastedCount, setPastedCount] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [groupBroadcastText, setGroupBroadcastText] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);

  // Loading & Progress states
  const [loading, setLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Group Members ledger
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [membersFilter, setMembersFilter] = useState('ALL');
  const [membersSearch, setMembersSearch] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Group Messages
  const [messages, setMessages] = useState<GroupMessage[]>([]);

  // WhatsApp connection status
  const [waConnected, setWaConnected] = useState(false);
  const [waPhone, setWaPhone] = useState('+91 95871 24896');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  // Fetch groups
  const loadGroups = async (preferredId?: string) => {
    try {
      setLoading(true);
      const res = await api.getGroups();
      if (res.success) {
        const groupList: GroupInfo[] = res.groups || [];
        setGroups(groupList);

        if (groupList.length === 0) {
          setActiveGroup(null);
        } else if (preferredId) {
          const match = groupList.find((g) => g.id === preferredId);
          setActiveGroup(match || groupList[0]);
        } else if (activeGroup) {
          const current = groupList.find((g) => g.id === activeGroup.id);
          setActiveGroup(current || groupList[0]);
        } else {
          setActiveGroup(groupList[0]);
        }
      }
    } catch (err: any) {
      console.error('Failed to load groups:', err);
    } finally {
      setLoading(false);
    }
  };

  // Check WA status
  const checkWhatsApp = async () => {
    try {
      const res = await api.getWhatsAppStatus();
      setWaConnected(res.connected === true || res.state === 'CONNECTED');
      if (res.displayPhoneNumber) setWaPhone(res.displayPhoneNumber);
    } catch {
      setWaConnected(false);
    }
  };

  useEffect(() => {
    loadGroups();
    checkWhatsApp();
  }, []);

  // Update pasted count
  useEffect(() => {
    if (!rawNumbers.trim()) {
      setPastedCount(0);
      return;
    }
    const matches = rawNumbers.match(/\b\d{10,13}\b/g);
    setPastedCount(matches ? matches.length : 0);
  }, [rawNumbers]);

  // Load members & messages when active group or tab changes
  useEffect(() => {
    if (activeGroup) {
      setRenameText(activeGroup.name);
      setIsRenaming(false);
      loadMembers(activeGroup.id);
      loadMessages(activeGroup.id);
    } else {
      setMembers([]);
      setMessages([]);
      setMembersTotal(0);
    }
  }, [activeGroup?.id, membersFilter]);

  const loadMembers = async (groupId: string) => {
    try {
      setLoadingMembers(true);
      const res = await api.getGroupMembers(groupId, membersFilter, membersSearch, 1);
      if (res.members) {
        setMembers(res.members);
        setMembersTotal(res.total || 0);
      }
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadMessages = async (groupId: string) => {
    try {
      const res = await api.getGroupMessages(groupId);
      if (res.messages) setMessages(res.messages);
    } catch {}
  };

  // Create New Group
  const handleCreateNewGroup = async () => {
    if (!newGroupName.trim()) {
      alert('कृपया ग्रुप का नाम लिखें (Please enter group name).');
      return;
    }
    try {
      setLoading(true);
      setActionStatus(null);
      setProgressMsg(`Creating group "${newGroupName.trim()}" on WhatsApp...`);

      const res = await api.createGroup({ name: newGroupName.trim() });
      if (res.success && res.group) {
        setActionStatus(`✅ नया ग्रुप "${res.group.name}" सफलतापूर्वक बन गया है! अब आप इसमें नंबर या एक्सेल जोड़ सकते हैं।`);
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

  // Rename Active Group
  const handleSaveRename = async () => {
    if (!activeGroup || !renameText.trim()) return;
    try {
      setLoading(true);
      await api.renameGroup(activeGroup.id, renameText.trim());
      setActionStatus(`✅ ग्रुप का नाम बदलकर "${renameText.trim()}" कर दिया गया है।`);
      setIsRenaming(false);
      await loadGroups(activeGroup.id);
    } catch (err: any) {
      alert(`नाम बदलने में समस्या: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete Active Group
  const handleDeleteGroup = async (group: GroupInfo) => {
    const confirmDelete = window.confirm(
      `क्या आप ग्रुप "${group.name}" को ऐप से हटाना चाहते हैं?\n(Are you sure you want to delete this group from the app?)`
    );
    if (!confirmDelete) return;

    try {
      setLoading(true);
      await api.deleteGroup(group.id);
      setActionStatus(`🗑️ ग्रुप "${group.name}" हटा दिया गया है।`);
      await loadGroups();
    } catch (err: any) {
      alert(`ग्रुप हटाने में समस्या: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Add members from paste to the active selected group
  const handleAddFromPaste = async () => {
    if (!activeGroup || !rawNumbers.trim()) return;
    try {
      setLoading(true);
      setActionStatus(null);
      setProgressMsg(`Adding contacts to "${activeGroup.name}" in safe anti-ban batches...`);

      const res = await api.addGroupMembers(activeGroup.id, { rawNumbers });
      setActionStatus(
        `✅ Success! Total processed: ${res.total} (Added: ${res.added}, Invited: ${res.invited}, Already Members: ${res.alreadyInGroup}, Failed: ${res.failed}) into "${activeGroup.name}".`
      );
      setRawNumbers('');
      await loadGroups(activeGroup.id);
      await loadMembers(activeGroup.id);
    } catch (err: any) {
      setActionStatus(`❌ Error: ${err.message || 'Failed to add contacts'}`);
    } finally {
      setLoading(false);
      setProgressMsg(null);
    }
  };

  // Add members from Excel to the active selected group
  const handleAddFromExcel = async () => {
    if (!activeGroup || !selectedFile) return;
    try {
      setLoading(true);
      setActionStatus(null);
      setProgressMsg(`Reading ${selectedFile.name} & adding numbers to "${activeGroup.name}"...`);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await api.uploadGroupExcel(activeGroup.id, formData);
      setActionStatus(
        `✅ ${selectedFile.name} successfully processed! Detected: ${res.totalDetected} numbers. Added: ${res.added}, Invited: ${res.invited}, Already Members: ${res.alreadyInGroup}. All numbers are now in "${activeGroup.name}"!`
      );
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadGroups(activeGroup.id);
      await loadMembers(activeGroup.id);
    } catch (err: any) {
      setActionStatus(`❌ Error: ${err.message || 'Failed to process Excel file'}`);
    } finally {
      setLoading(false);
      setProgressMsg(null);
    }
  };

  // Send group broadcast message to the active selected group
  const handleSendGroupMessage = async () => {
    if (!activeGroup || !groupBroadcastText.trim()) return;
    try {
      setLoading(true);
      setActionStatus(null);
      setProgressMsg(`Broadcasting message to group "${activeGroup.name}"...`);

      let mediaUrl: string | undefined;
      let mediaName: string | undefined;

      if (selectedMedia) {
        mediaName = selectedMedia.name;
        mediaUrl = `/uploads/${Date.now()}_${selectedMedia.name}`;
      }

      await api.sendGroupMessage(activeGroup.id, {
        messageText: groupBroadcastText,
        mediaName,
        mediaUrl
      });

      setActionStatus(`✅ Announcement sent to "${activeGroup.name}"! All group members have received it.`);
      setGroupBroadcastText('');
      setSelectedMedia(null);
      await loadMessages(activeGroup.id);
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC', overflow: 'hidden' }}>
      {/* Top Header */}
      <header
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #E2E8F0',
          padding: '16px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
            }}
          >
            <Users size={24} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 19, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                All Member Group (ऑल मेंबर ग्रुप)
              </h1>
              <span
                style={{
                  background: waConnected ? '#DCFCE7' : '#FEE2E2',
                  color: waConnected ? '#15803D' : '#B91C1C',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: waConnected ? '#16A34A' : '#DC2626'
                  }}
                />
                {waConnected ? `LIVE WHATSAPP (${waPhone})` : 'WHATSAPP OFFLINE'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#64748B', margin: '3px 0 0' }}>
              Create multiple WhatsApp groups, name them as you wish, and add contacts from Excel/numbers anytime.
            </p>
          </div>
        </div>

        {/* Action Buttons: New Group & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => {
              setNewGroupName(`DLB Group ${groups.length + 1}`);
              setShowCreateModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 16px',
              borderRadius: 9,
              background: '#0284c7',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)'
            }}
          >
            <Plus size={17} />
            <span>+ नया ग्रुप बनाएं (New Group)</span>
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
              title="Copy WhatsApp Group Invite Link"
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
              border: '1px solid #CBD5E1',
              cursor: 'pointer',
              color: '#64748B'
            }}
            title="Refresh Group Data"
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {/* CREATE NEW GROUP MODAL */}
        {showCreateModal && (
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              padding: 24,
              border: '2px solid #0284c7',
              boxShadow: '0 10px 25px rgba(2, 132, 199, 0.15)',
              marginBottom: 20
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Plus size={20} color="#0284c7" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  नया WhatsApp ग्रुप बनाएं (Create New Group)
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 16px' }}>
              अपने ग्रुप का नाम यहाँ लिखें। यह ग्रुप आपके कनेक्टेड WhatsApp (+{waPhone.replace(/[^\d]/g, '')}) पर तैयार होगा।
            </p>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="ग्रुप का नाम लिखें (e.g. DLB VIP Customers, Festive Offer Group...)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                maxLength={25}
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
                  background: !newGroupName.trim() || loading ? '#94A3B8' : '#16A34A',
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

        {/* MULTI-GROUP SELECTOR BAR */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📁 आपके WhatsApp ग्रुप्स (Select Group to Manage):
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
                अभी कोई ग्रुप नहीं है (No groups created yet)
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16 }}>
                नया ग्रुप बनाने के लिए नीचे दिए गए बटन पर क्लिक करें और अपनी पसंद का नाम रखें।
              </div>
              <button
                onClick={() => {
                  setNewGroupName('DLB AUTO - All Members');
                  setShowCreateModal(true);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  background: '#0284c7',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <Plus size={16} />
                <span>+ नया ग्रुप बनाएं (Create Your First Group)</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {groups.map((g, idx) => {
                const isActive = activeGroup?.id === g.id;
                return (
                  <div
                    key={g.id}
                    onClick={() => setActiveGroup(g)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 10,
                      background: isActive ? '#0284c7' : '#ffffff',
                      color: isActive ? '#ffffff' : '#1E293B',
                      border: `1.5px solid ${isActive ? '#0284c7' : '#E2E8F0'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      boxShadow: isActive ? '0 4px 12px rgba(2, 132, 199, 0.25)' : '0 1px 3px rgba(0,0,0,0.02)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: isActive ? '#38BDF8' : '#94A3B8'
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {idx + 1}. {g.name}
                      </div>
                      <div style={{ fontSize: 11, opacity: isActive ? 0.9 : 0.6, marginTop: 1 }}>
                        {g.total_members || g.local_saved_members || 0} Members
                      </div>
                    </div>

                    {isActive && (
                      <span
                        style={{
                          background: 'rgba(255,255,255,0.2)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          marginLeft: 4
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>
                );
              })}

              <button
                onClick={() => {
                  setNewGroupName(`DLB Group ${groups.length + 1}`);
                  setShowCreateModal(true);
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: '#F1F5F9',
                  border: '1.5px dashed #CBD5E1',
                  color: '#0284c7',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Plus size={16} />
                <span>+ नया ग्रुप</span>
              </button>
            </div>
          )}
        </div>

        {/* ACTIVE GROUP DETAIL BANNER (WITH RENAME & DELETE) */}
        {activeGroup && (
          <div
            style={{
              background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
              border: '1px solid #BFDBFE',
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
                  background: '#2563EB',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <input
                      type="text"
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      maxLength={25}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #2563EB',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1E3A8A' }}>
                      सक्रिय ग्रुप: <strong>{activeGroup.name}</strong>
                    </span>
                    <button
                      onClick={() => setIsRenaming(true)}
                      style={{
                        background: '#DBEAFE',
                        border: '1px solid #93C5FD',
                        borderRadius: 6,
                        padding: '3px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#1E40AF',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      title="Rename Group"
                    >
                      <Edit3 size={12} />
                      <span>नाम बदलें (Rename)</span>
                    </button>
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#3B82F6', marginTop: 4 }}>
                  👉 जो भी नए नंबर या एक्सेल फाइल अपलोड करेंगे, वे <strong>इसी ग्रुप ({activeGroup.name})</strong> में जुड़ेंगे। दूसरा ग्रुप चुनने के लिए ऊपर दिए गए ग्रुप्स पर क्लिक करें।
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
                    background: '#2563EB',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: 'none'
                  }}
                >
                  <span>WhatsApp में खोलें</span>
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

        {/* Action Status Notification */}
        {actionStatus && (
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 8,
              background: actionStatus.startsWith('✅') ? '#DCFCE7' : '#FEE2E2',
              border: `1px solid ${actionStatus.startsWith('✅') ? '#86EFAC' : '#FCA5A5'}`,
              color: actionStatus.startsWith('✅') ? '#14532D' : '#7F1D1D',
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
              background: '#FEF3C7',
              border: '1px solid #FCD34D',
              color: '#92400E',
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
              borderBottom: activeTab === 'excel' ? '3px solid #0284c7' : '3px solid transparent',
              color: activeTab === 'excel' ? '#0284c7' : '#64748B',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <FileSpreadsheet size={18} />
            एक्सेल फाइल से जोड़ें (Excel Upload)
          </button>

          <button
            onClick={() => setActiveTab('paste')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'paste' ? '3px solid #0284c7' : '3px solid transparent',
              color: activeTab === 'paste' ? '#0284c7' : '#64748B',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <UserPlus size={18} />
            नंबर लिखकर या पेस्ट करके जोड़ें
          </button>

          <button
            onClick={() => setActiveTab('messages')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'messages' ? '3px solid #0284c7' : '3px solid transparent',
              color: activeTab === 'messages' ? '#0284c7' : '#64748B',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Send size={18} />
            ग्रुप में मैसेज भेजें (Broadcast)
          </button>

          <button
            onClick={() => setActiveTab('members')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'members' ? '3px solid #0284c7' : '3px solid transparent',
              color: activeTab === 'members' ? '#0284c7' : '#64748B',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Users size={18} />
            ग्रुप सदस्य सूची ({membersTotal})
          </button>
        </div>

        {/* TAB 1: EXCEL UPLOAD */}
        {activeTab === 'excel' && (
          <div style={{ background: '#ffffff', borderRadius: 14, padding: 28, border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 0, marginBottom: 6 }}>
              एक्सेल या CSV फाइल अपलोड करें (10,000+ कॉन्टैक्ट्स)
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', marginTop: 0, marginBottom: 20 }}>
              फाइल चुनें या ड्रैग करें। सिस्टम स्वचालित रूप से सभी मोबाइल नंबरों को पहचानकर <strong>"{activeGroup?.name || 'Selected Group'}"</strong> में जोड़ देगा।
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #CBD5E1',
                borderRadius: 12,
                padding: '40px 24px',
                textAlign: 'center',
                background: selectedFile ? '#F0FDF4' : '#F8FAFC',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />
              <FileSpreadsheet size={48} color={selectedFile ? '#16A34A' : '#94A3B8'} style={{ margin: '0 auto 12px' }} />
              {selectedFile ? (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#166534' }}>{selectedFile.name}</div>
                  <div style={{ fontSize: 12, color: '#15803D', marginTop: 4 }}>
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • फाइल रेडी है
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>
                    यहाँ क्लिक करके एक्सेल (.xlsx, .xls, .csv) फाइल चुनें
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>
                    10,000 से लेकर 50,000 तक कितने भी नंबर एक साथ अपलोड कर सकते हैं
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                disabled={!selectedFile || loading || !activeGroup}
                onClick={handleAddFromExcel}
                style={{
                  padding: '12px 28px',
                  borderRadius: 10,
                  background: !selectedFile || loading || !activeGroup ? '#94A3B8' : '#0284c7',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  cursor: !selectedFile || loading || !activeGroup ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
                }}
              >
                {loading ? <RefreshCw size={18} className="animate-spin" /> : <UserPlus size={18} />}
                <span>"{activeGroup?.name || 'ग्रुप'}" में सभी नंबर जोड़ें</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: PASTE NUMBERS */}
        {activeTab === 'paste' && (
          <div style={{ background: '#ffffff', borderRadius: 14, padding: 28, border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  मोबाइल नंबर टाइप या पेस्ट करें
                </h3>
                <p style={{ fontSize: 13, color: '#64748B', margin: '4px 0 0' }}>
                  एक या हज़ारों नंबर कॉमा, स्पेस या नई लाइन देकर यहाँ पेस्ट करें।
                </p>
              </div>
              <span
                style={{
                  background: pastedCount > 0 ? '#DCFCE7' : '#F1F5F9',
                  color: pastedCount > 0 ? '#15803D' : '#64748B',
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '4px 12px',
                  borderRadius: 20
                }}
              >
                {pastedCount} नंबर पहचाने गए
              </span>
            </div>

            <textarea
              value={rawNumbers}
              onChange={(e) => setRawNumbers(e.target.value)}
              placeholder="यहाँ मोबाइल नंबर पेस्ट करें... उदाहरण:
9876543210
9587124896, 7568338021
+91 9123456789"
              rows={8}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 10,
                border: '1px solid #CBD5E1',
                fontSize: 14,
                fontFamily: 'monospace',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button
                disabled={pastedCount === 0 || loading || !activeGroup}
                onClick={handleAddFromPaste}
                style={{
                  padding: '12px 28px',
                  borderRadius: 10,
                  background: pastedCount === 0 || loading || !activeGroup ? '#94A3B8' : '#0284c7',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  cursor: pastedCount === 0 || loading || !activeGroup ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
                }}
              >
                {loading ? <RefreshCw size={18} className="animate-spin" /> : <UserPlus size={18} />}
                <span>"{activeGroup?.name || 'ग्रुप'}" में जोड़ें ({pastedCount} Contacts)</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: BROADCAST MESSAGE TO GROUP */}
        {activeTab === 'messages' && (
          <div style={{ background: '#ffffff', borderRadius: 14, padding: 28, border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 0, marginBottom: 6 }}>
              ग्रुप में मैसेज या ऑफर भेजें (Broadcast to "{activeGroup?.name || 'Selected Group'}")
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', marginTop: 0, marginBottom: 18 }}>
              यहाँ जो भी मैसेज या फोटो भेजेंगे, वह सीधे सक्रिय ग्रुप <strong>"{activeGroup?.name}"</strong> के सभी सदस्यों को एक साथ प्राप्त होगा।
            </p>

            <textarea
              value={groupBroadcastText}
              onChange={(e) => setGroupBroadcastText(e.target.value)}
              placeholder="ग्रुप के लिए मैसेज लिखें... उदाहरण: Hello All Members, DLB AUTO पर इस हफ्ते स्पेशल ऑफर चल रहा है!"
              rows={5}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 10,
                border: '1px solid #CBD5E1',
                fontSize: 14,
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) setSelectedMedia(e.target.files[0]);
                  }}
                />
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    fontSize: 13,
                    cursor: 'pointer',
                    color: '#334155'
                  }}
                >
                  <Paperclip size={16} />
                  <span>{selectedMedia ? selectedMedia.name : 'फोटो / इमेज जोड़ें'}</span>
                </button>
                {selectedMedia && (
                  <button
                    onClick={() => setSelectedMedia(null)}
                    style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 12, cursor: 'pointer' }}
                  >
                    हटाएं
                  </button>
                )}
              </div>

              <button
                disabled={!groupBroadcastText.trim() || loading || !activeGroup}
                onClick={handleSendGroupMessage}
                style={{
                  padding: '12px 28px',
                  borderRadius: 10,
                  background: !groupBroadcastText.trim() || loading || !activeGroup ? '#94A3B8' : '#16A34A',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  cursor: !groupBroadcastText.trim() || loading || !activeGroup ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                }}
              >
                {loading ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
                <span>"{activeGroup?.name || 'ग्रुप'}" में सेंड करें</span>
              </button>
            </div>

            {/* Recent Group Messages */}
            {messages.length > 0 && (
              <div style={{ marginTop: 32, borderTop: '1px solid #E2E8F0', paddingTop: 20 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 14 }}>
                  इस ग्रुप में पहले भेजे गए मैसेज ({messages.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        padding: '12px 16px',
                        background: '#F8FAFC',
                        borderRadius: 8,
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start'
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#1E293B', flex: 1 }}>
                        {m.message_text}
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginLeft: 14, whiteSpace: 'nowrap' }}>
                        {new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: MEMBERS LIST */}
        {activeTab === 'members' && (
          <div style={{ background: '#ffffff', borderRadius: 14, padding: 24, border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ position: 'relative' }}>
                  <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: 10, top: 10 }} />
                  <input
                    type="text"
                    placeholder="नंबर सर्च करें..."
                    value={membersSearch}
                    onChange={(e) => setMembersSearch(e.target.value)}
                    style={{
                      padding: '8px 12px 8px 34px',
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      fontSize: 13
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['ALL', 'ADDED', 'INVITED', 'FAILED'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setMembersFilter(st)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        background: membersFilter === st ? '#0284c7' : '#F8FAFC',
                        color: membersFilter === st ? '#ffffff' : '#475569',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
                कुल सदस्य ({activeGroup?.name}): {membersTotal}
              </span>
            </div>

            {loadingMembers ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <div>सदस्य लोड हो रहे हैं...</div>
              </div>
            ) : members.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
                इस ग्रुप में अभी कोई सदस्य नहीं है। ऊपर दिए गए एक्सेल या नंबर टैब से सदस्य जोड़ें।
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '10px 14px' }}>#</th>
                      <th style={{ padding: '10px 14px' }}>मोबाइल नंबर</th>
                      <th style={{ padding: '10px 14px' }}>स्टेटस</th>
                      <th style={{ padding: '10px 14px' }}>जोड़ा गया समय</th>
                      <th style={{ padding: '10px 14px' }}>विवरण</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m, idx) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', color: '#94A3B8' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1E293B' }}>
                          +{m.phone_number}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              background:
                                m.status === 'ADDED' || m.status === 'ALREADY_MEMBER'
                                  ? '#DCFCE7'
                                  : m.status === 'INVITED'
                                  ? '#FEF3C7'
                                  : '#FEE2E2',
                              color:
                                m.status === 'ADDED' || m.status === 'ALREADY_MEMBER'
                                  ? '#15803D'
                                  : m.status === 'INVITED'
                                  ? '#B45309'
                                  : '#B91C1C'
                            }}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#64748B' }}>
                          {new Date(m.added_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#64748B' }}>
                          {m.error_detail || (m.status === 'ADDED' ? 'Added directly to WhatsApp Group' : '—')}
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
