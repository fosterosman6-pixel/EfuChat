#!/usr/bin/env bash
# One-time setup so GitHub Actions can deploy EfuChat to Firebase without a key file.
# Run it in Google Cloud Shell: https://shell.cloud.google.com/?project=project-72f5d6ed-81b6-4920-86b
set -euo pipefail
PROJECT=project-72f5d6ed-81b6-4920-86b
NUMBER=943586081894
REPO=fosterosman6-pixel/efuchat
SA=github-deploy@$PROJECT.iam.gserviceaccount.com

gcloud config set project "$PROJECT"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com iam.googleapis.com \
  firebase.googleapis.com firestore.googleapis.com firebaserules.googleapis.com \
  cloudresourcemanager.googleapis.com serviceusage.googleapis.com

gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create github-deploy --display-name="GitHub deploy (EfuChat)"

for ROLE in roles/firebase.admin roles/serviceusage.serviceUsageConsumer roles/datastore.owner \
            roles/firebaserules.admin roles/cloudfunctions.admin roles/run.admin \
            roles/artifactregistry.admin roles/secretmanager.admin roles/iam.serviceAccountUser \
            roles/cloudscheduler.admin roles/eventarc.admin roles/storage.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="$ROLE" --condition=None -q >/dev/null
done

gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"

gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
    --display-name="GitHub" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$REPO'"

# Only the efuchat repo may act as the deploy account.
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" -q >/dev/null

echo "EfuChat deploy setup finished."
