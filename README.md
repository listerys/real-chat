# Real-Time Chat App

## Setup
cp .env.example .env
cd backend && npm install
cd frontend && npm install
# Run backend
cd backend && npm start
# Run frontend
cd frontend && npm run dev

## Architecture
- Frontend: React + Vite + Supabase Auth
- Backend: Node.js + Express + Socket.IO + Supabase