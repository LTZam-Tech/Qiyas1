import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { PERSPECTIVES, AXES, STANDARD_DETAILS } from '../utils/data.js';
import { Icons } from '../utils/icons.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StateView from '../components/StateView.jsx';
import styles from './CatalogPage.module.css';

const AXES_BY_PERSPECTIVE = AXES.reduce((acc, axis) => {
  (acc[axis.perspId] ||= []).push(axis);
  return acc;
}, {});

const CatalogPage = ({ lang }) => {
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const [perspId, setPerspId] = useState(null);
  const [axisId, setAxisId] = useState(null);
  const [query, setQuery] = useState('');

  const perspective = PERSPECTIVES.find((p) => p.id === perspId);
  const axis = AXES.find((a) => a.id === axisId);
  const axes = perspId ? AXES_BY_PERSPECTIVE[perspId] || [] : [];
  const detail = axisId ? STANDARD_DETAILS[axisId] : null;
  const name = (x) => (lang === 'ar' ? x.name : x.nameEn);

  const visiblePerspectives = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PERSPECTIVES;
    return PERSPECTIVES.filter((p) => [p.name, p.nameEn, p.code].some((v) => v.toLowerCase().includes(q)));
  }, [query]);

  const openPerspective = (id) => {
    setPerspId(id);
    setAxisId(null);
  };

  const crumbs = (
    <nav className={styles.crumbs} aria-label={t('موقعك في الفهرس', 'Catalog location')}>
      <button type="button" onClick={() => openPerspective(null)} className={styles.crumbLink}>
        {t('كل المناظير', 'All perspectives')}
      </button>
      {perspective && (
        <>
          <span className={styles.crumbSep} aria-hidden="true">{Icons.arrowRight}</span>
          {axis ? (
            <button type="button" onClick={() => setAxisId(null)} className={styles.crumbLink}>{name(perspective)}</button>
          ) : (
            <span className={styles.crumbCurrent}>{name(perspective)}</span>
          )}
        </>
      )}
      {axis && (
        <>
          <span className={styles.crumbSep} aria-hidden="true">{Icons.arrowRight}</span>
          <span className={styles.crumbCurrent}>{name(axis)}</span>
        </>
      )}
    </nav>
  );

  return (
    <div className="q-page">
      <PageHeader
        title={t('فهرس المعايير', 'Standards catalog')}
        subtitle={t('تصفح المناظير، ثم المحاور، ثم متطلبات كل معيار والأدلة المطلوبة له.', 'Browse perspectives, then axes, then each standard’s requirements and the evidence it needs.')}
        actions={
          !perspId ? (
            <label className="q-search">
              {Icons.searchIcon}
              <span className="q-sr-only">{t('بحث في المناظير', 'Search perspectives')}</span>
              <input type="search" className="q-input" placeholder={t('بحث في المناظير...', 'Search perspectives...')} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          ) : null
        }
      />

      {perspId && crumbs}

      {!perspId && (
        visiblePerspectives.length === 0 ? (
          <div className="q-card"><StateView icon="searchIcon" title={t('لا توجد نتائج', 'No matches')} /></div>
        ) : (
          <div className={styles.grid}>
            {visiblePerspectives.map((p) => (
              <button key={p.id} type="button" className={`q-card q-card-interactive ${styles.domain}`} onClick={() => openPerspective(p.id)}>
                <div className={styles.domainTop}>
                  <span className={`q-icon-chip q-tone-brand ${styles.domainIcon}`}>{Icons.layersIcon}</span>
                  <span className="q-code">{p.code}</span>
                </div>
                <span className={styles.domainTitle}>{name(p)}</span>
                <span className={styles.domainStats}>
                  <span>{t(`${p.axes} محاور`, `${p.axes} axes`)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t(`${p.standards} معايير`, `${p.standards} standards`)}</span>
                  <span className={styles.domainArrow}>{Icons.arrowRight}</span>
                </span>
              </button>
            ))}
          </div>
        )
      )}

      {perspId && !axisId && (
        axes.length === 0 ? (
          <div className="q-card"><StateView icon="folderIcon" title={t('لا توجد محاور في هذا المنظور', 'No axes in this perspective')} /></div>
        ) : (
          <ul className={`q-card ${styles.axisList}`}>
            {axes.map((a) => (
              <li key={a.id}>
                <button type="button" className={styles.axisRow} onClick={() => setAxisId(a.id)}>
                  <span className={`q-icon-chip q-tone-neutral ${styles.axisIcon}`}>{Icons.folderIcon}</span>
                  <span className={styles.axisText}>
                    <span className={styles.axisName}>{name(a)}</span>
                    <span className={styles.axisSub}>
                      {STANDARD_DETAILS[a.id] ? t('المتطلبات والأدلة متاحة', 'Requirements and evidence available') : t('التفاصيل غير متاحة بعد', 'Details not added yet')}
                    </span>
                  </span>
                  <span className="q-code">{a.code}</span>
                  <span className={styles.axisArrow}>{Icons.arrowRight}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {axis && (
        detail ? (
          <article className={`q-card ${styles.detail}`}>
            <header className={styles.detailHead}>
              <span className="q-code">{axis.code}</span>
              <h2 className={styles.detailTitle}>{name(axis)}</h2>
            </header>

            <section className={styles.block}>
              <h3 className={styles.blockTitle}><span className={`q-icon-chip q-tone-brand ${styles.blockIcon}`}>{Icons.target}</span>{t('الهدف', 'Goal')}</h3>
              <p className={styles.goal}>{detail.goal}</p>
            </section>

            <section className={styles.block}>
              <h3 className={styles.blockTitle}><span className={`q-icon-chip q-tone-info ${styles.blockIcon}`}>{Icons.checklistIcon}</span>{t('متطلبات التطبيق', 'Requirements')}</h3>
              <ol className={styles.reqList}>
                {detail.requirements.map((req) => (
                  <li key={req.title}>
                    <p className={styles.reqTitle}>{req.title}</p>
                    {req.items && (
                      <ul className={styles.reqItems}>
                        {req.items.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            <section className={styles.block}>
              <h3 className={styles.blockTitle}><span className={`q-icon-chip q-tone-gold ${styles.blockIcon}`}>{Icons.clipboardIcon}</span>{t('الأدلة المطلوبة', 'Evidence required')}</h3>
              <ul className={styles.evidenceList}>
                {detail.evidence.map((item) => (
                  <li key={item}><span className={styles.check}>{Icons.check}</span>{item}</li>
                ))}
              </ul>
            </section>
          </article>
        ) : (
          <div className="q-card">
            <StateView icon="documentIcon" title={t('التفاصيل غير متاحة بعد', 'Details not added yet')} message={t('لم تتم إضافة متطلبات هذا المحور إلى الفهرس.', 'This axis has no requirements in the catalog yet.')} />
          </div>
        )
      )}
    </div>
  );
};

CatalogPage.propTypes = {
  lang: PropTypes.oneOf(['ar', 'en']).isRequired,
};

export default CatalogPage;
