import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const ENV = await readEnv(join(ROOT, '.env'));
const TRAFFIC_KEY = ENV.GYEONGGI_TRAFFIC_API_KEY;
const KAKAO_KEY = ENV.KAKAO_REST_API_KEY;
const TRAFFIC_BASE = 'https://openapigits.gg.go.kr/api/rest';
const KAKAO_BASE = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast';
const ZONE_ROUTES = [
  { routeId: '1070000021', routeNm: '중앙로/수색로', keywords: ['대화', '고양종합운동장', '일산서구청', '장성교'] },
  { routeId: '1050000985', routeNm: '고양대로/서오릉로', keywords: ['대화', '법곳', '이산포'] },
  { routeId: '1050003571', routeNm: '제2 자유로', keywords: ['대화', '킨텍스', '법곳'] },
  { routeId: '1050000231', routeNm: '자유로', keywords: ['킨텍스', '이산포', '멱절교'] }
];

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

async function readEnv(path) {
  const text = await readFile(path, 'utf8').catch(() => '');
  return Object.fromEntries(text.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
    const index = line.indexOf('=');
    return index === -1 ? [line.trim(), ''] : [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function xmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
}

function xmlItems(xml) {
  return [...xml.matchAll(/<(?:item|itemList)>([\s\S]*?)<\/(?:item|itemList)>/gi)].map((match) => {
    const item = {};
    for (const tag of ['roadRank', 'routeId', 'routeNm', 'routeNo', 'routeTp', 'routeWay', 'routeSeq', 'linkId', 'startNodeId', 'startNodeNm', 'endNodeId', 'endNodeNm', 'linkLength', 'collDate', 'spd', 'vol', 'trvlTime', 'linkDelayTime', 'congGrade']) {
      const value = xmlValue(match[1], tag);
      if (value !== null) item[tag] = value;
    }
    return item;
  });
}

async function traffic(path, params = {}) {
  if (!TRAFFIC_KEY) throw new Error('GYEONGGI_TRAFFIC_API_KEY가 비어 있습니다.');
  const url = new URL(`${TRAFFIC_BASE}/${path}`);
  url.searchParams.set('serviceKey', TRAFFIC_KEY);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  const response = await fetch(url);
  const xml = await response.text();
  if (!response.ok) throw new Error(`경기도 교통 API HTTP ${response.status}`);
  return {
    headerCd: xmlValue(xml, 'headerCd'),
    headerMsg: xmlValue(xml, 'headerMsg'),
    itemCount: xmlValue(xml, 'itemCount'),
    items: xmlItems(xml)
  };
}

async function places(params = {}) {
  if (!KAKAO_KEY) throw new Error('KAKAO_REST_API_KEY가 비어 있습니다.');
  const url = new URL(KAKAO_BASE);
  url.searchParams.set('query', params.query || '킨텍스 음식점');
  if (params.x) url.searchParams.set('x', params.x);
  if (params.y) url.searchParams.set('y', params.y);
  if (params.radius) url.searchParams.set('radius', params.radius);
  const response = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || `카카오 API HTTP ${response.status}`);
  return body;
}

async function weather(params = {}) {
  const url = new URL(WEATHER_BASE);
  url.searchParams.set('latitude', params.lat || '37.6672');
  url.searchParams.set('longitude', params.lon || '126.7468');
  url.searchParams.set('current', 'temperature_2m,precipitation,wind_speed_10m');
  url.searchParams.set('timezone', 'Asia/Seoul');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`기상 API HTTP ${response.status}`);
  return response.json();
}

async function zoneTraffic() {
  const links = [];
  for (const route of ZONE_ROUTES) {
    const result = await traffic('getRoadLinkTrafficInfoList', { routeId: route.routeId });
    for (const item of result.items) {
      const nodes = `${item.startNodeNm || ''} ${item.endNodeNm || ''}`;
      if (route.keywords.some((keyword) => nodes.includes(keyword))) links.push({ ...item, routeNm: route.routeNm });
    }
  }
  const selected = links.slice(0, 20);
  const segments = [];
  for (const link of selected) {
    const result = await traffic('getRoadLinkTrafficInfo', { linkId: link.linkId });
    segments.push({ ...link, ...(result.items[0] || {}) });
  }
  const speeds = segments.map((item) => Number(item.spd)).filter(Number.isFinite);
  const delays = segments.map((item) => Number(item.linkDelayTime)).filter(Number.isFinite);
  return {
    routes: ZONE_ROUTES.map(({ routeId, routeNm }) => ({ routeId, routeNm })),
    links: segments,
    summary: {
      linkCount: segments.length,
      avgSpeed: speeds.length ? Math.round(speeds.reduce((sum, value) => sum + value, 0) / speeds.length) : null,
      avgDelay: delays.length ? Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length) : null,
      congestion: segments.reduce((result, item) => { result[item.congGrade || 'unknown'] = (result[item.congGrade || 'unknown'] || 0) + 1; return result; }, {})
    }
  };
}

async function routeApi(url, res) {
  try {
    if (url.pathname === '/api/traffic/roads') {
      sendJson(res, 200, { source: '경기도 교통정보센터', fetchedAt: new Date().toISOString(), ...(await traffic('getRoadInfoList')) });
      return true;
    }
    if (url.pathname === '/api/traffic/links') {
      sendJson(res, 200, { source: '경기도 교통정보센터', fetchedAt: new Date().toISOString(), ...(await traffic('getRoadLinkTrafficInfoList', { routeId: url.searchParams.get('routeId') })) });
      return true;
    }
    if (url.pathname === '/api/traffic/segment') {
      sendJson(res, 200, { source: '경기도 교통정보센터', fetchedAt: new Date().toISOString(), ...(await traffic('getRoadLinkTrafficInfo', { linkId: url.searchParams.get('linkId') })) });
      return true;
    }
    if (url.pathname === '/api/places') {
      const result = await places({ query: url.searchParams.get('query') || '킨텍스 음식점', x: url.searchParams.get('x'), y: url.searchParams.get('y'), radius: url.searchParams.get('radius') });
      sendJson(res, 200, { source: '카카오 장소 검색 API', fetchedAt: new Date().toISOString(), ...result });
      return true;
    }
    if (url.pathname === '/api/weather') {
      const result = await weather({ lat: url.searchParams.get('lat'), lon: url.searchParams.get('lon') });
      sendJson(res, 200, { source: 'Open-Meteo 기상 API', fetchedAt: new Date().toISOString(), ...result });
      return true;
    }
    if (url.pathname === '/api/traffic/zone') {
      sendJson(res, 200, { source: '경기도 교통정보센터', fetchedAt: new Date().toISOString(), ...(await zoneTraffic()) });
      return true;
    }
    return false;
  } catch (error) {
    const source = url.pathname === '/api/places' ? '카카오 장소 검색 API' : url.pathname === '/api/weather' ? 'Open-Meteo 기상 API' : '경기도 교통정보센터';
    sendJson(res, 502, { error: error.message, source });
    return true;
  }
}

async function serveStatic(url, res) {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = normalize(join(ROOT, requested));
  if (!file.startsWith(ROOT)) return sendJson(res, 403, { error: '허용되지 않은 경로입니다.' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': contentTypes[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: '파일을 찾을 수 없습니다.' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    const handled = await routeApi(url, res);
    if (handled) return;
  }
  await serveStatic(url, res);
});

server.listen(PORT, () => console.log(`운영 보드 서버: http://localhost:${PORT}`));
