/**
 * AnalysisTab — Tab 🔍 Báo cáo chất lượng (MOD-5, CHỈ ĐỌC).
 *
 * Chạy CV prefilter + cụm hoá (rẻ, KHÔNG gọi Gemini) trên các file gốc →
 * bảng chất lượng từng clip + tóm tắt + xuất CSV/HTML ra đĩa. Không ghi gì
 * lên timeline — đây là chế độ phân tích/báo cáo.
 */

import React, { useState } from 'react';
import { wsClient } from '../bridge/ws-client.js';
import { basename } from '../bridge/clip-paths.js';
import { useSession } from '../state/session.js';
import { ClipSourcePanel } from './ClipSourcePanel.js';
import { HelpButton } from './HelpButton.js';
import { Icon } from './Icon.js';
import './AnalysisTab.css';

interface Row {
  clip_path: string;
  composite: number;
  blur: number;
  suspect_score: number;
  is_suspect: boolean;
}
interface ReportResult {
  rows: Row[];
  summary: { total: number; suspects: number; clusters: number; reduction: number };
  csvPath: string;
  htmlPath: string;
}

export function AnalysisTab(): React.ReactElement {
  const s = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResult | null>(null);

  const clipPaths = s.clipPaths;

  const run = async (): Promise<void> => {
    setError(null);
    if (s.conn !== 'connected') {
      setError('Chưa kết nối Premiere — chờ kết nối rồi thử lại.');
      return;
    }
    if (clipPaths.length === 0) {
      setError('Chưa có clip có đường dẫn — bấm "Lấy path tự động" ở mục Nguồn clip.');
      return;
    }
    setBusy(true);
    try {
      const r = await wsClient.call<ReportResult>('context.qualityReport', { clipPaths });
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const fname = basename;

  return (
    <div className="analysis-tab">
      <div className="analysis-intro">
        <h2>
          <Icon name="report" size={18} /> Báo cáo chất lượng
          <HelpButton
            title="Báo cáo chất lượng làm gì?"
            lines={[
              'Chấm chất lượng (độ nét/phơi sáng) từng clip bằng CV — RẺ, không tốn Gemini.',
              'Gom clip gần giống thành cụm để biết bao nhiêu clip trùng.',
              'Xuất bảng CSV + HTML ra ~/.directorai/reports/ để xem ngoài Premiere.',
            ]}
            example="Quét 50 clip → biết 8 clip nghi kém + 12 clip trùng cụm, KHÔNG ghi gì."
          />
        </h2>
        <p className="analysis-sub">Chỉ phân tích — KHÔNG sửa timeline.</p>
      </div>

      {/* Nguồn clip dùng chung — map 1 lần ở bất kỳ tab nào */}
      <ClipSourcePanel title="Nguồn clip (dùng chung mọi tab)" />

      {error && (
        <div className="analysis-error">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <button className="analysis-btn" disabled={busy} onClick={() => void run()}>
        {busy ? (
          <>
            <Icon name="refresh" size={15} className="spin" /> Đang phân tích…
          </>
        ) : (
          <>
            <Icon name="report" size={15} /> Phân tích chất lượng
          </>
        )}
      </button>

      {report && (
        <div className="analysis-result">
          <div className="analysis-summary">
            Tổng <b>{report.summary.total}</b> clip · nghi kém{' '}
            <b className="warn">{report.summary.suspects}</b> · cụm <b>{report.summary.clusters}</b>{' '}
            (giảm {Math.round(report.summary.reduction * 100)}% gọi Vision)
          </div>
          <table className="analysis-table">
            <thead>
              <tr>
                <th>Clip</th>
                <th>Nét</th>
                <th>Blur</th>
                <th>Đánh giá</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.clip_path} className={r.is_suspect ? 'bad' : 'ok'}>
                  <td title={r.clip_path}>{fname(r.clip_path)}</td>
                  <td>{r.composite}</td>
                  <td>{r.blur}</td>
                  <td>
                    {r.is_suspect ? (
                      <span className="analysis-tag bad">
                        <Icon name="alert" size={12} /> nghi
                      </span>
                    ) : (
                      <span className="analysis-tag good">
                        <Icon name="check" size={12} /> tốt
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="analysis-files">
            <Icon name="report" size={14} /> Đã xuất: <code>{fname(report.csvPath)}</code> +{' '}
            <code>{fname(report.htmlPath)}</code>
            <div className="analysis-files-dir">tại ~/.directorai/reports/</div>
          </div>
        </div>
      )}
    </div>
  );
}
