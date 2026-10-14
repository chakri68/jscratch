/**
 * Builds a `guard` that runs a handler and routes any exception to `onError`
 * instead of letting it blank the UI.
 */
export function makeGuard(
  onError: (e: unknown) => void,
): <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => void {
  return (fn) =>
    (...args) => {
      try {
        fn(...args);
      } catch (e) {
        onError(e);
      }
    };
}
