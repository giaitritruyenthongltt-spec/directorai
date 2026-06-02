/**
 * AnalysisTab — Tab 🔍 Báo cáo chất lượng (MOD-5, CHỈ ĐỌC).
 *
 * Chạy CV prefilter + cụm hoá (rẻ, KHÔNG gọi Gemini) trên các file gốc →
 * bảng chất lượng từng clip + tóm tắt + xuất CSV/HTML ra đĩa. Không ghi gì
 * lên timeline — đây là chế độ phân tích/báo cáo.
 */

import React, { useState } from 'react';
import { wsClient } from '../bridge/ws-client.js';
import { parseClipPaths, basename } from '../bridge/clip-paths.js';
import { HelpButton } from './HelpButton.js';
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
  const [clipText, setClipText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResult | null>(null);

  const clipPaths = parseClipPaths(clipText);

  const run = async (): Promise<void> => {
    setError(null);
    if (clipPaths.length === 0) {
      setError('Hãy dán ít nhất 1 đường dẫn file gốc (mỗi dòng 1 file).');
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
          🔍 Báo cáo chất lượng
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

      <textarea
        className="analysis-cliptext"
        placeholder={'Mỗi dòng 1 đường dẫn file gốc:\nE:\\T11\\6.mp4\nE:\\T11\\7.mp4'}
        value={clipText}
        onChange={(e) => {
          setClipText(e.target.value);
          setReport(null);
        }}
        rows={5}
      />
      <div className="analysis-clipcount">{clipPaths.length} file</div>

      {error && <div className="analysis-error">✗ {error}</div>}

      <button className="analysis-btn" disabled={busy} onClick={() => void run()}>
        {busy ? '⏳ Đang phân tích…' : '🔍 Phân tích chất lượng'}
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
                  <td>{r.is_suspect ? '⚠ nghi' : '✓ tốt'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="analysis-files">
            📄 Đã xuất: <code>{fname(report.csvPath)}</code> + <code>{fname(report.htmlPath)}</code>
            <div className="analysis-files-dir">tại ~/.directorai/reports/</div>
          </div>
        </div>
      )}
    </div>
  );
}
