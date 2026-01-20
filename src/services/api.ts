/**
 * Base API client for making HTTP requests
 * Provides consistent error handling and type safety
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiResponse<T> {
  data: T;
  status: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(data.error || 'Request failed', response.status, data);
    }

    return data as T;
  }

  async get<T>(url: string): Promise<T> {
    return this.request<T>(url, { method: 'GET' });
  }

  async post<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>(url, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>(url, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(url: string): Promise<T> {
    return this.request<T>(url, { method: 'DELETE' });
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export class for testing or custom instances
export { ApiClient };
