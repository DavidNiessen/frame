import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
export interface FontOption { value: string; name: string; group: string }
export function FontPicker({ value, options, unavailable, change }: { value: string; options: FontOption[]; unavailable?: string; change: (value: string) => void }) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const label = options.find(option => option.value === value)?.name ?? unavailable ?? value;
  const [query, setQuery] = useState(label), [open, setOpen] = useState(false), [filter, setFilter] = useState(false), [active, setActive] = useState(0);
  const search = query.toLocaleLowerCase();
  const shown = options.filter(option => !filter || option.name.toLocaleLowerCase().includes(search)).sort((a, b) => filter ? Number(b.name.toLocaleLowerCase().startsWith(search)) - Number(a.name.toLocaleLowerCase().startsWith(search)) : 0);
  useEffect(() => { setQuery(label); setFilter(false); }, [label]);
  useEffect(() => { if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [open, active, query, id]);
  function choose(option: FontOption) { change(option.value); setQuery(option.name); setOpen(false); setFilter(false); }
  return <div className="font-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setFilter(false); setQuery(label); } }}>
    <label htmlFor={id}>Font</label><div className="font-picker-input"><input ref={input} id={id} role="combobox" aria-label="Font" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && shown[active] ? `${id}-${active}` : undefined} value={query}
      onFocus={event => { setOpen(true); setFilter(false); event.currentTarget.select(); }} onClick={() => setOpen(true)}
      onChange={event => { setQuery(event.target.value); setFilter(true); setOpen(true); setActive(0); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); setFilter(false); setQuery(label); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => Math.max(0, Math.min(shown.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))); }
        if (event.key === 'Enter') { event.preventDefault(); if (open && shown[active]) choose(shown[active]); }
      }} /><button type="button" className="icon-button" aria-label="Show font choices" aria-expanded={open} onPointerDown={event => event.preventDefault()} onClick={() => { input.current?.focus(); setOpen(!open); setFilter(false); }}><ChevronDown size={15} /></button></div>
    {open && <div className="font-picker-options" role="listbox" id={`${id}-list`} aria-label="Font choices">{shown.map((option, index) => <div key={option.value}>
      {(index === 0 || shown[index - 1].group !== option.group) && <span className="font-picker-group">{option.group}</span>}
      <button type="button" role="option" id={`${id}-${index}`} aria-selected={value === option.value} className={index === active ? 'active' : ''} onPointerDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(option)}>{option.name}</button>
    </div>)}{!shown.length && <p>No matching fonts</p>}</div>}
  </div>;
}
