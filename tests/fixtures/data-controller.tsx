import { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createInitialState, type DemoState, type Student } from '../../app/reppy-data';
import type { ReppyRepository } from '../../app/reppy-repository';
import { useReppyData } from '../../app/use-reppy-data';

type Account = 'a' | 'b';
type Invitation = { student: Student; token: string; expiresAt: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function initial(account: Account): DemoState {
  return { ...createInitialState(), loggedIn: true, role: 'trainer', assignments: [], sessions: [],
    subscriptionEntries: [], students: [{ id: `${account}-existing`, name: `${account} existing`, status: 'active', color: 'lime' }] };
}

export type ControllerFixture = {
  controller: ReturnType<typeof useReppyData> | null;
  outcome: string;
  heldLoads: number;
  acceptedHeldLoad: boolean | null;
  selectAccount: (account: Account) => void;
  startInvitation: () => void;
  completeInvitation: () => void;
  refresh: () => void;
  holdNextLoad: () => void;
  releaseLoad: () => void;
};

declare global { interface Window { reppyQa: ControllerFixture } }

const states = { a: initial('a'), b: initial('b') };
const subscribers = new Map<Account, () => void>();
let currentAccount: Account = 'a';
let pendingInvitation: { account: Account; request: ReturnType<typeof deferred<Invitation>> } | undefined;
let holdLoad = false;
let pendingLoad: { request: ReturnType<typeof deferred<DemoState>>; snapshot: DemoState } | undefined;

function repositoryFor(account: Account): ReppyRepository {
  return {
  async load(options) {
    const snapshot = structuredClone(states[account]);
    if (!holdLoad) return snapshot;
    holdLoad = false;
    const request = deferred<DemoState>();
    pendingLoad = { request, snapshot };
    fixture.heldLoads++;
    const result = await request.promise;
    fixture.acceptedHeldLoad = options?.accept?.() ?? true;
    return result;
  },
  async execute() {},
  async save() { throw new Error('Remote state must not be saved as demo'); },
  async clear() {},
  subscribe(callback) { subscribers.set(account, callback); return () => { subscribers.delete(account); }; },
  createStudentInvitation() {
    const request = deferred<Invitation>();
    pendingInvitation = { account, request };
    return request.promise;
  },
  };
}
const repositories = { a: repositoryFor('a'), b: repositoryFor('b') };

function Harness({ account }: { account: Account }) {
  const controller = useReppyData(repositories[account]);
  useLayoutEffect(() => { fixture.controller = controller; });
  return null;
}

const root = createRoot(document.getElementById('root')!);
const fixture: ControllerFixture = {
  controller: null, outcome: 'idle', heldLoads: 0, acceptedHeldLoad: null,
  selectAccount(account) { currentAccount = account; root.render(<Harness account={account} />); },
  startInvitation() {
    const create = fixture.controller?.createStudentInvitation;
    if (!create) throw new Error('Controller not ready');
    fixture.outcome = 'pending';
    void create('Invited student').then(() => { fixture.outcome = 'resolved'; })
      .catch((reason: Error) => { fixture.outcome = `rejected:${reason.name}`; });
  },
  completeInvitation() {
    if (!pendingInvitation) throw new Error('No pending invitation');
    const { account, request } = pendingInvitation;
    const student: Student = { id: `${account}-invited`, name: 'Invited student', status: 'invited', color: 'orange' };
    states[account].students.push(student);
    request.resolve({ student, token: 'isolated-token', expiresAt: '2026-10-23T10:00:00Z' });
    pendingInvitation = undefined;
  },
  refresh() { subscribers.get(currentAccount)?.(); },
  holdNextLoad() { holdLoad = true; },
  releaseLoad() {
    if (!pendingLoad) throw new Error('No pending load');
    pendingLoad.request.resolve(pendingLoad.snapshot);
    pendingLoad = undefined;
  },
};
window.reppyQa = fixture;
fixture.selectAccount('a');
