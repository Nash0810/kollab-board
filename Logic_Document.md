### Smart Assign Implementation

The Smart Assign feature automatically assigns tasks to the user with the fewest active tasks, promoting balanced workload distribution across team members.

**Algorithm Logic:**

1. **Active Task Calculation**: When Smart Assign is triggered, the system queries all tasks in the database and counts active tasks for each user. Active tasks are defined as tasks with status "Todo" or "In Progress" - completed tasks ("Done") are excluded from the count.

2. **User Selection Process**: The algorithm iterates through all registered users and calculates their current workload. It maintains a running comparison to find the user with the minimum active task count.

3. **Tie-Breaking**: If multiple users have the same lowest count, the system selects the first user encountered in the iteration (alphabetically by user ID) to ensure consistent behavior.

4. **Assignment Execution**: Once the optimal user is identified, the task's `assignedTo` field is updated, and the change is broadcast to all connected users via WebSocket for real-time synchronization.

**Business Benefits:**

- Prevents task overload on individual team members
- Ensures fair distribution of workload
- Improves team productivity by automatically balancing assignments
- Reduces manual effort in task assignment decisions

### Conflict Handling Implementation

The conflict resolution system detects and manages simultaneous edits to the same task by multiple users, ensuring data integrity and providing user-friendly resolution options.

**Conflict Detection Process:**

1. **Edit Tracking**: When a user begins editing a task, the system captures a timestamp of when editing started. This timestamp is stored locally and sent with update requests.

2. **Server-Side Validation**: Upon receiving a task update request, the backend compares the task's last modified timestamp in the database with the editing start time provided by the client. If the database timestamp is newer, it indicates another user has modified the task since editing began.

3. **Conflict Response**: When a conflict is detected, the server responds with HTTP status 409 (Conflict) along with both the current server version and the attempted client changes, rather than silently overwriting data.

**Resolution Options:**

1. **Merge Strategy**: Combines both versions by taking non-empty fields from the user's changes and falling back to server values for unchanged fields. This preserves work from both users when possible.

2. **Overwrite Strategy**: Keeps the user's complete version, discarding server changes. Used when the user is confident their changes should take precedence.

3. **Discard Strategy**: Abandons the user's changes and adopts the server version. Used when the user determines the other user's changes are more appropriate.

**User Experience Flow:**

1. User A and User B both open the same task for editing
2. User A saves changes first - update succeeds normally
3. User B attempts to save - conflict detected
4. User B sees a modal showing three columns: original version, their changes, and current server version
5. User B selects resolution strategy and confirms
6. Final resolved version is saved and broadcast to all users
7. Conflict resolution action is logged in the activity feed

**Technical Implementation:**

- Frontend stores local changes in component state during editing
- Backend uses MongoDB's `updatedAt` field for conflict detection
- WebSocket events notify all users of conflict resolution completion
- Activity logging tracks conflict occurrences and resolution choices for audit purposes

This approach ensures no data is lost unintentionally while maintaining collaborative workflow efficiency.
