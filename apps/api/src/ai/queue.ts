import { Queue } from "bullmq";
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

connection.on("error", (err) => {
  console.error("Redis connection error:", err);
});

// Create our main BullMQ Queue
export const aiQueue = new Queue("ai-analysis", {
  connection: connection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
  },
});

/**
 * Pushes a task to estimate complexity for a newly created or updated card
 */
export async function queueComplexityInference(cardId: string, title: string, description: string) {
  try {
    await aiQueue.add("infer-complexity", { cardId, title, description });
    console.log(`Queued complexity inference for card: ${cardId}`);
  } catch (error) {
    console.error(`Failed to queue complexity inference for card: ${cardId}`, error);
  }
}

/**
 * Pushes a task to run a complete board audit (bottlenecks, risks, assignments, digest)
 */
export async function queueBoardAudit(boardId: string) {
  try {
    await aiQueue.add("board-audit", { boardId });
    console.log(`Queued board audit for board: ${boardId}`);
  } catch (error) {
    console.error(`Failed to queue board audit for board: ${boardId}`, error);
  }
}

/**
 * Schedules a repeatable audit job for a board (every 6 hours)
 */
export async function scheduleBoardAudit(boardId: string) {
  try {
    // Schedule repeatable job using BullMQ repeat options (cron: every 6 hours)
    // For testing and reliability, standard cron: '0 */6 * * *'
    await aiQueue.add(
      "board-audit-repeat",
      { boardId },
      {
        repeat: {
          pattern: "0 */6 * * *",
        },
        jobId: `repeat-${boardId}`,
      }
    );
    console.log(`Scheduled repeatable 6-hour audit for board: ${boardId}`);
  } catch (error) {
    console.error(`Failed to schedule repeatable audit for board: ${boardId}`, error);
  }
}
