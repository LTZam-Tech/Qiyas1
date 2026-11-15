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

const TITLE_REGEX = /^(?=.{1,50}$)[\p{L}\p{N}\s\u060C\u061B\u061F.,()\-_/]+$/u;
const DESCRIPTION_REGEX = /^(?=.{0,300}$)[\p{L}\p{N}\s\u060C\u061B\u061F.,:;()\-_/]*$/u;

const isMockId = (value) => {
  const normalized = String(value || '');
  return (
    normalized.startsWith('user-') ||
    normalized.startsWith('dept-') ||
    normalized.startsWith('unit-') ||
    normalized.startsWith('std-')
  );
};

const TaskModal = ({ isOpen, onClose, onSuccess, lang = 'ar' }) => {
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
        setError(err.message || (lang === 'ar' ? 'فشل تحميل المحاور' : 'Failed to load axes'));
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [formData.perspectiveId, lang]);

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
        setError(err.message || (lang === 'ar' ? 'فشل تحميل المعايير' : 'Failed to load standards'));
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [formData.axisId, lang]);

  const targetEntities = useMemo(() => {
    return [
      ...departments.map((department) => ({
        value: `department:${department.id}`,
        label: lang === 'ar' 
          ? `إدارة - ${department.name}` 
          : `Department - ${department.name_en || department.name}`,
      })),
      ...units.map((unit) => ({
        value: `unit:${unit.id}`,
        label: lang === 'ar' 
          ? `وحدة - ${unit.name}` 
          : `Unit - ${unit.name_en || unit.name}`,
      })),
    ];
  }, [departments, units, lang]);

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
    setError('');
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
        setError(
          lang === 'ar'
            ? 'لا توجد منظورات بعد. أضف المنظورات والمحاور والمعايير أولاً من إدارة المنظومة، ثم عد لإنشاء المهمة.'
            : 'No perspectives found. Please add perspectives, axes and standards first, then come back to create a task.'
        );
      }
    } catch {
      setError(lang === 'ar' ? 'تعذر تحميل بيانات النموذج. الرجاء المحاولة مرة أخرى.' : 'Failed to load form data. Please try again.');
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

    if (
      isMockId(formData.assignedTo) ||
      isMockId(formData.standardId) ||
      isMockId(formData.axisId) ||
      isMockId(formData.perspectiveId) ||
      isMockId(targetId)
    ) {
      setError(lang === 'ar' ? 'تم تحميل بيانات تجريبية. يرجى تحديث الصفحة والتأكد من اتصال الـ API.' : 'Mock IDs detected. Refresh and ensure API connectivity.');
      return;
    }

    const selectedStandardTitle = selectedStandard?.name_ar || selectedStandard?.name || selectedStandard?.title;
    if (!selectedStandardTitle) {
      setError(lang === 'ar' ? 'لم يتم العثور على بيانات المعيار المحدد' : 'Selected standard data is missing');
      return;
    }

    setIsLoading(true);
    try {
      const taskData = {
        title: trimmedTitle,
        perspectiveId: formData.perspectiveId,
        axisId: formData.axisId,
        standardId: formData.standardId,
        standardCode: selectedStandard?.code,
        standardTitle: selectedStandardTitle,
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
      setError(err.message || (lang === 'ar' ? 'فشل إنشاء المهمة. الرجاء المحاولة مرة أخرى.' : 'Failed to create task. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={() => { resetForm(); onClose(); }}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headingText}>
            <h2 className={styles.title}>{lang === 'ar' ? 'إنشاء مهمة جديدة' : 'Create New Task'}</h2>
            <p className={styles.subtitle}>
              {lang === 'ar'
                ? 'حدد المعيار والمسؤول والموعد النهائي للشاهد المطلوب.'
                : 'Choose the standard, owner and due date for the required evidence.'}
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => { resetForm(); onClose(); }}
            aria-label="إغلاق"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {isLoadingData ? (
          <div className={styles.loadingState}>{lang === 'ar' ? 'جاري تحميل البيانات...' : 'Loading data...'}</div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label htmlFor="title" className={styles.label}>
                {lang === 'ar' ? 'عنوان المهمة' : 'Task Title'} <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className={styles.input}
                placeholder={lang === 'ar' ? 'أدخل عنوان المهمة' : 'Enter task title'}
                disabled={isLoading}
                maxLength={50}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="perspectiveId" className={styles.label}>
                {lang === 'ar' ? 'المنظور' : 'Perspective'} <span className={styles.required}>*</span>
              </label>
              <select
                id="perspectiveId"
                name="perspectiveId"
                value={formData.perspectiveId}
                onChange={handleChange}
                className={styles.select}
                disabled={isLoading}
              >
                <option value="">{lang === 'ar' ? 'اختر المنظور' : 'Select Perspective'}</option>
                {perspectives.map((perspective) => {
                  const displayLabel = lang === 'ar' 
                    ? (perspective.name_ar || perspective.name) 
                    : (perspective.name_en || perspective.name);
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
                {lang === 'ar' ? 'المحور' : 'Axis'} <span className={styles.required}>*</span>
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
                  {formData.perspectiveId ? (lang === 'ar' ? 'اختر المحور' : 'Select Axis') : (lang === 'ar' ? 'اختر المنظور أولاً' : 'Select Perspective first')}
                </option>
                {axes.map((axis) => {
                  const displayLabel = lang === 'ar' 
                    ? (axis.name_ar || axis.name) 
                    : (axis.name_en || axis.name);
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
                {lang === 'ar' ? 'المعيار' : 'Standard'} <span className={styles.required}>*</span>
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
                  {formData.axisId ? (lang === 'ar' ? 'اختر المعيار' : 'Select Standard') : (lang === 'ar' ? 'اختر المحور أولاً' : 'Select Axis first')}
                </option>
                {standards.map((standard) => {
                  const displayLabel = lang === 'ar' 
                    ? (standard.name_ar || standard.title) 
                    : (standard.name_en || standard.titleEn);
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
                {lang === 'ar' ? 'نوع الشاهد' : 'Evidence Type'} <span className={styles.required}>*</span>
              </label>
              <select
                id="evidenceType"
                name="evidenceType"
                value={formData.evidenceType}
                onChange={handleChange}
                className={styles.select}
                disabled={isLoading}
              >
                <option value="">{lang === 'ar' ? 'اختر نوع الشاهد' : 'Select Evidence Type'}</option>
                {EVIDENCE_OPTIONS.map(([value, label, labelEn]) => (
                  <option key={value} value={value}>
                    {lang === 'ar' ? label : labelEn}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="assignedTo" className={styles.label}>
                {lang === 'ar' ? 'المسؤول' : 'Responsible'} <span className={styles.required}>*</span>
              </label>
              <select
                id="assignedTo"
                name="assignedTo"
                value={formData.assignedTo}
                onChange={handleChange}
                className={styles.select}
                disabled={isLoading}
              >
                <option value="">{lang === 'ar' ? 'اختر المسؤول' : 'Select Responsible'}</option>
                {users.map((user) => {
                  const displayLabel = lang === 'ar' 
                    ? user.full_name 
                    : (user.full_name_en || user.full_name);
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
                {lang === 'ar' ? 'الوحدة / الإدارة' : 'Unit / Department'} <span className={styles.required}>*</span>
              </label>
              <select
                id="targetEntity"
                name="targetEntity"
                value={formData.targetEntity}
                onChange={handleChange}
                className={styles.select}
                disabled={isLoading}
              >
                <option value="">{lang === 'ar' ? 'اختر الوحدة أو الإدارة' : 'Select Unit or Department'}</option>
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
                  {lang === 'ar' ? 'الموعد النهائي' : 'Due Date'} <span className={styles.required}>*</span>
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
                  {lang === 'ar' ? 'الأولوية' : 'Priority'} <span className={styles.required}>*</span>
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
                      {lang === 'ar' ? label : labelEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label htmlFor="description" className={styles.label}>
                {lang === 'ar' ? 'التعليمات / الوصف' : 'Instructions / Description'}
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                className={styles.textarea}
                placeholder={lang === 'ar' ? 'أدخل تعليمات أو وصف المهمة (اختياري)' : 'Enter instructions or task description (optional)'}
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
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={isLoading}
              >
                {isLoading ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : (lang === 'ar' ? 'إنشاء المهمة' : 'Create Task')}
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
