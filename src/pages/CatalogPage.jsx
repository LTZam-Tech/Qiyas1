import { useMemo, useState } from 'react';
import { PERSPECTIVES, AXES } from '../utils/data.js';
import styles from './CatalogPage.module.css';

const CatalogPage = () => {
  const [selectedPerspective, setSelectedPerspective] = useState(null);

  const axesByPerspective = useMemo(
    () => AXES.reduce((acc, axis) => {
      if (!acc[axis.perspId]) acc[axis.perspId] = [];
      acc[axis.perspId].push(axis);
      return acc;
    }, {}),
    []
  );

  const currentAxes = selectedPerspective ? (axesByPerspective[selectedPerspective] || []) : [];
  const currentPerspective = PERSPECTIVES.find((p) => p.id === selectedPerspective);

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
              {currentAxes.map((axis) => (
                <section key={axis.id} className={styles.axisSection}>
                  <div className={styles.axisHeader}>
                    <div className={styles.axisTitle}>{axis.name}</div>
                    <div className={styles.axisLabel}>عنصر</div>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>لا توجد عناصر في هذا المجال</div>
          )}
        </div>
      )}
    </div>
  );
};

export default CatalogPage;
