import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { MessageSquare, Send, AlertTriangle, ShieldAlert, Check, CheckCheck, Clock } from 'lucide-react';

export const ChatsView: React.FC = () => {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [chatDetails, setChatDetails] = useState<any | null>(null);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);

  const loadConversations = async () => {
    try {
      const data = await api.getConversations();
      setConversations(data.conversations || []);
      if (!selectedChat && data.conversations?.length > 0) {
        loadChat(data.conversations[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadChat = async (chat: any) => {
    setSelectedChat(chat);
    try {
      const details = await api.getConversationMessages(chat.id);
      setChatDetails(details);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedChat) return;
    setLoading(true);
    try {
      await api.sendReply(selectedChat.id, replyText);
      setReplyText('');
      loadChat(selectedChat);
      loadConversations();
    } catch (err: any) {
      alert(err.message || 'Failed to send reply');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateInbound = async (text: string) => {
    if (!selectedChat) return;
    try {
      await api.simulateWebhook({
        eventType: 'INBOUND_MESSAGE',
        fromPhone: selectedChat.phone_number,
        textContent: text
      });
      loadChat(selectedChat);
      loadConversations();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const isWindowActive = chatDetails?.isWindowActive;
  const isOptedOut = selectedChat?.is_opted_out === 1;

  return (
    <div>
      <div className="card" style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card-title" style={{ margin: 0 }}>
              <MessageSquare size={18} color="var(--wa-green)" /> 2-Way Conversations
            </h2>
            <p className="card-subtitle">
              Official WhatsApp Business customer replies & 24-hour customer service window tracking.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleSimulateInbound('STOP')}
              title="Simulates customer sending STOP to test automated opt-out"
            >
              Simulate Inbound "STOP"
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleSimulateInbound('I want to book an appointment')}
            >
              Simulate Customer Reply
            </button>
          </div>
        </div>
      </div>

      <div className="chat-container">
        {/* Left Conversation List */}
        <div className="chat-list-panel">
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              CHATS ({conversations.length})
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 ? (
              <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No active conversations yet. Inbound messages from customers will appear here automatically.
              </div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`chat-item ${selectedChat?.id === c.id ? 'active' : ''}`}
                  onClick={() => loadChat(c)}
                >
                  <div className="avatar-circle">
                    {(c.contact_name || c.phone_number).charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.contact_name || c.phone_number}
                      </span>
                      {c.is_opted_out === 1 && (
                        <span className="badge badge-danger" style={{ fontSize: '9px', padding: '1px 5px' }}>DNC</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>
                        {c.last_message_text || 'No message'}
                      </span>
                      {c.unread_count > 0 && (
                        <span className="nav-badge" style={{ fontSize: '10px', padding: '1px 5px' }}>
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Conversation View */}
        <div className="chat-conversation-panel">
          {selectedChat ? (
            <>
              {/* Header */}
              <div style={{ padding: '12px 18px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="avatar-circle" style={{ width: '36px', height: '36px', fontSize: '13px' }}>
                    {(selectedChat.contact_name || selectedChat.phone_number).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{selectedChat.contact_name || selectedChat.phone_number}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>+{selectedChat.phone_number}</div>
                  </div>
                </div>

                {/* 24-Hour Window Badge */}
                <div>
                  {isOptedOut ? (
                    <span className="badge badge-danger">
                      <ShieldAlert size={12} /> Recipient Opted Out (DNC)
                    </span>
                  ) : isWindowActive ? (
                    <span className="badge badge-success">
                      <Clock size={12} /> 24h Customer Service Window Active
                    </span>
                  ) : (
                    <span className="badge badge-warning">
                      <AlertTriangle size={12} /> 24h Window Expired (Template Required)
                    </span>
                  )}
                </div>
              </div>

              {/* Messages Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                {chatDetails?.messages?.map((m: any) => (
                  <div
                    key={m.id}
                    className={`bubble ${m.direction === 'INBOUND' ? 'incoming' : 'outgoing'}`}
                  >
                    <div>{m.text_content}</div>
                    <div className="bubble-time">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {m.direction === 'OUTBOUND' && (
                        <span style={{ marginLeft: '4px', verticalAlign: 'middle' }}>
                          {m.status === 'READ' ? <CheckCheck size={12} color="#53bdeb" /> : <Check size={12} />}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer Input */}
              <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)' }}>
                {isOptedOut ? (
                  <div style={{ padding: '10px 14px', background: 'rgba(234, 67, 53, 0.1)', border: '1px solid rgba(234, 67, 53, 0.3)', borderRadius: 'var(--radius-md)', color: '#f87171', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldAlert size={16} /> Contact sent STOP. Further marketing and replies are restricted to comply with WhatsApp opt-out policies.
                  </div>
                ) : !isWindowActive ? (
                  <div style={{ padding: '10px 14px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 'var(--radius-md)', color: '#fbbf24', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} /> Freeform replies are closed because the customer has not replied in the last 24 hours. WhatsApp policy requires sending an approved Message Template to re-open the conversation window.
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Type a WhatsApp reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                      disabled={loading}
                    />
                    <button className="btn btn-primary" onClick={handleSendReply} disabled={loading}>
                      <Send size={16} />
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <MessageSquare size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p>Select a conversation from the left to view chat history.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
