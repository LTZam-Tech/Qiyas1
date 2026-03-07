import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import usersService from '../services/usersService.js';
import orgStructureService from '../services/orgStructureService.js';
import perspectivesService from '../services/perspectivesService.js';
import axesService from '../services/axesService.js';
import standardsService from '../services/standardsService.js';
import { createTask } from '../services/tasksService.js';
import styles from './TaskModal.module.css';

const PRIORITY_OPTIONS = [
  ['critical', 'حرج', 'Critical'],
  ['high', 'عالي', 'High'],
  ['medium', 'متوسط', 'Medium'],
  ['low', 'منخفض', 'Low'],
];

const EVIDENCE_OPTIONS = [
  ['file', 'ملف', 'File'],
  ['screenshot', 'لقطة شاشة', 'Screenshot'],
];

const TITLE_REGEX = /^(?=.{1,50}$)[A-Za-z\u0600-\u06FF\s]+$/u;
const DESCRIPTION_REGEX = /^(?=.{0,300}$)[A-Za-z0-9\u0600-\u06FF\s]*$/u;

const TaskModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    title: '',
    perspectiveId: '',
    axisId: '',
    standardId: '',
    evidenceType: '',
    assignedTo: '',
    targetEntity: '',
    dueDate: '',
    priority: 'medium',
    description: '',
  });

  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [units, setUnits] = useState([]);
  const [perspectives, setPerspectives] = useState([]);
  const [axes, setAxes] = useState([]);
  const [standards, setStandards] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');

  // Load standards and users on mount
  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen]);

  // Load axes when perspective changes
  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!formData.perspectiveId) {
        setAxes([]);
        setStandards([]);
        return;
      }

      try {
        const nextAxes = await axesService.getAxes(formData.perspectiveId);
        if (!active) return;
        setAxes(nextAxes);
      } catch (err) {
        if (!active) return;
        setAxes([]);
        setError(err.message || 'فشل تحميل المحاور');
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [formData.perspectiveId]);

  // Load standards when axis changes
  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!formData.axisId) {
        setStandards([]);
        return;
      }

      try {
        const nextStandards = await standardsService.getStandards(formData.axisId);
        if (!active) return;
        setStandards(nextStandards);
      } catch (err) {
        if (!active) return;
        setStandards([]);
        setError(err.message || 'فشل تحميل المعايير');
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [formData.axisId]);

  const targetEntities = useMemo(() => {
    return [
      ...departments.map((department) => ({
        value: `department:${department.id}`,
        label: `إدارة - ${department.name}${department.name_en ? ` - ${department.name_en}` : ''}`,
      })),
      ...units.map((unit) => ({
        value: `unit:${unit.id}`,
        label: `وحدة - ${unit.name}${unit.name_en ? ` - ${unit.name_en}` : ''}`,
      })),
    ];
  }, [departments, units]);

  const selectedStandard = useMemo(() => {
    return standards.find((standard) => String(standard.id) === String(formData.standardId));
  }, [formData.standardId, standards]);

  const selectedAssignee = useMemo(() => {
    return users.find((user) => String(user.id) === String(formData.assignedTo));
  }, [formData.assignedTo, users]);

  const resetForm = () => {
    setFormData({
      title: '',
      perspectiveId: '',
      axisId: '',
      standardId: '',
      evidenceType: '',
      assignedTo: '',
      targetEntity: '',
      dueDate: '',
      priority: 'medium',
      description: '',
    });
    setError('');
  };

  const parseTargetEntity = (value) => {
    if (!value.includes(':')) {
      return { targetType: '', targetId: '' };
    }
    const [targetType, targetId] = value.split(':');
    return { targetType, targetId };
  };

  const loadInitialData = async () => {
    setIsLoadingData(true);
    try {
      const [usersResult, departmentsResult, unitsResult, perspectivesResult] = await Promise.allSettled([
        usersService.getUsers(),
        orgStructureService.getDepartments(),
        orgStructureService.getUnits(),
        perspectivesService.getPerspectives(),
      ]);

      const usersData = usersResult.status === 'fulfilled' ? usersResult.value : [];
      const departmentsData = departmentsResult.status === 'fulfilled' ? departmentsResult.value : [];
      const unitsData = unitsResult.status === 'fulfilled' ? unitsResult.value : [];
      const perspectivesData = perspectivesResult.status === 'fulfilled' ? perspectivesResult.value : [];

      setUsers(usersData);
      setDepartments(departmentsData);
      setUnits(unitsData);
      setPerspectives(perspectivesData);

      if (perspectivesData.length === 0) {
        setError('تعذر تحميل المنظورات. الرجاء المحاولة مرة أخرى.');
      }
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name === 'perspectiveId') {
        return { ...prev, perspectiveId: value, axisId: '', standardId: '' };
      }

      if (name === 'axisId') {
        return { ...prev, axisId: value, standardId: '' };
      }

      return { ...prev, [name]: value };
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    const trimmedTitle = formData.title.trim();
    const trimmedDescription = formData.description.trim();

    if (!trimmedTitle) {
      setError('عنوان المهمة مطلوب');
      return;
    }
    if (!TITLE_REGEX.test(trimmedTitle)) {
      setError('عنوان المهمة يجب أن يكون أحرف عربية أو إنجليزية فقط وبحد أقصى 50 حرفًا');
      return;
    }
    if (!formData.perspectiveId) {
      setError('المنظور مطلوب');
      return;
    }
    if (!formData.axisId) {
      setError('المحور مطلوب');
      return;
    }
    if (!formData.standardId) {
      setError('المعيار مطلوب');
      return;
    }
    if (!formData.evidenceType) {
      setError('نوع الشاهد مطلوب');
      return;
    }
    if (!formData.assignedTo) {
      setError('المسؤول مطلوب');
      return;
    }
    if (!formData.targetEntity) {
      setError('الوحدة/الإدارة مطلوبة');
      return;
    }
    if (!formData.dueDate) {
      setError('الموعد النهائي مطلوب');
      return;
    }
    if (trimmedDescription && !DESCRIPTION_REGEX.test(trimmedDescription)) {
      setError('الوصف يجب أن يكون أحرف عربية/إنجليزية أو أرقام فقط وبحد أقصى 300 حرف');
      return;
    }

    const { targetType, targetId } = parseTargetEntity(formData.targetEntity);

    setIsLoading(true);
    try {
      const taskData = {
        title: trimmedTitle,
        perspectiveId: formData.perspectiveId,
        axisId: formData.axisId,
        standardId: formData.standardId,
        standardCode: selectedStandard?.code,
        standardTitle: selectedStandard?.name_ar || selectedStandard?.name || selectedStandard?.title,
        evidenceType: formData.evidenceType,
        assignedTo: formData.assignedTo,
        assignedToName: selectedAssignee?.full_name || selectedAssignee?.name || selectedAssignee?.email,
        targetType,
        targetId,
        dueDate: formData.dueDate,
        priority: formData.priority,
        description: trimmedDescription || undefined,
      };

      await createTask(taskData);

      resetForm();
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error creating task:', err);
      setError(err.message || 'فشل إنشاء المهمة. الرجاء المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={() => { resetForm(); onClose(); }}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => { resetForm(); onClose(); }}
            aria-label="إغلاق"
          >
            ×
          </button>
          <h2 className={styles.title}>إنشاء مهمة جديدة</h2>
        </div>

        {isLoadingData ? (
          <div className={styles.loadingState}>جاري تحميل البيانات...</div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.formGroup}>
              <label htmlFor="title" className={styles.label}>
                عنوان المهمة <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className={styles.input}
                placeholder="أدخل عنوان المهمة"
                disabled={isLoading}
                maxLength={50}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="perspectiveId" className={styles.label}>
                المنظور <span className={styles.required}>*</span>
              </label>
              <select
                id="perspectiveId"
                name="perspectiveId"
                value={formData.perspectiveId}
                onChange={handleChange}
                className={styles.select}
                disabled={isLoading}
              >
                <option value="">اختر المنظور</option>
                {perspectives.map((perspective) => {
                  const nameAr = perspective.name_ar || perspective.name;
                  const nameEn = perspective.name_en;
                  const displayLabel = nameEn ? `${nameAr} - ${nameEn}` : nameAr;
                  return (
                    <option key={perspective.id} value={perspective.id}>
                      {perspective.code} - {displayLabel}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="axisId" className={styles.label}>
                المحور <span className={styles.required}>*</span>
              </label>
              <select
                id="axisId"
                name="axisId"
                value={formData.axisId}
                onChange={handleChange}
                className={styles.select}
                disabled={isLoading || !formData.perspectiveId}
              >
                <option value="">
                  {formData.perspectiveId ? 'اختر المحور' : 'اختر المنظور أولاً'}
                </option>
                {axes.map((axis) => {
                  const nameAr = axis.name_ar || axis.name;
                  const nameEn = axis.name_en;
                  const displayLabel = nameEn ? `${nameAr} - ${nameEn}` : nameAr;
                  return (
                    <option key={axis.id} value={axis.id}>
                      {axis.code} - {displayLabel}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="standardId" className={styles.label}>
                المعيار <span className={styles.required}>*</span>
              </label>
              <select
                id="standardId"
                name="standardId"
                value={formData.standardId}
                onChange={handleChange}
                className={styles.select}
                disabled={isLoading || !formData.axisId}
              >
                <option value="">
                  {formData.axisId ? 'اختر المعيار' : 'اختر المحور أولاً'}
                </option>
                {standards.map((standard) => {
                  const titleAr = standard.name_ar || standard.title;
                  const titleEn = standard.name_en || standard.titleEn;
                  const displayLabel = titleEn ? `${titleAr} - ${titleEn}` : titleAr;
                  return (
                    <option key={standard.id} value={standard.id}>
                      {standard.code} - {displayLabel}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="evidenceType" className={styles.label}>
                نوع الشاهد <span className={styles.required}>*</span>
              </label>
              <select
                id="evidenceType"
                name="evidenceType"
                value={formData.evidenceType}
                onChange={handleChange}
                className={styles.select}
                disabled={isLoading}
              >
                <option value="">اختر نوع الشاهد</option>
                {EVIDENCE_OPTIONS.map(([value, label, labelEn]) => (
                  <option key={value} value={value}>
                    {labelEn ? `${label} - ${labelEn}` : label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="assignedTo" className={styles.label}>
                المسؤول <span className={styles.required}>*</span>
              </label>
              <select
                id="assignedTo"
                name="assignedTo"
                value={formData.assignedTo}
                onChange={handleChange}
                className={styles.select}
                disabled={isLoading}
              >
                <option value="">اختر المسؤول</option>
                {users.map((user) => {
                  const nameAr = user.full_name;
                  const nameEn = user.full_name_en;
                  const displayLabel = nameEn ? `${nameAr} - ${nameEn}` : nameAr;
                  return (
                    <option key={user.id} value={user.id}>
                      {displayLabel || user.email}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="targetEntity" className={styles.label}>
                الوحدة / الإدارة <span className={styles.required}>*</span>
              </label>
              <select
                id="targetEntity"
                name="targetEntity"
                value={formData.targetEntity}
                onChange={handleChange}
                className={styles.select}
                disabled={isLoading}
              >
                <option value="">اختر الوحدة أو الإدارة</option>
                {targetEntities.map((target) => (
                  <option key={target.value} value={target.value}>
                    {target.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="dueDate" className={styles.label}>
                  الموعد النهائي <span className={styles.required}>*</span>
                </label>
                <input
                  type="date"
                  id="dueDate"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={handleChange}
                  className={styles.input}
                  disabled={isLoading}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="priority" className={styles.label}>
                  الأولوية <span className={styles.required}>*</span>
                </label>
                <select
                  id="priority"
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  className={styles.select}
                  disabled={isLoading}
                >
                  {PRIORITY_OPTIONS.map(([value, label, labelEn]) => (
                    <option key={value} value={value}>
                      {labelEn ? `${label} - ${labelEn}` : label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="description" className={styles.label}>
                التعليمات / الوصف
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                className={styles.textarea}
                placeholder="أدخل تعليمات أو وصف المهمة (اختياري)"
                rows={4}
                disabled={isLoading}
                maxLength={300}
              />
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => { resetForm(); onClose(); }}
                className={styles.cancelButton}
                disabled={isLoading}
              >
                إلغاء
              </button>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={isLoading}
              >
                {isLoading ? 'جاري الإنشاء...' : 'إنشاء المهمة'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

TaskModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
};

export default TaskModal;
