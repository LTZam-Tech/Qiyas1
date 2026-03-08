import { httpClient, request } from '../lib/httpClient.js';
import errorLogger from './errorLogger.js';
import { TASK_EVIDENCE_TYPES, TASK_PRIORITIES } from '../constants/taskValidation.js';

const getResponseData = (response) => response?.data || response || {};

const TITLE_REGEX = /^(?=.{1,50}$)[\p{L}\p{N}\s\u060C\u061B\u061F.,()\-_/]+$/u;
const DESCRIPTION_REGEX = /^(?=.{0,300}$)[\p{L}\p{N}\s\u060C\u061B\u061F.,:;()\-_/]*$/u;
const VALID_PRIORITIES = new Set(TASK_PRIORITIES);
const VALID_EVIDENCE_TYPES = new Set(TASK_EVIDENCE_TYPES);

const createValidationError = (message) => {
  const error = new Error(message);
  error.status = 400;
  error.type = 'validation-error';
  return error;
};

function validateTaskPayload(taskData) {
  const title = String(taskData.title || '').trim();
  const description = String(taskData.description || '').trim();

  if (!title) {
    throw createValidationError('عنوان المهمة مطلوب');
  }
  if (!TITLE_REGEX.test(title)) {
    throw createValidationError('عنوان المهمة يجب أن يكون أحرف عربية أو إنجليزية فقط وبحد أقصى 50 حرفًا');
  }

  if (!taskData.perspectiveId) {
    throw createValidationError('المنظور مطلوب');
  }
  if (!taskData.axisId) {
    throw createValidationError('المحور مطلوب');
  }
  if (!taskData.standardId) {
    throw createValidationError('المعيار مطلوب');
  }
  if (!VALID_EVIDENCE_TYPES.has(taskData.evidenceType)) {
    throw createValidationError('نوع الشاهد يجب أن يكون ملف أو لقطة شاشة');
  }
  if (!taskData.assignedTo) {
    throw createValidationError('المسؤول مطلوب');
  }
  if (!taskData.targetType || !taskData.targetId) {
    throw createValidationError('الوحدة/الإدارة مطلوبة');
  }
  if (!taskData.dueDate) {
    throw createValidationError('الموعد النهائي مطلوب');
  }
  if (!VALID_PRIORITIES.has(taskData.priority)) {
    throw createValidationError('الأولوية غير صحيحة');
  }
  if (description && !DESCRIPTION_REGEX.test(description)) {
    throw createValidationError('الوصف يجب أن يكون أحرف عربية/إنجليزية أو أرقام فقط وبحد أقصى 300 حرف');
  }
}

function normalizePriority(priority) {
  if (priority === 'normal') {
    return 'medium';
  }
  return priority;
}

export async function getTasks(filter = {}) {
  try {
    const response = await httpClient.get('/tasks', filter);
    const data = getResponseData(response);
    return Array.isArray(data.tasks) ? data.tasks : [];
  } catch (err) {
    errorLogger.logWarning('Tasks API failed', 'backend', {
      message: err?.message,
      status: err?.status,
    });
    throw err;
  }
}

// Create new task
export async function createTask(taskData) {
  const normalizedTaskData = {
    ...taskData,
    priority: normalizePriority(taskData.priority),
  };

  validateTaskPayload(normalizedTaskData);

  const response = await request('/tasks', {
    method: 'POST',
    body: JSON.stringify(normalizedTaskData),
  });
  const data = getResponseData(response);
  return data.task || null;
}

// Update existing task
export async function updateTask(taskId, taskData) {
  const response = await request(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(taskData),
  });
  const data = getResponseData(response);
  return data.task || null;
}

// Delete task
export async function deleteTask(taskId) {
  const response = await request(`/tasks/${taskId}`, {
    method: 'DELETE',
  });
  return Boolean(response?.success ?? true);
}

// Get single task by ID
export async function getTaskById(taskId) {
  const response = await request(`/tasks/${taskId}`);
  const data = getResponseData(response);
  return data.task || null;
}
