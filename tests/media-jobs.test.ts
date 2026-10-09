import type { ChildProcess } from 'node:child_process';
import { afterEach, expect, test, vi } from 'vitest';
import { MediaJobs } from '../electron/jobs';

afterEach(() => vi.useRealTimers());

test('forces a stalled encoder to stop after graceful cancellation times out', async () => {
  vi.useFakeTimers();
  let reject!: (error: Error) => void;
  const done = new Promise<void>((_resolve, fail) => { reject = fail; });
  const kill = vi.fn((signal?: string) => { if (signal === 'SIGKILL') reject(new Error('Cancelled')); return true; });
  const child = { kill, exitCode: null, signalCode: null } as unknown as ChildProcess;
  const jobs = new MediaJobs(), result = jobs.run(execute => execute({ child, done }));
  const stopped = expect(result).rejects.toThrow('Cancelled');
  jobs.cancel();
  expect(kill).toHaveBeenCalledWith();
  await vi.advanceTimersByTimeAsync(1000);
  await stopped;
  expect(kill).toHaveBeenCalledWith('SIGKILL');
  expect(jobs.busy).toBe(false);
});

test('clears the forced-stop timer when graceful cancellation completes', async () => {
  vi.useFakeTimers();
  let reject!: (error: Error) => void;
  const done = new Promise<void>((_resolve, fail) => { reject = fail; });
  const kill = vi.fn(() => { reject(new Error('Cancelled')); return true; });
  const child = { kill, exitCode: null, signalCode: null } as unknown as ChildProcess;
  const jobs = new MediaJobs(), result = jobs.run(execute => execute({ child, done }));
  const stopped = expect(result).rejects.toThrow('Cancelled');
  jobs.cancel(); await stopped;
  await vi.advanceTimersByTimeAsync(1000);
  expect(kill).not.toHaveBeenCalledWith('SIGKILL');
  expect(vi.getTimerCount()).toBe(0);
});

test('also stops a stalled process attached after cancellation during preparation', async () => {
  vi.useFakeTimers();
  let reject!: (error: Error) => void, prepared!: () => void;
  const ready = new Promise<void>(resolve => { prepared = resolve; });
  const done = new Promise<void>((_resolve, fail) => { reject = fail; });
  const kill = vi.fn((signal?: string) => { if (signal === 'SIGKILL') reject(new Error('Cancelled')); return true; });
  const child = { kill, exitCode: null, signalCode: null } as unknown as ChildProcess;
  const jobs = new MediaJobs(), result = jobs.run(async execute => { await ready; await execute({ child, done }); });
  const stopped = expect(result).rejects.toThrow('Processing cancelled');
  jobs.cancel(); prepared();
  await vi.advanceTimersByTimeAsync(1000);
  await stopped;
  expect(kill).toHaveBeenCalledWith('SIGKILL');
  expect(jobs.busy).toBe(false);
});
