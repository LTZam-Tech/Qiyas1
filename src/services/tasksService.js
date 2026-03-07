import { env } from '../config/env.js';
import { httpClient, request } from '../lib/httpClient.js';
import { TASKS_DATA } from '../utils/data.js';

const TITLE_REGEX = /^(?=.{1,50}$)[A-Za-z\u0600-\u06FF\s]+$/u;
const DESCRIPTION_REGEX = /^(?=.{0,300}$)[A-Za-z0-9\u0600-\u06FF\s]*$/u;
const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
const VALID_EVIDENCE_TYPES = new Set(['file', 'screenshot']);

function validateTaskPayload(taskData) {
  const title = String(taskData.title || '').trim();
  const description = String(taskData.description || '').trim();

  if (!title) {
    throw new Error('عنوان المهمة مطلوب');
  }
  if (!TITLE_REGEX.test(title)) {
    throw new Error('عنوان المهمة يجب أن يكون أحرف عربية أو إنجليزية فقط وبحد أقصى 50 حرفًا');
  }

  if (!taskData.perspectiveId) {
    throw new Error('المنظور مطلوب');
  }
  if (!taskData.axisId) {
    throw new Error('المحور مطلوب');
  }
  if (!taskData.standardId) {
    throw new Error('المعيار مطلوب');
  }
  if (!VALID_EVIDENCE_TYPES.has(taskData.evidenceType)) {
    throw new Error('نوع الشاهد يجب أن يكون ملف أو لقطة شاشة');
  }
  if (!taskData.assignedTo) {
    throw new Error('المسؤول مطلوب');
  }
  if (!taskData.targetType || !taskData.targetId) {
    throw new Error('الوحدة/الإدارة مطلوبة');
  }
  if (!taskData.dueDate) {
    throw new Error('الموعد النهائي مطلوب');
  }
  if (!VALID_PRIORITIES.has(taskData.priority)) {
    throw new Error('الأولوية غير صحيحة');
  }
  if (description && !DESCRIPTION_REGEX.test(description)) {
    throw new Error('الوصف يجب أن يكون أحرف عربية/إنجليزية أو أرقام فقط وبحد أقصى 300 حرف');
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
    console.warn('Tasks API failed, using mock data:', err);
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
  return response.data?.task;
}

// Update existing task
export async function updateTask(taskId, taskData) {
  const response = await request(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(taskData),
  });
  return response.data?.task;
}

// Delete task
export async function deleteTask(taskId) {
  const response = await request(`/tasks/${taskId}`, {
    method: 'DELETE',
  });
  return response.success;
}

// Get single task by ID
export async function getTaskById(taskId) {
  const response = await request(`/tasks/${taskId}`);
  return response.data?.task;
}
