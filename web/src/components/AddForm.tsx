import { type FormEvent, useId, useState } from 'react'
import { errorMessage } from '../lib/api'
import { ErrorBox } from './Status'

type Field = {
  name: string
  label: string
  placeholder: string
  inputMode?: 'decimal'
  suggestions?: string[]
  trailingSelect?: {
    name: string
    label: string
    options: { value: string; label: string }[]
    defaultValue: string
  }
}

function defaultValues(fields: Field[]): Record<string, string> {
  return Object.fromEntries(
    fields.flatMap((field) =>
      field.trailingSelect ? [[field.trailingSelect.name, field.trailingSelect.defaultValue]] : [],
    ),
  )
}

/** A small "fill in fields, press a button" form that shows its own pending and error state. */
export function AddForm({
  fields,
  submitLabel,
  onSubmit,
  onValueChange,
}: {
  fields: Field[]
  submitLabel: string
  onSubmit: (values: Record<string, string>) => Promise<void>
  onValueChange?: (name: string, value: string) => void
}) {
  const id = useId()
  const [values, setValues] = useState<Record<string, string>>(() => defaultValues(fields))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateValue(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
    onValueChange?.(name, value)
  }

  function resetValues(current: Record<string, string>) {
    const reset = defaultValues(fields)
    for (const field of fields) {
      const select = field.trailingSelect
      if (select) reset[select.name] = current[select.name] ?? select.defaultValue
    }
    return reset
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await onSubmit(values)
      setValues(resetValues)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <div className="fields">
        {fields.map((field) => (
          <div className="field" key={field.name}>
            <label htmlFor={`${id}-${field.name}`}>{field.label}</label>
            {field.trailingSelect ? (
              <span className="input-with-select">
                <input
                  id={`${id}-${field.name}`}
                  value={values[field.name] ?? ''}
                  placeholder={field.placeholder}
                  inputMode={field.inputMode}
                  list={field.suggestions ? `${id}-${field.name}-suggestions` : undefined}
                  onChange={(event) => updateValue(field.name, event.target.value)}
                  disabled={pending}
                  required
                />
                <select
                  aria-label={field.trailingSelect.label}
                  value={values[field.trailingSelect.name] ?? field.trailingSelect.defaultValue}
                  onChange={(event) => {
                    if (field.trailingSelect) {
                      updateValue(field.trailingSelect.name, event.target.value)
                    }
                  }}
                  disabled={pending}
                >
                  {field.trailingSelect.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </span>
            ) : (
              <input
                id={`${id}-${field.name}`}
                value={values[field.name] ?? ''}
                placeholder={field.placeholder}
                inputMode={field.inputMode}
                list={field.suggestions ? `${id}-${field.name}-suggestions` : undefined}
                onChange={(event) => updateValue(field.name, event.target.value)}
                disabled={pending}
                required
              />
            )}
            {field.suggestions ? (
              <datalist id={`${id}-${field.name}-suggestions`}>
                {field.suggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            ) : null}
          </div>
        ))}
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
      {error ? <ErrorBox message={error} /> : null}
    </form>
  )
}
