import { Queue, Worker, type Job } from 'bullmq';
import { getBullMQRedis } from '../../shared/queue/redis-connection.js';
import { logger } from '../../shared/utils/logger.js';
import { processAutomationJob } from './automation-processor.js';

export const AUTOMATION_QUEUE = 'automation-sequence-queue';

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800 },
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 10_000 },
};

export interface AutomationJobData {
  campaignId: string;
  stepId: string;
}

let queueInstance: Queue<AutomationJobData> | null = null;
let workerInstance: Worker<AutomationJobData> | null = null;

export function getAutomationQueue(): Queue<AutomationJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<AutomationJobData>(AUTOMATION_QUEUE, {
      connection: getBullMQRedis(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    logger.info('[automation-queue] Queue initialized');
  }
  return queueInstance;
}

export function startAutomationWorker(): void {
  if (workerInstance) return;

  workerInstance = new Worker<AutomationJobData>(
    AUTOMATION_QUEUE,
    async (job: Job<AutomationJobData>) => {
      await processAutomationJob(job);
    },
    {
      connection: getBullMQRedis(),
      concurrency: 5, // Xử lý song song 5 tin nhắn
    }
  );

  workerInstance.on('completed', (job) => {
    logger.info(`[automation-queue] Job ${job.id} (campaign ${job.data.campaignId}) completed`);
  });

  workerInstance.on('failed', (job, err) => {
    logger.error(`[automation-queue] Job ${job?.id} failed: ${err.message}`);
  });

  logger.info('[automation-queue] Worker started');
}

export async function enqueueSequenceStep(campaignId: string, stepId: string, delayMs: number): Promise<void> {
  const queue = getAutomationQueue();
  await queue.add(
    'send-step',
    { campaignId, stepId },
    { delay: delayMs }
  );
  logger.info(`[automation-queue] Enqueued step ${stepId} for campaign ${campaignId} with delay ${delayMs}ms`);
}
