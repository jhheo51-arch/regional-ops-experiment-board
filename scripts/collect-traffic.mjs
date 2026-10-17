// 대화동·킨텍스 주거권역 교통 소통 정보를 한 번 조회해 data/traffic-history.csv에 덧붙인다.
// Windows 작업 스케줄러가 매일 17:00~21:00 사이 30분마다 실행한다(scripts/register-collector.ps1).
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, weather, zoneTraffic } from '../lib/api.mjs';

const ZONE_LABEL = '대화동·킨텍스 주거권역 (고양)';
const CENTER = { lat: '37.6728', lon: '126.7468' };
const HISTORY_FILE = join(ROOT, 'data', 'traffic-history.csv');
const HEADERS = ['snapshotAt', 'hour', 'dayType', 'precipitation', 'zone', 'route', 'startNode', 'endNode', 'speed', 'delay', 'congestion', 'collDate', 'source'];

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

async function main() {
  const now = new Date();
  const [result, precipitation] = await Promise.all([
    zoneTraffic(),
    weather(CENTER).then((body) => body.current?.precipitation ?? '').catch(() => '')
  ]);
  const hour = now.getHours();
  const dayType = [0, 6].includes(now.getDay()) ? '주말' : '평일';
  const rows = result.links.map((item) => [
    now.toISOString(), hour, dayType, precipitation, ZONE_LABEL, item.routeNm, item.startNodeNm, item.endNodeNm,
    item.spd, item.linkDelayTime, item.congGrade, item.collDate, 'scheduled'
  ]);
  await mkdir(join(ROOT, 'data'), { recursive: true });
  const exists = await readFile(HISTORY_FILE, 'utf8').then(() => true).catch(() => false);
  const lines = rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
  await appendFile(HISTORY_FILE, (exists ? '' : HEADERS.join(',') + '\n') + lines, 'utf8');
  console.log(`${now.toISOString()} ${rows.length}개 구간 저장, 평균 ${result.summary.avgSpeed}km/h, 강수 ${precipitation}mm`);
}

main().catch((error) => {
  console.error(`${new Date().toISOString()} 수집 실패: ${error.message}`);
  process.exitCode = 1;
});
