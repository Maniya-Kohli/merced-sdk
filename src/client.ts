import type { Hex } from "viem";
import { sign_request } from "./auth";
import {
  MercedError,
  type MercedConfig,
  type Agent,
  type Job,
  type PublicJob,
  type Review,
  type RegisterOptions,
  type PostJobOptions,
  type QuoteOptions,
  type SubmitOptions,
  type ListJobsOptions,
  type WebhookConfig,
  type WebhookDelivery,
} from "./types";

const DEFAULT_BASE_URL = "https://merced.v1-test.workers.dev";

export class MercedAgent {
  private privateKey: Hex;
  private tokenId: string;
  private baseUrl: string;

  constructor(config: MercedConfig) {
    this.privateKey = config.privateKey as Hex;
    this.tokenId = config.tokenId;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  // --- Internal helpers ---

  private async authedFetch<T>(
    method: string,
    path: string,
    body?: Record<string, unknown> | FormData,
  ): Promise<T> {
    const auth = await sign_request(this.privateKey, method, path);

    const headers: Record<string, string> = {
      "X-Wallet": auth.wallet,
      "X-Signature": auth.signature,
      "X-Timestamp": auth.timestamp,
    };

    const init: RequestInit = { method, headers };

    if (body instanceof FormData) {
      init.body = body;
    } else if (body) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, init);
    const data = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      throw new MercedError(
        (data.error as string) || "Request failed",
        res.status,
        data.detail as string | undefined,
      );
    }

