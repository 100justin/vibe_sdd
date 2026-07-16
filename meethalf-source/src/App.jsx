import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY

const CAT_LABEL = { cafe: '카페', food: '식사', transit: '역' }
const CAT_CODE = { cafe: 'CE7', food: 'FD6', transit: 'SW8' }

const MIN_STOPS = 2
const MAX_STOPS = 6
// 참가자별 고정 색상 팔레트. 노랑(#F2C94C)은 기준점(만남 장소) 전용이라 제외.
const PALETTE = ['#FF6B4A', '#4EC9B0', '#A78BFA', '#F783AC', '#60A5FA', '#82E0AA']
const EXAMPLES = [
  '예: 강남역, 서울 마포구 서교동',
  '예: 신촌역, 서울 성동구 성수동',
  '예: 홍대입구역, 서울 용산구 이태원동',
  '예: 잠실역, 경기 성남시 분당구',
  '예: 건대입구역, 서울 강서구 화곡동',
  '예: 노원역, 서울 동작구 상도동',
]

function toRad(v) { return (v * Math.PI) / 180 }
function haversineKm(a, b) {
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
function centroidOf(points) {
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
  }
}
function maxPairwiseKm(points) {
  let max = 0
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      max = Math.max(max, haversineKm(points[i], points[j]))
    }
  }
  return max
}

