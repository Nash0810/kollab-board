import { useEffect, useState, useCallback } from "react";
import axios from "axios";
// Removed react-beautiful-dnd as it caused compilation issues in this environment.
// Implementing basic drag-and-drop using native HTML Drag and Drop API.
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";

// Define the API base URL. Hardcoding as import.meta.env caused issues.
const API_BASE = "http://localhost:5000";

function BoardPage() {
  // State variables for tasks, users, activities, and UI logic
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [socket, setSocket] = useState(null);
  const [filterByMe, setFilterByMe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // State to store the ID of the task currently being dragged
  const [draggedTaskId, setDraggedTaskId] = useState(null);

  // State for new task form
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "Medium",
    assignedTo: [],
  });

  // State for editing tasks
  const [editingTask, setEditingTask] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");

  const navigate = useNavigate();
  // Define the possible task statuses (columns)
  const statuses = ["Todo", "In Progress", "Done"];
  // Get current user details from local storage
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  // Memoized function to get authentication headers
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  // Function to fetch tasks from the backend
  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (filterStatus) params.append("status", filterStatus);
      if (filterAssignee) params.append("assignedTo", filterAssignee);

      const res = await axios.get(`${API_BASE}/api/tasks?${params}`, {
        headers: getAuthHeaders(),
      });
      setTasks(res.data);
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
      setError("Failed to load tasks");
    }
  }, [searchTerm, filterStatus, filterAssignee, getAuthHeaders]);

  // Function to fetch users from the backend
  const fetchUsers = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/users`, {
        headers: getAuthHeaders(),
      });
      setUsers(res.data);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  }, [getAuthHeaders]);

  // Function to fetch activities from the backend
  const fetchActivities = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/activities`, {
        headers: getAuthHeaders(),
      });
      setActivities(res.data);
    } catch (err) {
      console.error("Failed to fetch activities:", err);
    }
  }, [getAuthHeaders]);

  // useEffect for Socket.IO connection and event listeners
  useEffect(() => {
    const token = localStorage.getItem("token");
    // Redirect to login if no token is found
    if (!token) {
      navigate("/");
      return;
    }

    // Initialize Socket.IO client
    const socketInstance = io(API_BASE, {
      auth: { token }, // Pass token for authentication
      autoConnect: false, // Prevent auto-connection
    });

    socketInstance.connect(); // Manually connect
    setSocket(socketInstance);

    // Socket event: on connect, join user-specific room
    socketInstance.on("connect", () => {
      socketInstance.emit("join-user", currentUser.id);
    });

    socketInstance.on("task-updated", (updatedTaskFromServer) => {
      // Update local state with the task from the server
      setTasks((prevTasks) => {
        // Check if the task already exists in our state
        const existingTaskIndex = prevTasks.findIndex(
          (t) => t._id === updatedTaskFromServer._id
        );
        if (existingTaskIndex > -1) {
          // If it exists, update it
          const newTasks = [...prevTasks];
          newTasks[existingTaskIndex] = updatedTaskFromServer;
          return newTasks;
        } else {
          return [...prevTasks, updatedTaskFromServer];
        }
      });
      fetchActivities(); // Fetch activities to ensure log is up-to-date
    });

    // Socket event: when an activity is added
    socketInstance.on("activity-added", (activity) => {
      // Add new activity to the top of the list, keeping only the latest 20
      setActivities((prev) => [activity, ...prev.slice(0, 19)]);
    });

    // Cleanup function for socket disconnection
    return () => {
      socketInstance.disconnect();
    };
  }, [navigate, currentUser.id, fetchActivities]);

  // useEffect to load all initial data (tasks, users, activities)
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      // Fetch all data concurrently
      await Promise.all([fetchTasks(), fetchUsers(), fetchActivities()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchTasks, fetchUsers, fetchActivities]); // Dependencies ensure this runs when fetch functions change

  // Function to update a task on the backend
  const updateTask = async (id, updates) => {
    try {
      const res = await axios.put(`${API_BASE}/api/tasks/${id}`, updates, {
        headers: getAuthHeaders(),
      });
      // Emit socket event only after successful API call
      socket?.emit("task-updated", res.data);
      return res.data; // Return updated data for optimistic update logic
    } catch (err) {
      console.error("Failed to update task:", err);
      throw err; // Re-throw to allow error handling in onDragEnd or saveEdit
    }
  };

  // Function to create a new task
  const createTask = async (e) => {
    e.preventDefault(); // Prevent default form submission
    try {
      const res = await axios.post(`${API_BASE}/api/tasks`, newTask, {
        headers: getAuthHeaders(),
      });
      // Update local state with the new task from the server
      setTasks((prevTasks) => [...prevTasks, res.data]);
      socket?.emit("task-updated", res.data); // Emit socket event
      resetForm(); // Clear the form
      fetchActivities(); // Fetch activities to log the creation
    } catch (err) {
      console.error("Failed to create task:", err);
      setError("Failed to create task."); // Set error message for UI
    }
  };

  // Function to delete a task
  const deleteTask = async (id) => {
    if (!window.confirm("Delete task?")) return;
    try {
      await axios.delete(`${API_BASE}/api/tasks/${id}`, {
        headers: getAuthHeaders(),
      });
      // Optimistically remove from UI
      setTasks((prevTasks) => prevTasks.filter((task) => task._id !== id));
      socket?.emit("task-updated", { type: "delete", id }); // Emit delete event
      fetchActivities(); // Fetch activities to log the deletion
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete task."); // Set error message for UI
    }
  };

  // Function to save an edited task
  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingTask) return;

    const originalTask = tasks.find((t) => t._id === editingTask._id);
    if (!originalTask) return;

    // Optimistically update the UI
    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task._id === editingTask._id ? { ...task, ...newTask } : task
      )
    );

    try {
      // Send updates to the backend
      await updateTask(editingTask._id, newTask);
      // The socket emit is handled inside updateTask
    } catch (err) {
      console.error("Failed to save edit:", err);
      // Revert if API call fails
      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task._id === editingTask._id ? originalTask : task
        )
      );
      setError("Failed to save changes. Please try again.");
    } finally {
      resetForm(); // Clear the form and editing state
    }
  };

  // Function to start editing a task (populate form with task data)
  const startEdit = (task) => {
    setEditingTask(task);
    setNewTask({
      title: task.title,
      description: task.description,
      priority: task.priority,
      // Ensure assignedTo is an array of IDs for the checkbox logic
      assignedTo: Array.isArray(task.assignedTo)
        ? task.assignedTo.map((u) => u._id)
        : task.assignedTo
        ? [task.assignedTo._id]
        : [], // Handle single object or null
    });
  };

  // Function to reset the new task/edit form
  const resetForm = () => {
    setEditingTask(null);
    setNewTask({
      title: "",
      description: "",
      priority: "Medium",
      assignedTo: [],
    });
  };

  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId); // Store the ID of the task being dragged
    e.dataTransfer.setData("text/plain", taskId); // Set data for drop target
    e.dataTransfer.effectAllowed = "move"; // Visual feedback
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Allow drop
    e.dataTransfer.dropEffect = "move"; // Visual feedback
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");

    if (
      !taskId ||
      (taskId === draggedTaskId &&
        newStatus === tasks.find((t) => t._id === taskId)?.status)
    ) {
      // Do nothing if no task ID or if dropped in the same column
      setDraggedTaskId(null); // Clear dragged task ID
      return;
    }

    // Optimistically update the UI state
    setTasks((prevTasks) => {
      const newTasks = Array.from(prevTasks);
      const taskIndex = newTasks.findIndex((task) => task._id === taskId);

      if (taskIndex === -1) {
        console.warn("Dragged task not found in state for optimistic update.");
        return prevTasks;
      }

      const taskToMove = { ...newTasks[taskIndex] };
      const originalStatus = taskToMove.status;

      taskToMove.status = newStatus; // Update the task's status
      newTasks[taskIndex] = taskToMove;

      return newTasks;
    });

    try {
      // Send the update to the backend
      await updateTask(taskId, { status: newStatus });
    } catch (err) {
      console.error("Failed to update task status on backend:", err);
      // Revert the optimistic update if the API call fails
      setTasks((prevTasks) => {
        return prevTasks.map((task) =>
          task._id === taskId
            ? { ...task, status: tasks.find((t) => t._id === taskId)?.status }
            : task
        );
      });
      setError("Failed to update task status. Please try again.");
    } finally {
      setDraggedTaskId(null); // Clear dragged task ID after drop attempt
    }
  };

  // Helper function to get user names from IDs
  const getUserNames = (ids) => {
    // Ensure ids is an array, even if a single ID is passed
    const arr = Array.isArray(ids) ? ids : [ids].filter(Boolean); // Filter out null/undefined

    return users
      .filter((u) => arr.includes(u._id))
      .map((u) => u.name || u.email)
      .join(", ");
  };

  // Filter tasks based on search term and "assigned to me" checkbox
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesByMe =
      !filterByMe || task.assignedTo?.some?.((u) => u._id === currentUser.id);
    return matchesSearch && matchesByMe;
  });

  // Display loading message if data is still being fetched
  if (loading) {
    return <div style={{ padding: "20px" }}>Loading board...</div>;
  }

  // Display error message if fetching failed
  if (error) {
    return <div style={{ padding: "20px", color: "red" }}>Error: {error}</div>;
  }

  return (
    <div style={{ padding: "20px" }}>
      <button
        onClick={() => {
          localStorage.clear(); // Clear user data from local storage
          navigate("/"); // Navigate back to login page
        }}
        style={{ float: "right" }}
      >
        Logout
      </button>
      <h2>
        Kollab Board — Welcome, <b>{currentUser?.name || currentUser?.email}</b>
      </h2>

      <div style={{ margin: "10px 0", display: "flex", gap: "10px" }}>
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={filterByMe}
            onChange={(e) => setFilterByMe(e.target.checked)}
          />
          Assigned to me
        </label>
      </div>

      {/* Replaced DragDropContext with a simple div as rbdnd is removed */}
      <div style={{ display: "flex", gap: "20px" }}>
        {statuses.map((status) => (
          <div
            key={status}
            onDragOver={handleDragOver} // Allow dropping
            onDrop={(e) => handleDrop(e, status)} // Handle drop for this column
            style={{
              flex: 1,
              backgroundColor: "#f0f0f0",
              padding: "10px",
              borderRadius: "8px",
              minHeight: "300px",
            }}
          >
            <h3>{status}</h3>
            {/* Filter tasks by their current status for rendering in the correct column */}
            {filteredTasks
              .filter((t) => t.status === status)
              .map((task) => (
                <div
                  key={task._id}
                  draggable="true" // Make the task draggable
                  onDragStart={(e) => handleDragStart(e, task._id)} // Handle drag start
                  style={{
                    padding: "10px",
                    marginBottom: "10px",
                    backgroundColor: "white",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    cursor: "grab", // Indicate draggable
                    opacity: draggedTaskId === task._id ? 0.5 : 1, // Visual feedback for dragging
                  }}
                >
                  <h4>{task.title}</h4>
                  <p>{task.description}</p>
                  <p>
                    <b>Priority:</b> {task.priority}
                  </p>
                  <p>
                    <b>Assigned to:</b> {getUserNames(task.assignedTo)}
                  </p>
                  <button onClick={() => startEdit(task)}>Edit</button>
                  <button onClick={() => deleteTask(task._id)}>Delete</button>
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* Form for creating/editing tasks */}
      <form
        onSubmit={editingTask ? saveEdit : createTask}
        style={{ marginTop: "20px" }}
      >
        <input
          placeholder="Title"
          value={newTask.title}
          onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
          required
        />
        <input
          placeholder="Description"
          value={newTask.description}
          onChange={(e) =>
            setNewTask({ ...newTask, description: e.target.value })
          }
        />
        <select
          value={newTask.priority}
          onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
        >
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>

        <div>
          <label>
            <b>Assign To:</b>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {users.map((user) => (
              <label key={user._id}>
                <input
                  type="checkbox"
                  value={user._id}
                  checked={newTask.assignedTo.includes(user._id)}
                  onChange={(e) => {
                    const id = e.target.value;
                    const updated = newTask.assignedTo.includes(id)
                      ? newTask.assignedTo.filter((uid) => uid !== id)
                      : [...newTask.assignedTo, id];
                    setNewTask({ ...newTask, assignedTo: updated });
                  }}
                />
                {user.name || user.email}
              </label>
            ))}
          </div>
        </div>

        <div>
          <button type="submit">{editingTask ? "Save" : "Add Task"}</button>
          {editingTask && (
            <button type="button" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Activity Log section */}
      <div style={{ marginTop: "30px" }}>
        <h3>Activity Log</h3>
        <ul>
          {activities.map((log, i) => (
            <li key={i}>
              {new Date(log.timestamp).toLocaleTimeString()} — {log.type} "
              {log.details?.title || "Task"}"
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default BoardPage;