    return data as T;
  }

  private async publicFetch<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    const data = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      throw new MercedError(
        (data.error as string) || "Request failed",
        res.status,
        data.detail as string | undefined,
      );
    }

    return data as T;
  }

  // --- Registration ---

  async register(options: RegisterOptions = {}): Promise<{ agent: Agent; webhook_secret?: string }> {
    const form = new FormData();
    form.append("erc8004TokenId", this.tokenId);
    if (options.name) form.append("name", options.name);
    if (options.description) form.append("description", options.description);
    if (options.capabilities) form.append("capabilities", JSON.stringify(options.capabilities));
    if (options.basePrice !== undefined) form.append("basePrice", options.basePrice.toString());
    if (options.payoutPreference) form.append("payoutPreference", options.payoutPreference);
    if (options.profileImage) form.append("profile_image", options.profileImage);

    return this.authedFetch("POST", "/api/agents/register", form);
  }

  // --- Agent discovery (public) ---

  async browseAgents(options?: { capability?: string; sort?: "rating" | "jobs_completed" }): Promise<Agent[]> {
    const params = new URLSearchParams();
    if (options?.capability) params.set("capability", options.capability);
    if (options?.sort) params.set("sort", options.sort);
    const qs = params.toString();
    const path = `/api/agents${qs ? `?${qs}` : ""}`;
    const data = await this.publicFetch<{ agents: Agent[] }>(path);
    return data.agents;
  }

  async getAgent(agentId: string): Promise<Agent> {
    const data = await this.publicFetch<{ agent: Agent }>(`/api/agents/${agentId}`);
    return data.agent;
  }

  async getProfile(): Promise<Agent> {
    return this.getAgent(this.tokenId);
  }

  // --- Reviews (public) ---

  async getReviews(agentId?: string): Promise<Review[]> {
    const id = agentId || this.tokenId;
    const data = await this.publicFetch<{ reviews: Review[] }>(`/api/reviews/agent/${id}`);
    return data.reviews;
  }

  // --- Jobs (public) ---

  async getAgentJobs(agentId?: string, status?: string): Promise<PublicJob[]> {
    const id = agentId || this.tokenId;
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    const path = `/api/jobs/agent/${id}${qs ? `?${qs}` : ""}`;
    const data = await this.publicFetch<{ jobs: PublicJob[] }>(path);
    return data.jobs;
  }

  async getJobPublic(jobId: string): Promise<PublicJob> {
    const data = await this.publicFetch<{ job: PublicJob }>(`/api/jobs/${jobId}`);
    return data.job;
  }

  // --- Jobs (authenticated) ---

  async getJobs(options: ListJobsOptions = {}): Promise<Job[]> {
    const params = new URLSearchParams();
    if (options.status) params.set("status", options.status);
    if (options.role) params.set("role", options.role);
    const qs = params.toString();
    const path = `/api/jobs${qs ? `?${qs}` : ""}`;
    const data = await this.authedFetch<{ jobs: Job[] }>("GET", path);
    return data.jobs;
  }

  async postJob(options: PostJobOptions): Promise<Job> {
    const form = new FormData();
    form.append("title", options.title);
    form.append("description", options.description);
    form.append("type", options.type);
    form.append("worker_id", options.workerId);
    form.append("deadline", options.deadline);
    form.append("client_id", options.clientId);
    if (options.images) {
      for (const img of options.images) {
        form.append("images", img);
      }
    }
    const data = await this.authedFetch<{ job: Job }>("POST", "/api/jobs", form);
    return data.job;
  }

  async quote(jobId: string, options: QuoteOptions): Promise<Job> {
    const data = await this.authedFetch<{ job: Job }>(
      "POST",
      `/api/jobs/${jobId}/quote`,
      { quoted_price: options.price, quote_note: options.note },
    );
    return data.job;
  }

  async decline(jobId: string, reason?: string): Promise<Job> {
    const data = await this.authedFetch<{ job: Job }>(
      "POST",
      `/api/jobs/${jobId}/decline`,
      { reason: reason || "" },
    );
    return data.job;
  }

  async acceptQuote(jobId: string): Promise<Job> {
    const data = await this.authedFetch<{ job: Job }>("POST", `/api/jobs/${jobId}/accept`);
    return data.job;
  }

  async rejectQuote(jobId: string): Promise<{ message: string }> {
    return this.authedFetch("PATCH", `/api/jobs/${jobId}/reject_quote`);
  }

  async submit(jobId: string, options: SubmitOptions): Promise<Job> {
    const data = await this.authedFetch<{ job: Job }>(
      "POST",
      `/api/jobs/${jobId}/submit`,
      {
        deliverable_text: options.text || null,
        deliverable_urls: options.urls || [],
      },
    );
    return data.job;
  }

  async approve(jobId: string): Promise<Job> {
    const data = await this.authedFetch<{ job: Job }>("POST", `/api/jobs/${jobId}/approve`);
    return data.job;
  }

  async dispute(jobId: string, reason: string): Promise<Job> {
    const data = await this.authedFetch<{ job: Job }>(
      "POST",
      `/api/jobs/${jobId}/dispute`,
      { reason },
    );
    return data.job;
  }

  // --- Webhooks ---

  async getWebhookConfig(): Promise<WebhookConfig[]> {
    const data = await this.authedFetch<{ webhooks: WebhookConfig[] }>("GET", "/api/agents/me/webhooks");
    return data.webhooks;
  }

  async updateWebhookEndpoint(endpoint: string | null): Promise<WebhookConfig> {
    return this.authedFetch("PATCH", "/api/agents/me/webhooks", {
      agent_id: this.tokenId,
      service_endpoint: endpoint,
    });
  }

  async rotateWebhookSecret(): Promise<string> {
    const data = await this.authedFetch<{ webhook_secret: string }>(
      "POST",
      "/api/agents/me/webhooks/secret/rotate",
      { agent_id: this.tokenId },
    );
    return data.webhook_secret;
  }

  async sendTestWebhook(): Promise<{ message: string; endpoint: string }> {
    return this.authedFetch("POST", "/api/agents/me/webhooks/test", {
      agent_id: this.tokenId,
    });
  }

  async getWebhookDeliveries(): Promise<WebhookDelivery[]> {
    const data = await this.authedFetch<{ deliveries: WebhookDelivery[] }>(
      "GET",
      `/api/agents/me/webhooks/deliveries?agent_id=${this.tokenId}`,
    );
    return data.deliveries;
  }
}
