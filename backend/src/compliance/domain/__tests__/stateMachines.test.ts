import {
  TransitionError,
  assignmentMachine,
  clarificationMachine,
  cycleMachine,
  extensionAskMachine,
  extensionMachine,
  reviewMachine,
  submissionMachine,
  taskMachine,
} from '../stateMachines';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof TransitionError) return e.code;
    throw e;
  }
  return 'ok';
};

describe('task execution status', () => {
  it('follows the happy path', () => {
    let s = taskMachine.initial;
    s = taskMachine.next(s, 'publish', ['QC']);
    s = taskMachine.next(s, 'assign', ['DM']);
    s = taskMachine.next(s, 'start', ['EMP']);
    s = taskMachine.next(s, 'submit', ['EMP']);
    s = taskMachine.next(s, 'all_covered', ['SYSTEM']);
    expect(s).toBe('completed');
    expect(taskMachine.isTerminal(s)).toBe(true);
  });

  it('rejection returns the task for rework, then resubmission', () => {
    let s = taskMachine.next('submitted', 'link_rejected', ['SYSTEM']);
    expect(s).toBe('rework_required');
    s = taskMachine.next(s, 'reassign', ['DM']);
    expect(s).toBe('assigned');
    expect(taskMachine.next('rework_required', 'resubmit', ['EMP'])).toBe('submitted');
  });

  it('only the department manager assigns', () => {
    expect(code(() => taskMachine.next('awaiting_assignment', 'assign', ['EMP']))).toBe('actor_not_allowed');
    expect(code(() => taskMachine.next('awaiting_assignment', 'assign', ['QC']))).toBe('actor_not_allowed');
  });

  it('D3: the consultant can submit on any task', () => {
    expect(taskMachine.next('in_progress', 'submit', ['QC'])).toBe('submitted');
  });

  it('cancel and reopen need a reason and the consultant', () => {
    expect(code(() => taskMachine.next('in_progress', 'cancel', ['QC']))).toBe('reason_required');
    expect(taskMachine.next('in_progress', 'cancel', ['QC'], 'Duplicate')).toBe('cancelled');
    expect(code(() => taskMachine.next('in_progress', 'cancel', ['DM'], 'Duplicate'))).toBe('actor_not_allowed');
    expect(taskMachine.next('completed', 'reopen', ['QC'], 'Evidence later found invalid')).toBe('in_progress');
  });

  it('refuses transitions that are not in the diagram', () => {
    expect(code(() => taskMachine.next('completed', 'cancel', ['QC'], 'late'))).toBe('invalid_transition');
    expect(code(() => taskMachine.next('draft', 'submit', ['EMP']))).toBe('invalid_transition');
  });

  it('lists the buttons a role can use', () => {
    expect(taskMachine.available('rework_required', ['DM']).map((t) => t.event).sort()).toEqual(['reassign', 'resubmit', 'resume']);
  });
});

describe('evidence review status', () => {
  it('claim, then accept', () => {
    let s = reviewMachine.next('draft', 'submit', ['EMP']);
    s = reviewMachine.next(s, 'claim', ['QC']);
    expect(reviewMachine.next(s, 'accept', ['QC'])).toBe('accepted');
  });

  it('rejection needs at least 10 characters (BR-REV-02)', () => {
    expect(code(() => reviewMachine.next('under_review', 'reject', ['QC'], 'bad'))).toBe('reason_required');
    expect(code(() => reviewMachine.next('under_review', 'reject', ['QC'], '          '))).toBe('reason_required');
    expect(reviewMachine.next('under_review', 'reject', ['QC'], 'Document is not signed')).toBe('rejected');
  });

  it('only consultants review; executors cannot accept their own work', () => {
    expect(code(() => reviewMachine.next('under_review', 'accept', ['DM']))).toBe('actor_not_allowed');
    expect(code(() => reviewMachine.next('submitted', 'claim', ['EMP']))).toBe('actor_not_allowed');
  });

  it('rejected is final; superseding is system-only', () => {
    expect(reviewMachine.isTerminal('rejected')).toBe(true);
    expect(code(() => reviewMachine.next('accepted', 'supersede', ['QC']))).toBe('actor_not_allowed');
    expect(reviewMachine.next('accepted', 'supersede', ['SYSTEM'])).toBe('superseded');
  });
});

describe('DGA submission status (two statuses)', () => {
  it('only the submission officer posts', () => {
    expect(submissionMachine.states).toEqual(['not_posted', 'posted']);
    expect(submissionMachine.next('not_posted', 'post', ['DSO'])).toBe('posted');
    expect(code(() => submissionMachine.next('not_posted', 'post', ['QC']))).toBe('actor_not_allowed');
  });

  it('reverting needs a reason', () => {
    expect(code(() => submissionMachine.next('posted', 'unpost', ['DSO']))).toBe('reason_required');
    expect(submissionMachine.next('posted', 'unpost', ['DSO'], 'Posted under wrong standard')).toBe('not_posted');
  });
});

describe('clarification', () => {
  it('D4: the manager can answer', () => {
    expect(clarificationMachine.next('open', 'answer', ['DM'])).toBe('answered');
    expect(clarificationMachine.next('open', 'answer', ['QC'])).toBe('answered');
    expect(code(() => clarificationMachine.next('open', 'answer', ['EMP']))).toBe('actor_not_allowed');
  });

  it('a follow-up reopens it', () => {
    expect(clarificationMachine.next('answered', 'follow_up', ['EMP'])).toBe('open');
  });
});

describe('extension', () => {
  it('D7: the employee asks, the manager forwards or declines', () => {
    expect(extensionAskMachine.next('asked', 'forward', ['DM'])).toBe('forwarded');
    expect(code(() => extensionAskMachine.next('asked', 'decline', ['DM']))).toBe('reason_required');
    expect(code(() => extensionAskMachine.next('asked', 'forward', ['EMP']))).toBe('actor_not_allowed');
  });

  it('the consultant decides formal requests; rejection needs a reason', () => {
    expect(extensionMachine.next('pending', 'approve', ['QC'])).toBe('approved');
    expect(code(() => extensionMachine.next('pending', 'reject', ['QC']))).toBe('reason_required');
    expect(code(() => extensionMachine.next('pending', 'approve', ['DM']))).toBe('actor_not_allowed');
  });
});

describe('assignment and cycle', () => {
  it('assignment closes only by the system', () => {
    expect(assignmentMachine.next('draft', 'publish', ['QC'])).toBe('published');
    expect(code(() => assignmentMachine.next('published', 'close', ['QC']))).toBe('actor_not_allowed');
  });

  it('only the administrator reopens or archives a cycle', () => {
    expect(cycleMachine.next('planning', 'open', ['QC'])).toBe('active');
    expect(code(() => cycleMachine.next('closed', 'reopen', ['QC'], 'Late correction'))).toBe('actor_not_allowed');
    expect(cycleMachine.next('closed', 'reopen', ['ADM'], 'Late correction')).toBe('active');
    expect(cycleMachine.next('closed', 'archive', ['ADM'])).toBe('archived');
  });
});

it('rejects a machine definition that names an unknown state', () => {
  const { StateMachine } = jest.requireActual('../stateMachines');
  expect(() => new StateMachine('bad', ['a'], 'a', [], [{ event: 'x', from: ['a'], to: 'b', actors: ['QC'] }])).toThrow('unknown state');
});
