// Whether an agent that answered actually did its task. The engine calls any
// agent that answered "completed", even when its answer says it could not.
export type Classify = (text: string, labels: readonly string[]) => Promise<string | undefined>

// An answer that leads with it needs no model to read it.
const SAYS_FAILED = /^\W*failed\b/i

export const verdictOf = async (answer: string, task: string, classify: Classify): Promise<'done' | 'failed'> => {
  const report = answer.trim()
  if (!report) {
    return 'done'
  }
  if (SAYS_FAILED.test(report)) {
    return 'failed'
  }
  try {
    const label = await classify(
      `An AI agent was given this task:\n${task}\n\nIts final report:\n${report.slice(0, 2000)}\n\n` +
        'Did the agent accomplish the task (succeeded), or report that it could not (failed)?',
      ['succeeded', 'failed'],
    )

    return label === 'failed' ? 'failed' : 'done'
  } catch {
    // No verdict (no network, rate limited): what the engine says, as before.
    return 'done'
  }
}
