# 🧠 DocuMind RAG — Role-Based Document Intelligence Platform

A full-stack, enterprise-grade **Retrieval-Augmented Generation (RAG)** system with JWT authentication, role-based access control, PDF processing, FAISS vector search, and Google Gemini AI.

---

## 🏗️ Architecture

```
┌─────────────────┐    ┌───────────────────┐    ┌────────────────────┐
│  React Frontend │───▶│  Node.js Backend  │───▶│  Python RAG Service│
│  (Vite, port    │    │  Express + JWT    │    │  FastAPI + FAISS   │
│   5173)         │    │  (port 5000)      │    │  (port 8000)       │
└────────┬────────┘    └─────────┬─────────┘    └────────┬───────────┘
         │                       │                        │
         │              ┌────────▼────────┐    ┌─────────▼──────────┐
         │              │   PostgreSQL    │    │   FAISS Indexes    │
         │              │   (port 5432)  │    │   (local .index    │
         └──────────────│   Users, Docs, │    │    files)          │
                        │   Chunks, Logs │    └────────────────────┘
                        └────────────────┘
                                 ▲
                        ┌────────┴────────┐
                        │  Google Gemini  │
                        │  AI API         │
                        │  (Embeddings +  │
                        │   Generation)   │
                        └─────────────────┘
```

---

## 🚀 Quick Setup Guide

### Prerequisites
- Node.js 18+
- Python 3.10+
- PostgreSQL 14+
- Google Gemini API Key ([Get one here](https://makersuite.google.com/app/apikey))

---

### Step 1: Database Setup

```bash
# Connect to PostgreSQL and run setup script
psql -U postgres -f database/setup.sql
```

Or manually:
```sql
CREATE DATABASE "RagAdv";
```

---

### Step 2: Python RAG Service

```bash
cd python_service

# Copy and fill environment variables
copy .env.example .env
# Edit .env and add your GEMINI_API_KEY and DB credentials

# Create virtual environment
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Start the service
python main.py
# Running at http://localhost:8000
```

---

### Step 3: Node.js Backend

```bash
cd backend

# Copy and fill environment variables
copy .env.example .env
# Edit .env and set:
#   GEMINI_API_KEY, DB_*, JWT_SECRET, PYTHON_SERVICE_URL

# Install dependencies
npm install

# Start development server
npm run dev
# Running at http://localhost:5000
```

---

### Step 4: React Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
# Running at http://localhost:5173
```

---

## 🔑 Feature Walkthrough

### Authentication
- Navigate to `http://localhost:5173`
- Select **Role** from dropdown (Admin / User)
- Register then Sign In
- JWT tokens auto-attach to all API requests

### Admin Features
| Feature | Location |
|---------|----------|
| Upload PDF documents | Admin → Documents → Upload PDF |
| Set access level (Admin Only / All Users / Selected Users) | Documents table → Access dropdown |
| Grant access to specific users | Documents → 👥 button (when "Selected Users") |
| View all users | Admin → Users |
| Activate/Deactivate users | Users table → Toggle button |
| System statistics | Admin → Overview |

### User Features
| Feature | Location |
|---------|----------|
| Ask questions | Dashboard → Chat interface |
| Filter by specific document | Top-right document filter |
| View answer sources | Below each AI response |
| Query history | Dashboard → History |

---

## 📁 Project Structure

```
new/
├── frontend/               # React + Vite frontend
│   └── src/
│       ├── pages/
│       │   ├── AuthPage.jsx          # Login/Register with role dropdown
│       │   ├── AdminDashboard.jsx    # Admin panel
│       │   └── UserDashboard.jsx     # User chat interface
│       ├── components/
│       │   └── Sidebar.jsx
│       ├── context/
│       │   └── AuthContext.jsx       # JWT auth state
│       └── lib/
│           └── api.js                # Axios with interceptors
│
├── backend/                # Node.js + Express API
│   ├── config/
│   │   └── database.js               # PostgreSQL + schema init
│   ├── middleware/
│   │   └── auth.js                   # JWT + role middleware
│   └── routes/
│       ├── auth.js                   # /api/auth/*
│       ├── documents.js              # /api/documents/*
│       ├── query.js                  # /api/query/*
│       └── admin.js                  # /api/admin/*
│
├── python_service/         # FastAPI + FAISS RAG engine
│   ├── main.py                       # PDF parse → chunk → embed → FAISS
│   └── requirements.txt
│
└── database/
    └── setup.sql                     # PostgreSQL schema
```

---

## 🔒 Security Model

| Capability | Admin | User |
|-----------|-------|------|
| Upload documents | ✅ | ❌ |
| View document files/names | ✅ | ❌ |
| Query documents | ✅ (all) | ✅ (accessible only) |
| Manage access | ✅ | ❌ |
| Manage users | ✅ | ❌ |
| View query history | Own | Own |

---

## 🛠️ Environment Variables

### Backend (`backend/.env`)
```
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/RagAdv
JWT_SECRET=your_super_secret_key_min_32_chars
JWT_EXPIRES_IN=7d
PORT=5000
PYTHON_SERVICE_URL=http://localhost:8000
GEMINI_API_KEY=your_gemini_api_key
```

### Python Service (`python_service/.env`)
```
GEMINI_API_KEY=your_gemini_api_key
DB_HOST=localhost
DB_PORT=5432
DB_NAME=RagAdv
DB_USER=postgres
DB_PASSWORD=yourpassword
FAISS_INDEX_DIR=./faiss_indexes
CHUNK_SIZE=800
CHUNK_OVERLAP=100
TOP_K_RESULTS=5
```

---

## 🎨 Design System

Professional **black & white** theme featuring:
- Dark backgrounds: `#020202` to `#222222`
- High-contrast white typography
- Glass-morphism cards with subtle borders
- Micro-animations and hover effects
- JetBrains Mono for code/numbers
- Inter for UI text