// ---------- Kakao SDK loader (singleton) ----------
let kakaoLoadPromise = null
function loadKakaoSdk() {
  if (!KAKAO_KEY) return Promise.reject(new Error('no-key'))
  if (window.kakao && window.kakao.maps) return Promise.resolve()
  if (kakaoLoadPromise) return kakaoLoadPromise

  kakaoLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false&libraries=services`
    script.async = true
    script.onload = () => {
      window.kakao.maps.load(() => resolve())
    }
    script.onerror = () => reject(new Error('sdk-load-failed'))
    document.head.appendChild(script)
  })
  return kakaoLoadPromise
}

// ---------- Kakao search helpers ----------
function keywordSearch(query) {
  return new Promise((resolve, reject) => {
    const ps = new window.kakao.maps.services.Places()
    ps.keywordSearch(query, (data, status) => {
      const K = window.kakao.maps.services.Status
      if (status === K.OK) resolve(data)
      else if (status === K.ZERO_RESULT) resolve([])
      else reject(new Error('kakao-request-failed'))
    })
  })
}

function categorySearch(code, lat, lng, radius) {
  return new Promise((resolve) => {
    const ps = new window.kakao.maps.services.Places()
    const center = new window.kakao.maps.LatLng(lat, lng)
    ps.categorySearch(
      code,
      (data, status) => {
        const K = window.kakao.maps.services.Status
        if (status === K.OK) resolve(data)
        else resolve([])
      },
      { location: center, radius, sort: window.kakao.maps.services.SortBy.DISTANCE }
    )
  })
}

async function fetchNearbyPlaces(lat, lng, radius = 900) {
  const [cafes, foods, transit] = await Promise.all([
    categorySearch(CAT_CODE.cafe, lat, lng, radius),
    categorySearch(CAT_CODE.food, lat, lng, radius),
    categorySearch(CAT_CODE.transit, lat, lng, radius),
  ])
  const merge = (arr, cat) =>
    arr.slice(0, 15).map((p) => ({
      id: p.id,
      name: p.place_name,
      cat,
      lat: parseFloat(p.y),
      lng: parseFloat(p.x),
      dist: p.distance ? parseInt(p.distance, 10) : haversineKm({ lat, lng }, { lat: parseFloat(p.y), lng: parseFloat(p.x) }) * 1000,
    }))
  return [...merge(cafes, 'cafe'), ...merge(foods, 'food'), ...merge(transit, 'transit')]
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 14)
}

// ---------- Fair meeting-station picker (N명 지원) ----------
// 여러 출발지의 기하학적 중심(centroid)은 바다/야산 등 실제로 갈 수 없는 곳일 수 있다.
// 대신 참가자들 사이 구간을 따라 "실제 교통 거점"(지하철역 → 기차역 → 버스터미널)을 후보로 모으고,
// 모두에게 가장 공평한 곳을 골라 기준점으로 쓴다.

function lerpPoint(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
}

function keywordSearchNear(query, lat, lng, radius) {
  return new Promise((resolve) => {
    const ps = new window.kakao.maps.services.Places()
    const center = new window.kakao.maps.LatLng(lat, lng)
    ps.keywordSearch(
      query,
      (data, status) => {
        const K = window.kakao.maps.services.Status
        if (status === K.OK) resolve(data)
        else resolve([])
      },
      { location: center, radius, sort: window.kakao.maps.services.SortBy.DISTANCE }
    )
  })
}

function dedupeStations(list) {
  const kept = []
  for (const s of list) {
    const pos = { lat: parseFloat(s.y), lng: parseFloat(s.x) }
    const dup = kept.find((k) => k.name === s.place_name && haversineKm(k.pos, pos) < 0.3)
    if (!dup) kept.push({ name: s.place_name, pos })
  }
  return kept
}

// 중심점(centroid) 한 곳이 아니라, 각 참가자~중심점 중간지점들에서도 함께 탐색한다.
// 중심점이 바다·산이어도 참가자 쪽으로 치우친 지점들에서 후보를 커버할 수 있다.
async function collectStationCandidates(points) {
  const centroid = centroidOf(points)
  const maxKm = maxPairwiseKm(points)
  const radius = Math.min(20000, Math.max(2000, Math.round(maxKm * 1000 * 0.35)))
  const probePoints = [centroid, ...points.map((p) => lerpPoint(p, centroid, 0.5))]

  const probe = async (searchFn) => {
    const results = await Promise.all(probePoints.map((p) => searchFn(p.lat, p.lng, radius)))
    return results.flat()
  }

  // 1순위: 지하철역
  let flat = await probe((lat, lng, r) => categorySearch(CAT_CODE.transit, lat, lng, r))
  let kind = 'subway'

  // 2순위: 기차역 (지하철이 없는 지역 대응)
  if (flat.length === 0) {
    flat = (await probe((lat, lng, r) => keywordSearchNear('기차역', lat, lng, r)))
      .filter((p) => /기차|철도|KTX|SRT/i.test(p.category_name || ''))
    kind = 'train'
  }

  // 3순위: 버스터미널
  if (flat.length === 0) {
    flat = (await probe((lat, lng, r) => keywordSearchNear('버스터미널', lat, lng, r)))
      .filter((p) => /터미널|버스/.test(p.category_name || '') || /터미널/.test(p.place_name))
    kind = 'bus'
  }

  return { stations: dedupeStations(flat), kind }
}

const FAIRNESS_WEIGHT = 1
const DETOUR_WEIGHT = 0.3 // 공평하더라도 다 함께 너무 멀리 돌아가야 하면 감점

// 공평도 = (가장 먼 사람 거리 - 가장 가까운 사람 거리). 한 명만 유난히 손해 보는 곳을 배제한다.
function scoreStations(points, stations) {
  return stations
    .map(({ name, pos }) => {
      const dists = points.map((p) => haversineKm(p, pos))
      const max = Math.max(...dists)
      const min = Math.min(...dists)
      const total = dists.reduce((a, b) => a + b, 0)
      return { name, lat: pos.lat, lng: pos.lng, dists, score: (max - min) * FAIRNESS_WEIGHT + total * DETOUR_WEIGHT }
    })
    .sort((a, b) => a.score - b.score)
}

// 인원이 많을수록 도로거리 API 호출량이 커지므로, 재검증 후보 개수를 인원수에 맞춰 줄인다.
function candidateCountFor(n) {
  if (n <= 3) return 5
  if (n <= 5) return 3
  return 2
}

// ---------- 실제 도로 이동거리 기반 재선정 (선택 기능) ----------
// 직선거리는 강·바다를 무시하므로, 상위 후보들에 한해 카카오모빌리티 길찾기 API로
// 실제 도로 거리/시간을 조회해 다시 점수를 매긴다.
// REST 키는 브라우저에 노출하면 안 되므로 Vercel 서버리스 함수(/api/directions)를 경유한다.
// 함수가 없거나(로컬 vite dev) 키가 미설정이면 조용히 건너뛰고 직선거리 결과를 쓴다.
async function roadRoute(from, to) {
  const url = `/api/directions?origin=${from.lng},${from.lat}&destination=${to.lng},${to.lat}`
  const r = await fetch(url)
  if (!r.ok) throw new Error('directions-unavailable')
  const d = await r.json()
  const route = d.routes && d.routes[0]
  if (!route || route.result_code !== 0) throw new Error('no-route')
  return { km: route.summary.distance / 1000, min: Math.round(route.summary.duration / 60) }
}

async function refineByRoadDistance(points, topCandidates) {
  const settled = await Promise.allSettled(
    topCandidates.map(async (s) => {
      const routes = await Promise.all(points.map((p) => roadRoute(p, s)))
      const dists = routes.map((r) => r.km)
      const mins = routes.map((r) => r.min)
      const max = Math.max(...dists)
      const min = Math.min(...dists)
      const total = dists.reduce((a, b) => a + b, 0)
      return { ...s, dists, mins, score: (max - min) * FAIRNESS_WEIGHT + total * DETOUR_WEIGHT }
    })
  )
  const refined = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value)
  if (refined.length === 0) throw new Error('directions-unavailable')
  refined.sort((a, b) => a.score - b.score)
  return refined[0]
}

async function findFairStation(points) {
  const { stations, kind } = await collectStationCandidates(points)
  if (stations.length === 0) return null

  const scored = scoreStations(points, stations)
  const topN = candidateCountFor(points.length)

  try {
    const best = await refineByRoadDistance(points, scored.slice(0, topN))
    return { ...best, kind, distMode: 'road' }
  } catch {
    // 도로거리 API가 없거나(로컬 vite dev) 실패하면 직선거리로 폴백하는데,
    // scored[0]에는 mins(소요시간) 필드가 없다. 렌더링에서 항상 result.mins[i]로
    // 배열 인덱싱하므로, 여기서 undefined 배열을 채워주지 않으면
    // "undefined[i]" 예외가 터져 React 트리 전체가 검은 화면으로 죽는다.
    return { ...scored[0], kind, distMode: 'line', mins: points.map(() => undefined) }
  }
}

function reverseGeocode(lat, lng) {
  return new Promise((resolve) => {
    const geocoder = new window.kakao.maps.services.Geocoder()
    geocoder.coord2Address(lng, lat, (data, status) => {
      const K = window.kakao.maps.services.Status
      if (status === K.OK && data[0]) {
        const region = data[0].address
        resolve(region ? `${region.region_2depth_name} ${region.region_3depth_name}` : null)
      } else {
        resolve(null)
      }
    })
  })
}

function kakaoDirectionsLink(name, lat, lng) {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`
}

