import React from 'react';
import { TrendingUp, ShieldCheck, HelpCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const Footer: React.FC = () => {
  const { setActiveTab } = useApp();

  return (
    <footer className="mt-16 border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0c0f17] text-slate-500 dark:text-slate-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center text-white font-black text-sm">
                BD
              </div>
              <span className="font-black text-base text-slate-900 dark:text-white">
                병돌 인베스트먼트
              </span>
            </div>
            <p className="text-xs leading-relaxed max-w-md text-slate-500 dark:text-slate-400">
              한국 주식 투자자를 위한 실시간 주식 커뮤니티 및 금융 인텔리전스 플랫폼.
              코스피·코스닥 실시간 지수, 급등락 종목 감지, 호가창 분석, Gemini AI 종목 브리핑을 제공합니다.
            </p>
          </div>

          {/* Service Links */}
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-xs uppercase tracking-wider">
              주요 서비스
            </h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => setActiveTab('stocks')} className="hover:text-rose-500 transition-colors">
                  국내 주식 실시간 시세
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('watchlist')} className="hover:text-rose-500 transition-colors">
                  내 관심종목 포트폴리오
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('community')} className="hover:text-rose-500 transition-colors">
                  주주 토론 커뮤니티
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('chat')} className="hover:text-rose-500 transition-colors">
                  실시간 증시 라이브 톡
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('alerts')} className="hover:text-rose-500 transition-colors">
                  급등락 및 시장 이벤트 알림
                </button>
              </li>
            </ul>
          </div>

          {/* Regulatory & Disclaimer */}
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-xs uppercase tracking-wider">
              고객지원 & 보안
            </h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => setActiveTab('admin')} className="hover:text-rose-500 transition-colors">
                  관리자 콘솔
                </button>
              </li>
              <li>
                <span className="flex items-center gap-1.5 text-emerald-500 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Firebase 백엔드 연동 지원
                </span>
              </li>
              <li className="text-[11px] text-slate-400 pt-2">
                고객문의: support@byeongdol.kr
              </li>
            </ul>
          </div>
        </div>

        {/* Legal Disclaimer */}
        <div className="pt-6 border-t border-slate-100 dark:border-slate-800/80 text-[11px] leading-relaxed text-slate-400 space-y-1">
          <p>
            ※ 병돌 인베스트먼트에서 제공하는 모든 시세 정보 및 AI 분석 브리핑은 투자 참고용 데이터이며, 투자 결과에 대한 최종 법적 책임은 투자자 본인에게 있습니다.
          </p>
          <p>
            © 2026 병돌 인베스트먼트 (Byeongdol Investment Inc.). All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
