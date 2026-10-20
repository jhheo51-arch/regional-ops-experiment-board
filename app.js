// 권역은 설정만 바꿔 끼운다. 판단 흐름(사건 → 신호 → 가설 → 조치 → 결과)은 권역과 무관하다.
// 선정 기준은 주거 수요다. 대단지 주거지와 역세권 상업지가 붙어 있어 저녁 피크 주문이 몰리는 권역을 고른다.
const ZONES = {
  'daehwa-kintex': {
    label: '대화동·킨텍스 주거권역 (고양)',
    idPrefix: 'DAEHWAKINTEX',
    name: '대화동',
    axis: '대화역 상업지와 주변 단지',
    population: '대화동 51,885명 · 23,248세대 · 1인 세대 36.4% (2026년 6월 주민등록)',
    center: [37.6728, 126.7468],
    points: [[37.6762, 126.7471, '대화역 상업지'], [37.6730, 126.7477, '장성마을 단지'], [37.6692, 126.7456, '킨텍스 일대 주상복합·상업지']],
    trafficSource: '경기도 구간 소통 정보',
    trafficReady: true
  },
  'daegu-wolbae': {
    label: '상인·월배·진천 주거권역 (대구 달서구)',
    idPrefix: 'DAEGUWOLBAE',
    name: '상인·월성·진천',
    axis: '상인역–진천역 상업지와 주변 단지',
    population: '상인동 58,139명(1인 세대 38.5%) · 월성동 52,297명(28.8%) · 진천동 30,134명(34.3%) (2026년 6월 주민등록)',
    center: [35.8205, 128.5280],
    points: [[35.8190, 128.5378, '상인역'], [35.8162, 128.5304, '월배역'], [35.8139, 128.5227, '진천역'], [35.8288, 128.5155, '월성동 단지']],
    trafficSource: '대구 교통 공개 데이터',
    trafficReady: false
  }
};

const actions = [
  { title: '피크 시간 라이더 공급 협의', desc: '협력사와 18~20시 출근 인원과 시작 시각을 조정', score: '비용 높음' },
  { title: '매장 조리 예상 시간 보정', desc: '픽업 대기가 긴 매장의 피크 조리 시간을 현실화', score: '비용 낮음' },
  { title: '단지 출입 동선 안내', desc: '관리사무소와 라이더 진입·거치 위치를 협의해 안내', score: '효과 확인 필요' },
  { title: '원거리 배달 범위 임시 조정', desc: '비 오는 피크에 상업지에서 먼 단지의 반경을 제한', score: '부작용 주의' }
];

const $ = (selector) => document.querySelector(selector);
const TRAFFIC_HISTORY_KEY = 'ilsan-traffic-history';
const INCIDENTS_KEY = 'ilsan-ops-incidents';
let zoneMap;
let zoneLayer;
let hypotheses = [];
let initialOrder = '';

function currentZone() {
  return ZONES[$('#zoneSelect').value] || ZONES['daehwa-kintex'];
}

function buildHypotheses(zone) {
  return [
    { title: '저녁 피크 주문이 라이더 공급보다 빨리 늘어남', detail: '시간대별 가상 주문 수와 배차 대기를 대조하고, 매장 앞에 대기 라이더가 있는지 확인하세요.', evidence: '반대 증거: 매장 앞에 라이더가 대기 중인데도 지연', priority: 1 },
    { title: '일부 매장의 조리·픽업이 먼저 포화됨', detail: `${zone.axis} 가운데 픽업 대기가 긴 매장을 현장에서 확인하세요.`, evidence: '반대 증거: 여러 매장의 픽업 대기가 짧음', priority: 2 },
    { title: '상업지에서 먼 단지로 가는 이동 시간이 늘어남', detail: '음식점 분포와 단지까지 거리, 도로 지체와 강수를 함께 확인하세요.', evidence: '반대 증거: 가까운 단지 주문도 똑같이 지연', priority: 3 },
    { title: '대단지 안 라스트마일에서 시간이 걸림', detail: '단지 출입 통제, 지하주차장 진입 제한, 엘리베이터 대기를 현장에서 확인하세요.', evidence: '반대 증거: 소규모·저층 건물 주문도 똑같이 지연', priority: 4 }
  ];
}

function hypothesisOrder() {
  return hypotheses.map((item) => item.title).join(' > ');
}

function incidentId(zone) {
  const date = ($('#observeDate').value || '').replace(/-/g, '');
  return `${zone.idPrefix}-${date}-001`;
}