// ---------- 참가자(stops) 상태 도우미 ----------
function randomId() {
  return Math.random().toString(36).slice(2, 9)
}
function emptyStop() {
  return { id: randomId(), name: '', addr: '', sel: null }
}

// 공유 링크 포맷: ?stops=이름,주소,위도,경도|이름,주소,위도,경도|...
// 이름/주소는 encodeURIComponent로 인코딩되어 쉼표(,)나 파이프(|)가 안전하게 이스케이프된다.
function encodeStopsParam(stops, points) {
  return stops
    .map((s, i) => {
      const p = points[i]
      return [encodeURIComponent(s.name || ''), encodeURIComponent(s.addr), p.lat, p.lng].join(',')
    })
    .join('|')
}
function parseStopsParam(raw) {
  if (!raw) return null
  try {
    const stops = raw.split('|').map((chunk) => {
      const parts = chunk.split(',')
      if (parts.length < 4) return null
      const [name, addr, lat, lng] = parts
      const latN = parseFloat(lat)
      const lngN = parseFloat(lng)
      const decodedAddr = decodeURIComponent(addr)
      if (!decodedAddr || Number.isNaN(latN) || Number.isNaN(lngN)) return null
      return {
        id: randomId(),
        name: decodeURIComponent(name),
        addr: decodedAddr,
        sel: { lat: latN, lng: lngN, name: decodedAddr, addr: decodedAddr },
      }
    })
    if (stops.some((s) => !s)) return null
    return stops.length >= MIN_STOPS ? stops.slice(0, MAX_STOPS) : null
  } catch {
    return null
  }
}

