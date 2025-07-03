import { useEffect, useState } from "react";
import axios from "axios";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { useNavigate } from "react-router-dom";

function BoardPage() {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "Medium",
  });
  const [editingTask, setEditingTask] = useState(null);
  const [activity, setActivity] = useState([]);

  const navigate = useNavigate();
  const statuses = ["Todo", "In Progress", "Done"];

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
    } else {
      fetchTasks();
    }
  }, []);

  const fetchTasks = async () => {
    const token = localStorage.getItem("token");
    const res = await axios.get("http://localhost:5000/api/tasks", {
      headers: { Authorization: token },
    });
    setTasks(res.data);
  };

  const createTask = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    await axios.post("http://localhost:5000/api/tasks", newTask, {
      headers: { Authorization: token },
    });
    setActivity((prev) => [
      {
        type: "Created",
        title: newTask.title,
        time: new Date().toLocaleTimeString(),
      },
      ...prev,
    ]);
    setNewTask({ title: "", description: "", priority: "Medium" });
    fetchTasks();
  };

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const movedTask = tasks.find((t) => t._id === draggableId);
    const updatedTasks = tasks.map((t) =>
      t._id === draggableId ? { ...t, status: destination.droppableId } : t
    );
    setTasks(updatedTasks);

    const token = localStorage.getItem("token");
    await axios.put(
      `http://localhost:5000/api/tasks/${draggableId}`,
      { status: destination.droppableId },
      { headers: { Authorization: token } }
    );

    setActivity((prev) => [
      {
        type: "Moved",
        title: movedTask.title,
        from: source.droppableId,
        to: destination.droppableId,
        time: new Date().toLocaleTimeString(),
      },
      ...prev,
    ]);
  };

  const startEdit = (task) => {
    setEditingTask(task);
    setNewTask({
      title: task.title,
      description: task.description,
      priority: task.priority,
    });
  };

  const cancelEdit = () => {
    setEditingTask(null);
    setNewTask({ title: "", description: "", priority: "Medium" });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    await axios.put(
      `http://localhost:5000/api/tasks/${editingTask._id}`,
      newTask,
      { headers: { Authorization: token } }
    );
    setActivity((prev) => [
      {
        type: "Updated",
        title: newTask.title,
        time: new Date().toLocaleTimeString(),
      },
      ...prev,
    ]);
    cancelEdit();
    fetchTasks();
  };

  const deleteTask = async (id) => {
    const token = localStorage.getItem("token");
    const deleted = tasks.find((t) => t._id === id);
    await axios.delete(`http://localhost:5000/api/tasks/${id}`, {
      headers: { Authorization: token },
    });
    setActivity((prev) => [
      {
        type: "Deleted",
        title: deleted?.title || "Task",
        time: new Date().toLocaleTimeString(),
      },
      ...prev,
    ]);
    fetchTasks();
  };

  return (
    <div style={{ padding: "20px" }}>
      <button
        onClick={() => {
          localStorage.clear();
          navigate("/");
        }}
        style={{ float: "right" }}
      >
        🚪 Logout
      </button>

      <h2>Kollab Board</h2>

      <form
        onSubmit={editingTask ? saveEdit : createTask}
        style={{ marginBottom: "20px", display: "flex", gap: "10px" }}
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

        <button type="submit">{editingTask ? "Save" : "Add Task"}</button>

        {editingTask && (
          <button type="button" onClick={cancelEdit}>
            Cancel
          </button>
        )}
      </form>

      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ display: "flex", gap: "20px" }}>
          {statuses.map((status) => (
            <Droppable
              droppableId={status}
              key={status}
              isDropDisabled={false}
              isCombineEnabled={false}
              ignoreContainerClipping={false}
            >
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    flex: 1,
                    backgroundColor: "#f8f8f8",
                    padding: "10px",
                    borderRadius: "8px",
                    minHeight: "300px",
                  }}
                >
                  <h3>{status}</h3>
                  {tasks
                    .filter((t) => t.status === status)
                    .map((task, index) => (
                      <Draggable
                        key={task._id}
                        draggableId={task._id}
                        index={index}
                      >
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{
                              padding: "10px",
                              marginBottom: "10px",
                              backgroundColor: "white",
                              border: "1px solid #ccc",
                              borderRadius: "4px",
                              ...provided.draggableProps.style,
                            }}
                          >
                            <h4>{task.title}</h4>
                            <p>{task.description}</p>
                            <p>
                              <b>Priority:</b> {task.priority}
                            </p>
                            <button onClick={() => startEdit(task)}>
                              ✏️ Edit
                            </button>
                            <button onClick={() => deleteTask(task._id)}>
                              🗑️ Delete
                            </button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      <div style={{ marginTop: "30px" }}>
        <h3>🕒 Activity Log</h3>
        <ul>
          {activity.map((log, i) => (
            <li key={i}>
              {log.time} —{" "}
              {log.type === "Moved"
                ? `Moved "${log.title}" from ${log.from} to ${log.to}`
                : `${log.type} "${log.title}"`}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default BoardPage;
