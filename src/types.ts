// --- Configuration ---

export interface MercedConfig {
  privateKey: string;
  tokenId: string;
  baseUrl?: string;
}

// --- Agent ---

export interface Agent {
  id: string;
  wallet: string;
  erc8004_token_id: string;
  name: string;
  description: string;
  capabilities: string[];
  base_price: number;
  registration_file_uri: string;
  payout_preference: "fiat" | "crypto" | "both";
  erc8004_verified: boolean;
  jobs_completed: number;
  total_earned_usd: number;
  rating: number;
  review_count: number;
  registered_at: string;
  profile_image_url: string | null;
}

export interface RegisterOptions {
  name?: string;
  description?: string;
  capabilities?: string[];
  basePrice?: number;
  payoutPreference?: "fiat" | "crypto" | "both";
  profileImage?: Blob | File;
}

// --- Job ---

export type JobStatus =
  | "pending_quote"
  | "quoted"
  | "in_progress"
  | "submitted"
  | "completed"
  | "disputed"
  | "declined"
  | "quote_rejected"
  | "cancelled";

export type JobType = "code" | "writing" | "research" | "any";

export interface AgentResponse {
  quoted_price: number | null;
  quote_note: string | null;
  deliverable_text: string | null;
  deliverable_urls: string[];
}

export interface JobImage {
  r2_key: string;
  signed_url: string;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  type: JobType;
  client_id: string;
  worker_id: string;
  worker_wallet: string;
  status: JobStatus;
  escrow_contract_address: string | null;
  escrow_tx_hash: string | null;
  images: JobImage[];
  worker_response: AgentResponse | null;
  dispute_reason: string | null;
  deadline: string;
  review_deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicJob {
  id: string;
  title: string;
  description: string;
  type: JobType;
  worker_id: string;
  status: JobStatus;
  deadline: string;
  created_at: string;
  updated_at: string;
  quoted_price: number | null;
}

export interface PostJobOptions {
  title: string;
  description: string;
  type: JobType;
  workerId: string;
  deadline: string;
  clientId: string;
  images?: (Blob | File)[];
}

export interface QuoteOptions {
  price: number;
  note: string;
}

export interface SubmitOptions {
  text?: string;
  urls?: string[];
}

export interface ListJobsOptions {
  status?: JobStatus;
  role?: "worker" | "client";
}

// --- Review ---

export interface Review {
  job_id: string;
  agent_id: string;
  agent_wallet: string;
  agent_token_id: string;
  rating: number;
  comment: string;
  on_chain_tx_hash: string | null;
  created_at: string;
}

// --- Webhook ---

export type WebhookEvent =
  | "job.created"
  | "job.accepted"
  | "job.completed"
  | "job.disputed"
  | "job.resolved"
  | "test";

export interface WebhookPayload {
  event: WebhookEvent;
  agent_id: string;
  job: Job | null;
  timestamp: string;
}

export interface WebhookConfig {
  agent_id: string;
  service_endpoint: string | null;
  active: boolean;
}

export interface WebhookDelivery {
  id: string;
  agent_id: string;
  event: WebhookEvent;
  job_id: string | null;
  endpoint: string;
  status: "success" | "failed";
  http_status: number | null;
  attempt: number;
  created_at: string;
}

// --- Errors ---

export class MercedError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string,
  ) {
    super(message);
    this.name = "MercedError";
  }
}
