import type { ChangeEvent, ReactNode } from 'react';

/**
 * Small, plain controls. Everything a user reads here is a full word: no
 * abbreviations, and a hint explains the idea rather than restating the label.
 */
export function Button({
  children,
  onClick,
  kind = 'plain',
  small,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'plain' | 'primary' | 'quiet' | 'danger';
  small?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`button ${kind}${small ? ' small' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <span className="hint" tabIndex={0} role="note">
      ?<span>{children}</span>
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  inline,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <label className={`field${inline ? ' inline' : ''}`}>
      <span className="label">
        {label}
        {hint ? <Hint>{hint}</Hint> : null}
      </span>
      {children}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={min}
      max={max}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
    />
  );
}

export interface Choice {
  value: string;
  label: string;
}

export function Select({
  value,
  choices,
  onChange,
  placeholder,
}: {
  value: string;
  choices: readonly Choice[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {placeholder === undefined ? null : <option value="">{placeholder}</option>}
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="field inline">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="label">
        {label}
        {hint ? <Hint>{hint}</Hint> : null}
      </span>
    </label>
  );
}

export function Panel({
  title,
  children,
  action,
  plain,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  plain?: boolean;
}) {
  return (
    <section className={`panel${plain ? ' plain' : ''}`}>
      {title === undefined ? null : (
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {title}
          {action ? <span style={{ marginLeft: 'auto' }}>{action}</span> : null}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>;
}
