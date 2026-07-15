from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.crud import create_todo, delete_todo, get_todos, update_todo
from app.database import Base, SessionLocal, engine, get_db
from app.models import Todo
from app.schemas import TodoCreate, TodoResponse, TodoUpdate

app = FastAPI(title="Todo App")

templates = Jinja2Templates(directory="app/templates")

Base.metadata.create_all(bind=engine)


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/todos", response_model=list[TodoResponse])
def list_todos(status: str = "all", db: Session = Depends(get_db)):
    if status not in {"all", "active", "completed"}:
        raise HTTPException(status_code=400, detail="invalid status")
    return get_todos(db=db, status=status)


@app.post("/api/todos", response_model=TodoResponse, status_code=status.HTTP_201_CREATED)
def create_todo_api(todo: TodoCreate, db: Session = Depends(get_db)):
    title = todo.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="title is required")
    return create_todo(db=db, title=title)


@app.patch("/api/todos/{todo_id}", response_model=TodoResponse)
def update_todo_api(todo_id: int, payload: TodoUpdate, db: Session = Depends(get_db)):
    if payload.completed is None:
        raise HTTPException(status_code=422, detail="completed is required")
    todo = update_todo(db=db, todo_id=todo_id, completed=payload.completed)
    if todo is None:
        raise HTTPException(status_code=404, detail="todo not found")
    return todo


@app.delete("/api/todos/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo_api(todo_id: int, db: Session = Depends(get_db)):
    deleted = delete_todo(db=db, todo_id=todo_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="todo not found")
    return None
