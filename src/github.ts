/* eslint-disable @typescript-eslint/explicit-function-return-type */

import * as core from '@actions/core'
import { createTokenAuth } from '@octokit/auth-token'
import { graphql } from '@octokit/graphql'
import { graphql as GraphQL } from '@octokit/graphql/dist-types/types'; // eslint-disable-line import/no-unresolved
import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'
import { Octokit } from '@octokit/rest'
import { GetResponseDataTypeFromEndpointMethod } from '@octokit/types'; // eslint-disable-line import/named

const Client = Octokit.plugin(retry, throttling)

const Endpoints = new Octokit()

type Repositories = GetResponseDataTypeFromEndpointMethod<
  typeof Endpoints.repos.listForOrg
>

type Teams = GetResponseDataTypeFromEndpointMethod<typeof Endpoints.teams.list>

const GH_TOKEN = process.env.GH_TOKEN

if (!GH_TOKEN) {
  throw `missing GH_TOKEN`
}

export class GitHub {
  static github: GitHub

  static async get(): Promise<GitHub> {
    if (GitHub.github === undefined) {
      const auth = createTokenAuth(GH_TOKEN!);
      const { token } = await auth();
      GitHub.github = new GitHub(token)
    }

    return GitHub.github
  }

  client: Octokit
  graphql: GraphQL

  private constructor(token: string) {
    this.client = new Client({
      auth: token,
      throttle: {
        onRateLimit: (
          retryAfter: number,
          options: { method: string; url: string; request: { retryCount: number } }
        ) => {
          core.warning(
            `Request quota exhausted for request ${options.method} ${options.url}`
          )

          if (options.request.retryCount === 0) {
            // only retries once
            core.info(`Retrying after ${retryAfter} seconds!`)
            return true
          }
        },
        onSecondaryRateLimit: (
          retryAfter: number,
          options: { method: string; url: string; request: { retryCount: number } }
        ) => {
          core.warning(
            `SecondaryRateLimit detected for request ${options.method} ${options.url}`
          )

          if (options.request.retryCount === 0) {
            // only retries once
            core.info(`Retrying after ${retryAfter} seconds!`)
            return true
          }
        }
      }
    })

    this.graphql = graphql.defaults({
      headers: {
        authorization: `token ${token}`
      }
    })
  }
}
