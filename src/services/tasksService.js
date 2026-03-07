import { env } from '../config/env.js';
import { httpClient, request } from '../lib/httpClient.js';
import { TASKS_DATA } from '../utils/data.js';

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
    if (env.useMockApi) {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('Mock: Creating task', taskData);
      // Return mock created task
      return {
        id: `task-${Date.now()}`,
        ...taskData,
        status: 'assigned',
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
