import { useSearchParams } from 'react-router-dom';

// A single-select filter kept in the URL query string (?<param>=<key>), so a
// link can open a page pre-filtered and the dropdown, the URL and the back
// button always agree. `options` is an object keyed by the allowed values;
// anything else (missing, misspelt, stale link) falls back to '' = no filter.
export function useUrlFilter(param, options) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(param);
  const value = raw && Object.hasOwn(options, raw) ? raw : '';

  const setValue = (next) => {
    setParams((prev) => {
      const updated = new URLSearchParams(prev);
      if (next) updated.set(param, next);
      else updated.delete(param);
      return updated;
    });
  };

  return [value, setValue];
}
