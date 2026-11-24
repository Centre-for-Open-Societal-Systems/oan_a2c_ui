// =============================================================================
//  Jenkinsfile — OAN-Access-To-Credit-System (A2C frontend, Next.js). Single
//  pipeline for the `oan-package` GitHub Organization folder (multibranch).
//
//  Per branch:
//    develop     -> build + push to ECR (eoan/oan-a2c-ui/a2c-ui) + ci/deploy-helm-dev.sh
//                   (Helm upgrade on oan_dev k3s, namespace `a2c`, via VPN kubeconfig),
//                   then package + publish the Helm chart oan-a2c-ui to oan-helm
//    staging     -> builds nothing: ci/package_chart.py promote tags the image develop built from this same source
//                   tree <version>-staging.<build>, repackages its chart, and ci/deploy-helm-dev.sh (DEPLOY_ENV=staging,
//                   helm/environments/staging) installs it on the QA cluster (qa.oanstaging.com) with oan-qa-kubeconfig.
//                   The chart is published to repository/staging of oan-helm.
//
//  develop: the VPN deploy agent (oan-ci-deploy) runs ci/deploy-helm-dev.sh with the
//  `oan-dev-kubeconfig` Secret file credential (same kubeconfig used by the oan_a2c backend).
//  The agent must have kubectl + helm available. No SSH or EC2 credentials needed.
//
//  API_BASE_URL is set at runtime via Helm values (helm/environments/dev/oan-a2c-ui.yaml),
//  so the same image is deployed without a rebuild when the backend URL changes.
//
//  Tags:  develop: <package.json version>-develop.<build>, e.g. 0.0.1-develop.57 (= chart version)
//         staging: <package.json version>-staging.<build> (= chart version), the develop image promoted
//
//  Agent needs: docker(+buildx), aws cli v2, git.
//  Credentials: AWS_ACCOUNT_ID; oan-dev-kubeconfig (develop); oan-qa-kubeconfig (staging).
// =============================================================================
pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '30'))
    timeout(time: 30, unit: 'MINUTES')
  }

  environment {
    AWS_REGION               = 'ap-south-1'
    DEV_API_BASE_URL         = 'https://a2c-backend-development.oanstaging.com/api'
  }

  stages {
    stage('Resolve') {
      steps {
        script {
          // One ECR repo (must exist) and one backend: the image is built on develop and promoted to staging.
          // tag = chart version = <package.json version>-<branch>.<build>, e.g. 0.0.1-develop.57 / 0.0.1-staging.58
          env.ECR_REPO      = 'eoan/oan-a2c-ui/a2c-ui'
          env.API_BASE_URL  = env.DEV_API_BASE_URL
          env.IMMUTABLE_TAG = "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"
          if (env.BRANCH_NAME == 'develop' || env.BRANCH_NAME == 'staging') {
            env.IMMUTABLE_TAG = sh(returnStdout: true, script: 'python3 ci/package_chart.py version').trim()
          }
          env.MOVING_TAG    = "${env.BRANCH_NAME}-latest"
          echo "branch=${env.BRANCH_NAME}  repo=${env.ECR_REPO}  tag=${env.IMMUTABLE_TAG}  api=${env.API_BASE_URL}"
        }
      }
    }

    stage('Build image') {
      when { branch 'develop' }
      steps {
        withCredentials([string(credentialsId: 'AWS_ACCOUNT_ID', variable: 'AWS_ACCOUNT_ID')]) {
          sh '''#!/usr/bin/env bash
            set -euo pipefail
            IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
            # --no-cache: never reuse a layer from an earlier build on this
            #   shared agent, so every image is built from the checked-out tree.
            # --pull: re-resolve the `node:24` base rather than building on a
            #   copy the agent may have cached weeks ago, which would keep the
            #   image pinned to an unpatched base indefinitely.
            DOCKER_BUILDKIT=1 docker build \
              --no-cache --pull \
              --build-arg API_BASE_URL="${API_BASE_URL}" \
              --tag ${IMAGE_URI}:${IMMUTABLE_TAG} \
              --tag ${IMAGE_URI}:${MOVING_TAG} \
              .
            echo "Built ${IMAGE_URI}:${IMMUTABLE_TAG}"
          '''
        }
      }
    }

    stage('Push to ECR') {
      when { branch 'develop' }
      steps {
        withCredentials([string(credentialsId: 'AWS_ACCOUNT_ID', variable: 'AWS_ACCOUNT_ID')]) {
          sh '''#!/usr/bin/env bash
            set -euo pipefail
            REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
            IMAGE_URI="${REGISTRY}/${ECR_REPO}"
            aws ecr get-login-password --region ${AWS_REGION} \
              | docker login --username AWS --password-stdin "${REGISTRY}"

            # ECR does not create a repository on push.
            aws ecr describe-repositories --region ${AWS_REGION} --repository-names "${ECR_REPO}" >/dev/null 2>&1 \
              || aws ecr create-repository --region ${AWS_REGION} --repository-name "${ECR_REPO}" >/dev/null

            docker push ${IMAGE_URI}:${IMMUTABLE_TAG}
            docker push ${IMAGE_URI}:${MOVING_TAG}
            # Scoped cleanup only — never `docker system prune -f` on a shared agent.
            docker rmi ${IMAGE_URI}:${IMMUTABLE_TAG} ${IMAGE_URI}:${MOVING_TAG} || true
            echo "Pushed ${IMAGE_URI}:${IMMUTABLE_TAG} (+ ${MOVING_TAG})"
          '''
        }
      }
    }

    // ---------------------- Helm chart package (same name as the chart) ----------------------
    // Flow (develop): Resolve (version) -> Build image -> Push to ECR -> Package chart -> deploy -> Publish chart.
    // helm/oan-a2c-ui is zipped with this build's image before the deploy; the same archive is
    // published to oan-helm after it.
    // staging: `promote` instead of `package`: develop's chart for this source tree, its image tagged for staging.
    stage('Package chart') {
      when { anyOf { branch 'develop'; branch 'staging' } }
      steps {
        withCredentials([string(credentialsId: 'AWS_ACCOUNT_ID', variable: 'AWS_ACCOUNT_ID')]) {
          script {
            env.IMAGE_TAG = env.IMMUTABLE_TAG
            env.SOURCE_COMMIT = sh(returnStdout: true, script: 'git rev-parse --verify HEAD').trim()
            env.COMMIT_SUBJECT = sh(returnStdout: true, script: 'git log -1 --pretty=%s').trim()
            env.IMAGE_REPOSITORY = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
          }
          sh "python3 ci/package_chart.py ${env.BRANCH_NAME == 'staging' ? 'promote' : 'package'}"
          stash name: 'built-chart', includes: 'built-chart/**'
        }
      }
    }

    // ---------------------- per-branch deploy ----------------------

    stage('develop → oan_dev (helm)') {
      when { branch 'develop' }
      agent { label 'oan-ci-deploy' }
      options { timeout(time: 15, unit: 'MINUTES') }
      steps {
        checkout scm
        sh 'rm -rf built-chart'
        unstash 'built-chart'
        withCredentials([
          string(credentialsId: 'AWS_ACCOUNT_ID', variable: 'AWS_ACCOUNT_ID'),
          file(credentialsId: 'oan-dev-kubeconfig', variable: 'KUBECONFIG')
        ]) {
          sh '''#!/usr/bin/env bash
            set -euo pipefail
            chmod +x ci/deploy-helm-dev.sh
            IMAGE_REPOSITORY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}" \
            IMMUTABLE_TAG="${IMMUTABLE_TAG}" \
            bash ci/deploy-helm-dev.sh
          '''
        }
      }
    }

    stage('staging → QA cluster (helm)') {
      when { branch 'staging' }
      agent { label 'oan-ci-deploy' }   // VPN agent with helm and kubectl; must reach the QA API
      options { timeout(time: 15, unit: 'MINUTES') }
      steps {
        checkout scm
        sh 'rm -rf built-chart'
        unstash 'built-chart'
        withCredentials([
          string(credentialsId: 'AWS_ACCOUNT_ID', variable: 'AWS_ACCOUNT_ID'),
          file(credentialsId: 'oan-qa-kubeconfig', variable: 'KUBECONFIG')
        ]) {
          sh '''#!/usr/bin/env bash
            set -euo pipefail
            DEPLOY_ENV=staging \
            IMAGE_REPOSITORY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}" \
            IMMUTABLE_TAG="${IMMUTABLE_TAG}" \
            bash ci/deploy-helm-dev.sh
          '''
        }
      }
    }

    // ---------------------- Helm chart publish ----------------------
    // Adds the archive built by 'Package chart' to repository/develop/ of oan-helm, only after
    // the dev VM deploy succeeded.
    stage('Publish chart') {
      when { anyOf { branch 'develop'; branch 'staging' } }
      steps {
        // UNSTABLE, not failed: the image is already deployed.
        catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
          withCredentials([usernamePassword(credentialsId: 'oan-helm-fork-token', usernameVariable: 'GH_USER', passwordVariable: 'GH_TOKEN')]) {
            sh 'python3 ci/package_chart.py publish'
          }
        }
      }
    }
  }

  post {
    // Bound the BuildKit cache so the shared agent's disk can't fill over many builds.
    // `docker rmi` only drops the final tag; the build cache is a SEPARATE store that
    // otherwise grows unbounded. --max-used-space caps it at ~20GB (buildx v0.34+; replaces
    // the deprecated --keep-storage). Scoped to the build cache only — never
    // `docker system prune`, which wipes other jobs on a shared agent.
    always  { sh 'docker buildx prune -f --max-used-space=20GB 2>/dev/null || true' }
    success { echo "OK  ${env.BRANCH_NAME} #${env.BUILD_NUMBER} -> ${env.IMMUTABLE_TAG}" }
    failure { echo "FAIL ${env.BRANCH_NAME} #${env.BUILD_NUMBER}" }
  }
}
