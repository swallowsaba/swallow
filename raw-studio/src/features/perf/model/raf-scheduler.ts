/**
 * Coalesces many "please render" requests into at most one call per animation
 * frame. Injectable timing makes it unit-testable.
 */
export interface RafLike {
  request: (cb: () => void) => number;
  cancel: (id: number) => void;
}

const defaultRaf: RafLike = {
  request: (cb) =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(cb)
      : (setTimeout(cb, 16) as unknown as number),
  cancel: (id) => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
    else clearTimeout(id);
  },
};

export interface RafScheduler {
  schedule: () => void;
  cancel: () => void;
}

export function createRafScheduler(fn: () => void, raf: RafLike = defaultRaf): RafScheduler {
  let scheduled = false;
  let id = 0;
  return {
    schedule() {
      if (scheduled) return;
      scheduled = true;
      id = raf.request(() => {
        scheduled = false;
        fn();
      });
    },
    cancel() {
      if (scheduled) {
        raf.cancel(id);
        scheduled = false;
      }
    },
  };
}