// ---------- Debounce hook ----------
function useDebouncedCallback(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

// ---------- Stop input with autocomplete ----------
function StopInput({ index, stop, color, canRemove, disabled, onChange, onRemove, example }) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)

  const runSearch = useDebouncedCallback(async (q) => {
    if (!q || q.trim().length < 2 || !window.kakao?.maps) {
      setSuggestions([])
      return
    }
    setSearching(true)
    try {
      const data = await keywordSearch(q)
      setSuggestions(data.slice(0, 6))
      setOpen(true)
    } catch {
      setSuggestions([])
    } finally {
      setSearching(false)
    }
  }, 350)

  const handleChange = (e) => {
    const v = e.target.value
    onChange({ addr: v, sel: null }) // invalidate previous selection until re-picked
    runSearch(v)
  }

  const pick = (place) => {
    onChange({
      addr: place.place_name,
      sel: {
        lat: parseFloat(place.y),
        lng: parseFloat(place.x),
        name: place.place_name,
        addr: place.road_address_name || place.address_name,
      },
    })
    setOpen(false)
    setSuggestions([])
  }

  return (
    <div className="stop" style={{ '--stop-color': color }}>
      <div className="stop-header">
        <span className="stop-tag">친구{index + 1}</span>
        {stop.sel && <span className="stop-check">✓ 선택됨</span>}
        {canRemove && (
          <button type="button" className="stop-remove" onClick={onRemove} disabled={disabled} aria-label="삭제">✕</button>
        )}
      </div>
      <input
        data-name
        placeholder="이름 (선택)"
        value={stop.name}
        disabled={disabled}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <div className="autocomplete-wrap">
        <input
          data-addr
          placeholder={example}
          value={stop.addr}
          disabled={disabled}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
        />
        {open && suggestions.length > 0 && (
          <ul className="suggestions">
            {suggestions.map((p) => (
              <li key={p.id} className="suggestion-item" onMouseDown={() => pick(p)}>
                <span className="sg-name">{p.place_name}</span>
                <span className="sg-addr">{p.road_address_name || p.address_name}</span>
              </li>
            ))}
          </ul>
        )}
        {searching && <div className="autocomplete-loading">검색 중…</div>}
      </div>
    </div>
  )
}

