// EDUCATIONAL: a mutex (mutual exclusion lock) for code running inside ONE Node.js process.
// OS concept: only one "thread of control" may be inside the critical section at a time;
// everyone else waits in a FIFO queue.
//
// WHY JavaScript needs it even though it is single-threaded: every `await` lets other code run,
// so two async functions can interleave. A mutex makes a block of async code run one-at-a-time.
//
// LIMIT: this lock lives in this process's memory. Two backend processes each have their own copy,
// so it can NOT protect money. Money is protected by PostgreSQL row locks (see orderService.js).
export class Mutex {
  constructor() {
    this.locked = false;
    this.waiters = [];
  }

  acquire() {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  release() {
    const next = this.waiters.shift();
    if (next) next(); // hand the lock directly to the next waiter (FIFO)
    else this.locked = false;
  }

  async runExclusive(work) {
    await this.acquire();
    try {
      return await work();
    } finally {
      this.release();
    }
  }
}
