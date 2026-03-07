import { env } from '../config/env.js';
import { httpClient, request } from '../lib/httpClient.js';
import { TASKS_DATA } from '../utils/data.js';
import errorLogger from './errorLogger.js';
import { TASK_EVIDENCE_TYPES, TASK_PRIORITIES } from '../constants/taskValidation.js';

const getResponseData = (response) => response?.data || response || {};

const TITLE_REGEX = /^(?=.{1,50}$)[\p{L}\s]+$/u;
const DESCRIPTION_REGEX = /^(?=.{0,300}$)[\p{L}\p{N}\s]*$/u;
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

export async function getTasks(filter = {}) {
  if (env.useMockApi) {
    const status = filter.status;
    if (!status || status === 'all') {
      return TASKS_DATA;
    }
    return TASKS_DATA.filter((task) => task.status === status);
  }

  try {
    return await httpClient.get('/tasks', filter);
  } catch (err) {
    errorLogger.logWarning('Tasks API failed, using mock data fallback', 'backend', {
      message: err?.message,
      status: err?.status,
    });
    const status = filter.status;
    if (!status || status === 'all') {
      return TASKS_DATA;
    }
    return TASKS_DATA.filter((task) => task.status === status);
  }
}

// Create new task
export async function createTask(taskData) {
  validateTaskPayload(taskData);

  if (env.useMockApi) {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const mockTask = {
      id: Date.now(),
      code: taskData.standardCode || String(taskData.standardId),
      req: taskData.evidenceType === 'file' ? 'ملف' : 'لقطة شاشة',
      assignee: taskData.assignedToName || String(taskData.assignedTo),
      due: taskData.dueDate,
      status: 'active',
      priority: taskData.priority,
      title: taskData.title,
      perspectiveId: taskData.perspectiveId,
      axisId: taskData.axisId,
      standardId: taskData.standardId,
      targetType: taskData.targetType,
      targetId: taskData.targetId,
      description: taskData.description,
    };

    TASKS_DATA.unshift(mockTask);

    return {
      ...mockTask,
      created_at: new Date().toISOString(),
    };
  }
  
  const response = await request('/tasks', {
    method: 'POST',
    body: JSON.stringify(taskData),
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
