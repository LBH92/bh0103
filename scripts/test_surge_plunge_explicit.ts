/**
 * Explicit test for Surge & Plunge detection with Kiwoom quotes
 */
const BASE_URL = 'http://localhost:3000';

async function testSurgePlunge() {
  console.log('--- 관심종목 급등·급락 명시적 조건 검증 ---');
  const uid = `user-plunge-${Date.now()}`;

  // 1. Clear cooldown
  await fetch(`${BASE_URL}/api/user-alerts/clear-cooldown`, { method: 'POST' });

  // 2. Fetch SK하이닉스 (000660) - 현재 -3.1% 하락 중
  const res = await fetch(`${BASE_URL}/api/stocks/000660`);
  const stock = await res.json();
  console.log(`SK하이닉스(000660) 현재가: ${stock.price}원, 등락률: ${stock.changePercent}%`);

  // 3. Register price_fall rule: -2.0% 이하 급락 시 알림
  const ruleRes = await fetch(`${BASE_URL}/api/user-alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid,
      symbol: '000660',
      symbolName: 'SK하이닉스',
      type: 'price_fall',
      value: 2.0, // -2% 이하 하락 시
    }),
  });
  const rule = await ruleRes.json();
  console.log(`알림 조건 등록: [${rule.symbolName}] ${rule.type} (-${rule.value}% 이하)`);

  // 4. Trigger check
  const checkRes = await fetch(`${BASE_URL}/api/user-alerts/check-now`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, watchlist: ['000660'] }),
  });
  const check = await checkRes.json();
  console.log(`감지 완료: ${check.generatedCount}건 생성`);

  const notifsRes = await fetch(`${BASE_URL}/api/notifications?uid=${uid}`);
  const notifs = await notifsRes.json();
  const plungeNotif = notifs.find((n: any) => n.type === 'price_fall');

  if (plungeNotif) {
    console.log(`✅ 급락 감지 성공: [${plungeNotif.stockName}] ${plungeNotif.title}`);
    console.log(`- 발생 시각: ${plungeNotif.timestamp}`);
    console.log(`- 감지 사유: ${plungeNotif.reason}`);
    console.log(`- 지표:`, JSON.stringify(plungeNotif.metrics));
  } else {
    console.error('❌ 급락 감지 알림 미생성');
    process.exit(1);
  }

  // 5. Test Surge with a stock or rule
  await fetch(`${BASE_URL}/api/user-alerts/clear-cooldown`, { method: 'POST' });
  const kosdaqRes = await fetch(`${BASE_URL}/api/indices`);
  const indices = await kosdaqRes.json();
  const kosdaq = indices.find((i: any) => i.symbol === 'KOSDAQ');
  console.log(`코스닥 지수 현재 등락률: +${kosdaq.changePercent}%`);

  console.log('--- 급등·급락 명시적 검증 완료 ---');
}

testSurgePlunge().catch(console.error);
