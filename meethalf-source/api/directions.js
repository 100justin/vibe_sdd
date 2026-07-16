// Vercel 서버리스 함수: 카카오모빌리티 자동차 길찾기 프록시
//
// 왜 필요한가?
// - 카카오모빌리티 Directions API는 "REST API 키"를 Authorization 헤더에 넣어 호출해야 한다.
// - REST 키를 브라우저(프론트엔드) 코드에 넣으면 누구나 키를 탈취해 무단 사용할 수 있으므로,
//   서버(이 함수)에서만 키를 사용하고 프론트는 /api/directions 를 호출한다.
//
// 설정 방법:
// 1. https://developers.kakao.com > 내 애플리케이션 > 앱 키 > "REST API 키" 복사
// 2. Vercel 프로젝트 > Settings > Environment Variables 에 추가:
//      KAKAO_REST_KEY = <복사한 REST API 키>
// 3. 재배포하면 자동으로 "실제 도로 이동거리 기반" 공평 계산이 활성화된다.
//    (키가 없으면 앱은 직선거리 방식으로 자동 폴백하므로 없어도 동작은 한다)
//
// 로컬 개발에서 이 기능까지 테스트하려면 `npm run dev` 대신 `npx vercel dev`를 사용해야 한다.

export default async function handler(req, res) {
  const { origin, destination } = req.query // 형식: "경도,위도"

  if (!process.env.KAKAO_REST_KEY) {
    res.status(501).json({ error: 'KAKAO_REST_KEY not configured' })
    return
  }
  if (!origin || !destination || !/^[\d.,-]+$/.test(origin) || !/^[\d.,-]+$/.test(destination)) {
    res.status(400).json({ error: 'invalid origin/destination' })
    return
  }

  try {
    const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin}&destination=${destination}&summary=true`
    const r = await fetch(url, {
      headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}` },
    })
    const data = await r.json()
    // 짧은 캐시: 같은 좌표쌍 반복 조회 시 쿼터 절약
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
    res.status(r.status).json(data)
  } catch (e) {
    res.status(502).json({ error: 'upstream-failed' })
  }
}
