import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";

const API_BASE = "http://localhost:5000";

function BoardPage() {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [socket, setSocket] = useState(null);
  const [filterByMe, setFilterByMe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const assignDropdownRef = useRef(null);

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "Medium",
    assignedTo: [],
  });

  const [editingTask, setEditingTask] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");

  const navigate = useNavigate();
  const statuses = ["Todo", "In Progress", "Done"];
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  }, []);

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

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
      return;
    }

    const socketInstance = io(API_BASE, {
      auth: { token },
      autoConnect: false,
    });

    socketInstance.connect();
    setSocket(socketInstance);

    socketInstance.on("connect", () => {
      socketInstance.emit("join-user", currentUser.id);
    });

    socketInstance.on("task-updated", (updatedTaskFromServer) => {
      setTasks((prevTasks) => {
        const existingTaskIndex = prevTasks.findIndex(
          (t) => t._id === updatedTaskFromServer._id
        );
        if (existingTaskIndex > -1) {
          const newTasks = [...prevTasks];
          newTasks[existingTaskIndex] = updatedTaskFromServer;
          return newTasks;
        } else {
          return [...prevTasks, updatedTaskFromServer];
        }
      });
    });

    socketInstance.on("activity-added", (activity) => {
      setActivities((prev) => [activity, ...prev.slice(0, 19)]);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [navigate, currentUser.id]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchTasks(), fetchUsers(), fetchActivities()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchTasks, fetchUsers, fetchActivities]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        assignDropdownRef.current &&
        !assignDropdownRef.current.contains(event.target)
      ) {
        setShowAssignDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const updateTask = async (id, updates) => {
    try {
      const res = await axios.put(`${API_BASE}/api/tasks/${id}`, updates, {
        headers: getAuthHeaders(),
      });
      socket?.emit("task-updated", res.data);
      return res.data;
    } catch (err) {
      console.error("Failed to update task:", err);
      throw err;
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/api/tasks`, newTask, {
        headers: getAuthHeaders(),
      });
      setTasks((prevTasks) => [...prevTasks, res.data]);
      socket?.emit("task-updated", res.data);
      resetForm();
    } catch (err) {
      console.error("Failed to create task:", err);
      setError("Failed to create task.");
    }
  };

  const deleteTask = async (id) => {
    if (!window.confirm("Delete task?")) return;
    try {
      await axios.delete(`${API_BASE}/api/tasks/${id}`, {
        headers: getAuthHeaders(),
      });
      setTasks((prevTasks) => prevTasks.filter((task) => task._id !== id));
      socket?.emit("task-updated", { type: "delete", id });
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete task.");
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingTask) return;

    const originalTask = tasks.find((t) => t._id === editingTask._id);
    if (!originalTask) return;

    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task._id === editingTask._id ? { ...task, ...newTask } : task
      )
    );

    try {
      await updateTask(editingTask._id, newTask);
    } catch (err) {
      console.error("Failed to save edit:", err);
      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task._id === editingTask._id ? originalTask : task
        )
      );
      setError("Failed to save changes. Please try again.");
    } finally {
      resetForm();
    }
  };

  const startEdit = (task) => {
    setEditingTask(task);
    setNewTask({
      title: task.title,
      description: task.description,
      priority: task.priority,
      assignedTo: Array.isArray(task.assignedTo)
        ? task.assignedTo
            .map((item) =>
              typeof item === "object" && item !== null ? item._id : item
            )
            .filter(Boolean)
        : (task.assignedTo && typeof task.assignedTo === "object"
            ? [task.assignedTo._id]
            : [task.assignedTo]
          ).filter(Boolean),
    });
  };

  const resetForm = () => {
    setEditingTask(null);
    setNewTask({
      title: "",
      description: "",
      priority: "Medium",
      assignedTo: [],
    });
    setShowAssignDropdown(false);
  };

  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");

    if (
      !taskId ||
      (taskId === draggedTaskId &&
        newStatus === tasks.find((t) => t._id === taskId)?.status)
    ) {
      setDraggedTaskId(null);
      return;
    }

    setTasks((prevTasks) => {
      const newTasks = Array.from(prevTasks);
      const taskIndex = newTasks.findIndex((task) => task._id === taskId);

      if (taskIndex === -1) {
        console.warn("Dragged task not found in state for optimistic update.");
        return prevTasks;
      }

      const taskToMove = { ...newTasks[taskIndex] };
      taskToMove.status = newStatus;
      newTasks[taskIndex] = taskToMove;

      return newTasks;
    });

    try {
      await updateTask(taskId, { status: newStatus });
    } catch (err) {
      console.error("Failed to update task status on backend:", err);
      setTasks((prevTasks) => {
        const originalTask = tasks.find((t) => t._id === taskId);
        return prevTasks.map((task) =>
          task._id === taskId
            ? { ...task, status: originalTask?.status || "Todo" }
            : task
        );
      });
      setError("Failed to update task status. Please try again.");
    } finally {
      setDraggedTaskId(null);
    }
  };

  const handleSmartAssign = async () => {
    if (!editingTask) {
      setError("Please select or create a task to smart assign.");
      return;
    }
    try {
      const res = await axios.post(
        `${API_BASE}/api/tasks/${editingTask._id}/smart-assign`,
        {},
        {
          headers: getAuthHeaders(),
        }
      );
      setNewTask((prev) => ({
        ...prev,
        assignedTo: Array.isArray(res.data.task.assignedTo)
          ? res.data.task.assignedTo.map((u) => u._id)
          : [res.data.task.assignedTo._id],
      }));
      console.log("Smart assign successful:", res.data.smartAssignReason);
    } catch (err) {
      console.error("Failed to smart assign task:", err);
      setError("Failed to smart assign task. Please try again.");
    }
  };

  const getUserNames = (assignedUsersOrIds) => {
    const assignedIds = Array.isArray(assignedUsersOrIds)
      ? assignedUsersOrIds
          .map((item) =>
            typeof item === "object" && item !== null ? item._id : item
          )
          .filter(Boolean)
      : (assignedUsersOrIds && typeof assignedUsersOrIds === "object"
          ? [assignedUsersOrIds._id]
          : [assignedUsersOrIds]
        ).filter(Boolean);

    return users
      .filter((userInState) => assignedIds.includes(userInState._id))
      .map((userInState) => userInState.name || userInState.email)
      .join(", ");
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesByMe =
      !filterByMe ||
      task.assignedTo?.some?.((u) => {
        const assignedUserId = typeof u === "object" && u !== null ? u._id : u;
        return assignedUserId === currentUser.id;
      });
    return matchesSearch && matchesByMe;
  });

  const formatActivityLog = (log) => {
    const userName = log.userId?.name || log.userId?.email || "Unknown User";
    const taskTitle = log.taskId?.title || log.details?.title || "Task";

    switch (log.type) {
      case "Task Created":
        return `${userName} created task "${taskTitle}"`;
      case "Task Deleted":
        return `${userName} deleted task "${taskTitle}"`;
      case "Task Status Changed":
        const fromStatus = log.details?.status?.from || "Unknown";
        const toStatus = log.details?.status?.to || "Unknown";
        return `${userName} changed status of "${taskTitle}" from "${fromStatus}" to "${toStatus}"`;
      case "Task Assigned":
        const fromAssignees =
          log.details?.assignedTo?.from?.join(", ") || "Nobody";
        const toAssignees = log.details?.assignedTo?.to?.join(", ") || "Nobody";
        return `${userName} changed assigned users for "${taskTitle}" from [${fromAssignees}] to [${toAssignees}]`;
      case "Task Assigned (Smart)":
        return `${userName} smart-assigned "${taskTitle}". Reason: ${
          log.details?.reason || "N/A"
        }`;
      case "Task Title Changed":
        const oldTitle = log.details?.title?.from || "Unknown Title";
        const newTitle = log.details?.title?.to || "Unknown Title";
        return `${userName} changed title of "${oldTitle}" to "${newTitle}"`;
      case "Conflict Resolved":
        return `${userName} resolved a conflict for "${taskTitle}" (${log.details?.resolution} method)`;
      default:
        return `${userName} ${log.type} "${taskTitle}"`;
    }
  };

  if (loading) {
    return <div className="p-5 text-lg text-gray-700">Loading board...</div>;
  }

  if (error) {
    return <div className="p-5 text-lg text-red-600">Error: {error}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-5 font-sans">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-800">
          Kollab Board — Welcome,{" "}
          <b className="text-blue-600">
            {currentUser?.name || currentUser?.email}
          </b>
        </h2>
        <button
          onClick={() => {
            localStorage.clear();
            navigate("/");
          }}
          className="px-4 py-2 bg-red-500 text-white rounded-md shadow-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75 transition-colors duration-200"
        >
          Logout
        </button>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 w-full sm:w-auto"
        />
        <label className="flex items-center space-x-2 text-gray-700">
          <input
            type="checkbox"
            checked={filterByMe}
            onChange={(e) => setFilterByMe(e.target.checked)}
            className="form-checkbox h-5 w-5 text-blue-600 rounded"
          />
          <span>Assigned to me</span>
        </label>
      </div>

      {/* Changed flex-col md:flex-row to flex-row to always display columns in a row */}
      <div className="flex flex-row gap-6 mb-8 overflow-x-auto pb-4">
        {" "}
        {/* Added overflow-x-auto for smaller screens */}
        {statuses.map((status) => (
          <div
            key={status}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
            className="flex-shrink-0 w-80 bg-gray-50 p-4 rounded-lg shadow-md min-h-[300px] border border-gray-200" // Added flex-shrink-0 and fixed width
          >
            <h3 className="text-xl font-semibold text-gray-700 mb-4">
              {status}
            </h3>
            {filteredTasks
              .filter((t) => t.status === status)
              .map((task) => (
                <div
                  key={task._id}
                  draggable="true"
                  onDragStart={(e) => handleDragStart(e, task._id)}
                  className={`bg-white p-4 mb-3 rounded-lg shadow-sm border border-gray-200 cursor-grab transition-opacity duration-200 ${
                    draggedTaskId === task._id ? "opacity-50" : "opacity-100"
                  }`}
                >
                  <h4 className="text-lg font-medium text-gray-800 mb-1">
                    {task.title}
                  </h4>
                  <p className="text-sm text-gray-600 mb-2">
                    {task.description}
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    <b className="font-semibold">Priority:</b> {task.priority}
                  </p>
                  <p className="text-xs text-gray-500 mb-3">
                    <b className="font-semibold">Assigned to:</b>{" "}
                    {getUserNames(task.assignedTo)}
                  </p>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => startEdit(task)}
                      className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition-colors duration-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteTask(task._id)}
                      className="px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75 transition-colors duration-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>

      <form
        onSubmit={editingTask ? saveEdit : createTask}
        className="bg-white p-6 rounded-lg shadow-md mb-8"
      >
        <h3 className="text-xl font-semibold text-gray-700 mb-4">
          {editingTask ? "Edit Task" : "Add New Task"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input
            placeholder="Title"
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            required
          />
          <input
            placeholder="Description"
            value={newTask.description}
            onChange={(e) =>
              setNewTask({ ...newTask, description: e.target.value })
            }
            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
          <select
            value={newTask.priority}
            onChange={(e) =>
              setNewTask({ ...newTask, priority: e.target.value })
            }
            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>

          {/* Assign To Dropdown with Checkboxes */}
          <div className="relative" ref={assignDropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assign To:
            </label>
            <button
              type="button"
              onClick={() => setShowAssignDropdown(!showAssignDropdown)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm bg-white text-left text-gray-700 hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-200 flex justify-between items-center"
            >
              <span>
                {newTask.assignedTo.length > 0
                  ? `${newTask.assignedTo.length} user(s) selected`
                  : "Select Users"}
              </span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${
                  showAssignDropdown ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                ></path>
              </svg>
            </button>
            {showAssignDropdown && (
              <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                {users.length > 0 ? (
                  users.map((user) => (
                    <label
                      key={user._id}
                      className="flex items-center p-2 hover:bg-gray-100 cursor-pointer"
                    >
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
                        className="form-checkbox h-4 w-4 text-blue-600 rounded mr-2"
                      />
                      <span className="text-gray-800">
                        {user.name || user.email}
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="p-2 text-gray-500 text-sm">
                    No users available.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <button
            type="submit"
            className="px-5 py-2 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition-colors duration-200 flex-1 sm:flex-none"
          >
            {editingTask ? "Save Task" : "Add Task"}
          </button>
          {editingTask && (
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-2 bg-gray-300 text-gray-800 rounded-md shadow-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-75 transition-colors duration-200 flex-1 sm:flex-none"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSmartAssign}
            className={`px-5 py-2 rounded-md shadow-md transition-colors duration-200 flex-1 sm:flex-none ${
              !editingTask
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-green-500 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75"
            }`}
            disabled={!editingTask}
          >
            Smart Assign
          </button>
        </div>
      </form>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold text-gray-700 mb-4">
          Activity Log
        </h3>
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {activities.map((log, i) => (
            <li
              key={i}
              className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md border border-gray-200"
            >
              <span className="font-mono text-gray-500 text-xs mr-2">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              — {formatActivityLog(log)}
            </li>
          ))}
          {activities.length === 0 && (
            <li className="text-gray-500 text-center py-4">
              No activities logged yet.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default BoardPage;
