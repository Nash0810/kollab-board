## 📌 Smart Assign Logic

**Goal:**
Automatically assign a task to the user with the fewest number of currently active tasks (status: _Todo_ or _In Progress_).

### 🔧 How It Works:

1. When a user clicks the **Smart Assign** button:

   - A request is sent to the backend: `POST /api/tasks/:id/smart-assign`.

2. The backend:

   - Fetches **all users**.
   - For each user, it **counts** how many active tasks they have using:

     ```js
     Task.countDocuments({
       assignedTo: user._id,
       status: { $in: ["Todo", "In Progress"] },
     });
     ```

3. After calculating task counts, the user with the **lowest active task count** is selected.

4. The task is **updated** to assign it to this user.

5. The assignment is **broadcast in real-time** via Socket.IO to all connected clients.

6. An **activity log entry** is created and stored, including:

   - The task title
   - The assigned user
   - Reason for smart assignment

### 💡 Example:

- User A: 2 active tasks
- User B: 1 active task
- Result: Task gets assigned to **User B**

---

## 🚨 Conflict Handling Logic

**Goal:**
Prevent silent overwrites when multiple users try to edit the same task simultaneously.

### 🛠 How It Works:

1. **When a user starts editing a task:**

   - A Socket.IO event `start-editing` is emitted to the server with the task ID.
   - The server checks if anyone else is editing that task (`activeEditors` map).

2. If **another user is already editing**, a `edit-conflict` event is emitted back to the second user.

3. The second user receives a UI **conflict modal**, offering 3 options:

   - **Merge:** Combines both local and server changes.
   - **Overwrite:** Pushes local changes over server version.
   - **Discard:** Keeps the server version and cancels local changes.

4. Upon decision:

   - A request is sent to `POST /api/tasks/resolve-conflict` with:

     - `taskId`
     - `resolution` type
     - `mergedData` (new task state)

5. The backend:

   - Applies the chosen resolution (`merge`, `overwrite`, or discard).
   - Updates the task in the database.
   - Emits `task-updated` via Socket.IO.
   - Logs the resolution action in the **activity log**.

### 🧠 Example:

- User A and User B both open Task X.
- User A updates the description.
- User B tries to edit the same task → **Conflict Detected**
- User B chooses **merge** and sends merged content.
- Server updates task and notifies all clients.

---
