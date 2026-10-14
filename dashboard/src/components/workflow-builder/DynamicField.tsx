import { useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Braces, Plus, Trash2, AlertCircle, Sparkles } from 'lucide-react';

export interface DynamicInputRef {
  insertToken: (token: string) => void;
  focus: () => void;
  getValue: () => string;
}

export interface DynamicInputProps {
  id?: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onOpenVariablePicker?: (context: {
    fieldName: string;
    insertToken: (token: string) => void;
  }) => void;
  description?: string;
  error?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  type?: 'text' | 'url' | 'number';
}

export const DynamicInput = forwardRef<DynamicInputRef, DynamicInputProps>(function DynamicInput(
  {
    id,
    label,
    required = false,
    placeholder,
    value,
    onChange,
    onOpenVariablePicker,
    description,
    error,
    className = '',
    disabled = false,
    autoFocus = false,
    type = 'text',
  },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number }>({
    start: (value || '').length,
    end: (value || '').length,
  });

  const updateSelection = () => {
    if (inputRef.current) {
      setSelectionRange({
        start: inputRef.current.selectionStart ?? (value || '').length,
        end: inputRef.current.selectionEnd ?? (value || '').length,
      });
    }
  };

  const insertToken = useCallback(
    (rawToken: string) => {
      const token = rawToken.startsWith('{{') ? rawToken : `{{${rawToken}}}`;
      const currentVal = value || '';
      const start = selectionRange.start ?? currentVal.length;
      const end = selectionRange.end ?? currentVal.length;

      const before = currentVal.substring(0, start);
      const after = currentVal.substring(end);
      const nextVal = `${before}${token}${after}`;
      const newCursorPos = start + token.length;

      onChange(nextVal);
      setSelectionRange({ start: newCursorPos, end: newCursorPos });

      // Re-focus and set cursor after render
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 50);
    },
    [value, selectionRange, onChange],
  );

  useImperativeHandle(ref, () => ({
    insertToken,
    focus: () => inputRef.current?.focus(),
    getValue: () => value || '',
  }));

  const handleOpenPicker = () => {
    updateSelection();
    if (onOpenVariablePicker) {
      onOpenVariablePicker({
        fieldName: label || id || 'Input',
        insertToken,
      });
    }
  };

  return (
    <div className={`dynamic-field-container ${className}`}>
      {label && (
        <div className="dynamic-field-label-row">
          <label htmlFor={id} className="dynamic-field-label">
            {label}
            {required && <span className="dynamic-field-required">*</span>}
          </label>
          {onOpenVariablePicker && (
            <button
              type="button"
              className="dynamic-field-var-btn"
              onClick={handleOpenPicker}
              title="Insert variable from previous steps"
              tabIndex={-1}
            >
              <Braces size={12} className="dynamic-var-icon" />
              <span>Insert Variable</span>
            </button>
          )}
        </div>
      )}

      <div className={`dynamic-input-wrapper ${error ? 'has-error' : ''}`}>
        <input
          ref={inputRef}
          id={id}
          type={type}
          className="dynamic-input-control"
          placeholder={placeholder}
          value={value || ''}
          onChange={e => {
            onChange(e.target.value);
            updateSelection();
          }}
          onSelect={updateSelection}
          onClick={updateSelection}
          onKeyUp={updateSelection}
          disabled={disabled}
          autoFocus={autoFocus}
        />
        {onOpenVariablePicker && !label && (
          <button
            type="button"
            className="dynamic-input-inline-btn"
            onClick={handleOpenPicker}
            title="Insert variable"
            tabIndex={-1}
          >
            <Braces size={13} />
          </button>
        )}
      </div>

      {description && !error && <span className="dynamic-field-hint">{description}</span>}
      {error && (
        <span className="dynamic-field-error">
          <AlertCircle size={12} /> {error}
        </span>
      )}
    </div>
  );
});

export interface DynamicTextareaProps {
  id?: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onOpenVariablePicker?: (context: {
    fieldName: string;
    insertToken: (token: string) => void;
  }) => void;
  description?: string;
  error?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  quickTokens?: Array<{ label: string; token: string }>;
}