function applyZone() {
  const zone = currentZone();
  hypotheses = buildHypotheses(zone);
  initialOrder = hypothesisOrder();
  $('#hypothesisReason').value = '';
  renderHypotheses();
  $('#incidentId').textContent = incidentId(zone);
  document.querySelectorAll('[data-name]').forEach((node) => { node.textContent = zone.name; });
  document.querySelectorAll('[data-axis]').forEach((node) => { node.textContent = zone.axis; });
  $('#zonePopulation').textContent = zone.population;
  $('#trafficSourceName').textContent = zone.trafficSource;
  $('#trafficSourceDetail').textContent = zone.trafficReady ? '승인 대기 후 도로 구간 속도 조회' : '아직 연결하지 않음. 구간 단위 데이터 제공 여부 확인 필요';
  $('#trafficSourceState').textContent = zone.trafficReady ? '승인 대기' : '미연결';
  $('#placesSourceDetail').textContent = `${zone.name} 권역 반경 3km 음식점 수와 위치 조회`;
  $('#zoneTrafficTable').innerHTML = `<span>교통 API 확인을 누르면 ${escapeHtml(zone.axis)} 주변 구간을 표시합니다.</span>`;
  drawZoneMap(zone);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function renderChart() {
  const values = [
    [35, 28], [48, 39], [72, 78], [66, 69], [40, 35]
  ];
  // 고정 예시 패턴이다. API 응답이 아니므로 화면 범례와 캡션에 예시값임을 표시한다.
  $('#signalChart').innerHTML = values.map(([real, virtual]) => `<div class="bar-group"><span class="bar real" style="height:${real}%" title="외부 신호 예시 ${real}"></span><span class="bar virtual" style="height:${virtual}%" title="가상 운영 ${virtual}"></span></div>`).join('');
}

function renderHypotheses() {
  $('#hypothesisList').innerHTML = hypotheses.map((item, index) => `
    <div class="hypothesis-item ${index === 0 ? 'active' : ''}">
      <span class="priority">0${item.priority}</span>
      <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p><span class="evidence-tag">${escapeHtml(item.evidence)}</span></div>
      <button type="button" data-move="${index}">${index === 0 ? '1순위' : '우선'}</button>
    </div>`).join('');
  document.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => {
    const selected = Number(button.dataset.move);
    const [item] = hypotheses.splice(selected, 1);
    hypotheses.unshift(item);
    hypotheses.forEach((entry, index) => { entry.priority = index + 1; });
    renderHypotheses();
    $('#hypothesisReason').focus();
    showToast('가설 우선순위를 변경했습니다. 아래에 변경 이유를 적어 주세요.');
  }));
}

