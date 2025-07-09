import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import { io } from "socket.io-client";

const API_BASE = "https://kollab-board.onrender.com";

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

  const [conflictTask, setConflictTask] = useState(null);
  const [localChanges, setLocalChanges] = useState(null);
  const [conflictEditor, setConflictEditor] = useState(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);

  const [toast, setToast] = useState(null);

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "Medium",
    assignedTo: [],
    dueDate: "",
  });

  const [editingTask, setEditingTask] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");

  const navigate = useNavigate();
  const statuses = ["Todo", "In Progress", "Done"];
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    const timer = setTimeout(() => {
      setToast(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const fetchTasks = useCallback(async () => {
    console.log("fetchTasks: Starting fetch...");
    try {
      console.log(
        "fetchTasks: Making axios GET request to",
        `${API_BASE}/api/tasks?search=${searchTerm}&status=${filterStatus}&assignedTo=${filterAssignee}`
      );
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (filterStatus) params.append("status", filterStatus);
      if (filterAssignee) params.append("assignedTo", filterAssignee);

      const res = await axios.get(
        `${API_BASE}/api/tasks?${params.toString()}`,
        {
          headers: getAuthHeaders(),
          timeout: 10000, // Add a 10-second timeout to catch hangs
        }
      );
      console.log(
        "fetchTasks: Tasks fetched successfully. Data length:",
        res.data.length
      );
      setTasks(res.data);
    } catch (err) {
      console.error(
        "fetchTasks: Failed to fetch tasks:",
        err.message,
        "Response data:",
        err.response?.data
      );
      // Ensure the error is re-thrown so Promise.allSettled can catch it
      throw new Error(
        `Failed to load tasks: ${err.response?.data?.message || err.message}`
      );
    }
  }, [searchTerm, filterStatus, filterAssignee, getAuthHeaders]);

  const fetchUsers = useCallback(async () => {
    console.log("fetchUsers: Starting fetch...");
    try {
      const res = await axios.get(`${API_BASE}/api/users`, {
        headers: getAuthHeaders(),
        timeout: 10000,
      });
      console.log(
        "fetchUsers: Users fetched successfully. Data length:",
        res.data.length
      );
      setUsers(res.data);
    } catch (err) {
      console.error(
        "fetchUsers: Failed to fetch users:",
        err.message,
        "Response data:",
        err.response?.data
      );
      throw new Error(
        `Failed to load users: ${err.response?.data?.message || err.message}`
      );
    }
  }, [getAuthHeaders]);

  const fetchActivities = useCallback(async () => {
    console.log("fetchActivities: Starting fetch...");
    try {
      const res = await axios.get(`${API_BASE}/api/activities`, {
        headers: getAuthHeaders(),
        timeout: 10000,
      });
      console.log(
        "fetchActivities: Activities fetched successfully. Data length:",
        res.data.length
      );
      setActivities(res.data);
    } catch (err) {
      console.error(
        "fetchActivities: Failed to fetch activities:",
        err.message,
        "Response data:",
        err.response?.data
      );
      throw new Error(
        `Failed to load activities: ${
          err.response?.data?.message || err.message
        }`
      );
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
      transports: ["websocket"],
      autoConnect: false,
    });

    socketInstance.connect();
    setSocket(socketInstance);

    socketInstance.on("connect", () => {
      console.log("Connected to socket with ID:", socketInstance.id);
      console.log("Sending join-user with userId:", currentUser.id);
      socketInstance.emit("join-user", currentUser.id);
    });

    socketInstance.on("task-updated", (updatedTaskFromServer) => {
      console.log("Socket: task-updated received", updatedTaskFromServer);

      if (updatedTaskFromServer.deleted) {
        setTasks((prev) =>
          prev.filter((t) => t._id !== updatedTaskFromServer._id)
        );
        fetchActivities();
        return;
      }

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

      fetchActivities();
    });

    socketInstance.on("activity-added", (activity) => {
      console.log("Socket: activity-added received", activity);
      setActivities((prev) => [activity, ...prev.slice(0, 19)]);
    });

    socketInstance.on("edit-conflict", ({ taskId, currentEditor }) => {
      console.log("Socket: edit-conflict received", taskId, currentEditor);

      const task = tasks.find((t) => t._id === taskId);
      console.log("Matched task:", task);
      console.log("newTask (form state):", newTask);

      if (!task) return;

      setConflictTask(task);
      setLocalChanges(newTask);
      setConflictEditor(currentEditor);

      setEditingTask(null);
      resetForm();

      showToast("Conflict detected! Please resolve.", "error");
    });

    socketInstance.on("disconnect", () => {
      console.log("Socket.IO disconnected.");
      //showToast("Disconnected from real-time updates.", "error");
    });

    socketInstance.on("connect_error", (err) => {
      console.error("Socket.IO connection error:", err.message);
      showToast(`Socket connection error: ${err.message}`, "error");
    });

    return () => {
      console.log("Cleaning up socket connection.");
      if (editingTask && socketInstance) {
        socketInstance.emit("stop-editing", editingTask._id);
      }
      socketInstance.disconnect();
    };
  }, [navigate, currentUser.id]);

  useEffect(() => {
    const loadAll = async () => {
      console.log("loadAll: Starting initial data load...");
      setLoading(true);
      try {
        const [tasksResult, usersResult, activitiesResult] =
          await Promise.allSettled([
            fetchTasks(),
            fetchUsers(),
            fetchActivities(),
          ]);

        let combinedErrorMessages = [];

        if (tasksResult.status === "rejected") {
          combinedErrorMessages.push(tasksResult.reason.message);
          console.error("loadAll: Tasks fetch rejected:", tasksResult.reason);
        }
        if (usersResult.status === "rejected") {
          combinedErrorMessages.push(usersResult.reason.message);
          console.error("loadAll: Users fetch rejected:", usersResult.reason);
        }
        if (activitiesResult.status === "rejected") {
          combinedErrorMessages.push(activitiesResult.reason.message);
          console.error(
            "loadAll: Activities fetch rejected:",
            activitiesResult.reason
          );
        }

        if (combinedErrorMessages.length > 0) {
          const finalErrorMessage = combinedErrorMessages.join(" | ");
          setError(finalErrorMessage);
          showToast(finalErrorMessage, "error");
          console.log("loadAll: Initial data load completed with errors.");
        } else {
          setError("");
          console.log("loadAll: Initial data load completed successfully.");
        }
      } catch (err) {
        console.error(
          "loadAll: Unexpected error during initial data load:",
          err
        );
        setError(
          err.message || "An unexpected error occurred during board load."
        );
        showToast(
          err.message || "An unexpected error occurred during board load.",
          "error"
        );
      } finally {
        setLoading(false);
        console.log("loadAll: setLoading(false) called.");
      }
    };
    loadAll();
  }, [fetchTasks, fetchUsers, fetchActivities, showToast]);

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

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (editingTask && socket) {
        socket.emit("stop-editing", editingTask._id);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [editingTask, socket]);

  const updateTask = async (id, updates) => {
    try {
      const res = await axios.put(`${API_BASE}/api/tasks/${id}`, updates, {
        headers: getAuthHeaders(),
      });
      socket?.emit("task-updated", res.data);
      showToast("Task updated successfully!", "success");
      return res.data;
    } catch (err) {
      console.error("Failed to update task:", err);
      showToast(
        err.response?.data?.message || "Failed to update task.",
        "error"
      );
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
      showToast("Task created successfully!", "success");
    } catch (err) {
      console.error("Failed to create task:", err);
      setError("Failed to create task.");
      showToast(
        err.response?.data?.message || "Failed to create task.",
        "error"
      );
    }
  };

  const handleDeleteClick = (task) => {
    setTaskToDelete(task);
    setShowDeleteModal(true);
  };

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;

    try {
      await axios.delete(`${API_BASE}/api/tasks/${taskToDelete._id}`, {
        headers: getAuthHeaders(),
      });
      setTasks((prevTasks) =>
        prevTasks.filter((task) => task._id !== taskToDelete._id)
      );
      socket?.emit("task-updated", { type: "delete", id: taskToDelete._id });
      setTaskToDelete(null);
      setShowDeleteModal(false);
      showToast("Task deleted successfully!", "success");
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete task.");
      setTaskToDelete(null);
      setShowDeleteModal(false);
      showToast(
        err.response?.data?.message || "Failed to delete task.",
        "error"
      );
    }
  };

  const cancelDelete = () => {
    setTaskToDelete(null);
    setShowDeleteModal(false);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingTask) return;

    const originalTask = tasks.find((t) => t._id === editingTask._id);
    if (!originalTask) return;

    socket?.emit("stop-editing", editingTask._id);

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
      showToast(
        err.response?.data?.message || "Failed to save changes.",
        "error"
      );
    } finally {
      resetForm();
    }
  };

  const startEdit = (task) => {
    if (socket && socket.connected) {
      console.log("Emitting start-editing for task", task._id);
      socket.emit("start-editing", task._id);
    } else {
      console.warn("Socket not connected, cannot emit start-editing");
    }

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
      dueDate: task.dueDate
        ? new Date(task.dueDate).toISOString().split("T")[0]
        : "",
    });
    setError("");
  };

  const resetForm = () => {
    if (editingTask && socket) {
      socket.emit("stop-editing", editingTask._id);
    }
    setEditingTask(null);
    setNewTask({
      title: "",
      description: "",
      priority: "Medium",
      assignedTo: [],
      dueDate: "",
    });
    setShowAssignDropdown(false);
    setError("");
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
      showToast(`Task status updated to "${newStatus}"!`, "success");
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
      showToast(
        err.response?.data?.message || "Failed to update task status.",
        "error"
      );
    } finally {
      setDraggedTaskId(null);
    }
  };

  const handleSmartAssign = async () => {
    if (!editingTask) {
      showToast("Please select or create a task to smart assign.", "info");
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
      showToast("Task smart-assigned successfully!", "success");
    } catch (err) {
      console.error("Failed to smart assign task:", err);
      setError("Failed to smart assign task. Please try again.");
      showToast(
        err.response?.data?.message || "Failed to smart assign task.",
        "error"
      );
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
      case "Task Due Date Changed":
        const oldDueDate = log.details?.dueDate?.from || "None";
        const newDueDate = log.details?.dueDate?.to || "None";
        return `${userName} changed due date of "${taskTitle}" from ${oldDueDate} to ${newDueDate}`;
      case "Conflict Resolved":
        return `${userName} resolved a conflict for "${taskTitle}" (${log.details?.resolution} method)`;
      default:
        return `${userName} ${log.type} "${taskTitle}"`;
    }
  };

  const handleResolveConflict = async (resolutionType) => {
    if (!conflictTask || !localChanges) return;

    let mergedData = {};
    if (resolutionType === "merge") {
      mergedData = {
        title: localChanges.title,
        description: localChanges.description,
        priority: localChanges.priority,
        status: localChanges.status || conflictTask.status,
        assignedTo:
          localChanges.assignedTo || conflictTask.assignedTo.map((u) => u._id),
        dueDate: localChanges.dueDate || conflictTask.dueDate,
      };
    } else if (resolutionType === "overwrite") {
      mergedData = {
        title: localChanges.title,
        description: localChanges.description,
        priority: localChanges.priority,
        status: localChanges.status,
        assignedTo: localChanges.assignedTo,
        dueDate: localChanges.dueDate,
      };
    } else if (resolutionType === "discard") {
      mergedData = {
        title: conflictTask.title,
        description: conflictTask.description,
        priority: conflictTask.priority,
        status: conflictTask.status,
        assignedTo: conflictTask.assignedTo.map((u) => u._id),
        dueDate: conflictTask.dueDate,
      };
    }

    try {
      const res = await axios.post(
        `${API_BASE}/api/tasks/resolve-conflict`,
        {
          taskId: conflictTask._id,
          resolution: resolutionType,
          mergedData,
        },
        {
          headers: getAuthHeaders(),
        }
      );
      console.log("Conflict resolved:", res.data);
      setTasks((prevTasks) =>
        prevTasks.map((task) => (task._id === res.data._id ? res.data : task))
      );
      setConflictTask(null);
      setLocalChanges(null);
      setConflictEditor(null);
      setError("");
      showToast("Conflict resolved successfully!", "success");
    } catch (err) {
      console.error("Failed to resolve conflict:", err);
      setError("Failed to resolve conflict. Please try again.");
      showToast(
        err.response?.data?.message || "Failed to resolve conflict.",
        "error"
      );
    }
  };

  const getEditorName = (editorId) => {
    const editor = users.find((u) => u._id === editorId);
    return editor ? editor.name || editor.email : "Another User";
  };

  const getDueDateDisplay = (dateString) => {
    if (!dateString) return "No due date";
    const date = new Date(dateString);
    if (isNaN(date)) return "Invalid date";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(dateString);
    taskDate.setHours(0, 0, 0, 0);

    const diffTime = taskDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="text-red-600 font-semibold">
          Overdue ({date.toLocaleDateString()})
        </span>
      );
    } else if (diffDays === 0) {
      return (
        <span className="text-orange-500 font-semibold">
          Due Today ({date.toLocaleDateString()})
        </span>
      );
    } else if (diffDays === 1) {
      return (
        <span className="text-yellow-600">
          Due Tomorrow ({date.toLocaleDateString()})
        </span>
      );
    } else {
      return `Due: ${date.toLocaleDateString()}`;
    }
  };

  if (loading) {
    return <div className="p-5 text-lg text-gray-700">Loading board...</div>;
  }

  {
    error && (
      <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
        {error}
      </div>
    );
  }

  console.log("Modal visibility check:", { conflictTask, localChanges });

  return (
    <div className="min-h-screen bg-gray-100 p-5 font-sans">
      {toast && (
        <div
          className={`fixed top-5 right-5 p-4 rounded-md shadow-lg text-white z-50
          ${
            toast.type === "success"
              ? "bg-green-500"
              : toast.type === "error"
              ? "bg-red-500"
              : "bg-blue-500"
          }`}
        >
          {toast.message}
        </div>
      )}

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
            showToast("Logged out successfully!", "info");
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

      <div className="flex flex-row gap-6 mb-8 overflow-x-auto pb-4">
        {statuses.map((status) => (
          <div
            key={status}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
            className="flex-shrink-0 w-80 bg-gray-50 p-4 rounded-lg shadow-md min-h-[300px] border border-gray-200"
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
                    <b>Priority:</b> {task.priority}
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    <b>Due Date:</b> {getDueDateDisplay(task.dueDate)}
                  </p>
                  <p className="text-xs text-gray-500 mb-3">
                    <b>Assigned to:</b> {getUserNames(task.assignedTo)}
                  </p>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => startEdit(task)}
                      className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition-colors duration-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteClick(task)}
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

          <div>
            <label
              htmlFor="dueDate"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Due Date:
            </label>
            <input
              type="date"
              id="dueDate"
              value={newTask.dueDate}
              onChange={(e) =>
                setNewTask({ ...newTask, dueDate: e.target.value })
              }
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

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

      {conflictTask && localChanges && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl">
            <h3 className="text-2xl font-bold text-red-600 mb-4">
              Conflict Detected!
            </h3>
            <p className="text-gray-700 mb-4">
              Another user ({getEditorName(conflictEditor)}) is currently
              editing task "<b>{conflictTask.title}</b>". Please choose how to
              resolve your unsaved changes.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                <h4 className="font-semibold text-lg text-gray-800 mb-2">
                  Current Server Version
                </h4>
                <p className="text-sm text-gray-700">
                  <b>Title:</b> {conflictTask.title}
                </p>
                <p className="text-sm text-gray-700">
                  <b>Description:</b> {conflictTask.description}
                </p>
                <p className="text-sm text-gray-700">
                  <b>Priority:</b> {conflictTask.priority}
                </p>
                <p className="text-sm text-gray-700">
                  <b>Status:</b> {conflictTask.status}
                </p>
                <p className="text-sm text-gray-700">
                  <b>Assigned To:</b> {getUserNames(conflictTask.assignedTo)}
                </p>
                <p className="text-sm text-gray-700">
                  <b>Due Date:</b> {getDueDateDisplay(conflictTask.dueDate)}
                </p>
              </div>

              <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
                <h4 className="font-semibold text-lg text-blue-800 mb-2">
                  Your Local Changes
                </h4>
                <p className="text-sm text-gray-700">
                  <b>Title:</b> {localChanges.title}
                </p>
                <p className="text-sm text-gray-700">
                  <b>Description:</b> {localChanges.description}
                </p>
                <p className="text-sm text-gray-700">
                  <b>Priority:</b> {localChanges.priority}
                </p>
                <p className="text-sm text-gray-700">
                  <b>Status:</b> {localChanges.status || conflictTask.status}
                </p>
                <p className="text-sm text-gray-700">
                  <b>Assigned To:</b> {getUserNames(localChanges.assignedTo)}
                </p>
                <p className="text-sm text-gray-700">
                  <b>Due Date:</b> {getDueDateDisplay(localChanges.dueDate)}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => handleResolveConflict("merge")}
                className="px-5 py-2 bg-purple-600 text-white rounded-md shadow-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-75 transition-colors duration-200"
              >
                Merge (Keep your changes, but respect server's status/assignee)
              </button>
              <button
                onClick={() => handleResolveConflict("overwrite")}
                className="px-5 py-2 bg-yellow-600 text-white rounded-md shadow-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-75 transition-colors duration-200"
              >
                Overwrite (Your changes win)
              </button>
              <button
                onClick={() => handleResolveConflict("discard")}
                className="px-5 py-2 bg-gray-500 text-white rounded-md shadow-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-75 transition-colors duration-200"
              >
                Discard (Use server's version)
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && taskToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              Confirm Deletion
            </h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete the task "
              <b>{taskToDelete.title}</b>"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md shadow-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-75 transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteTask}
                className="px-4 py-2 bg-red-600 text-white rounded-md shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75 transition-colors duration-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BoardPage;
