# 중간에서 (MeetHalf)

두 사람의 출발지를 입력하면 **공평한 중간지점**을 계산하고, 그 주변의 카페 · 식당 · 지하철역을 지도에서 바로 추천해주는 웹 서비스입니다.

🔗 배포 링크: `<Vercel 배포 후 이 자리에 URL을 붙여넣으세요>`

## 주요 기능

- 두 사람의 이름과 출발지(주소/지하철역/장소명) 입력
- **입력 중 실시간 후보 목록**에서 정확한 위치를 직접 선택 (검색 정확도 개선)
- 두 좌표의 지리적 중간지점(centroid) 자동 계산 + 중간지점 지역명 표시
- 각 출발지 → 중간지점 거리 표시로 "공평함" 확인
- 카카오맵에 두 경로선 + 중간지점 핀 시각화
- 중간지점 반경 900m 내 카페 · 식당 · 지하철역 자동 추천 (거리순 정렬)
- 추천 장소마다 **카카오맵 길찾기 바로가기** 제공
- 결과를 URL 링크(좌표 포함)로 복사해 상대방과 공유 → 상대방은 재검색 없이 동일 결과 확인
- 상황별로 구분된 에러 메시지 (API 키 미설정 / 검색 결과 없음 / 네트워크 오류)

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프레임워크 | React 18 + Vite |
| 지도 · 검색 | Kakao Maps JavaScript SDK + Kakao Local API (키워드 검색, 카테고리 검색, 좌표→주소 변환) |
| 배포 | Vercel |

한국 주소·상호명 인식률이 높은 카카오 지도/검색 API로 구성했습니다.

## 중간지점 선정 방식

기하학적 직선 중간점은 바다·강·야산 등 갈 수 없는 곳에 찍힐 수 있어, 아래 방식으로 **실제 교통 거점**을 기준점으로 고릅니다.

1. 두 출발지 사이 구간(30%~70% 지점 5곳)에서 주변 교통 거점을 탐색
2. **지하철역 → 기차역 → 버스터미널** 순으로 폴백 (지하철 없는 지역 대응)
3. 각 후보마다 `|A거리 − B거리| + (A거리 + B거리) × 0.3` 점수 계산 → 가장 낮은(공평한) 곳 채택
4. `KAKAO_REST_KEY` 설정 시(아래 참고), 상위 5개 후보를 **실제 도로 이동거리·소요시간**(카카오모빌리티 길찾기)으로 재검증
5. 후보가 전혀 없으면 직선 중간점으로 폴백 + 경고 표시

## (선택) 실제 도로거리 기반 공평 계산 활성화

`api/directions.js` 서버리스 함수가 카카오모빌리티 길찾기 API를 프록시합니다. REST 키는 브라우저에 노출되면 안 되므로 서버 환경변수로만 설정합니다.

1. Kakao Developers > 내 애플리케이션 > 앱 키 > **REST API 키** 복사
2. Vercel > Settings > **Environment Variables**에 `KAKAO_REST_KEY` 추가 후 재배포
3. 로컬에서 이 기능까지 테스트하려면 `npm run dev` 대신 `npx vercel dev` 사용

키가 없어도 앱은 직선거리 방식으로 정상 동작합니다.

## 카카오맵 API 키 발급 (필수)

1. [Kakao Developers](https://developers.kakao.com) 접속 → 로그인 → **내 애플리케이션 > 애플리케이션 추가하기**
2. 생성된 앱의 **앱 키 > JavaScript 키** 복사
3. **제품 설정 > 지도** 활성화 확인
4. **앱 설정 > 플랫폼 > Web 플랫폼 등록**에 아래 두 도메인을 반드시 등록
   - `http://localhost:5173` (로컬 개발용)
   - 실제 Vercel 배포 주소 (예: `https://meethalf.vercel.app`)
   - ⚠️ 도메인을 등록하지 않으면 다른 사이트가 내 키로 지도를 무단 호출할 수 있습니다.
5. 프로젝트 루트에 `.env` 파일 생성 후 아래처럼 입력:
   ```
   VITE_KAKAO_MAP_KEY=발급받은_JavaScript_키
   ```
   (`.env.example` 파일을 복사해서 사용하면 편합니다)

## 로컬 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

## 빌드

```bash
npm run build
npm run preview
```

## Vercel 배포 방법

1. 이 저장소를 GitHub에 Public으로 push
2. [vercel.com](https://vercel.com) 접속 → **Add New Project** → 방금 push한 GitHub repo 선택
3. Framework Preset은 **Vite**로 자동 인식됨 (Build Command: `npm run build`, Output Directory: `dist`)
4. **Environment Variables**에 `VITE_KAKAO_MAP_KEY` 추가 (카카오에서 발급받은 JavaScript 키)
5. **Deploy** 클릭 → 완료 후 발급된 URL을 카카오 개발자 콘솔의 **Web 플랫폼 도메인**에도 추가 등록
6. 배포 URL을 제출

## 프로젝트 구조

```
meethalf/
├── src/
│   ├── App.jsx         # 전체 로직 (검색/지오코딩, 중간지점 계산, 지도, 장소 검색)
│   ├── main.jsx        # 엔트리포인트
│   └── index.css       # 디자인 시스템 (다크 · 트랜짓맵 컨셉)
├── index.html
├── .env.example         # 카카오맵 API 키 설정 예시
├── package.json
└── vite.config.js
```

## 향후 개선 아이디어

- 3인 이상 참여 시 다각형 무게중심 계산으로 확장
- 대중교통 소요시간 기반 "체감 공평함" 지수 도입 (도보 거리 대신 이동시간 기준)
- 참여자별 이동 수단(도보/대중교통/자차) 선택 반영

## 팀

- 팀원 A — 프론트엔드 / 지도 연동
- 팀원 B — 기획 / 발표자료

## 라이선스

지도 및 장소 데이터 ⓒ Kakao Corp. (Kakao Maps / Local API 이용약관 준수)
