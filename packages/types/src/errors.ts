export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super('not_found', `${entity} not found: ${id}`, 404);
  }
}

export class InvalidArgumentError extends DomainError {
  constructor(message: string, details?: Record<string, string>) {
    super('invalid_argument', message, 400, details);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super('conflict', message, 409);
  }
}

export class PreconditionFailedError extends DomainError {
  constructor(message: string) {
    super('precondition_failed', message, 412);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string = 'Unauthorized') {
    super('unauthorized', message, 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string = 'Forbidden') {
    super('forbidden', message, 403);
  }
}
