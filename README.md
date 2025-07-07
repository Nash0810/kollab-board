# 🚀 Kollab Board - Real-Time Collaborative To-Do App

A **full-stack Kanban-style task management tool** with real-time collaboration, user authentication, smart task assignment, and conflict resolution. 

---

## 🌍 Live Demo

Frontend (React + Vite): [https://your-frontend.vercel.app](https://your-frontend.vercel.app)
Backend (Express + MongoDB): [https://your-backend.onrender.com](https://your-backend.onrender.com)

---

## 🎓 Tech Stack

### Frontend

* React (Vite)
* React Router
* Axios
* Socket.IO client
* Tailwind CSS (optional: hand-styled if Tailwind wasn't used)

### Backend

* Node.js
* Express.js
* MongoDB with Mongoose
* JWT for authentication
* bcrypt for password hashing
* Socket.IO for real-time updates
* dotenv for env management

---

## 🌟 Features Implemented 

### 1. 🔐 User Authentication

* Registration and login using JWT
* Passwords hashed securely with bcrypt
* Auth-protected routes (middleware based)

### 2. 📅 Task Management

* CRUD operations for tasks
* Each task includes:

  * Title (unique)
  * Description
  * Status: Todo, In Progress, Done
  * Priority: Low, Medium, High
  * Assigned Users
  * Due Date (optional)

### 3. 📆 Real-Time Sync

* All task changes (add/update/delete) are reflected live via WebSocket (Socket.IO)
* Activity logs update in real-time
* Editing conflicts detected live (see below)

### 4. ✏️ Conflict Detection & Resolution

* If two users edit the same task simultaneously, a conflict is detected
* UI shows both versions (local + server)
* Users choose to:

  * Merge
  * Overwrite
  * Discard changes

### 5. ✨ Smart Assignment

* Button to auto-assign task to the user with **fewest active tasks** (status: Todo/In Progress)
* Includes logging of assignment and reasoning

### 6. 📈 Activity Log

* Every action (create/edit/delete/assign/drag-drop/conflict) is logged
* REST API returns last 20 actions
* Real-time UI updates

### 7. 🔄 Drag and Drop Kanban Board

* Tasks can be moved across columns via drag-and-drop
* Optimistic UI updates with error fallback
* Custom styling and animation

### 8. 🌐 Responsive UI (No UI libraries used)

* Custom-built from scratch using CSS
* Fully responsive for desktop and mobile

---

## 🔧 How to Run Locally

### Backend

```bash
cd server
npm install
cp .env.example .env   # Add your Mongo URI and JWT secret
npm start
```

### Frontend

```bash
cd client
npm install
npm run dev
```

* Frontend runs at: `http://localhost:5173`
* Backend runs at: `http://localhost:5000`

---

## 📄 Logic Breakdown

### Smart Assign Logic

* On "Smart Assign" button click:

  * Fetch all users
  * Count their currently assigned active tasks (Todo/In Progress)
  * Assign task to the user with the **least active load**

### Conflict Handling

* When editing a task:

  * Socket emits `start-editing`
  * If another user also starts editing, both are notified
* If conflict is detected:

  * Server version vs. local version is shown
  * User can resolve by:

    * Merging
    * Overwriting
    * Discarding
* Backend ensures correct state is persisted

---

## 📚 Project Structure

```
kollab-board/
├── client/                # React frontend
│   ├── pages/             # BoardPage, LoginPage, etc.
│   ├── components/        # Reusable components
│   ├── utils/             # API utilities or helpers
│   └── main.jsx           # Entry point
├── server/                # Express backend
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── middleware/
│   └── index.js           # Main server entry point
└── README.md              # This file

```

---

## 🎥 Demo Video

[Watch on YouTube (Unlisted)](https://youtube.com/demo-link)

Covers:

* Login/Register
* Create & edit tasks
* Drag and drop
* Smart Assign
* Real-time updates
* Conflict resolution

---

## 🚀 Next Goals 

* Board-level access control (multi-board support)
* Notifications for task changes
* Better animations + accessibility

---
