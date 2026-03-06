import { emailQueue, EmailJob } from '@/queue';
import logger from '@/utils/logger';
import nodemailer from 'nodemailer';

// Configure email transporter (SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Email templates
const templates = {
  task_assignment: (data: any) => `
    <h2>New Task Assignment</h2>
    <p>Hello ${data.assignedToName},</p>
    <p>You have been assigned a new task: <strong>${data.taskTitle}</strong></p>
    <p>Description: ${data.taskDescription}</p>
    <p>Due Date: ${new Date(data.dueDate).toLocaleDateString()}</p>
    <p>Priority: ${data.priority}</p>
    <p><a href="${process.env.FRONTEND_URL}/tasks/${data.taskId}">View Task</a></p>
  `,
  
  task_reminder: (data: any) => `
    <h2>Task Deadline Approaching</h2>
    <p>Hello ${data.assignedToName},</p>
    <p>Your task <strong>${data.taskTitle}</strong> is due soon.</p>
    <p>Due Date: ${new Date(data.dueDate).toLocaleDateString()}</p>
    <p><a href="${process.env.FRONTEND_URL}/tasks/${data.taskId}">View Task</a></p>
  `,
  
  escalation: (data: any) => `
    <h2>Task Overdue - Escalation</h2>
    <p>Hello ${data.adminName},</p>
    <p>The following task is overdue and requires attention:</p>
    <p>Task: <strong>${data.taskTitle}</strong></p>
    <p>Assigned to: ${data.assignedToName}</p>
    <p>Due Date: ${new Date(data.dueDate).toLocaleDateString()}</p>
    <p><a href="${process.env.FRONTEND_URL}/tasks/${data.taskId}">View Task</a></p>
  `,
  
  review_completed: (data: any) => `
    <h2>Review Completed</h2>
    <p>Hello ${data.submittedByName},</p>
    <p>Your evidence submission has been reviewed.</p>
    <p>Task: <strong>${data.taskTitle}</strong></p>
    <p>Decision: <strong>${data.decision}</strong></p>
    <p>Feedback: ${data.feedback}</p>
    <p><a href="${process.env.FRONTEND_URL}/submissions/${data.submissionId}">View Submission</a></p>
  `,
};

// Process email queue
emailQueue.process(async (job) => {
  const { to, subject, template, data } = job.data as EmailJob;

  try {
    logger.info(`Processing email job ${job.id}: ${template} to ${to}`);

    const htmlContent = templates[template](data);

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Qiyas Platform <noreply@qiyas.sa>',
      to,
      subject,
      html: htmlContent,
    });

    logger.info(`Email sent successfully: ${job.id}`);
    return { success: true };
  } catch (error) {
    logger.error(`Email job ${job.id} failed`, error);
    throw error;
  }
});

logger.info('Email notification worker started');

export default emailQueue;
