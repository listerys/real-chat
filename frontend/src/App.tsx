import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { socket } from './socket';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY);

interface Room {
  id: string;
  name: string;
  created_at: string;
}

interface Message {
  id: number;
  room_id: string;
  user_email: string;
  text: string;
  created_at: string;
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [participants, setParticipants] = useState('');
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user || null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });
  }, []);

  useEffect(() => {
    if (user?.email) {
      fetchUserRooms();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Socket connection handlers
    const handleConnect = () => {
      console.log('✅ Connected to server');
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log('❌ Disconnected from server');
      setIsConnected(false);
    };

    const handleNewRoom = (data: any) => {
      if (data.participants.some((p: any) => p.user_email === user?.email)) {
        fetchUserRooms();
      }
    };

    const handleNewMessage = (message: Message) => {
      if (selectedRoom && message.room_id === selectedRoom.id) {
        setMessages(prev => [...prev, message]);
      }
    };

    const handleError = (error: any) => {
      console.error('Socket error:', error);
    };

    // Add event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('new-room', handleNewRoom);
    socket.on('new-message', handleNewMessage);
    socket.on('error', handleError);

    return () => {
      // Clean up all listeners
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('new-room', handleNewRoom);
      socket.off('new-message', handleNewMessage);
      socket.off('error', handleError);
    };
  }, [user, selectedRoom]);

  async function signIn() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) console.error('Login error:', error);
    } catch (error) {
      console.error('Login failed:', error);
    }
  }

  function signOut() {
    supabase.auth.signOut();
    setRooms([]);
    setSelectedRoom(null);
    setMessages([]);
  }

  async function fetchUserRooms() {
    try {
      const response = await fetch(`http://localhost:4000/api/rooms/${user.email}`);
      const roomsData = await response.json();
      setRooms(roomsData);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  }

  async function createRoom() {
    if (!newRoomName.trim()) return;
    
    setLoading(true);
    try {
      const participantEmails = participants
        .split(',')
        .map(email => email.trim())
        .filter(email => email);

      const response = await fetch('http://localhost:4000/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoomName,
          createdBy: user.id,
          creatorEmail: user.email,
          participants: participantEmails
        })
      });

      if (response.ok) {
        setNewRoomName('');
        setParticipants('');
        setShowCreateRoom(false);
        fetchUserRooms();
      }
    } catch (error) {
      console.error('Error creating room:', error);
    }
    setLoading(false);
  }

  function selectRoom(room: Room) {
    setSelectedRoom(room);
    setMessages([]);
    
    // Clean up previous room history listener
    socket.off('room-history');
    
    // Join the room via socket
    socket.emit('join-room', { roomId: room.id, userEmail: user.email });
    
    // Listen for room history (only once per room selection)
    socket.once('room-history', (history: Message[]) => {
      setMessages(history || []);
    });
  }

  function sendMessage() {
    if (!newMessage.trim() || !selectedRoom) return;
    
    socket.emit('send-message', {
      roomId: selectedRoom.id,
      userEmail: user.email,
      text: newMessage
    });
    
    setNewMessage('');
  }

  if (!user) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        backgroundColor: '#f8fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '48px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          maxWidth: '400px',
          width: '90%'
        }}>
          <h1 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#1e293b',
            marginBottom: '8px',
            margin: '0 0 8px 0'
          }}>
            Realtime Chat
          </h1>
          <p style={{
            fontSize: '16px',
            color: '#64748b',
            marginBottom: '32px',
            margin: '0 0 32px 0'
          }}>
            Connect and chat with your team in real-time
          </p>
          <button 
            onClick={signIn}
            style={{
              padding: '14px 28px',
              fontSize: '16px',
              fontWeight: '500',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              width: '100%'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      backgroundColor: '#f8fafc'
    }}>
      {/* Sidebar */}
      <div style={{ 
        width: '320px', 
        borderRight: '1px solid #e2e8f0', 
        padding: '24px',
        backgroundColor: 'white',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '1px solid #f1f5f9'
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#1e293b',
            margin: '0'
          }}>
            Rooms
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#10b981' : '#ef4444',
              title: isConnected ? 'Connected' : 'Disconnected'
            }}></div>
            <button 
              onClick={signOut} 
              style={{ 
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Logout
            </button>
          </div>
        </div>
        
                <button 
          onClick={() => setShowCreateRoom(true)}
          style={{
            width: '100%',
            padding: '12px 16px',
            marginBottom: '20px',
            fontSize: '14px',
            fontWeight: '500',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          + Create Room
        </button>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {rooms.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#64748b',
              fontSize: '14px'
            }}>
              No rooms yet. Create your first room to get started.
            </div>
          ) : (
            rooms.map(room => (
              <div
                key={room.id}
                onClick={() => selectRoom(room)}
                style={{
                  padding: '16px',
                  marginBottom: '8px',
                  backgroundColor: selectedRoom?.id === room.id ? '#eff6ff' : 'transparent',
                  color: selectedRoom?.id === room.id ? '#1e40af' : '#334155',
                  border: selectedRoom?.id === room.id ? '1px solid #bfdbfe' : '1px solid transparent',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  if (selectedRoom?.id !== room.id) {
                    e.currentTarget.style.backgroundColor = '#f8fafc';
                  }
                }}
                onMouseOut={(e) => {
                  if (selectedRoom?.id !== room.id) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div style={{ 
                  fontWeight: '500', 
                  fontSize: '15px',
                  marginBottom: '4px' 
                }}>
                  {room.name}
                </div>
                <div style={{ 
                  fontSize: '12px', 
                  color: '#64748b' 
                }}>
                  {new Date(room.created_at).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create Room Modal */}
        {showCreateRoom && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '32px',
              borderRadius: '12px',
              width: '420px',
              maxWidth: '90vw',
              border: '1px solid #e2e8f0'
            }}>
              <h3 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#1e293b',
                marginBottom: '20px',
                margin: '0 0 20px 0'
              }}>
                Create New Room
              </h3>
              <input
                type="text"
                placeholder="Room name"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
              />
              <textarea
                placeholder="Participant emails (comma-separated)\nExample: user1@email.com, user2@email.com"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  marginBottom: '24px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  minHeight: '80px',
                  resize: 'vertical',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
              />
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowCreateRoom(false)}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: '#f8fafc',
                    color: '#475569',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={createRoom}
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: loading ? '#94a3b8' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
        {selectedRoom ? (
          <>
            {/* Chat Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: 'white'
            }}>
              <h3 style={{ 
                margin: 0,
                fontSize: '18px',
                fontWeight: '600',
                color: '#1e293b'
              }}>
                {selectedRoom.name}
              </h3>
              <p style={{
                margin: '4px 0 0 0',
                fontSize: '14px',
                color: '#64748b'
              }}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </p>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              padding: '24px',
              overflowY: 'auto',
              backgroundColor: '#f8fafc'
            }}>
              {messages.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: '#64748b',
                  fontSize: '14px'
                }}>
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((msg, index) => (
                  <div key={index} style={{ 
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: msg.user_email === user.email ? 'flex-end' : 'flex-start'
                  }}>
                    <div style={{
                      maxWidth: '70%',
                      minWidth: '120px'
                    }}>
                      <div style={{
                        fontSize: '12px',
                        color: '#64748b',
                        marginBottom: '4px',
                        textAlign: msg.user_email === user.email ? 'right' : 'left'
                      }}>
                        {msg.user_email === user.email ? 'You' : msg.user_email.split('@')[0]}
                      </div>
                      <div style={{
                        padding: '12px 16px',
                        backgroundColor: msg.user_email === user.email ? '#3b82f6' : 'white',
                        color: msg.user_email === user.email ? 'white' : '#1e293b',
                        borderRadius: '12px',
                        fontSize: '14px',
                        lineHeight: '1.4',
                        border: msg.user_email === user.email ? 'none' : '1px solid #e2e8f0',
                        wordWrap: 'break-word'
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Message Input */}
            <div style={{
              padding: '20px 24px',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: 'white',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-end'
            }}>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '24px',
                  fontSize: '14px',
                  outline: 'none',
                  resize: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                style={{
                  padding: '12px 20px',
                  backgroundColor: newMessage.trim() ? '#3b82f6' : '#e2e8f0',
                  color: newMessage.trim() ? 'white' : '#9ca3af',
                  border: 'none',
                  borderRadius: '24px',
                  cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            flexDirection: 'column',
            color: '#64748b',
            backgroundColor: 'white'
          }}>
            <div style={{
              fontSize: '18px',
              fontWeight: '500',
              marginBottom: '8px'
            }}>
              Welcome to Realtime Chat
            </div>
            <div style={{
              fontSize: '14px'
            }}>
              Select a room from the sidebar to start chatting
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
