export class TripManagementError extends Error {
  constructor(public code: 'FORBIDDEN' | 'VALIDATION_ERROR') {
    super(code);
  }
}