function renderActions() {
  $('#actionTable').innerHTML = actions.map((item) => `<div class="action-row"><div><strong>${item.title}</strong><small>${item.desc}</small></div><span class="action-score">${item.score}</span></div>`).join('');
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function saveIncident() {
  const currentOrder = hypothesisOrder();
  const reason = $('#hypothesisReason').value.trim();
  if (currentOrder !== initialOrder && !reason) {
    $('#hypothesisReason').focus();
    showToast('가설 우선순위를 바꿨다면 변경 이유를 먼저 적어 주세요.');
    return;
  }
  const record = {
    id: $('#incidentId').textContent,
    date: $('#observeDate').value,
    zone: currentZone().label,
    hypothesisBefore: initialOrder,
    hypothesisAfter: currentOrder,
    hypothesisReason: reason,
    fact: $('#fieldFact').value,
    constraint: $('#stakeholderConstraint').value,
    action: $('#selectedAction').value,
    decision: $('#decisionSelect').value,
    decisionNote: $('#decisionNote').value,
    beforeDelay: $('#beforeDelay').value,
    afterDelay: $('#afterDelay').value,
    actionCost: $('#actionCost').value,
    savedAt: new Date().toISOString()
  };
  const records = JSON.parse(localStorage.getItem(INCIDENTS_KEY) || '[]');
  records.push(record);
  localStorage.setItem(INCIDENTS_KEY, JSON.stringify(records));
  $('#savedCount').textContent = `${records.length}건`;
  updateHistoryCounts();
  showToast('사건 기록을 저장했습니다. 운영값과 가상값은 기록 기준을 확인해 주세요.');
}

function loadCount() {
  const records = JSON.parse(localStorage.getItem(INCIDENTS_KEY) || '[]');
  $('#savedCount').textContent = `${records.length}건`;
  updateHistoryCounts();
}

let collectedTrafficRows = [];

// 작업 스케줄러가 30분마다 쌓은 data/traffic-history.csv를 불러와 브라우저 이력과 함께 비교한다.
async function loadCollectedHistory() {
  try {
    const result = await fetch('/api/traffic/history').then((response) => response.json());
    collectedTrafficRows = result.rows || [];
  } catch {
    collectedTrafficRows = [];
  }
  updateHistoryCounts();
}

function updateHistoryCounts() {
  const incidents = JSON.parse(localStorage.getItem(INCIDENTS_KEY) || '[]');
  const trafficRows = JSON.parse(localStorage.getItem(TRAFFIC_HISTORY_KEY) || '[]');
  $('#trafficHistoryCount').textContent = collectedTrafficRows.length ? `${trafficRows.length}건 + 자동 수집 ${collectedTrafficRows.length}건` : `${trafficRows.length}건`;
  $('#incidentHistoryCount').textContent = `${incidents.length}건`;
  renderTrafficCompare([...trafficRows, ...collectedTrafficRows]);
}

// 권역 평균 하나로 보지 않도록, 저녁 피크 조회만 골라 강수 여부별로 나눠 비교한다. 분모(조회 횟수)를 함께 보여 준다.
function renderTrafficCompare(rows) {
  const evening = rows.filter((row) => row.zone === currentZone().label && Number(row.hour) >= 17 && Number(row.hour) < 21);
  const group = (rain) => {
    const items = evening.filter((row) => (Number(row.precipitation) > 0) === rain && row.precipitation !== '' && row.precipitation != null);
    const snapshots = new Set(items.map((row) => row.snapshotAt)).size;
    const avg = (key) => items.length ? (items.reduce((sum, row) => sum + Number(row[key] || 0), 0) / items.length).toFixed(1) : '-';
    return { snapshots, speed: avg('speed') };
  };
  const rain = group(true);
  const dry = group(false);
  // 지체시간은 API가 항상 0초를 돌려줘 비교에서 뺀다(사례 #1 검산).
  $('#trafficCompare').textContent = rain.snapshots + dry.snapshots
    ? `저녁 17~21시 · 비: 조회 ${rain.snapshots}회, 평균 ${rain.speed}km/h / 맑음: 조회 ${dry.snapshots}회, 평균 ${dry.speed}km/h`
    : '저녁 17~21시 조회가 쌓이면 강수 여부별 평균 속도를 비교합니다.';
}

async function fetchPrecipitation() {
  try {
    const [lat, lon] = currentZone().center;
    const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    const result = await response.json();
    return result.current?.precipitation ?? '';
  } catch {
    return '';
  }
}

function saveTrafficHistory(result, precipitation) {
  const snapshotAt = result.fetchedAt || new Date().toISOString();
  const local = new Date(snapshotAt);
  const hour = Number.isNaN(local.getTime()) ? '' : local.getHours();
  const dayType = Number.isNaN(local.getTime()) ? '' : [0, 6].includes(local.getDay()) ? '주말' : '평일';
  const rows = (result.links || []).map((item) => ({ snapshotAt, hour, dayType, precipitation, zone: currentZone().label, route: item.routeNm || item.routeId, startNode: item.startNodeNm, endNode: item.endNodeNm, speed: item.spd, delay: item.linkDelayTime, congestion: item.congGrade }));
  const history = JSON.parse(localStorage.getItem(TRAFFIC_HISTORY_KEY) || '[]');
  localStorage.setItem(TRAFFIC_HISTORY_KEY, JSON.stringify([...history, ...rows].slice(-2000)));
  updateHistoryCounts();
}

async function checkTrafficApi() {
  const button = $('#checkTrafficApi');
  const icon = $('#trafficSourceIcon');
  const detail = $('#trafficSourceDetail');
  const state = $('#trafficSourceState');
  const zone = currentZone();
  button.disabled = true;
  button.textContent = '확인 중';
  try {
    const [response, precipitation] = await Promise.all([fetch('/api/traffic/zone?zone=' + encodeURIComponent($('#zoneSelect').value)), fetchPrecipitation()]);
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'API 응답을 확인할 수 없습니다.');
    const summary = result.summary || {};
    saveTrafficHistory(result, precipitation);
    icon.textContent = '✓';
    icon.className = 'source-icon ready';
    detail.textContent = `${zone.axis} 구간 ${summary.linkCount || 0}개, 평균 속도 ${summary.avgSpeed ?? '확인 전'} km/h, ${result.fetchedAt} 확인`;
    $('#zoneTrafficTable').innerHTML = `<table><thead><tr><th>노선</th><th>시작</th><th>종점</th><th>속도 km/h</th><th>지체 초(참고)</th><th>혼잡 등급(참고)</th></tr></thead><tbody>${(result.links || []).slice(0, 10).map((item) => `<tr><td>${escapeHtml(item.routeNm || item.routeId)}</td><td>${escapeHtml(item.startNodeNm)}</td><td>${escapeHtml(item.endNodeNm)}</td><td>${escapeHtml(item.spd)}</td><td>${escapeHtml(item.linkDelayTime)}</td><td>${escapeHtml(item.congGrade)}</td></tr>`).join('') || '<tr><td colspan="6">연결된 구간이 없습니다.</td></tr>'}</tbody></table>`;
    state.textContent = '연결됨';
    state.className = 'source-state';
    showToast('경기도 교통 API 응답을 확인했습니다.');
  } catch (error) {
    icon.textContent = '!';
    icon.className = 'source-icon pending';
    detail.textContent = !zone.trafficReady ? '이 권역의 교통 API는 아직 연결하지 않았습니다.' : error.message.includes('사용할 수 없는') ? '공개키 승인 후 다시 확인해 주세요.' : '서버를 실행한 뒤 다시 확인해 주세요.';
    state.textContent = zone.trafficReady ? '확인 필요' : '미연결';
    state.className = 'source-state pending-text';
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '교통 API 확인';
  }
}

