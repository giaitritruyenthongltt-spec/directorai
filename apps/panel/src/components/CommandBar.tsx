import React, { useState } from 'react';
import './CommandBar.css';

interface Props {
  onSubmit: (cmd: string) => void;
  disabled?: boolean;
}

export function CommandBar({ onSubmit, disabled }: Props): React.ReactElement {
  const [value, setValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      onSubmit(value.trim());
      setValue('');
    }
  };

  return (
    <div className="command-bar">
      <input
        type="text"
        className="command-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          disabled
            ? 'Đang kết nối…'
            : '💬 Hỏi/ra lệnh tiếng Việt rồi Enter (KHÔNG phải nút Chạy — nút Chạy ở trong tab)'
        }
        disabled={disabled}
      />
      <button
        className="send-btn"
        onClick={() => {
          if (value.trim()) {
            onSubmit(value.trim());
            setValue('');
          }
        }}
        disabled={disabled || !value.trim()}
      >
        ▶
      </button>
    </div>
  );
}
