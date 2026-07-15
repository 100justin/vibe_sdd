from sqlalchemy.orm import Session

from app.models import Todo


def get_todos(db: Session, status: str = "all"):
    query = db.query(Todo)
    if status == "active":
        query = query.filter(Todo.completed.is_(False))
    elif status == "completed":
        query = query.filter(Todo.completed.is_(True))
    return query.order_by(Todo.id.asc()).all()


def create_todo(db: Session, title: str):
    todo = Todo(title=title, completed=False)
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


def update_todo(db: Session, todo_id: int, completed: bool):
    todo = db.query(Todo).filter(Todo.id == todo_id).first()
    if todo is None:
        return None
    todo.completed = completed
    db.commit()
    db.refresh(todo)
    return todo


def delete_todo(db: Session, todo_id: int):
    todo = db.query(Todo).filter(Todo.id == todo_id).first()
    if todo is None:
        return False
    db.delete(todo)
    db.commit()
    return True
