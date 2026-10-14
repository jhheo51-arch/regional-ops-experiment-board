const hypotheses = [
  { title: '행사 종료 직후 주문이 짧은 시간에 집중됨', detail: '행사 시간, 주변 신호와 가상 주문 수를 대조하세요.', evidence: '반대 증거: 주문 수 변화가 작음', priority: 1 },
  { title: '대화역과 킨텍스 사이 이동 시간이 늘어남', detail: '도로 지체, 강수와 전시장 진입 동선을 확인하세요.', evidence: '반대 증거: 주요 도로는 정상', priority: 2 },
  { title: '일부 매장의 조리 수용량이 먼저 포화됨', detail: '가상 조리 대기와 현장 픽업 적체를 확인하세요.', evidence: '반대 증거: 여러 매장의 조리가 정상', priority: 3 }
];

const actions = [
  { title: '라이더 대기 위치 조정', desc: '전시장 출구와 겹치지 않는 외곽 대기 지점 안내', score: '효과 중간' },
  { title: '매장 수용량 조정', desc: '행사 종료 30분 동안 일부 매장의 수용량을 낮춤', score: '비용 낮음' },
  { title: '임시 배달 범위 조정', desc: '장거리 이동 주문의 반경을 제한하는 시나리오', score: '부작용 주의' }
];

const $ = (selector) => document.querySelector(selector);
const TRAFFIC_HISTORY_KEY = 'ilsan-traffic-history';
let zoneMap;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function renderChart() {
  const values = [
    [35, 28], [48, 39], [72, 78], [66, 69], [40, 35]
  ];
  $('#signalChart').innerHTML = values.map(([real, virtual]) => `<div class="bar-group"><span class="bar real" style="height:${real}%" title="외부 신호 ${real}"></span><span class="bar virtual" style="height:${virtual}%" title="가상 운영 ${virtual}"></span></div>`).join('');
}