export const DynamicTextarea = forwardRef<DynamicInputRef, DynamicTextareaProps>(
  function DynamicTextarea(
    {
      id,
      label,
      required = false,
      placeholder,
      value,
      onChange,
      onOpenVariablePicker,
      description,
      error,
      rows = 4,
      className = '',
      disabled = false,
      quickTokens = [],
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [selectionRange, setSelectionRange] = useState<{ start: number; end: number }>({
      start: (value || '').length,
      end: (value || '').length,
    });

    const updateSelection = () => {
      if (textareaRef.current) {
        setSelectionRange({
          start: textareaRef.current.selectionStart ?? (value || '').length,
          end: textareaRef.current.selectionEnd ?? (value || '').length,
        });
      }
    };

    const insertToken = useCallback(
      (rawToken: string) => {
        const token = rawToken.startsWith('{{') ? rawToken : `{{${rawToken}}}`;
        const currentVal = value || '';
        const start = selectionRange.start ?? currentVal.length;
        const end = selectionRange.end ?? currentVal.length;

        const before = currentVal.substring(0, start);
        const after = currentVal.substring(end);
        const nextVal = `${before}${token}${after}`;
        const newCursorPos = start + token.length;

        onChange(nextVal);
        setSelectionRange({ start: newCursorPos, end: newCursorPos });

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
        }, 50);
      },
      [value, selectionRange, onChange],
    );

    useImperativeHandle(ref, () => ({
      insertToken,
      focus: () => textareaRef.current?.focus(),
      getValue: () => value || '',
    }));

    const handleOpenPicker = () => {
      updateSelection();
      if (onOpenVariablePicker) {
        onOpenVariablePicker({
          fieldName: label || id || 'Textarea',
          insertToken,
        });
      }
    };

    return (
      <div className={`dynamic-field-container ${className}`}>
        <div className="dynamic-field-label-row">
          {label && (
            <label htmlFor={id} className="dynamic-field-label">
              {label}
              {required && <span className="dynamic-field-required">*</span>}
            </label>
          )}
          {onOpenVariablePicker && (
            <button
              type="button"
              className="dynamic-field-var-btn"
              onClick={handleOpenPicker}
              title="Insert variable from previous steps"
              tabIndex={-1}
            >
              <Braces size={12} className="dynamic-var-icon" />
              <span>Insert Variable</span>
            </button>
          )}
        </div>

        <div className={`dynamic-textarea-wrapper ${error ? 'has-error' : ''}`}>
          <textarea
            ref={textareaRef}
            id={id}
            rows={rows}
            className="dynamic-textarea-control"
            placeholder={placeholder}
            value={value || ''}
            onChange={e => {
              onChange(e.target.value);
              updateSelection();
            }}
            onSelect={updateSelection}
            onClick={updateSelection}
            onKeyUp={updateSelection}
            disabled={disabled}
          />
        </div>

        {quickTokens && quickTokens.length > 0 && (
          <div className="dynamic-quick-chips">
            <span className="dynamic-chips-label">Quick variables:</span>
            {quickTokens.map(qt => (
              <button
                key={qt.token}
                type="button"
                className="dynamic-chip-pill"
                onClick={() => insertToken(qt.token)}
                title={`Insert {{${qt.token}}}`}
              >
                + {qt.label}
              </button>
            ))}
            {onOpenVariablePicker && (
              <button
                type="button"
                className="dynamic-chip-pill more-btn"
                onClick={handleOpenPicker}
              >
                <Sparkles size={11} /> All Variables...
              </button>
            )}
          </div>
        )}

        {description && !error && <span className="dynamic-field-hint">{description}</span>}
        {error && (
          <span className="dynamic-field-error">
            <AlertCircle size={12} /> {error}
          </span>
        )}
      </div>
    );
  },
);

export interface KeyValueItem {
  key: string;
  value: string;
}

export interface DynamicKeyValueEditorProps {
  label: string;
  description?: string;
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addButtonLabel?: string;
  onOpenVariablePicker?: (context: {
    fieldName: string;
    insertToken: (token: string) => void;
  }) => void;
}

export function DynamicKeyValueEditor({
  label,
  description,
  items = [],
  onChange,
  keyPlaceholder = 'Key (e.g. Content-Type)',
  valuePlaceholder = 'Value (supports {{variables}})',
  addButtonLabel = 'Add Parameter',
  onOpenVariablePicker,
}: DynamicKeyValueEditorProps) {
  const handleAdd = () => {
    onChange([...items, { key: '', value: '' }]);
  };

  const handleUpdate = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: val };
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="dynamic-field-container">
      <div className="dynamic-field-label-row">
        <label className="dynamic-field-label">
          {label} ({items.length})
        </label>
        <button
          type="button"
          className="dynamic-kv-add-btn"
          onClick={handleAdd}
          title={addButtonLabel}
        >
          <Plus size={12} /> {addButtonLabel}
        </button>
      </div>

      {description && <span className="dynamic-field-hint">{description}</span>}

      <div className="dynamic-kv-list">
        {items.length === 0 ? (
          <div className="dynamic-kv-empty">
            <span>No entries yet. Click &quot;{addButtonLabel}&quot; to configure.</span>
          </div>
        ) : (
          items.map((item, idx) => (
            <div key={idx} className="dynamic-kv-row">
              <input
                type="text"
                className="dynamic-input-control kv-key-input"
                placeholder={keyPlaceholder}
                value={item.key || ''}
                onChange={e => handleUpdate(idx, 'key', e.target.value)}
              />
              <span className="dynamic-kv-separator">:</span>
              <div className="dynamic-kv-val-wrapper">
                <input
                  type="text"
                  className="dynamic-input-control kv-val-input"
                  placeholder={valuePlaceholder}
                  value={item.value || ''}
                  onChange={e => handleUpdate(idx, 'value', e.target.value)}
                />
                {onOpenVariablePicker && (
                  <button
                    type="button"
                    className="dynamic-input-inline-btn"
                    onClick={() => {
                      onOpenVariablePicker({
                        fieldName: `${label} [${item.key || `Row ${idx + 1}`}]`,
                        insertToken: (token: string) => {
                          const fullToken = token.startsWith('{{') ? token : `{{${token}}}`;
                          const cur = item.value || '';
                          handleUpdate(idx, 'value', cur ? `${cur} ${fullToken}` : fullToken);
                        },
                      });
                    }}
                    title="Insert variable into value"
                  >
                    <Braces size={12} />
                  </button>
                )}
              </div>
              <button
                type="button"
                className="dynamic-kv-remove-btn"
                onClick={() => handleRemove(idx)}
                title="Remove row"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
