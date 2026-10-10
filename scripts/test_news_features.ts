import dotenv from 'dotenv';
dotenv.config();

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

async function runTests() {
  console.log('====================================================');
  console.log('실제 뉴스/속보 API 연동 및 주식 기능 무결성 검증 테스트');
  console.log('====================================================\n');

  const baseUrl = 'http://localhost:3000';

  // 1. News Status API Check
  try {
    const res = await fetch(`${baseUrl}/api/news/status`);
    const data = await res.json();
    console.log('[1] 뉴스 API 엔진 상태:', data);
    const passed = res.ok && data.service === 'Stock News API Engine';
    results.push({
      name: '뉴스 엔진 상태 API (/api/news/status)',
      passed,
      details: `Google RSS: ${data.providers?.googleRss?.status}, Cache TTL: ${data.ttlSeconds}s`,
    });
  } catch (err: any) {
    results.push({ name: '뉴스 엔진 상태 API', passed: false, details: err.message });
  }

  // 2. Samsung Electronics (005930) Stock News Fetch
  let samsungNews: any = null;
  try {
    const res = await fetch(`${baseUrl}/api/news/stock/005930?page=1&limit=5`);
    const dataSource = res.headers.get('X-Data-Source');
    const cacheStatus = res.headers.get('X-Cache');
    samsungNews = await res.json();

    console.log('\n[2] 삼성전자(005930) 종목 뉴스 조회 결과:');
    console.log(`- HTTP Status: ${res.status}`);
    console.log(`- X-Data-Source: ${dataSource}`);
    console.log(`- X-Cache: ${cacheStatus}`);
    console.log(`- Total articles: ${samsungNews.total}, Returned: ${samsungNews.items?.length}`);

    if (samsungNews.items?.length > 0) {
      console.log('--- 최신 뉴스 샘플 2건 ---');
      samsungNews.items.slice(0, 2).forEach((item: any, idx: number) => {
        console.log(`  [${idx + 1}] 제목: ${item.title}`);
        console.log(`      언론사: ${item.source}`);
        console.log(`      발행시간: ${item.pubDate} (${item.timeAgo})`);
        console.log(`      원문링크: ${item.url.slice(0, 70)}...`);
      });
    }

    const hasRealItems = samsungNews.items && samsungNews.items.length > 0;
    const hasValidFields = hasRealItems && samsungNews.items.every((it: any) => it.title && it.source && it.url && it.pubDate);
    results.push({
      name: '삼성전자(005930) 실제 뉴스 수신 여부',
      passed: res.ok && hasRealItems && hasValidFields,
      details: `총 ${samsungNews.total}건 수신, 언론사/발행시간/원문링크 유효`,
    });
  } catch (err: any) {
    results.push({ name: '삼성전자 종목 뉴스 조회', passed: false, details: err.message });
  }

  // 3. Cache HIT Verification
  try {
    const res = await fetch(`${baseUrl}/api/news/stock/005930?page=1&limit=5`);
    const cacheHeader = res.headers.get('X-Cache');
    console.log(`\n[3] 2차 호출 캐시 상태 (X-Cache): ${cacheHeader}`);
    results.push({
      name: '서버 캐싱 적용 여부 (X-Cache: HIT)',
      passed: cacheHeader === 'HIT',
      details: `캐시 헤더 값: ${cacheHeader}`,
    });
  } catch (err: any) {
    results.push({ name: '서버 캐싱 검증', passed: false, details: err.message });
  }

  // 4. Market News Categories Check (코스피, 코스닥, 경제, 주요 속보)
  const categories = ['breaking', 'kospi', 'kosdaq', 'economy'];
  for (const cat of categories) {
    try {
      const res = await fetch(`${baseUrl}/api/news?category=${cat}&limit=3`);
      const data = await res.json();
      const hasArticles = data.items && data.items.length > 0;
      console.log(`\n[4] 시장 카테고리 [${cat}] 뉴스: ${data.items?.length || 0}건 반환`);
      if (hasArticles) {
        console.log(`    최신 기사: "${data.items[0].title}" (${data.items[0].source}, ${data.items[0].timeAgo})`);
      }
      results.push({
        name: `시장 뉴스 카테고리 [${cat}]`,
        passed: res.ok && hasArticles,
        details: `기사 수: ${data.items?.length}, 최신 발행: ${data.items?.[0]?.timeAgo}`,
      });
    } catch (err: any) {
      results.push({ name: `시장 뉴스 카테고리 [${cat}]`, passed: false, details: err.message });
    }
  }

  // 5. Keyword Search News Check (/api/news/search)
  try {
    const res = await fetch(`${baseUrl}/api/news/search?q=%EB%B0%98%EB%8F%84%EC%B2%B4&limit=3`);
    const searchData = await res.json();
    console.log(`\n[5] 검색 '반도체' 뉴스: ${searchData.items?.length || 0}건 반환`);
    results.push({
      name: '뉴스 키워드 검색 (/api/news/search)',
      passed: res.ok && searchData.items && searchData.items.length > 0,
      details: `검색어: 반도체, 결과: ${searchData.items?.length}건`,
    });
  } catch (err: any) {
    results.push({ name: '뉴스 키워드 검색', passed: false, details: err.message });
  }

  // 6. Chronological Order Verification (속보/최신순 정렬)
  if (samsungNews && samsungNews.items && samsungNews.items.length >= 2) {
    let isSortedDesc = true;
    for (let i = 0; i < samsungNews.items.length - 1; i++) {
      if (samsungNews.items[i].publishedAt < samsungNews.items[i + 1].publishedAt) {
        isSortedDesc = false;
        break;
      }
    }
    results.push({
      name: '최신순/속보 시간 내림차순 정렬',
      passed: isSortedDesc,
      details: isSortedDesc ? '모든 기사가 publishedAt 기준 내림차순으로 정렬됨' : '정렬 불일치',
    });
  }

  // 7. Error Handling on Invalid Parameters
  try {
    const res = await fetch(`${baseUrl}/api/news/stock/INVALID_SYMBOL!`);
    console.log(`\n[7] 유효하지 않은 종목 코드 요청 응답 HTTP: ${res.status}`);
    results.push({
      name: '올바르지 않은 종목 파라미터 방어 (400 Bad Request)',
      passed: res.status === 400,
      details: `HTTP ${res.status} 정상 반환`,
    });
  } catch (err: any) {
    results.push({ name: '오류 처리 방어', passed: false, details: err.message });
  }

  // 8. Existing Core Stock Functionality Integrity (Kiwoom / Quotes / Indices)
  try {
    const indicesRes = await fetch(`${baseUrl}/api/indices`);
    const indicesData = await indicesRes.json();
    const hasKospi = indicesData.some((idx: any) => idx.symbol === 'KOSPI');
    const hasKosdaq = indicesData.some((idx: any) => idx.symbol === 'KOSDAQ');

    const quoteRes = await fetch(`${baseUrl}/api/stocks/005930`);
    const quoteData = await quoteRes.json();
    const hasValidQuote = quoteData && quoteData.symbol === '005930' && quoteData.price > 0;

    const chartRes = await fetch(`${baseUrl}/api/stocks/005930/chart?period=day`);
    const chartData = await chartRes.json();
    const hasChart = Array.isArray(chartData.candles) && chartData.candles.length > 0;

    const allPassed = indicesRes.ok && hasKospi && hasKosdaq && quoteRes.ok && hasValidQuote && chartRes.ok && hasChart;
    results.push({
      name: '기존 기능 무결성 (지수, 현재가, 차트 등)',
      passed: allPassed,
      details: `KOSPI/KOSDAQ: ${hasKospi && hasKosdaq}, 삼성전자 현재가: ${quoteData.price}원, 차트 캔들: ${chartData.candles?.length}개`,
    });
  } catch (err: any) {
    results.push({ name: '기존 기능 무결성 검증', passed: false, details: err.message });
  }

  console.log('\n====================================================');
  console.log('최종 테스트 결과 요약');
  console.log('====================================================');
  let allTestsPassed = true;
  for (const r of results) {
    const mark = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${mark} ${r.name}: ${r.details}`);
    if (!r.passed) allTestsPassed = false;
  }
  console.log('====================================================');
  console.log(allTestsPassed ? '🎉 모든 테스트 항목 통과 완료!' : '⚠️ 일부 항목 실패');

  if (!allTestsPassed) {
    process.exit(1);
  }
}

runTests();
