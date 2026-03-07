import { useMemo, useState } from 'react';
import { PERSPECTIVES, AXES, STANDARD_DETAILS } from '../utils/data.js';
import { Icons } from '../utils/icons.jsx';
import styles from './CatalogPage.module.css';

const CatalogPage = () => {
  const [selectedPerspective, setSelectedPerspective] = useState(null);
  const [selectedAxis, setSelectedAxis] = useState(null);

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
    if (selectedAxis) {
      setSelectedAxis(null);
    } else {
      setSelectedPerspective(null);
    }
  };

  const handleAxisClick = (axisId) => {
    setSelectedAxis(axisId);
  };

  const currentAxis = AXES.find((a) => a.id === selectedAxis);
  const standardDetail = selectedAxis ? STANDARD_DETAILS[selectedAxis] : null;

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>
        {Icons.bookmarkIcon}
        <span>فهرس المقاييس - Standards Catalog Navigator</span>
      </h2>

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
              <div className={styles.domainIcon}>{Icons.layersIcon}</div>
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
      ) : selectedAxis && standardDetail ? (
        // Standard Details View
        <div className={styles.standardsView}>
          <button type="button" onClick={handleBackClick} className={styles.backButton}>
            {Icons.arrowLeft}
            <span>العودة للعناصر</span>
          </button>

          {currentAxis && (
            <div className={styles.standardDetailCard}>
              <div className={styles.standardHeader}>
                {Icons.documentIcon}
                <div>
                  <h3 className={styles.standardCode}>{currentAxis.code}</h3>
                  <h2 className={styles.standardTitle}>{currentAxis.name}</h2>
                  <p className={styles.standardTitleEn}>{currentAxis.nameEn}</p>
                </div>
              </div>

              <div className={styles.standardSection}>
                <h4 className={styles.sectionHeading}>
                  {Icons.target}
                  <span>الهدف</span>
                </h4>
                <p className={styles.sectionContent}>{standardDetail.goal}</p>
              </div>

              <div className={styles.standardSection}>
                <h4 className={styles.sectionHeading}>
                  {Icons.checklistIcon}
                  <span>متطلبات التطبيق</span>
                </h4>
                {standardDetail.requirements.map((req, idx) => (
                  <div key={idx} className={styles.requirementBlock}>
                    <p className={styles.requirementTitle}>{idx + 1}) {req.title}</p>
                    {req.items && (
                      <ul className={styles.requirementList}>
                        {req.items.map((item, itemIdx) => (
                          <li key={itemIdx}>{String.fromCharCode(1571 + itemIdx)}. {item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.standardSection}>
                <h4 className={styles.sectionHeading}>
                  {Icons.clipboardIcon}
                  <span>مستندات الإثبات</span>
                </h4>
                <ul className={styles.evidenceList}>
                  {standardDetail.evidence.map((item, idx) => (
                    <li key={idx}>{idx + 1}) {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Axes View
        <div className={styles.standardsView}>
          <button type="button" onClick={handleBackClick} className={styles.backButton}>
            {Icons.arrowLeft}
            <span>العودة للمجالات</span>
          </button>

          {currentPerspective && (
            <div className={styles.perspectiveHeader}>
              <div className={styles.perspectiveHeaderContent}>
                {Icons.layersIcon}
                <div>
                  <h3 className={styles.perspectiveTitle}>
                    {currentPerspective.code} - {currentPerspective.name}
                  </h3>
                  <p className={styles.perspectiveMeta}>{currentPerspective.nameEn}</p>
                </div>
              </div>
            </div>
          )}

          {currentAxes.length > 0 ? (
            <div className={styles.axesGrid}>
              {currentAxes.map((axis) => (
                <button
                  key={axis.id}
                  type="button"
                  onClick={() => handleAxisClick(axis.id)}
                  className={styles.axisSection}
                >
                  <div className={styles.axisHeader}>
                    <div className={styles.axisIconWrapper}>{Icons.folderIcon}</div>
                    <div className={styles.axisTitle}>{axis.name}</div>
                    <div className={styles.axisLabel}>{axis.code}</div>
                  </div>
                  {STANDARD_DETAILS[axis.id] && (
                    <div className={styles.axisPreview}>
                      <span>انقر لعرض التفاصيل</span>
                      {Icons.arrowRight}
                    </div>
                  )}
                </button>
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
