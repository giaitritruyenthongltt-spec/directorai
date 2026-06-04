import React, { useState } from 'react';
import { Icon } from './Icon.js';
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
            : 'Hỏi/ra lệnh tiếng Việt rồi Enter (nút Chạy nằm trong từng tab)'
        }
        disabled={disabled}
      />
      <button
        className="send-btn"
        title="Gửi"
        onClick={() => {
          if (value.trim()) {
            onSubmit(value.trim());
            setValue('');
          }
        }}
        disabled={disabled || !value.trim()}
      >
        <Icon name="send" size={16} />
      </button>
    </div>
  );
}
