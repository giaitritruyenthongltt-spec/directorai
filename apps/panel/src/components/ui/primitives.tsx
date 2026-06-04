/**
 * UI2 — Component dùng chung (chuẩn hóa, diệt CSS trùng).
 *
 * Trước đây mỗi tab tự định nghĩa style button/input/section → ~400 dòng CSS
 * lặp + spacing/màu lệch nhau. Gom về đây, dùng design token (UI1).
 */

import React from 'react';
import { Icon, type IconName } from '../Icon.js';
import './primitives.css';

// ─── Section: hộp có tiêu đề ───────────────────────────────────────────────
// R6 — ưu tiên iconName (SVG, không tofu); `icon` (emoji) giữ để tương thích cũ.
export function Section(props: {
  title?: React.ReactNode;
  icon?: string;
  iconName?: IconName;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section className={`ui-section ${props.className ?? ''}`}>
      {props.title && (
        <div className="ui-section-title">
          {props.iconName ? (
            <Icon name={props.iconName} size={15} />
          ) : (
            props.icon && <span>{props.icon}</span>
          )}
          <span>{props.title}</span>
        </div>
      )}
      {props.children}
    </section>
  );
}

// ─── Button ────────────────────────────────────────────────────────────────
export function Button(props: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  full?: boolean;
  iconName?: IconName;
}): React.ReactElement {
  const v = props.variant ?? 'secondary';
  const isDisabled = Boolean(props.disabled || props.busy);
  // UXP <button> NUỐT icon span → dùng <div role=button> (UXP render icon trong
  // div đúng). Tự lo disabled/keyboard.
  return (
    <div
      className={`ui-btn ui-btn-${v}${props.full ? ' ui-btn-full' : ''}`}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled || undefined}
      title={props.title}
      style={
        isDisabled ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : undefined
      }
      onClick={isDisabled ? undefined : props.onClick}
      onKeyDown={(e) => {
        if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          props.onClick?.();
        }
      }}
    >
      {props.busy ? (
        <span className="ui-spinner" aria-hidden />
      ) : (
        props.iconName && <Icon name={props.iconName} size={15} />
      )}
      {props.children}
    </div>
  );
}

// ─── Badge: nhãn nhỏ có màu theo loại ─────────────────────────────────────
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warn' | 'error';
export function Badge(props: {
  children: React.ReactNode;
  tone?: BadgeTone;
  title?: string;
}): React.ReactElement {
  return (
    <span className={`ui-badge ui-badge-${props.tone ?? 'neutral'}`} title={props.title}>
      {props.children}
    </span>
  );
}

// ─── ErrorBox ──────────────────────────────────────────────────────────────
export function ErrorBox(props: { error?: string | null }): React.ReactElement | null {
  if (!props.error) return null;
  return (
    <div className="ui-error">
      <Icon name="alert" size={15} /> {props.error}
    </div>
  );
}

// ─── EmptyState ────────────────────────────────────────────────────────────
export function EmptyState(props: {
  icon?: string;
  iconName?: IconName;
  title: string;
  hint?: string;
}): React.ReactElement {
  return (
    <div className="ui-empty">
      {props.iconName ? (
        <div className="ui-empty-icon">
          <Icon name={props.iconName} size={30} />
        </div>
      ) : (
        props.icon && <div className="ui-empty-icon">{props.icon}</div>
      )}
      <div className="ui-empty-title">{props.title}</div>
      {props.hint && <div className="ui-empty-hint">{props.hint}</div>}
    </div>
  );
}

// ─── Field: nhãn + control ────────────────────────────────────────────────
export function Field(props: {
  label: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
}): React.ReactElement {
  return (
    <label className="ui-field">
      <span className="ui-field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="ui-field-hint">{props.hint}</span>}
    </label>
  );
}
