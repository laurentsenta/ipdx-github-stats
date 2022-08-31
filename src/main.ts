import { Console } from 'console'
import 'reflect-metadata'
import { GitHub } from './github'

const OWNER = 'laurentsenta'
const REPO = 'test-plans'
const BRANCH = 'laurent-statistics-3008'
const RUNS_LIMIT = 2000
const DEBUG = false

interface IWorkflowLine {
  workflowId: number,
  workflowName: string,
  headBranch: string | null,
  headCommit: string | null,
  runId: number,
  status: string | null,
  conclusion: string | null,
  commit: string,
  createdAt: string,
  startedAt: string | null
}

interface IJobLine extends IWorkflowLine {
  os: string,
  jobId: number,
  jobDurationInMS: number | null,
  jobStartedAt: string,
  jobCompletedAt: string | null,
}

interface IJobStepLine extends IJobLine {
  stepStatus: string,
  stepConclusion: string | null,
  stepName: string,
  stepNumber: number,
  stepStartedAt: string | null,
  stepCompletedAt: string | null,
}

const debug = new Console(process.stderr)

// https://docs.github.com/en/rest/actions/workflow-runs#get-workflow-run-usage
async function run(): Promise<void> {
  const gh = await GitHub.get()

  const workflowLines: IWorkflowLine[] = []
  const jobLines: IJobLine[] = []
  const stepLines: IJobStepLine[] = []

  // Naive debug implementation, TODO: throw or use generators instead.
  const isDone = (): boolean => {
    if (!DEBUG) {
      return false;
    }

    if (jobLines.length > 10 || workflowLines.length > 10) {
      return true; // debug with 10 lines for now
    }
    if (stepLines.length > 10) {
      return true; // debug with 10 lines for now
    }

    return false;
  }

  const workflowsRequest = await gh.client.actions.listRepoWorkflows({
    owner: OWNER,
    repo: REPO,
  })

  const workflows = workflowsRequest.data.workflows;
  debug.log(`Found ${workflows.length} workflows.`)

  for (const workflow of workflows) {
    debug.log(`Fetching workflow ${workflow.id} (${workflow.name})`)

    const workflowRunsRequest = await gh.client.actions.listWorkflowRuns({
      owner: OWNER,
      repo: REPO,
      branch: BRANCH,
      workflow_id: workflow.id,
      limit: RUNS_LIMIT,
    })
    const workflowRuns = workflowRunsRequest.data.workflow_runs;

    debug.log(`Found ${workflowRuns.length} workflow runs.`)
    debug.log("a workflow looks like this:", workflowRuns[0])

    for (const workflowRun of workflowRuns) {
      debug.log(`Fetching run ${workflowRun.id}`)

      const usageRequest = await gh.client.actions.getWorkflowRunUsage({
        owner: OWNER,
        repo: REPO,
        run_id: workflowRun.id,
      })

      const usage = usageRequest.data;

      const workflowLine = {
        workflowId: workflow.id,
        workflowName: workflow.name,
        headBranch: workflowRun.head_branch,
        headCommit: workflowRun.head_commit?.id || null,
        runId: workflowRun.id,
        status: workflowRun.status,
        conclusion: workflowRun.conclusion,
        commit: workflowRun.head_sha,
        createdAt: workflowRun.created_at,
        startedAt: workflowRun.run_started_at || null,
        durationInMS: usage.run_duration_ms,
      }

      for (const key of Object.keys(usage.billable)) {
        const os = key as (keyof typeof usage.billable)
        const jobs = usage.billable[os]!.job_runs || []

        for (const job of jobs) {
          const jobRequest = await gh.client.actions.getJobForWorkflowRun({
            owner: OWNER,
            repo: REPO,
            run_id: workflowRun.id,
            job_id: job.job_id,
          })
          const jobData = jobRequest.data;

          const jobLine = {
            ...workflowLine,
            os,
            jobId: job.job_id,
            jobDurationInMS: job.duration_ms || null,
            jobName: jobData.name,
            jobStartedAt: jobData.started_at,
            jobCompletedAt: jobData.completed_at || null,
          }
          jobLines.push(jobLine)

          for (const step of (jobData.steps || [])) {
            const stepLine = {
              ...jobLine,
              stepStatus: step.status,
              stepConclusion: step.conclusion,
              stepName: step.name,
              stepNumber: step.number,
              stepStartedAt: step.started_at || null,
              stepCompletedAt: step.completed_at || null,
            }
            stepLines.push(stepLine)

            if (isDone()) {
              break;
            }
          }

          if (isDone()) {
            break;
          }
        }

        if (isDone()) {
          break;
        }
      }

      workflowLines.push(workflowLine)

      if (isDone()) {
        break;
      }
    }

    if (isDone()) {
      break;
    }
  }

  console.log(JSON.stringify(stepLines));
}

run()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
