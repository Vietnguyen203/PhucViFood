import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  reload: () => void;
}

/**
 * Tải dữ liệu khi component hiện và mỗi khi `deps` đổi. Tự hủy yêu cầu cũ (đổi bộ lọc, chuyển trang) và không cập nhật state
 * sau khi component đã gỡ. `fn` nhận AbortSignal để truyền cho lớp API.
 */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: unknown }>({ data: undefined, loading: true, error: undefined });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fnRef.current(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ data, loading: false, error: undefined }); },
      (error) => { if (!controller.signal.aborted) setState({ data: undefined, loading: false, error }); },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
