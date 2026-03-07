import { useMemo, useState } from 'react';
import { PERSPECTIVES, AXES, STANDARDS_HIERARCHY } from '../utils/data.js';
import styles from './CatalogPage.module.css';

const CatalogPage = () => {
  const [selectedPerspective, setSelectedPerspective] = useState(null);

  const { axesByPerspective, standardsByAxis } = useMemo(() => {
    const axesMap = AXES.reduce((acc, axis) => {
      if (!acc[axis.perspId]) acc[axis.perspId] = [];
      acc[axis.perspId].push(axis);
      return acc;
    }, {});

    const standardsMap = STANDARDS_HIERARCHY.reduce((acc, standard) => {
      if (!acc[standard.axisId]) acc[standard.axisId] = [];
      acc[standard.axisId].push(standard);
      return acc;
    }, {});

    return { axesByPerspective: axesMap, standardsByAxis: standardsMap };
  }, []);

  const currentAxes = selectedPerspective ? (axesByPerspective[selectedPerspective] || []) : [];
  const currentPerspective = PERSPECTIVES.find((p) => p.id === selectedPerspective);

  // Badge color classes
  const getBadgeClass = (count, total) => {
    const ratio = count / total;
    if (ratio === 1) return styles.badgeGreen;
    if (ratio >= 0.5) return styles.badgeOrange;
    return styles.badgeRed;
  };

  const handlePerspectiveClick = (perspId) => {
    setSelectedPerspective(perspId === selectedPerspective ? null : perspId);
  };

  const handleBackClick = () => {
    setSelectedPerspective(null);
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>فهرس المعايير - Standards Catalog Navigator</h2>

      {!selectedPerspective ? (
        // Domain Boxes Grid
        <div className={styles.domainsGrid}>
          {PERSPECTIVES.map((perspective) => (
            <button
              key={perspective.id}
              type="button"
              onClick={() => handlePerspectiveClick(perspective.id)}
              className={styles.domainBox}
            >
              <div className={styles.domainCode}>{perspective.code}</div>
              <div className={styles.domainTitle}>{perspective.name}</div>
              <div className={styles.domainSubtitle}>{perspective.nameEn}</div>
              <div className={styles.domainStats}>
                <span>{perspective.axes} محاور</span>
                <span>•</span>
                <span>{perspective.standards} معيار</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        // Standards View
        <div className={styles.standardsView}>
          <button type="button" onClick={handleBackClick} className={styles.backButton}>
            ← العودة للمجالات
          </button>

          {currentPerspective && (
            <div className={styles.perspectiveHeader}>
              <h3 className={styles.perspectiveTitle}>
                {currentPerspective.code} - {currentPerspective.name}
              </h3>
              <p className={styles.perspectiveMeta}>{currentPerspective.nameEn}</p>
            </div>
          )}

          {currentAxes.length > 0 ? (
            <div className={styles.axesGrid}>
              {currentAxes.map((axis) => {
                const standards = standardsByAxis[axis.id] || [];

                return (
                  <section key={axis.id} className={styles.axisSection}>
                    <div className={styles.axisHeader}>
                      <div className={styles.axisTitle}>{axis.name}</div>
                      <div className={styles.axisLabel}>المحور</div>
                    </div>

                    <div className={styles.standardsList}>
                      {standards.length > 0 ? (
                        standards.map((standard) => (
                          <div key={standard.id} className={styles.standardCard}>
                            <div className={styles.standardTitle}>{standard.title}</div>
                            <div className={styles.badgesRow}>
                              <span className={`${styles.badge} ${getBadgeClass(standard.metrics.approved, standard.metrics.total)}`}>
                                {standard.metrics.approved}
                              </span>
                              <span className={`${styles.badge} ${styles.badgeBlue}`}>
                                {standard.metrics.pending}
                              </span>
                              <span className={`${styles.badge} ${styles.badgeRed}`}>
                                {standard.metrics.rejected}
                              </span>
                              <span className={`${styles.badge} ${styles.badgeGray}`}>
                                {standard.metrics.total}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className={styles.emptyAxis}>لا توجد معايير</div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>لا توجد محاور في هذا المنظور</div>
          )}
        </div>
      )}
    </div>
  );
};

export default CatalogPage;
