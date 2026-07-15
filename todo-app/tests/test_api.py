from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_create_todo_success():
    response = client.post("/api/todos", json={"title": "테스트 할 일"})
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "테스트 할 일"
    assert data["completed"] is False


def test_create_todo_invalid_title():
    response = client.post("/api/todos", json={"title": "   "})
    assert response.status_code == 422


def test_list_todos_filter_all():
    response = client.get("/api/todos?status=all")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_toggle_todo_complete():
    response = client.post("/api/todos", json={"title": "완료 토글 테스트"})
    todo_id = response.json()["id"]

    response = client.patch(f"/api/todos/{todo_id}", json={"completed": True})
    assert response.status_code == 200
    assert response.json()["completed"] is True


def test_delete_todo_success():
    response = client.post("/api/todos", json={"title": "삭제 테스트"})
    todo_id = response.json()["id"]

    response = client.delete(f"/api/todos/{todo_id}")
    assert response.status_code == 204


def test_delete_todo_not_found():
    response = client.delete("/api/todos/999999")
    assert response.status_code == 404
