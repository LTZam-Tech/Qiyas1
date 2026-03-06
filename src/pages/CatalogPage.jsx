import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Icons } from '../utils/icons.jsx';
import { PERSPECTIVES, STANDARDS_SAMPLE } from '../utils/data.js';
import Badge from '../components/Badge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import styles from './CatalogPage.module.css';

const CatalogPage = ({ isMobile }) => {
  const [expanded, setExpanded] = useState(null);

  const standardsByPerspective = useMemo(() => {
    return PERSPECTIVES.reduce((acc, perspective) => {
      acc[perspective.id] = STANDARDS_SAMPLE.filter((standard) => standard.perspId === perspective.id);
      return acc;
    }, {});
  }, []);

  const borderClass = (completion) => {
    if (completion < 50) return styles.panelButtonNon;
    if (completion < 80) return styles.panelButtonPartial;
    return '';
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>فهرس المعايير - Standards Catalog Navigator</h2>

      <div className={styles.list}>
        {PERSPECTIVES.length > 0 ? (
          PERSPECTIVES.map((perspective) => {
            const standards = standardsByPerspective[perspective.id] || [];
            const isOpen = expanded === perspective.id;

            return (
              <section key={perspective.id} className={styles.panel}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : perspective.id)}
                  aria-expanded={isOpen}
                  aria-label={`تبديل عرض المنظور ${perspective.code}`}
                  className={`${styles.panelButton} ${borderClass(perspective.completion)}`}
                >
                  <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>{Icons.chevron}</span>
                  <div className={styles.panelBody}>
                    <div className={styles.panelTitle}>
                      {perspective.code} - {perspective.name}
                    </div>
                    <div className={styles.panelMeta}>
                      {perspective.nameEn} | {perspective.axes} محاور | {perspective.standards} معيار
                    </div>
                  </div>
                  <div className={`${styles.panelProgress} ${isMobile ? styles.panelProgressMobile : ''}`}>
                    <ProgressBar value={perspective.completion} height={6} />
                  </div>
                  <span className={`${styles.panelPercent} ${isMobile ? styles.panelPercentMobile : ''}`}>
                    {perspective.completion}%
                  </span>
                </button>

                {isOpen && (
                  <div className={styles.expanded}>
                    <div className={styles.expandedList}>
                      {standards.length > 0 ? (
                        standards.map((standard) => {
                          const pct = standard.reqCount > 0 ? Math.round((standard.approved / standard.reqCount) * 100) : 0;
                          return (
                            <div key={standard.code} className={styles.standardRow}>
                              <Badge status={standard.status} />
                              <div className={styles.standardBody}>
                                <div className={styles.standardTitle}>
                                  {standard.code} - {standard.title}
                                </div>
                                <div className={styles.standardMeta}>{standard.titleEn}</div>
                              </div>
                              <div className={`${styles.standardProgress} ${isMobile ? styles.standardProgressMobile : ''}`}>
                                <ProgressBar value={pct} height={5} />
                              </div>
                              <span className={`${styles.standardCount} ${isMobile ? styles.standardCountMobile : ''}`}>
                                {standard.approved}/{standard.reqCount} شاهد
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div className={styles.emptyPerspective}>لا توجد معايير مسجلة حاليا في هذا المنظور</div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })
        ) : (
          <div className={styles.emptyState}>لا توجد بيانات معايير حاليا</div>
        )}
      </div>
    </div>
  );
};

CatalogPage.propTypes = {
  isMobile: PropTypes.bool.isRequired,
};

export default CatalogPage;
