import { Console } from 'console';
import 'reflect-metadata';
import { GitHub } from './github';

const OWNER = 'laurentsenta'
const REPO = 'test-plans'
const BRANCH = 'laurent-statistics-3008'
const DEBUG = process.env.DEBUG === 'true'

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

const DoneErr = new Error('done')

// https://docs.github.com/en/rest/actions/workflow-runs#get-workflow-run-usage
async function run(): Promise<void> {
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
  const throwWhenDone = () => {
    if (!DEBUG) {
      return;
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
    for await (const response of allOf(
      actions.listRepoWorkflows,
      {
        owner: OWNER,
        repo: REPO,
      },
    )) {
      for (const workflow of response.data) {
        yield workflow
      }
    }
  }

  async function* allRuns(workflowId: string | number) {
    for await (const response of allOf(actions.listWorkflowRuns,
      {
        owner: OWNER,
        repo: REPO,
        branch: BRANCH,
        workflow_id: workflowId,
      })) {

      for await (const workflowRun of response.data) {
        yield workflowRun
      }
    }
  }

  try {

    for await (const workflow of allWorkflows()) {
      throwWhenDone();
      debug.log(`Fetching workflow ${workflow.id} (${workflow.name})`)

      for await (const workflowRun of allRuns(workflow.id)) {
        throwWhenDone();
        debug.log(`Fetching workflow run ${workflowRun.id} (${workflowLines.length})`)

        const usageRequest = await actions.getWorkflowRunUsage({
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
        workflowLines.push(workflowLine);

        for (const key of Object.keys(usage.billable)) {
          throwWhenDone();
          const os = key as (keyof typeof usage.billable)
          const jobs = usage.billable[os]!.job_runs || []

          for (const job of jobs) {
            const jobRequest = await actions.getJobForWorkflowRun({
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
              throwWhenDone();
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
    console.log(JSON.stringify(stepLines));
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  });
