// DTOs
export * from './dto';

/**
 * 通用 API 回應包裝
 */
export interface ApiResponse<T> {
  data: T;
  status: number;
}