export default function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const initialStops = useMemo(() => parseStopsParam(params.get('stops')), [params])

  const [stops, setStops] = useState(() => initialStops || [emptyStop(), emptyStop()])

  const [kakaoStatus, setKakaoStatus] = useState(KAKAO_KEY ? 'loading' : 'no-key') // loading | ready | no-key | failed
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorType, setErrorType] = useState('') // no-key | not-found | network
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const [mapError, setMapError] = useState('')

  const mapRef = useRef(null)
  const mapObjRef = useRef(null)
  const searchIdRef = useRef(0) // 겹쳐서 실행된 이전 검색의 응답이 최신 상태를 덮어쓰지 않도록 막는 토큰

  useEffect(() => {
    loadKakaoSdk()
      .then(() => setKakaoStatus('ready'))
      .catch((e) => setKakaoStatus(e.message === 'no-key' ? 'no-key' : 'failed'))
  }, [])

  const updateStop = useCallback((id, patch) => {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  const addStop = useCallback(() => {
    setStops((prev) => (prev.length >= MAX_STOPS ? prev : [...prev, emptyStop()]))
  }, [])

  const removeStop = useCallback((id) => {
    setStops((prev) => (prev.length <= MIN_STOPS ? prev : prev.filter((s) => s.id !== id)))
  }, [])

  const resolvePoint = useCallback(async (addr, selected) => {
    if (selected && selected.name === addr) {
      return { lat: selected.lat, lng: selected.lng, display: selected.addr || selected.name }
    }
    const data = await keywordSearch(addr)
    if (!data || data.length === 0) return null
    const p = data[0]
    return { lat: parseFloat(p.y), lng: parseFloat(p.x), display: p.road_address_name || p.address_name || p.place_name }
  }, [])

  const runSearch = useCallback(async () => {
    if (kakaoStatus === 'no-key') {
      setError('카카오맵 API 키가 설정되지 않았어요. .env 파일의 VITE_KAKAO_MAP_KEY를 확인해주세요.')
      setErrorType('no-key')
      return
    }
    if (kakaoStatus === 'failed') {
      setError('카카오맵을 불러오지 못했어요. 네트워크 연결을 확인해주세요.')
      setErrorType('network')
      return
    }
    if (stops.some((s) => !s.addr.trim())) {
      setError('모든 친구의 출발지를 입력해주세요.')
      setErrorType('')
      return
    }
    setLoading(true)
    setError('')
    setErrorType('')
    setResult(null)
    setMapError('')
    const myId = ++searchIdRef.current
    const isStale = () => myId !== searchIdRef.current
    try {
      const points = await Promise.all(stops.map((s) => resolvePoint(s.addr, s.sel)))
      if (isStale()) return
      const missingIdx = points.findIndex((p) => !p)
      if (missingIdx !== -1) {
        setError(`"${stops[missingIdx].addr}" 위치를 찾을 수 없어요. 검색창에 뜨는 후보 중에서 선택해보세요.`)
        setErrorType('not-found')
        setLoading(false)
        return
      }

      const centroid = centroidOf(points)

      let station = null
      try {
        station = await findFairStation(points)
      } catch {
        station = null
      }
      if (isStale()) return

      const isStation = !!station
      const mid = isStation ? { lat: station.lat, lng: station.lng } : centroid

      // 좌표가 계산되지 않는(NaN) 이상 상태면 지도가 빈 화면으로 남지 않도록 여기서 걸러낸다.
      if (!Number.isFinite(mid.lat) || !Number.isFinite(mid.lng)) {
        setError('중간지점 좌표를 계산하지 못했어요. 출발지를 다시 선택해주세요.')
        setErrorType('not-found')
        setLoading(false)
        return
      }

      let places = []
      let midName = null
      try {
        [places, midName] = await Promise.all([
          fetchNearbyPlaces(mid.lat, mid.lng),
          isStation ? Promise.resolve(null) : reverseGeocode(mid.lat, mid.lng),
        ])
      } catch {
        places = []
      }
      if (isStale()) return

      // 기준역 자체가 "주변 역" 추천 목록에 중복으로 뜨지 않도록 제외
      if (isStation) {
        places = places.filter((p) => !(p.cat === 'transit' && p.name === station.name && p.dist < 80))
      }

      setResult({
        points,
        names: stops.map((s, i) => s.name || `친구${i + 1}`),
        mid,
        isStation,
        stationKind: isStation ? station.kind : null,   // subway | train | bus
        distMode: isStation ? station.distMode : 'line', // road = 실제 도로거리, line = 직선거리
        dists: isStation ? station.dists : points.map((p) => haversineKm(p, mid)),
        mins: isStation ? (station.mins || points.map(() => undefined)) : points.map(() => undefined),
        midName: isStation ? station.name : (midName || '중간지점'),
        places,
      })
    } catch (e) {
      if (isStale()) return
      setError('카카오 API 요청에 실패했어요. 네트워크 상태를 확인하고 다시 시도해주세요.')
      setErrorType('network')
    } finally {
      if (!isStale()) setLoading(false)
    }
  }, [stops, kakaoStatus, resolvePoint])

  useEffect(() => {
    if (initialStops) runSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoStatus])

  // ---- Render kakao map whenever result changes ----
  useEffect(() => {
    if (!result || !mapRef.current) return
    if (!window.kakao?.maps?.Map) {
      // SDK 스크립트는 로드됐지만 지도 생성자를 못 쓰는 상태(도메인 미등록/키 오류 등)
      // → 검은 빈 화면 대신 안내 메시지를 보여준다.
      setMapError('지도를 불러오지 못했어요. 카카오 개발자 콘솔의 Web 플랫폼 도메인 등록과 API 키를 확인해주세요.')
      return
    }
    try {
      const kakao = window.kakao
      const center = new kakao.maps.LatLng(result.mid.lat, result.mid.lng)
      const map = new kakao.maps.Map(mapRef.current, { center, level: 6 })
      mapObjRef.current = map

      const bounds = new kakao.maps.LatLngBounds()

      const addMarker = (lat, lng, color, label) => {
        const pos = new kakao.maps.LatLng(lat, lng)
        bounds.extend(pos)
        const content = document.createElement('div')
        content.style.cssText = `width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #12151A;box-shadow:0 0 0 2px ${color}55;`
        new kakao.maps.CustomOverlay({ map, position: pos, content, yAnchor: 0.5 })
        if (label) {
          new kakao.maps.CustomOverlay({
            map, position: pos, yAnchor: 2.1,
            content: `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px;background:#1B1F27;color:#EDEDE5;border:1px solid #2E3440;padding:3px 8px;border-radius:5px;white-space:nowrap;">${label}</div>`,
          })
        }
      }

      result.points.forEach((p, i) => {
        const color = PALETTE[i % PALETTE.length]
        addMarker(p.lat, p.lng, color, result.names[i])
      })

      const midPos = new kakao.maps.LatLng(result.mid.lat, result.mid.lng)
      bounds.extend(midPos)
      const midContent = document.createElement('div')
      midContent.style.cssText = 'width:22px;height:22px;border-radius:50%;background:#F2C94C;border:3px solid #12151A;box-shadow:0 0 0 4px #F2C94C33;'
      new kakao.maps.CustomOverlay({ map, position: midPos, content: midContent, yAnchor: 0.5 })
      new kakao.maps.CustomOverlay({
        map, position: midPos, yAnchor: 2.3,
        content: `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;background:#F2C94C;color:#12151A;border:1px solid #12151A;padding:3px 8px;border-radius:5px;white-space:nowrap;">${result.isStation ? (result.stationKind === 'subway' ? '🚇 ' : result.stationKind === 'train' ? '🚆 ' : '🚌 ') : ''}${result.midName}</div>`,
      })

      result.points.forEach((p, i) => {
        const color = PALETTE[i % PALETTE.length]
        new kakao.maps.Polyline({
          map, path: [new kakao.maps.LatLng(p.lat, p.lng), midPos],
          strokeWeight: 2, strokeColor: color, strokeStyle: 'shortdash',
        })
      })

      result.places.forEach((p) => {
        const color = p.cat === 'cafe' ? '#4EC9B0' : p.cat === 'transit' ? '#F2C94C' : '#FF6B4A'
        const pos = new kakao.maps.LatLng(p.lat, p.lng)
        const content = document.createElement('div')
        content.style.cssText = `width:10px;height:10px;border-radius:50%;background:${color};border:1.5px solid #12151A;`
        new kakao.maps.CustomOverlay({ map, position: pos, content, yAnchor: 0.5 })
      })

      map.setBounds(bounds, 60, 60, 60, 60)
    } catch (e) {
      setMapError('지도를 표시하는 중 오류가 발생했어요. 새로고침 후 다시 시도해주세요.')
    }
  }, [result])

  const shareLink = () => {
    if (!result) return
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('stops', encodeStopsParam(stops, result.points))
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">중간<span>에서</span></div>
        <div className="tagline">하나의 공평한 지점</div>
      </header>

      <main className="main">
        <section className="panel">
          <div className="board-label">
            출발지 입력
            <span className="stop-count">{stops.length}/{MAX_STOPS}</span>
          </div>

          <div className={`stops-list ${loading ? 'is-loading' : ''}`}>
            {stops.map((stop, i) => (
              <StopInput
                key={stop.id}
                index={i}
                stop={stop}
                color={PALETTE[i % PALETTE.length]}
                canRemove={stops.length > MIN_STOPS}
                disabled={loading}
                onChange={(patch) => updateStop(stop.id, patch)}
                onRemove={() => removeStop(stop.id)}
                example={EXAMPLES[i % EXAMPLES.length]}
              />
            ))}

            {stops.length < MAX_STOPS && (
              <button type="button" className="add-stop-btn" onClick={addStop} disabled={loading}>
                + 친구 추가
              </button>
            )}
          </div>

          <button className={`find-btn ${loading ? 'is-loading' : ''}`} onClick={runSearch} disabled={loading}>
            {loading ? '중간지점 계산 중' : '중간지점 찾기'}
          </button>
          <div className={`status-line ${error ? 'error' : ''}`}>
            {error || (loading ? '주소 확인 → 중간지점 계산 → 주변 장소 탐색' : kakaoStatus === 'loading' ? '카카오맵 불러오는 중…' : '검색창에 뜨는 후보를 선택하면 더 정확해요')}
          </div>

          {result && (
            <div className="result-reveal">
              <div className="divider" />
              <div className="result-head">{result.isStation ? '가장 공평한 기준 거점' : '추천 중간지점'}</div>
              <div className="midpoint-card">
                <p className="midpoint-name">
                  {result.isStation && (result.stationKind === 'subway' ? '🚇 ' : result.stationKind === 'train' ? '🚆 ' : '🚌 ')}
                  {result.midName}
                </p>
                <div className="midpoint-meta">
                  {result.points.map((p, i) => (
                    <span key={i}>
                      {result.names[i]}로부터 {result.dists[i].toFixed(1)}km
                      {result.mins[i] != null && ` · 차로 약 ${result.mins[i]}분`}
                    </span>
                  ))}
                </div>
                {result.isStation && (
                  <p className="midpoint-fairness">
                    {result.distMode === 'road' ? '실제 도로 이동거리 기준' : '직선거리 기준'} 최대·최소 차이 {(Math.max(...result.dists) - Math.min(...result.dists)).toFixed(1)}km
                    {' · '}기하학적 중간점 대신 실제로 갈 수 있는 교통 거점을 골랐어요
                  </p>
                )}
                {!result.isStation && (
                  <p className="midpoint-fairness midpoint-fairness-warn">
                    경로 주변에서 지하철역·기차역·버스터미널을 찾지 못해 기하학적 중심점을 사용했어요.
                  </p>
                )}
              </div>
              <button className="share-btn" onClick={shareLink}>
                {copied ? '링크가 복사됐어요 ✓' : '결과 링크 공유하기'}
              </button>

              <div className="divider" />
              <div className="result-head">주변 만남 장소 ({result.places.length})</div>
              <ul className="places-list">
                {result.places.length === 0 && (
                  <li className="status-line">반경 내 장소를 찾지 못했어요.</li>
                )}
                {result.places.map((p) => (
                  <li className="place-item" key={p.id}>
                    <span className="place-cat" data-cat={p.cat}>{CAT_LABEL[p.cat]}</span>
                    <span className="place-name">{p.name}</span>
                    <span className="place-dist">{Math.round(p.dist)}m</span>
                    <a
                      className="place-go"
                      href={kakaoDirectionsLink(p.name, p.lat, p.lng)}
                      target="_blank" rel="noreferrer"
                    >길찾기</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="map-wrap">
          {!result && (
            <div className="map-empty">
              <svg className="route-svg-hint" viewBox="0 0 160 60" fill="none">
                <circle cx="16" cy="14" r="6" fill="#FF6B4A" />
                <circle cx="144" cy="46" r="6" fill="#4EC9B0" />
                <circle cx="80" cy="30" r="8" fill="#F2C94C" />
                <path d="M16 14 L80 30" stroke="#FF6B4A" strokeWidth="1.5" strokeDasharray="4 4" />
                <path d="M144 46 L80 30" stroke="#4EC9B0" strokeWidth="1.5" strokeDasharray="4 4" />
              </svg>
              <span>
                {kakaoStatus === 'no-key'
                  ? <>카카오맵 API 키가 없어요.<br />.env에 VITE_KAKAO_MAP_KEY를 설정해주세요.</>
                  : <>출발지를 입력하면<br />지도에 경로와 중간지점이 표시돼요</>}
              </span>
            </div>
          )}
          {result && mapError && (
            <div className="map-empty">
              <span>{mapError}</span>
            </div>
          )}
          {result && <div ref={mapRef} style={{ width: '100%', height: '100%', display: mapError ? 'none' : 'block' }} />}
        </section>
      </main>

      <footer className="footer-note">
        <span>중간에서 · 지도 데이터 Kakao Map</span>
        <span>주소 검색 · 주변장소 Kakao Local API</span>
      </footer>
    </div>
  )
}
