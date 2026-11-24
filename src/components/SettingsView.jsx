import React from 'react';
import { Moon, Sun, Type, Languages, Volume2, Download, Upload, ShieldCheck, LogIn, LogOut } from 'lucide-react';
import { ADMIN_EMAIL } from '../lib/supabase';

export default function SettingsView({
  darkMode,
  setDarkMode,
  fontScale,
  setFontScale,
  dictMode,
  setDictMode,
  showVn,
  setShowVn,
  ttsRate,
  setTtsRate,
  user,
  isAdmin,
  onOpenAuth,
  onSignOut,
  onExportJson,
  onTriggerImportJson,
}) {
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Cài đặt hiển thị & Sao lưu</h1>

        {/* Dark Mode */}
        <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            {darkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Chế độ tối (Dark Mode)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Dịu mắt khi ôn thi buổi tối hoặc sau ca làm khuya</p>
            </div>
          </div>
          <button
            onClick={() => setDarkMode((d) => !d)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              darkMode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}
          >
            {darkMode ? 'Đang bật Tối' : 'Đang bật Sáng'}
          </button>
        </div>

        {/* Font Size */}
        <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Type className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Cỡ chữ toàn ứng dụng</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Chỉnh độ lớn chữ cho thoải mái trên iPhone hoặc MacBook</p>
            </div>
          </div>
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
            {[
              { id: 'sm', label: 'Nhỏ' },
              { id: 'md', label: 'Vừa' },
              { id: 'lg', label: 'Lớn' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setFontScale(s.id)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  fontScale === s.id
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Click-to-translate German */}
        <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Languages className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Chạm bất kỳ từ tiếng Đức nào để dịch</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hiện giống (der/die/das), loại từ, nghĩa Việt, ví dụ & tự lưu cache 0 giây cho lần sau
              </p>
            </div>
          </div>
          <button
            onClick={() => setDictMode((m) => !m)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              dictMode ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {dictMode ? 'Đang BẬT' : 'Đang TẮT'}
          </button>
        </div>

        {/* TTS Speed & VN Toggle */}
        <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Volume2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Tốc độ đọc tiếng Đức (de-DE)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Chọn 0.85x để nghe chậm rõ từng âm tiết</p>
            </div>
          </div>
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
            {[0.85, 1.0].map((r) => (
              <button
                key={r}
                onClick={() => setTtsRate(r)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  ttsRate === r ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500'
                }`}
              >
                {r}x
              </button>
            ))}
          </div>
        </div>

        {/* Backup & Restore */}
        <div className="space-y-3 pt-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">Sao lưu & Khôi phục dữ liệu (JSON)</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onExportJson}
              className="px-4 py-2.5 bg-slate-900 dark:bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" /> Tải file sao lưu toàn bộ (.json)
            </button>
            {isAdmin && (
              <button
                onClick={onTriggerImportJson}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl flex items-center gap-2 transition"
              >
                <Upload className="w-4 h-4" /> Khôi phục từ file JSON
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Account Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            {user ? `Đang đăng nhập: ${user.email}` : 'Chưa đăng nhập (Chế độ Khách)'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isAdmin
              ? 'Tài khoản Admin toàn quyền thêm/sửa/xóa bài học, nạp đề thi cũ và từ vựng.'
              : `Đăng nhập bằng ${ADMIN_EMAIL} để bật quyền Admin.`}
          </p>
        </div>
        {user ? (
          <button
            onClick={onSignOut}
            className="px-4 py-2.5 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-bold rounded-xl flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Đăng xuất
          </button>
        ) : (
          <button
            onClick={onOpenAuth}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-2"
          >
            <LogIn className="w-4 h-4" /> Đăng nhập ngay
          </button>
        )}
      </div>
    </div>
  );
}
