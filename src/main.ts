import { Console } from 'console'
import 'reflect-metadata'
import { GitHub } from './github'
import fs from 'fs/promises'

const DEBUG = process.env.DEBUG === 'true'

interface IWorkflowLine {
  workflowId: number
  workflowName: string
  headBranch: string | null
  headCommit: string | null
  headCommitTimestamp: string | null,
  headShacommit: string,
  workflowRunId: number
  workflowStatus: string | null
  workflowConclusion: string | null
  workflowCreatedAt: string
  workflowStartedAt: string | null
  workflowUpdatedAt: string
  workflowDurationInMS: number | null
  workflowTimeInQueueInMS: number | null
  workflowTotalWallClockTimeInMS: number | null
}

interface IJobLine extends IWorkflowLine {
  os: string
  jobId: number
  jobDurationInMS: number | null
  jobStartedAt: string
  jobCompletedAt: string | null
  jobWallTimeDurationInMS: number | null
}

interface IJobStepLine extends IJobLine {
  stepStatus: string
  stepConclusion: string | null
  stepName: string
  stepNumber: number
  stepStartedAt: string | null
  stepCompletedAt: string | null
  stepDurationInMS: number | null
}

const debug = new Console(process.stderr)

const DoneErr = new Error('done')

// https://docs.github.com/en/rest/actions/workflow-runs#get-workflow-run-usage
async function fetch(owner: string, repo: string, branch: string): Promise<void> {
  const gh = await GitHub.get()

  // TODO: should be a plugin or middleware
  const allOf = gh.client.paginate.iterator
  const actions = gh.client.actions

  const workflowLines: IWorkflowLine[] = []
  const jobLines: IJobLine[] = []
  const stepLines: IJobStepLine[] = []

  // https://github.com/octokit/plugin-paginate-rest.js/#how-it-works
  // TODO: implement and use
  // async function* allOf<R extends OctokitTypes.RequestInterface>(q: R, parameters: Parameters<R>[0]): AsyncIterableIterator<NormalizeResponse<OctokitTypes.GetResponseTypeFromEndpointMethod<R>>> {
  //   for await (const response of gh.client.paginate.iterator(
  //     q, parameters
  //   )) {
  //     console.log('response', response)

  //     for (const item of response.data) {
  //       yield item
  //     }
  //   }
  // }

  // TODO: fix, naive
  const throwWhenDone = (): void => {
    if (!DEBUG) {
      return
    }
    if (workflowLines.length > 10) {
      throw DoneErr
    }
    if (jobLines.length > 10) {
      throw DoneErr
    }
    if (stepLines.length > 100) {
      throw DoneErr
    }
  }

  async function* allWorkflows() {
    for await (const response of allOf(actions.listRepoWorkflows, {
      owner,
      repo
    })) {
      for (const workflow of response.data) {
        yield workflow
      }
    }
  }

  async function* allRuns(workflowId: string | number) {
    for await (const response of allOf(actions.listWorkflowRuns, {
      owner,
      repo,
      branch,
      workflow_id: workflowId
    })) {
      for await (const workflowRun of response.data) {
        yield workflowRun
      }
    }
  }

  try {
    for await (const workflow of allWorkflows()) {
      throwWhenDone()
      debug.log(`Fetching workflow ${workflow.id} (${workflow.name})`)

      for await (const workflowRun of allRuns(workflow.id)) {
        throwWhenDone()
        debug.log(
          `Fetching workflow run ${workflowRun.id} (${workflowLines.length})`
        )

        const usageRequest = await actions.getWorkflowRunUsage({
          owner,
          repo,
          run_id: workflowRun.id
        })

        const usage = usageRequest.data

        const workflowLine = {
          workflowId: workflow.id,
          workflowName: workflow.name,
          headBranch: workflowRun.head_branch,
          headCommit: workflowRun.head_commit?.id || null,
          headCommitTimestamp: workflowRun.head_commit?.timestamp || null,
          headShacommit: workflowRun.head_sha,
          workflowRunId: workflowRun.id,
          workflowStatus: workflowRun.status,
          workflowConclusion: workflowRun.conclusion,
          workflowCreatedAt: workflowRun.created_at,
          workflowStartedAt: workflowRun.run_started_at || null,
          workflowUpdatedAt: workflow.updated_at,
          workflowDurationInMS: usage.run_duration_ms || null,
          workflowTimeInQueueInMS: durationInMS(
            workflow.created_at,
            workflowRun.run_started_at
          ),
          workflowTotalWallClockTimeInMS: durationInMS(
            workflow.created_at,
            workflow.updated_at
          )
        }
        workflowLines.push(workflowLine)

        for (const key of Object.keys(usage.billable)) {
          throwWhenDone()
          const os = key as keyof typeof usage.billable
          const jobs = usage.billable[os]!.job_runs || []

          for (const job of jobs) {
            const jobRequest = await actions.getJobForWorkflowRun({
              owner,
              repo,
              run_id: workflowRun.id,
              job_id: job.job_id
            })

            const jobData = jobRequest.data

            const jobLine = {
              ...workflowLine,
              os,
              jobId: job.job_id,
              jobDurationInMS: job.duration_ms || null,
              jobName: jobData.name,
              jobStartedAt: jobData.started_at,
              jobCompletedAt: jobData.completed_at || null,
              jobWallTimeDurationInMS: durationInMS(
                jobData.started_at,
                jobData.completed_at
              )
            }
            jobLines.push(jobLine)

            for (const step of jobData.steps || []) {
              throwWhenDone()

              const stepLine = {
                ...jobLine,
                stepStatus: step.status,
                stepConclusion: step.conclusion,
                stepName: step.name,
                stepNumber: step.number,
                stepStartedAt: step.started_at || null,
                stepCompletedAt: step.completed_at || null,
                stepDurationInMS: durationInMS(
                  step.started_at,
                  step.completed_at
                )
              }
              stepLines.push(stepLine)
            }
          }
        }

        debug.log(`Done fetching workflow run ${workflowRun.id}`)
      }
    }
  } catch (e) {
    if (e !== DoneErr) {
      throw e
    }
  } finally {
    console.log(JSON.stringify(stepLines))
  }
}

const durationInMS = (
  x: string | undefined | null,
  y: string | undefined | null
): number | null => {
  if (!x || !y) {
    return null
  }
  const xDate = new Date(x)
  const yDate = new Date(y)
  return Math.floor(yDate.getTime() - xDate.getTime())
}

async function main() {
  const args = process.argv.slice(2)

  switch (args[0]) {
    case 'fetch':
      const [owner, repo, branch] = args.slice(1)
      return fetch(owner, repo, branch);
    case 'merge':
      return merge(...args.slice(1));
    default:
      throw new Error(`Unknown command ${args[0]}`)
  }
}

const merge = async (...paths: string[]) => {
  const files = await Promise.all(paths.map(p => fs.readFile(p, { encoding: 'utf8' })))
  const jsons = files.map(f => JSON.parse(f))

  const merged = jsons.reduce(
    (acc, json) => [...acc, ...json], []
  )

  console.log(JSON.stringify(merged))
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
