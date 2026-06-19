export function useDebouncedCallback<T extends any[]>(fn: (...args:T)=>void, ms: number) {
  let t: any;
  return (...args:T) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
