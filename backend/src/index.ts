import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY in environment variables');
  process.exit(1);
}

const app = express();

// Configure CORS
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
const supabase = createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_KEY!);
// API Routes
app.get('/api/rooms/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    
    // First get all room IDs where user is a participant
    const { data: participations, error: participationError } = await supabase
      .from('room_participants')
      .select('room_id')
      .eq('user_email', userEmail);
    
    if (participationError) throw participationError;
    
    if (!participations || participations.length === 0) {
      return res.json([]);
    }
    
    // Then get room details for those room IDs
    const roomIds = participations.map(p => p.room_id);
    const { data: rooms, error: roomError } = await supabase
      .from('rooms')
      .select('id, name, created_at')
      .in('id', roomIds);
    
    if (roomError) throw roomError;
    res.json(rooms || []);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const { name, createdBy, participants } = req.body;
    
    // Create room
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({ name, created_by: createdBy })
      .select()
      .single();
    
    if (roomError) throw roomError;
    
    // Add participants including creator
    const allParticipants = [...participants, req.body.creatorEmail].map(email => ({
      room_id: room.id,
      user_email: email
    }));
    
    const { error: participantsError } = await supabase
      .from('room_participants')
      .insert(allParticipants);
    
    if (participantsError) throw participantsError;
    
    // Notify all participants about new room
    io.emit('new-room', { room, participants: allParticipants });
    
    res.json(room);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Socket handling
io.on('connection', socket => {
  console.log(`✅ User connected: ${socket.id}`);
  
  socket.on('join-room', async (data) => {
    try {
      const { roomId, userEmail } = data;
      console.log(`👤 ${userEmail} joining room: ${roomId}`);
      
      socket.join(roomId);
      
      // Get room messages
      const { data: msgs, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error fetching room history:', error);
        socket.emit('error', { message: 'Failed to load room history' });
        return;
      }
      
      socket.emit('room-history', msgs || []);
      
      // Get active users count
      const clients = await io.in(roomId).allSockets();
      io.to(roomId).emit('active-users', clients.size);
      
      console.log(`📊 Room ${roomId} has ${clients.size} active users`);
    } catch (error) {
      console.error('Error in join-room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });
  
  socket.on('send-message', async (data) => {
    try {
      const { roomId, userEmail, text } = data;
      console.log(`💬 Message from ${userEmail} in room ${roomId}: ${text}`);
      
      const msg = {
        room_id: roomId,
        user_email: userEmail,
        text,
        created_at: new Date().toISOString()
      };
      
      const { error } = await supabase.from('messages').insert(msg);
      
      if (error) {
        console.error('Error saving message:', error);
        socket.emit('error', { message: 'Failed to send message' });
        return;
      }
      
      // Broadcast message to all users in the room
      io.to(roomId).emit('new-message', msg);
      
    } catch (error) {
      console.error('Error in send-message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
  });
  
  socket.on('error', (error) => {
    console.error(`🚨 Socket error for ${socket.id}:`, error);
  });
});
server.listen(4000, () => {
  console.log('🚀 Backend server running on http://localhost:4000');
});
