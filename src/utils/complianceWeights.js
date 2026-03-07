function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundPercent(value) {
  return Number(value.toFixed(2));
}

function defaultStandardProgressResolver(standard) {
  const approved = toNumber(standard?.metrics?.approved, 0);
  const total = toNumber(standard?.metrics?.total, 0);

  if (total <= 0) {
    return 0;
  }

  return clamp(approved / total);
}

/**
 * Dynamically calculates completion and weights from current hierarchy data.
 * No weights are hardcoded: domain/axis/standard weights are derived from counts.
 */
export function calculateHierarchyWeights({
  perspectives = [],
  axes = [],
  standards = [],
  standardProgressResolver = defaultStandardProgressResolver,
} = {}) {
  const totalStandards = standards.length;

  const axesByPerspective = axes.reduce((acc, axis) => {
    const perspectiveId = String(axis.perspId ?? axis.perspective_id ?? '');
    if (!perspectiveId) return acc;

    if (!acc[perspectiveId]) {
      acc[perspectiveId] = [];
    }
    acc[perspectiveId].push(axis);
    return acc;
  }, {});

  const standardsByAxis = standards.reduce((acc, standard) => {
    const axisId = String(standard.axisId ?? standard.axis_id ?? '');
    if (!axisId) return acc;

    if (!acc[axisId]) {
      acc[axisId] = [];
    }
    acc[axisId].push(standard);
    return acc;
  }, {});

  let fullCompliance = 0;
  let partialCompliance = 0;
  let nonCompliance = 0;

  const perspectiveWeights = perspectives.map((perspective) => {
    const perspectiveId = String(perspective.id);
    const perspectiveAxes = axesByPerspective[perspectiveId] || [];

    const standardsInPerspective = perspectiveAxes.reduce((sum, axis) => {
      const axisStandards = standardsByAxis[String(axis.id)] || [];
      return sum + axisStandards.length;
    }, 0);

    const domainWeight = totalStandards > 0 ? standardsInPerspective / totalStandards : 0;

    const enrichedAxes = perspectiveAxes.map((axis) => {
      const axisStandards = standardsByAxis[String(axis.id)] || [];
      const axisStandardsCount = axisStandards.length;
      const axisWeightInDomain =
        standardsInPerspective > 0 ? axisStandardsCount / standardsInPerspective : 0;

      const enrichedStandards = axisStandards.map((standard) => {
        const progress = clamp(standardProgressResolver(standard));

        if (progress >= 1) {
          fullCompliance += 1;
        } else if (progress > 0) {
          partialCompliance += 1;
        } else {
          nonCompliance += 1;
        }

        return {
          ...standard,
          completion: roundPercent(progress * 100),
          standardWeightInAxis: axisStandardsCount > 0 ? 1 / axisStandardsCount : 0,
        };
      });

      const axisCompletionRatio = enrichedStandards.reduce((sum, standard) => {
        return sum + standard.standardWeightInAxis * (standard.completion / 100);
      }, 0);

      return {
        ...axis,
        standardsCount: axisStandardsCount,
        axisWeightInDomain: roundPercent(axisWeightInDomain * 100),
        completion: roundPercent(axisCompletionRatio * 100),
        standards: enrichedStandards,
      };
    });

    const perspectiveCompletionRatio = enrichedAxes.reduce((sum, axis) => {
      return sum + (axis.axisWeightInDomain / 100) * (axis.completion / 100);
    }, 0);

    return {
      ...perspective,
      standardsCount: standardsInPerspective,
      domainWeight: roundPercent(domainWeight * 100),
      completion: roundPercent(perspectiveCompletionRatio * 100),
      axes: enrichedAxes,
    };
  });

  return {
    kpis: {
      totalStandards,
      fullCompliance,
      partialCompliance,
      nonCompliance,
    },
    perspectives: perspectiveWeights,
  };
}
