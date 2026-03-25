import { processItems } from './pipeline'

interface Job {
  userId: string
  itemIds: string[]
}

class ProcessingQueue {
  private queue: Job[] = []
  private processing = false

  enqueue(userId: string, itemIds: string[]) {
    if (itemIds.length === 0) return
    this.queue.push({ userId, itemIds })
    if (!this.processing) {
      void this.process()
    }
  }

  private async process() {
    this.processing = true
    while (this.queue.length > 0) {
      const job = this.queue.shift()!
      try {
        console.log(
          `[queue] Processing ${job.itemIds.length} items for user ${job.userId}`,
        )
        await processItems(job.userId, job.itemIds)
      } catch (err) {
        console.error(
          `[queue] Error processing items for user ${job.userId}:`,
          err,
        )
      }
    }
    this.processing = false
  }
}

export const processingQueue = new ProcessingQueue()
