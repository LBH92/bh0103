import React, { useState } from 'react';
import { 
  Sliders, 
  ShieldAlert, 
  Save, 
  CheckCircle2, 
  Lock, 
  AlertTriangle 
} from 'lucide-react';
import { AdminSettingItem, UserRole } from '../../../types';

interface AdminSettingsTabProps {
  settings: AdminSettingItem[];
  callerRole: UserRole;
  onUpdateSetting: (key: string, value: any) => void;
}

export const AdminSettingsTab: React.FC<AdminSettingsTabProps> = ({
  settings,
  callerRole,
  onUpdateSetting,
}) => {
  const isSuperAdmin = callerRole === 'superadmin';
  const [formState, setFormState] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    settings.forEach(s => {
      initial[s.key] = s.value;
    });
    return initial;
  });

  const handleChange = (key: string, val: any) => {
    setFormState(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = (key: string) => {
    onUpdateSetting(key, formState[key]);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Sliders className="w-6 h-6 text-indigo-500" />
            <span>시스템 및 커뮤니티 전역 설정</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            서비스 점검 모드, 회원가입 정책, 채팅 도배 제한, AI 일일 쿼터 등 핵심 설정을 구성합니다.
          </p>
        </div>

        {!isSuperAdmin && (
          <div className="px-3.5 py-2 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto">
            <Lock className="w-4 h-4" />
            <span>최고 관리자(Superadmin) 전용 수정 권한</span>
          </div>
        )}
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {settings.map(setting => {
          const currentVal = formState[setting.key] !== undefined ? formState[setting.key] : setting.value;
          const isDirty = formState[setting.key] !== undefined && formState[setting.key] !== setting.value;

          return (
            <div
              key={setting.key}
              className="p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    {setting.label}
                  </span>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                    {setting.category}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {setting.description}
                </p>

                {/* Input Controls */}
                <div className="mt-4">
                  {setting.type === 'boolean' && (
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {currentVal ? '활성화 (ON)' : '비활성화 (OFF)'}
                      </span>
                      <button
                        type="button"
                        disabled={!isSuperAdmin}
                        onClick={() => handleChange(setting.key, !currentVal)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 ${
                          currentVal ? 'bg-rose-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            currentVal ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  )}

                  {setting.type === 'number' && (
                    <input
                      type="number"
                      disabled={!isSuperAdmin}
                      value={currentVal}
                      onChange={e => handleChange(setting.key, Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold disabled:opacity-50"
                    />
                  )}

                  {setting.type === 'select' && (
                    <select
                      disabled={!isSuperAdmin}
                      value={currentVal}
                      onChange={e => handleChange(setting.key, e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium disabled:opacity-50"
                    >
                      {setting.options?.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Setting Footer & Save Button */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>수정자: {setting.updatedBy} ({setting.updatedAt})</span>
                {isSuperAdmin && (
                  <button
                    disabled={!isDirty}
                    onClick={() => handleSave(setting.key)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-bold text-xs disabled:opacity-20 hover:opacity-90 transition-opacity"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>저장</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