function updateEffectSummary() {
  const before = Number($('#beforeDelay').value);
  const after = Number($('#afterDelay').value);
  const cost = Number($('#actionCost').value);
  const summary = $('#effectSummary');
  if (!(before > 0) || !(after >= 0)) {
    summary.textContent = '전후 값을 입력하면 효과를 계산합니다.';
    return;
  }
  const reduction = ((before - after) / before * 100).toFixed(1);
  summary.textContent = `지연시간 ${before}분 → ${after}분, ${reduction}% 변화${cost > 0 ? `, 실행 비용 ${cost.toLocaleString()}원` : ''}`;
}

function exportCsv() {
  const records = JSON.parse(localStorage.getItem(INCIDENTS_KEY) || '[]');
  const headers = ['id', 'date', 'zone', 'hypothesisBefore', 'hypothesisAfter', 'hypothesisReason', 'beforeDelay', 'afterDelay', 'actionCost', 'action', 'decision', 'decisionNote'];
  const csv = [headers.join(','), ...records.map((record) => headers.map((key) => `"${String(record[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'regional-ops-incidents.csv';
  link.click();
  URL.revokeObjectURL(url);
  showToast(`${records.length}건을 CSV로 내보냈습니다.`);
}

async function checkPlacesApi() {
  const button = $('#checkPlacesApi');
  const icon = $('#placesSourceIcon');
  const detail = $('#placesSourceDetail');
  const state = $('#placesSourceState');
  button.disabled = true;
  button.textContent = '확인 중';
  try {
    const zone = currentZone();
    const [lat, lon] = zone.center;
    const response = await fetch(`/api/places?query=${encodeURIComponent('음식점')}&x=${lon}&y=${lat}&radius=3000`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '카카오 API 응답을 확인할 수 없습니다.');
    icon.textContent = '✓';
    icon.className = 'source-icon ready';
    detail.textContent = `${zone.name} 권역 반경 3km 음식점 ${result.meta.total_count}건 검색, ${result.fetchedAt} 확인`;
    state.textContent = '연결됨';
    state.className = 'source-state';
    showToast('카카오 장소 검색 API 응답을 확인했습니다.');
  } catch (error) {
    icon.textContent = '!';
    icon.className = 'source-icon pending';
    detail.textContent = '서버와 카카오 앱 키 설정을 확인해 주세요.';
    state.textContent = '확인 필요';
    state.className = 'source-state pending-text';
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '장소 API 확인';
  }
}

async function checkWeatherApi() {
  const button = $('#checkWeatherApi');
  const icon = $('#weatherSourceIcon');
  const detail = $('#weatherSourceDetail');
  const state = $('#weatherSourceState');
  button.disabled = true;
  button.textContent = '확인 중';
  try {
    const [lat, lon] = currentZone().center;
    const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || '날씨 API 응답을 확인할 수 없습니다.');
    const current = result.current || {};
    icon.textContent = '✓';
    icon.className = 'source-icon ready';
    detail.textContent = `기온 ${current.temperature_2m ?? '-'}°C, 강수 ${current.precipitation ?? '-'}mm, 풍속 ${current.wind_speed_10m ?? '-'}km/h`;
    state.textContent = '연결됨';
    state.className = 'source-state';
    showToast('날씨 API 응답을 확인했습니다.');
  } catch (error) {
    icon.textContent = '!';
    icon.className = 'source-icon pending';
    detail.textContent = '날씨 API 응답을 확인해 주세요.';
    state.textContent = '확인 필요';
    state.className = 'source-state pending-text';
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '날씨 API 확인';
  }
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportTableauCsv() {
  const rows = [...JSON.parse(localStorage.getItem(TRAFFIC_HISTORY_KEY) || '[]'), ...collectedTrafficRows];
  if (!rows.length) {
    showToast('먼저 교통 API를 확인해 이력을 만드세요.');
    return;
  }
  downloadCsv('regional-ops-traffic-history.csv', ['snapshotAt', 'hour', 'dayType', 'precipitation', 'zone', 'route', 'startNode', 'endNode', 'speed', 'delay', 'congestion'], rows);
  showToast(`${rows.length}건의 태블로용 누적 데이터를 내보냈습니다.`);
}

function exportReport() {
  const report = window.open('', '_blank', 'noopener,noreferrer');
  if (!report) {
    showToast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.');
    return;
  }
  const before = $('#beforeDelay').value || '미입력';
  const after = $('#afterDelay').value || '미입력';
  const cost = $('#actionCost').value || '미입력';
  report.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>권역별 운영 실험 리포트</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;color:#202124;line-height:1.6}h1{font-size:28px}h2{margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:8px}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #eee;padding:10px}td:first-child{width:32%;color:#61706f;font-weight:bold}</style></head><body><h1>권역별 운영 실험 리포트</h1><p>권역: ${escapeHtml(currentZone().label)} / 관찰일: ${escapeHtml($('#observeDate').value)}</p><h2>가설 변경</h2><table><tr><td>처음 순서</td><td>${escapeHtml(initialOrder)}</td></tr><tr><td>현재 순서</td><td>${escapeHtml(hypothesisOrder())}</td></tr><tr><td>변경 이유</td><td>${escapeHtml($('#hypothesisReason').value || '변경 없음')}</td></tr></table><h2>현장 확인</h2><table><tr><td>관찰 사실</td><td>${escapeHtml($('#fieldFact').value || '미입력')}</td></tr><tr><td>관계자 제약</td><td>${escapeHtml($('#stakeholderConstraint').value || '미입력')}</td></tr><tr><td>선택한 조치</td><td>${escapeHtml($('#selectedAction').value || '미입력')}</td></tr></table><h2>실험 결과</h2><table><tr><td>조치 전 지연시간</td><td>${escapeHtml(before)}분</td></tr><tr><td>조치 후 지연시간</td><td>${escapeHtml(after)}분</td></tr><tr><td>실행 비용</td><td>${escapeHtml(cost)}원</td></tr><tr><td>최종 결정</td><td>${escapeHtml($('#decisionSelect').value)}</td></tr><tr><td>결정 이유</td><td>${escapeHtml($('#decisionNote').value || '미입력')}</td></tr></table><script>window.onload=()=>window.print();</script></body></html>`);
  report.document.close();
}

function drawZoneMap(zone) {
  if (!window.L || !$('#zoneMap')) return;
  if (!zoneMap) {
    zoneMap = window.L.map('zoneMap');
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(zoneMap);
  }
  if (zoneLayer) zoneLayer.remove();
  zoneLayer = window.L.layerGroup().addTo(zoneMap);
  zone.points.forEach(([lat, lon, label]) => window.L.marker([lat, lon]).addTo(zoneLayer).bindPopup(label));
  window.L.polyline(zone.points.map(([lat, lon]) => [lat, lon]), { color: '#00a88f', weight: 4 }).addTo(zoneLayer);
  zoneMap.fitBounds(zone.points.map(([lat, lon]) => [lat, lon]), { padding: [32, 32] });
}

renderChart();
renderActions();
applyZone();
loadCount();
loadCollectedHistory();
$('#zoneSelect').addEventListener('change', () => { applyZone(); updateHistoryCounts(); });
$('#observeDate').addEventListener('change', () => { $('#incidentId').textContent = incidentId(currentZone()); });
$('#saveIncident').addEventListener('click', saveIncident);
$('#exportCsv').addEventListener('click', exportCsv);
$('#exportTableauCsv').addEventListener('click', exportTableauCsv);
$('#exportReport').addEventListener('click', exportReport);
$('#checkTrafficApi').addEventListener('click', checkTrafficApi);
$('#checkPlacesApi').addEventListener('click', checkPlacesApi);
$('#checkWeatherApi').addEventListener('click', checkWeatherApi);
['beforeDelay', 'afterDelay', 'actionCost'].forEach((id) => $(`#${id}`).addEventListener('input', updateEffectSummary));
