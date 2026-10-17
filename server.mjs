import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { ROOT, places, traffic, weather, zoneTraffic } from './lib/api.mjs';

const PORT = Number(process.env.PORT || 4173);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

// 작업 스케줄러가 쌓은 data/traffic-history.csv를 보드의 저녁 비교에 넘긴다.
async function collectedHistory() {
  const text = await readFile(join(ROOT, 'data', 'traffic-history.csv'), 'utf8').catch(() => '');
  const [header, ...lines] = text.split(/\r?\n/).filter(Boolean);
  if (!header) return [];
  const parse = (line) => [...line.matchAll(/"((?:[^"]|"")*)"|([^,]+)/g)].map((match) => (match[1] ?? match[2]).replace(/""/g, '"'));
  const keys = parse(header);
  return lines.map((line) => Object.fromEntries(parse(line).map((value, index) => [keys[index], value])));
}

async function routeApi(url, res) {
  try {
    if (url.pathname === '/api/traffic/history') {
      sendJson(res, 200, { source: '자동 수집 이력', rows: await collectedHistory() });
      return true;
    }
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
      const result = await places({ query: url.searchParams.get('query') || '음식점', x: url.searchParams.get('x'), y: url.searchParams.get('y'), radius: url.searchParams.get('radius') });
      sendJson(res, 200, { source: '카카오 장소 검색 API', fetchedAt: new Date().toISOString(), ...result });
      return true;
    }
    if (url.pathname === '/api/weather') {
      const result = await weather({ lat: url.searchParams.get('lat'), lon: url.searchParams.get('lon') });
      sendJson(res, 200, { source: 'Open-Meteo 기상 API', fetchedAt: new Date().toISOString(), ...result });
      return true;
    }
    if (url.pathname === '/api/traffic/zone') {
      const zone = url.searchParams.get('zone') || 'daehwa-kintex';
      if (zone !== 'daehwa-kintex') {
        sendJson(res, 501, { error: '이 권역의 교통 API는 아직 연결하지 않았습니다. 현재는 경기도 구간 소통 정보만 연결되어 있습니다.', source: '권역 교통 API' });
        return true;
      }
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
