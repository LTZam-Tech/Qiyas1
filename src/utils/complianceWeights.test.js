import { calculateHierarchyWeights } from './complianceWeights.js';

describe('calculateHierarchyWeights', () => {
  it('derives domain, axis, and standard weights dynamically from counts', () => {
    const perspectives = [{ id: 1, code: 'D1' }];
    const axes = [
      { id: 11, code: 'A1.1', perspId: 1 },
      { id: 12, code: 'A1.2', perspId: 1 },
      { id: 13, code: 'A1.3', perspId: 1 },
    ];
    const standards = [
      { id: 1, code: '1.1.1', axisId: 11, metrics: { approved: 1, total: 1 } },
      { id: 2, code: '1.1.2', axisId: 11, metrics: { approved: 1, total: 1 } },
      { id: 3, code: '1.2.1', axisId: 12, metrics: { approved: 1, total: 1 } },
      { id: 4, code: '1.2.2', axisId: 12, metrics: { approved: 1, total: 1 } },
      { id: 5, code: '1.3.1', axisId: 13, metrics: { approved: 1, total: 1 } },
      { id: 6, code: '1.3.2', axisId: 13, metrics: { approved: 1, total: 1 } },
      { id: 7, code: '1.3.3', axisId: 13, metrics: { approved: 1, total: 1 } },
    ];

    const result = calculateHierarchyWeights({ perspectives, axes, standards });
    const domain = result.perspectives[0];

    expect(domain.domainWeight).toBe(100);
    expect(domain.completion).toBe(100);

    const axisA11 = domain.axes.find((axis) => axis.code === 'A1.1');
    const axisA12 = domain.axes.find((axis) => axis.code === 'A1.2');
    const axisA13 = domain.axes.find((axis) => axis.code === 'A1.3');

    expect(axisA11.axisWeightInDomain).toBeCloseTo(28.57, 2);
    expect(axisA12.axisWeightInDomain).toBeCloseTo(28.57, 2);
    expect(axisA13.axisWeightInDomain).toBeCloseTo(42.86, 2);

    expect(axisA11.standards[0].standardWeightInAxis).toBeCloseTo(0.5, 5);
    expect(axisA13.standards[0].standardWeightInAxis).toBeCloseTo(1 / 3, 5);
  });

  it('computes domain completion from completed standards only', () => {
    const perspectives = [{ id: 1, code: 'D1' }];
    const axes = [
      { id: 11, code: 'A1.1', perspId: 1 },
      { id: 12, code: 'A1.2', perspId: 1 },
      { id: 13, code: 'A1.3', perspId: 1 },
    ];
    const standards = [
      { id: 1, code: '1.1.1', axisId: 11, metrics: { approved: 0, total: 1 } },
      { id: 2, code: '1.1.2', axisId: 11, metrics: { approved: 1, total: 1 } },
      { id: 3, code: '1.2.1', axisId: 12, metrics: { approved: 0, total: 1 } },
      { id: 4, code: '1.2.2', axisId: 12, metrics: { approved: 0, total: 1 } },
      { id: 5, code: '1.3.1', axisId: 13, metrics: { approved: 0, total: 1 } },
      { id: 6, code: '1.3.2', axisId: 13, metrics: { approved: 0, total: 1 } },
      { id: 7, code: '1.3.3', axisId: 13, metrics: { approved: 0, total: 1 } },
    ];

    const result = calculateHierarchyWeights({ perspectives, axes, standards });

    expect(result.kpis.totalStandards).toBe(7);
    expect(result.kpis.fullCompliance).toBe(1);
    expect(result.kpis.nonCompliance).toBe(6);
    expect(result.perspectives[0].completion).toBeCloseTo(14.29, 2);
  });
});
