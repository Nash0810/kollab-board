import { useEffect, useState } from "react";
import axios from "axios";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

function BoardPage() {
  const [tasks, setTasks] = useState([]);

  const fetchTasks = async () => {
    const token = localStorage.getItem("token");
    const res = await axios.get("http://localhost:5000/api/tasks", {
      headers: { Authorization: token },
    });
    setTasks(res.data);
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const statuses = ["Todo", "In Progress", "Done"];

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    // Update local state
    const updatedTasks = tasks.map((t) =>
      t._id === draggableId ? { ...t, status: destination.droppableId } : t
    );
    setTasks(updatedTasks);

    // Send to backend
    const token = localStorage.getItem("token");
    await axios.put(
      `http://localhost:5000/api/tasks/${draggableId}`,
      { status: destination.droppableId },
      { headers: { Authorization: token } }
    );
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div style={{ display: "flex", gap: "20px" }}>
        {statuses.map((status) => (
          <Droppable droppableId={status} key={status}>
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                style={{
                  flex: 1,
                  backgroundColor: "#f0f0f0",
                  padding: "10px",
                  minHeight: "300px",
                }}
              >
                <h2>{status}</h2>
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
                            margin: "5px",
                            backgroundColor: "white",
                            border: "1px solid #ccc",
                            ...provided.draggableProps.style,
                          }}
                        >
                          <h4>{task.title}</h4>
                          <p>{task.description}</p>
                          <p>
                            <b>Priority:</b> {task.priority}
                          </p>
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
  );
}

export default BoardPage;
