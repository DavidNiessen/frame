import { Check, Laptop } from 'lucide-react';
import type { Theme } from '../../hooks/useTheme';

const choices: { value: Theme; label: string; detail: string }[] = [
  { value: 'system', label: 'System', detail: 'Follow your device' },
  { value: 'light', label: 'Light', detail: 'Bright & clear' },
  { value: 'dark', label: 'Dark', detail: 'Easy on the eyes' },
  { value: 'midnight', label: 'Midnight', detail: 'A touch of indigo' },
];
export function ThemeChoices({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  return (
    <fieldset className="theme-choices">
      <legend className="sr-only">Theme</legend>
      {choices.map((choice) => (
        <label
          className={`theme-choice ${theme === choice.value ? 'selected' : ''}`}
          key={choice.value}
        >
          <input
            type="radio"
            name="theme"
            value={choice.value}
            checked={theme === choice.value}
            onChange={() => setTheme(choice.value)}
            aria-label={`${choice.label} theme`}
          />
          <span className="theme-preview" data-preview={choice.value} aria-hidden="true">
            <span className="theme-preview-header">
              <i />
              <i />
              <i />
            </span>
            <span className="theme-preview-body">
              <span className="theme-preview-sidebar">
                <i />
                <i />
                <i />
              </span>
              <span className="theme-preview-stage">
                <span />
                <i />
              </span>
            </span>
          </span>
          <span className="theme-choice-label">
            <strong>
              {choice.value === 'system' && <Laptop size={13} />}
              {choice.label}
            </strong>
            <span className="theme-choice-check" aria-hidden="true">
              {theme === choice.value && <Check size={13} />}
            </span>
          </span>
          <small>{choice.detail}</small>
        </label>
      ))}
    </fieldset>
  );
}
