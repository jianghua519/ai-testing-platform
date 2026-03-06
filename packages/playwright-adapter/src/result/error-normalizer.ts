export const normalizeError = (error: unknown): { code: string; message: string } => {
  if (error instanceof Error) {
    return {
      code: 'PW_EXECUTION_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'PW_EXECUTION_UNKNOWN_ERROR',
    message: String(error),
  };
};
