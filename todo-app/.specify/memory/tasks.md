# 작업 목록: 오늘의 할 일 웹 앱

**입력**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md), [contracts/todo-api.yaml](contracts/todo-api.yaml)

**정렬 기준**: 사용자 스토리 우선순위(P1 → P2) 순서, 화면(UI)은 API 완성 후 진행

## Phase 1: 공통 인프라 설정

**목적**: 프로젝트 기본 구조와 환경 구성을 준비한다.

- [ ] T01 [P] 프로젝트 구조 생성: app/, tests/, templates/, .env.example, requirements.txt 준비
- [ ] T02 FastAPI 앱 진입점과 기본 라우팅 구조 구성
- [ ] T03 [P] SQLite 연결 및 환경변수 로딩 설정 (DATABASE_URL)
- [ ] T04 [P] SQLAlchemy 모델 및 Pydantic 스키마 기본 틀 작성

## Phase 2: P1 핵심 API 구현

**목적**: MVP의 핵심 동작인 할 일 생성/조회/완료/삭제를 독립적으로 구현한다.

### 사용자 스토리 1 - 새 할 일을 생성하고 유효성 검증하기 (우선순위: P1)

**독립 테스트**: POST /api/todos가 정상 생성과 빈 제목 오류를 각각 처리하는지 확인할 수 있다.

- [ ] T05 [P] 테스트 작성: 생성 성공 시나리오 (`tests/test_api.py`)
- [ ] T06 [P] 테스트 작성: 빈 제목 입력 시 422 응답 시나리오 (`tests/test_api.py`)
- [ ] T07 구현: 할 일 생성 API (`app/crud.py`, `app/main.py`)
- [ ] T08 완료 조건: `pytest -q tests/test_api.py -k "create"` 통과

### 사용자 스토리 2 - 할 일을 완료/미완료 상태로 토글하고 삭제하기 (우선순위: P1)

**독립 테스트**: PATCH /api/todos/{id}와 DELETE /api/todos/{id}가 정상 동작하는지 확인할 수 있다.

- [ ] T09 [P] 테스트 작성: 완료 토글 성공 시나리오 (`tests/test_api.py`)
- [ ] T10 [P] 테스트 작성: 삭제 성공 시나리오 (`tests/test_api.py`)
- [ ] T11 [P] 테스트 작성: 없는 ID 삭제 시 404 응답 시나리오 (`tests/test_api.py`)
- [ ] T12 구현: 완료 토글 API (`app/crud.py`, `app/main.py`)
- [ ] T13 구현: 삭제 API (`app/crud.py`, `app/main.py`)
- [ ] T14 완료 조건: `pytest -q tests/test_api.py -k "toggle or delete"` 통과

### 사용자 스토리 3 - 할 일 목록 조회와 상태 기반 필터 지원 (우선순위: P1)

**독립 테스트**: GET /api/todos가 status 파라미터별로 올바른 목록을 반환하는지 확인할 수 있다.

- [ ] T15 [P] 테스트 작성: 전체/활성/완료 필터 조회 시나리오 (`tests/test_api.py`)
- [ ] T16 구현: 목록 조회 API 및 status 필터 로직 (`app/crud.py`, `app/main.py`)
- [ ] T17 완료 조건: `pytest -q tests/test_api.py -k "list"` 통과

## Phase 3: P2 화면(UI) 및 통합 동작 구현

**목적**: API가 준비된 뒤 화면과 사용자 경험을 완성한다.

- [ ] T18 [P] 템플릿 기반 메인 페이지 구조 구현 (`app/templates/index.html`)
- [ ] T19 [P] 생성/완료/삭제/필터 동작을 fetch 기반으로 연결
- [ ] T20 남은 할 일 개수 표시 및 빈 상태(empty state) 안내 구현
- [ ] T21 반응형 레이아웃 및 모바일 화면 스타일 적용
- [ ] T22 완료 조건: `pytest -q tests/test_api.py` 전체 통과 및 UI 동작이 브라우저에서 확인 가능

## Phase 4: 통합 검증

**목적**: 전체 흐름이 함께 동작하는지 확인한다.

- [ ] T23 [P] 통합 테스트: 생성 → 완료/미완료 토글 → 삭제 → 필터/남은 개수 갱신 흐름
- [ ] T24 완료 조건: 전체 테스트 스위트 통과