function renderHypotheses() {
  $('#hypothesisList').innerHTML = hypotheses.map((item, index) => `
    <div class="hypothesis-item ${index === 0 ? 'active' : ''}">
      <span class="priority">0${item.priority}</span>
      <div><strong>${item.title}</strong><p>${item.detail}</p><span class="evidence-tag">${item.evidence}</span></div>
      <button type="button" data-move="${index}">${index === 0 ? '1순위' : '우선'}</button>
    </div>`).join('');
  document.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => {
    const selected = Number(button.dataset.move);
    const [item] = hypotheses.splice(selected, 1);
    hypotheses.unshift(item);
    hypotheses.forEach((entry, index) => { entry.priority = index + 1; });
    renderHypotheses();
    showToast('가설 우선순위를 변경했습니다. 변경 이유를 사건 기록에 남겨 주세요.');
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
  const record = {
    id: $('#incidentId').textContent,
    date: $('#observeDate').value,
    zone: $('#zoneSelect').value,
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
  const records = JSON.parse(localStorage.getItem('ilsan-ops-incidents') || '[]');
  records.push(record);
  localStorage.setItem('ilsan-ops-incidents', JSON.stringify(records));
  $('#savedCount').textContent = `${records.length}건`;
  updateHistoryCounts();
  showToast('사건 기록을 저장했습니다. 운영값과 가상값은 기록 기준을 확인해 주세요.');
}

function loadCount() {
  const records = JSON.parse(localStorage.getItem('ilsan-ops-incidents') || '[]');
  $('#savedCount').textContent = `${records.length}건`;
  updateHistoryCounts();
}

function updateHistoryCounts() {
  const incidents = JSON.parse(localStorage.getItem('ilsan-ops-incidents') || '[]');
  const trafficRows = JSON.parse(localStorage.getItem(TRAFFIC_HISTORY_KEY) || '[]');
  $('#trafficHistoryCount').textContent = `${trafficRows.length}건`;
  $('#incidentHistoryCount').textContent = `${incidents.length}건`;
}

function saveTrafficHistory(result) {
  const snapshotAt = result.fetchedAt || new Date().toISOString();
  const rows = (result.links || []).map((item) => ({ snapshotAt, zone: '대화역과 킨텍스', route: item.routeNm || item.routeId, startNode: item.startNodeNm, endNode: item.endNodeNm, speed: item.spd, delay: item.linkDelayTime, congestion: item.congGrade }));
  const history = JSON.parse(localStorage.getItem(TRAFFIC_HISTORY_KEY) || '[]');
  localStorage.setItem(TRAFFIC_HISTORY_KEY, JSON.stringify([...history, ...rows].slice(-2000)));
  updateHistoryCounts();
}

async function checkTrafficApi() {
  const button = $('#checkTrafficApi');
  const icon = $('#trafficSourceIcon');
  const detail = $('#trafficSourceDetail');
  const state = $('#trafficSourceState');
  button.disabled = true;
  button.textContent = '확인 중';
  try {
    const response = await fetch('/api/traffic/zone');
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'API 응답을 확인할 수 없습니다.');
    const summary = result.summary || {};
    saveTrafficHistory(result);
    icon.textContent = '✓';
    icon.className = 'source-icon ready';
    detail.textContent = `대화역과 킨텍스 구간 ${summary.linkCount || 0}개, 평균 속도 ${summary.avgSpeed ?? '확인 전'} km/h, 평균 지체 ${summary.avgDelay ?? '확인 전'}초, ${result.fetchedAt} 확인`;
    $('#zoneTrafficTable').innerHTML = `<table><thead><tr><th>노선</th><th>시작</th><th>종점</th><th>속도 km/h</th><th>지체 초</th><th>혼잡</th></tr></thead><tbody>${(result.links || []).slice(0, 10).map((item) => `<tr><td>${escapeHtml(item.routeNm || item.routeId)}</td><td>${escapeHtml(item.startNodeNm)}</td><td>${escapeHtml(item.endNodeNm)}</td><td>${escapeHtml(item.spd)}</td><td>${escapeHtml(item.linkDelayTime)}</td><td>${escapeHtml(item.congGrade)}</td></tr>`).join('') || '<tr><td colspan="6">연결된 구간이 없습니다.</td></tr>'}</tbody></table>`;
    state.textContent = '연결됨';
    state.className = 'source-state';
    showToast('경기도 교통 API 응답을 확인했습니다.');
  } catch (error) {
    icon.textContent = '!';
    icon.className = 'source-icon pending';
    detail.textContent = error.message.includes('사용할 수 없는') ? '공개키 승인 후 다시 확인해 주세요.' : '서버를 실행한 뒤 다시 확인해 주세요.';
    state.textContent = '확인 필요';
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
  const records = JSON.parse(localStorage.getItem('ilsan-ops-incidents') || '[]');
  const headers = ['id', 'date', 'zone', 'beforeDelay', 'afterDelay', 'actionCost', 'action', 'decision', 'decisionNote'];
  const csv = [headers.join(','), ...records.map((record) => headers.map((key) => `"${String(record[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ilsan-ops-incidents.csv';
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
    const response = await fetch('/api/places?query=' + encodeURIComponent('킨텍스 음식점'));
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '카카오 API 응답을 확인할 수 없습니다.');
    icon.textContent = '✓';
    icon.className = 'source-icon ready';
    detail.textContent = `킨텍스 음식점 ${result.meta.total_count}건 검색, ${result.fetchedAt} 확인`;
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
    const response = await fetch('/api/weather?lat=37.6672&lon=126.7468');
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
  const rows = JSON.parse(localStorage.getItem(TRAFFIC_HISTORY_KEY) || '[]');
  if (!rows.length) {
    showToast('먼저 교통 API를 확인해 이력을 만드세요.');
    return;
  }
  downloadCsv('regional-ops-traffic-history.csv', ['snapshotAt', 'zone', 'route', 'startNode', 'endNode', 'speed', 'delay', 'congestion'], rows);
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
  report.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>권역별 운영 실험 리포트</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;color:#202124;line-height:1.6}h1{font-size:28px}h2{margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:8px}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #eee;padding:10px}td:first-child{width:32%;color:#61706f;font-weight:bold}</style></head><body><h1>권역별 운영 실험 리포트</h1><p>권역: ${escapeHtml($('#zoneSelect').value)} / 관찰일: ${escapeHtml($('#observeDate').value)}</p><h2>현장 확인</h2><table><tr><td>관찰 사실</td><td>${escapeHtml($('#fieldFact').value || '미입력')}</td></tr><tr><td>관계자 제약</td><td>${escapeHtml($('#stakeholderConstraint').value || '미입력')}</td></tr><tr><td>선택한 조치</td><td>${escapeHtml($('#selectedAction').value || '미입력')}</td></tr></table><h2>실험 결과</h2><table><tr><td>조치 전 지연시간</td><td>${escapeHtml(before)}분</td></tr><tr><td>조치 후 지연시간</td><td>${escapeHtml(after)}분</td></tr><tr><td>실행 비용</td><td>${escapeHtml(cost)}원</td></tr><tr><td>최종 결정</td><td>${escapeHtml($('#decisionSelect').value)}</td></tr><tr><td>결정 이유</td><td>${escapeHtml($('#decisionNote').value || '미입력')}</td></tr></table><script>window.onload=()=>window.print();</script></body></html>`);
  report.document.close();
}

function initZoneMap() {
  if (!window.L || !$('#zoneMap')) return;
  zoneMap = window.L.map('zoneMap').setView([37.6672, 126.7468], 13);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(zoneMap);
  const points = [[37.676, 126.747, '대화역'], [37.669, 126.745, '킨텍스'], [37.664, 126.751, '고양종합운동장']];
  points.forEach(([lat, lon, label]) => window.L.marker([lat, lon]).addTo(zoneMap).bindPopup(label));
  window.L.polyline(points.map(([lat, lon]) => [lat, lon]), { color: '#00a88f', weight: 4 }).addTo(zoneMap);
}

renderChart();
renderHypotheses();
renderActions();
loadCount();
initZoneMap();
$('#saveIncident').addEventListener('click', saveIncident);
$('#exportCsv').addEventListener('click', exportCsv);
$('#exportTableauCsv').addEventListener('click', exportTableauCsv);
$('#exportReport').addEventListener('click', exportReport);
$('#checkTrafficApi').addEventListener('click', checkTrafficApi);
$('#checkPlacesApi').addEventListener('click', checkPlacesApi);
$('#checkWeatherApi').addEventListener('click', checkWeatherApi);
['beforeDelay', 'afterDelay', 'actionCost'].forEach((id) => $(`#${id}`).addEventListener('input', updateEffectSummary));
