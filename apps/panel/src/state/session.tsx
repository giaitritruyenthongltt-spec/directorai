/**
 * R1 — SessionProvider: STATE DÙNG CHUNG cho cả panel.
 *
 * Trước đây mỗi tab tự giữ clips/đường-dẫn → đổi tab (App unmount tab) là mất,
 * phải map lại. Đưa các state "phiên làm việc" lên đây (sống ở cấp App, không
 * unmount theo tab) → map 1 lần, mọi tab thấy, đổi tab KHÔNG mất.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { wsClient, type ConnectionState } from '../bridge/ws-client.js';
import { parseClipPaths } from '../bridge/clip-paths.js';
import type { ClipRow } from '../components/ClipTable.js';

/** Kế hoạch edit (lite) — đủ để cache giữa các tab. */
export interface SessionPlan {
  goal_understanding?: string;
  strategy?: string;
  steps?: { order: number; action: string; target_path: string; reason: string }[];
  chapters?: {
    name: string;
    purpose: string;
    pacing: string;
    target_duration_sec: number;
    clip_paths: string[];
  }[];
  total_target_duration_sec?: number;
  estimated_kept_clips?: number;
}

interface SessionValue {
  conn: ConnectionState;
  clips: ClipRow[];
  seqName: string;
  /** Đường dẫn ĐẦY ĐỦ đã resolve (derived). */
  clipPaths: string[];
  resolvedCount: number;
  loadingClips: boolean;
  clipError: string | null;
  folderText: string;
  setFolderText: (s: string) => void;
  /** editPlan dùng chung (FilmTab lập → tab khác thấy). */
  editPlan: SessionPlan | null;
  setEditPlan: (p: SessionPlan | null) => void;
  /** Actions — gom logic clip/path về 1 nơi (bỏ lặp). */
  loadClips: () => Promise<void>;
  resolveFromProject: () => Promise<void>;
  scanFolders: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used within <SessionProvider>');
  return v;
}

export function SessionProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [conn, setConn] = useState<ConnectionState>(wsClient.state);
  const [clips, setClips] = useState<ClipRow[]>([]);
  const [seqName, setSeqName] = useState('');
  const [loadingClips, setLoadingClips] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);
  // G9 — nhớ thư mục gốc qua reload.
  const [folderText, setFolderTextRaw] = useState<string>(() => {
    try {
      return localStorage.getItem('directorai_folders') ?? '';
    } catch {
      return '';
    }
  });
  const setFolderText = useCallback((s: string): void => {
    setFolderTextRaw(s);
    try {
      localStorage.setItem('directorai_folders', s);
    } catch {
      // bỏ qua nếu storage không khả dụng
    }
  }, []);
  const [editPlan, setEditPlan] = useState<SessionPlan | null>(null);

  // 1 subscribe conn duy nhất cho cả panel.
  useEffect(() => wsClient.onStateChange(setConn), []);

  const loadClips = useCallback(async (): Promise<void> => {
    if (wsClient.state !== 'connected') return;
    setLoadingClips(true);
    setClipError(null);
    try {
      const r = await wsClient.call<{
        sequenceName: string;
        clips: { id?: string; name: string; path: string; hasFullPath: boolean; kind?: string }[];
      }>('context.activeSequenceClips', {});
      setClips(
        r.clips.map((c) => ({
          id: c.id,
          name: c.name,
          path: c.path,
          kind: c.kind,
          hasFullPath: c.hasFullPath,
        }))
      );
      setSeqName(r.sequenceName);
    } catch (e) {
      setClipError(`Không nạp được clip: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingClips(false);
    }
  }, []);

  // Tự nạp khi đã kết nối + chưa có clip (giữ map cũ khi đổi tab quay lại).
  useEffect(() => {
    if (conn === 'connected' && clips.length === 0) void loadClips();
  }, [conn, clips.length, loadClips]);

  /** Gắn path resolve (name→fullPath) vào clips hiện có. */
  const applyResolved = (resolved: { name: string; fullPath: string }[]): void => {
    const byName = new Map(resolved.map((x) => [x.name.toLowerCase(), x.fullPath]));
    setClips((prev) =>
      prev.map((c) => {
        const full = byName.get(c.name.toLowerCase());
        return full ? { ...c, path: full, hasFullPath: true } : c;
      })
    );
  };

  const resolveFromProject = useCallback(async (): Promise<void> => {
    setLoadingClips(true);
    setClipError(null);
    try {
      const r = await wsClient.call<{
        resolved: { name: string; fullPath: string }[];
        mediaIndexed: number;
      }>('context.resolveFromProject', {});
      applyResolved(r.resolved);
      if (r.resolved.length === 0) {
        setClipError(
          `Không map được clip nào (${r.mediaIndexed} media). Hãy LƯU project rồi thử lại, hoặc Quét thư mục.`
        );
      }
    } catch (e) {
      setClipError(`Lấy path từ project lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingClips(false);
    }
  }, []);

  const scanFolders = useCallback(async (): Promise<void> => {
    const folders = parseClipPaths(folderText);
    if (folders.length === 0) {
      setClipError('Nhập ít nhất 1 thư mục gốc (mỗi dòng 1 folder).');
      return;
    }
    setLoadingClips(true);
    setClipError(null);
    try {
      const r = await wsClient.call<{ resolved: { name: string; fullPath: string }[] }>(
        'context.resolveFromFolders',
        { folders }
      );
      applyResolved(r.resolved);
    } catch (e) {
      setClipError(`Quét thư mục lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingClips(false);
    }
  }, [folderText]);

  const clipPaths = clips.filter((c) => c.hasFullPath && c.path).map((c) => c.path as string);

  const value: SessionValue = {
    conn,
    clips,
    seqName,
    clipPaths,
    resolvedCount: clipPaths.length,
    loadingClips,
    clipError,
    folderText,
    setFolderText,
    editPlan,
    setEditPlan,
    loadClips,
    resolveFromProject,
    scanFolders,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
