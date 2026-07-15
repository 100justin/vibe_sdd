# 구현 계획: 오늘의 할 일 웹 앱

**브랜치**: `001-todo-app` | **작성일**: 2026-07-15 | **명세서**: [spec.md](spec.md)

**입력**: 기능 명세서에서 정의한 사용자 요구사항과 품질 요구사항

## 요약

이 기능은 FastAPI 기반의 간단한 할 일 관리 웹 앱을 구현한다. 사용자는 웹 화면에서 할 일을 생성하고, 완료 상태를 토글하고, 삭제하며, 필터와 남은 개수를 확인할 수 있다. 데이터는 브라우저 로컬 저장소를 사용해 새로고침 후에도 유지되도록 구현한다.

## 기술 컨텍스트

**언어/버전**: Python 3.11+

**주요 의존성**: FastAPI, SQLAlchemy 2.x, Pydantic, Jinja2, pytest, httpx/TestClient

**저장소**: SQLite, 데이터베이스 경로는 .env의 DATABASE_URL 환경변수로 관리

**테스트**: pytest + FastAPI TestClient

**대상 플랫폼**: 웹 브라우저

**프로젝트 유형**: 웹 애플리케이션

**성능 목표**: 단일 사용자 기준의 소규모 할 일 목록 처리

**제약 조건**: 별도 빌드 도구 없이 단일 HTML 페이지와 서버 API로 구성

**규모/범위**: 단일 사용자, 간단한 할 일 CRUD와 필터/상태 표시 기능

## 원칙 검토

- 스펙 우선: 기능 범위는 명세서의 FR-001~FR-010에 맞춰 구현한다.
- 테스트 필수: 핵심 API 동작은 pytest 테스트로 검증한다.
- 설정 분리: DATABASE_URL은 .env로 관리한다.
- 문서 작성 원칙: 본 계획서와 관련 문서는 모두 한국어로 작성한다.

## 프로젝트 구조

```text
todo-app/
├── app/
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── crud.py
│   ├── database.py
│   └── templates/
│       └── index.html
├── tests/
│   └── test_api.py
├── .env
├── .env.example
└── requirements.txt
```

**구조 결정**: 백엔드 API와 단일 프론트엔드 템플릿을 하나의 프로젝트 구조로 구성한다. 프론트엔드는 index.html 하나로 구현하고, 서버가 Jinja2 템플릿을 렌더링한다.

## 구현 접근 방식

1. FastAPI 앱을 구성하고 루트 페이지 및 REST API 엔드포인트를 구현한다.
2. SQLAlchemy 모델과 Pydantic 스키마를 정의해 할 일 데이터를 저장하고 검증한다.
3. CRUD 로직을 분리해 API 요청을 처리한다.
4. index.html에서 fetch를 사용해 목록을 갱신하고, 남은 할 일 개수와 필터 상태를 동적으로 반영한다.
5. pytest와 TestClient로 주요 API 동작을 테스트한다.

## 구현 단계

### 1단계: 데이터 모델 및 DB 설정
- SQLAlchemy 모델로 Todo 엔티티를 정의한다.
- SQLite 연결과 세션 생명주기를 구성한다.
- DATABASE_URL 환경변수를 읽어 연결한다.

### 2단계: API 구현
- GET /api/todos, POST /api/todos, PATCH /api/todos/{id}, DELETE /api/todos/{id} 구현
- 빈 제목 입력 시 422 응답을 반환한다.
- 존재하지 않는 할 일 삭제 시 404 응답을 반환한다.

### 3단계: 웹 화면 구현
- GET / 페이지에서 할 일 목록을 렌더링한다.
- fetch 기반으로 생성/완료/삭제/필터 변경을 처리한다.
- 빈 상태와 반응형 레이아웃을 포함한다.

### 4단계: 테스트 작성
- 생성, 완료 토글, 삭제, 필터, 남은 개수 관련 API 테스트를 작성한다.
- 주요 성공/실패 시나리오를 검증한다.

## 복잡도 추적

없음.
