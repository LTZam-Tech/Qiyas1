import { LinkInput, RequirementInput, evaluateCompleteness, evaluateRequirement } from '../completeness';

const req = (id: string, proofItemIds: string[] = [], applicable = true, standardId = 'S1'): RequirementInput => ({ id, standardId, applicable, proofItemIds });
const link = (requirementId: string, proofItemId: string | null, reviewStatus: LinkInput['reviewStatus'], submissionStatus: LinkInput['submissionStatus'] = null): LinkInput => ({
  requirementId, proofItemId, reviewStatus, submissionStatus: reviewStatus === 'accepted' && submissionStatus === null ? 'not_posted' : submissionStatus,
});

describe('requirement readiness', () => {
  it('BR-CMP-01: uploading (draft) never counts', () => {
    expect(evaluateRequirement(req('R1', ['P1']), [link('R1', 'P1', 'draft')]).readiness).toBe('not_started');
  });

  it('submitted evidence means in progress, not ready', () => {
    expect(evaluateRequirement(req('R1', ['P1']), [link('R1', 'P1', 'submitted')]).readiness).toBe('in_progress');
  });

  it('ready only when every expected proof item is covered by accepted evidence', () => {
    const r = req('R1', ['P1', 'P2']);
    const half = evaluateRequirement(r, [link('R1', 'P1', 'accepted')]);
    expect(half.readiness).toBe('in_progress');
    expect(half.coveredProofItems).toBe(1);
    expect(evaluateRequirement(r, [link('R1', 'P1', 'accepted'), link('R1', 'P2', 'accepted')]).readiness).toBe('ready');
  });

  it('two accepted files for the same proof item still leave the other item missing', () => {
    const r = req('R1', ['P1', 'P2']);
    expect(evaluateRequirement(r, [link('R1', 'P1', 'accepted'), link('R1', 'P1', 'accepted')]).readiness).toBe('in_progress');
  });

  it('a requirement without proof items is ready with any accepted link', () => {
    expect(evaluateRequirement(req('R1'), [link('R1', null, 'accepted')]).readiness).toBe('ready');
  });

  it('rejected, revoked and superseded evidence stops counting', () => {
    const r = req('R1', ['P1']);
    expect(evaluateRequirement(r, [link('R1', 'P1', 'rejected')]).readiness).toBe('in_progress');
    expect(evaluateRequirement(r, [link('R1', 'P1', 'revoked')]).readiness).toBe('in_progress');
  });

  it('not applicable wins over evidence', () => {
    expect(evaluateRequirement(req('R1', ['P1'], false), [link('R1', 'P1', 'accepted')]).readiness).toBe('not_applicable');
  });

  it('posting state and changed-after-posting flag (BR-SUB-05)', () => {
    const r = req('R1', ['P1', 'P2']);
    expect(evaluateRequirement(r, [link('R1', 'P1', 'accepted', 'posted'), link('R1', 'P2', 'accepted')]).posting).toBe('partial');
    expect(evaluateRequirement(r, [link('R1', 'P1', 'accepted', 'posted')]).posting).toBe('full');
    expect(evaluateRequirement(r, [link('R1', 'P1', 'superseded', 'posted')]).postedEvidenceChanged).toBe(true);
  });
});

describe('roll-ups', () => {
  const hierarchy = {
    standardAxis: new Map([['S1', 'A1'], ['S2', 'A1'], ['S3', 'A2']]),
    axisPerspective: new Map([['A1', 'P1'], ['A2', 'P1']]),
  };
  const requirements = [
    req('R1', ['x'], true, 'S1'),
    req('R2', ['y'], true, 'S1'),
    req('R3', [], false, 'S2'),
    req('R4', [], true, 'S3'),
  ];
  const links = [link('R1', 'x', 'accepted', 'posted'), link('R2', 'y', 'submitted'), link('R4', null, 'accepted')];
  const result = evaluateCompleteness(requirements, links, hierarchy);

  it('standard readiness = ready ÷ applicable', () => {
    expect(result.standards.get('S1')?.readinessPct).toBe(50);
    expect(result.standards.get('S2')?.readinessPct).toBeNull(); // nothing applicable
  });

  it('excludes not-applicable requirements from every level', () => {
    expect(result.cycle.applicable).toBe(3);
    expect(result.cycle.notApplicable).toBe(1);
    expect(result.cycle.readinessPct).toBe(66.7);
    expect(result.perspectives.get('P1')?.ready).toBe(2);
  });

  it('posting progress is separate from readiness', () => {
    expect(result.cycle.acceptedLinks).toBe(2);
    expect(result.cycle.postedLinks).toBe(1);
    expect(result.cycle.postingPct).toBe(50);
  });
});
