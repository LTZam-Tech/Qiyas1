import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import standardsService from '../services/standardsService.js';
import usersService from '../services/usersService.js';
import { createTask } from '../services/tasksService.js';
import styles from './TaskModal.module.css';

const PRIORITY_OPTIONS = [
  ['low', 'منخفض'],
  ['normal', 'عادي'],
  ['high', 'عالي'],
  ['critical', 'حرج'],
];

const TaskModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    title: '',
    standardId: '',
    evidenceRequirementId: '',
    assignedTo: '',
    dueDate: '',
    priority: 'normal',
    description: '',
  });

  const [standards, setStandards] = useState([]);
  const [evidenceRequirements, setEvidenceRequirements] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');

  // Load standards and users on mount
  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen]);

  // Load evidence requirements when standard changes
  useEffect(() => {
    if (formData.standardId) {
      loadEvidenceRequirements(formData.standardId);
    } else {
      setEvidenceRequirements([]);
      setFormData((prev) => ({ ...prev, evidenceRequirementId: '' }));
    }
  }, [formData.standardId]);

  const loadInitialData = async () => {
    setIsLoadingData(true);
    try {
      const [standardsData, usersData] = await Promise.all([
        standardsService.getStandards(),
        usersService.getUsers(),
      ]);
      setStandards(standardsData);
      setUsers(usersData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('فشل تحميل البيانات. الرجاء المحاولة مرة أخرى.');
    } finally {
      setIsLoadingData(false);
    }
  };

  const loadEvidenceRequirements = async (standardId) => {
    try {
      const standard = await standardsService.getStandardById(standardId);
      setEvidenceRequirements(standard.evidence_requirements || []);
    } catch (err) {
      console.error('Error loading evidence requirements:', err);
      setEvidenceRequirements([]);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.title.trim()) {
      setError('العنوان مطلوب');
      return;
    }
    if (!formData.standardId) {
      setError('المعيار مطلوب');
      return;
    }
    if (!formData.evidenceRequirementId) {
      setError('الشاهد المطلوب مطلوب');
      return;
    }
    if (!formData.assignedTo) {
      setError('المسؤول مطلوب');
      return;
    }
    if (!formData.dueDate) {
      setError('الموعد النهائي مطلوب');
      return;
    }

    setIsLoading(true);
    try {
      const taskData = {
        title: formData.title,
        standardId: formData.standardId,
        evidenceRequirementId: formData.evidenceRequirementId,
        assignedTo: formData.assignedTo,
        dueDate: formData.dueDate,
        priority: formData.priority,
        description: formData.description || undefined,
      };

      await createTask(taskData);
      
      // Reset form
      setFormData({
        title: '',
        standardId: '',
        evidenceRequirementId: '',
        assignedTo: '',
        dueDate: '',
        priority: 'normal',
        description: '',
      });
      
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
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
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
              />
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
                disabled={isLoading}
              >
                <option value="">اختر المعيار</option>
                {standards.map((standard) => (
                  <option key={standard.id} value={standard.id}>
                    {standard.code} - {standard.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="evidenceRequirementId" className={styles.label}>
                الشاهد المطلوب <span className={styles.required}>*</span>
              </label>
              <select
                id="evidenceRequirementId"
                name="evidenceRequirementId"
                value={formData.evidenceRequirementId}
                onChange={handleChange}
                className={styles.select}
                disabled={isLoading || !formData.standardId}
              >
                <option value="">
                  {formData.standardId ? 'اختر الشاهد المطلوب' : 'اختر المعيار أولاً'}
                </option>
                {evidenceRequirements.map((req) => (
                  <option key={req.id} value={req.id}>
                    {req.title}
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
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.name || user.email}
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
                  {PRIORITY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
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
              />
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                onClick={onClose}
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
